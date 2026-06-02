const bcrypt = require('bcryptjs');
const db = require('../config/database');

// GET /api/users - Admin only
const getAll = async (req, res) => {
    try {
        const { role, is_aktif, search } = req.query;
        let query = `
            SELECT u.user_id AS id, u.nama, u.email, u.role, u.no_hp, u.is_aktif, u.last_login, u.login_ip,
                   g.nip, g.spesialisasi,
                   GROUP_CONCAT(DISTINCT k.nama_kelas ORDER BY k.nama_kelas SEPARATOR ', ') AS kelas_mengajar
            FROM users u
            LEFT JOIN guru g ON g.user_id = u.user_id
            LEFT JOIN kelas_guru kg ON kg.guru_id = g.guru_id
            LEFT JOIN kelas k ON k.kelas_id = kg.kelas_id
            WHERE 1=1
        `;
        const params = [];
        if (role) { query += ' AND u.role = ?'; params.push(role); }
        if (is_aktif !== undefined) { query += ' AND u.is_aktif = ?'; params.push(is_aktif); }
        if (search) { query += ' AND (u.nama LIKE ? OR u.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
        query += ' GROUP BY u.user_id ORDER BY u.role, u.nama';

        const [rows] = await db.execute(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/users - Admin buat akun baru
const create = async (req, res) => {
    try {
        const { nama, email, password, role, no_hp, nip, spesialisasi } = req.body;
        if (!nama || !email || !password || !role) {
            return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
        }

        const hashed = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            'INSERT INTO users (nama, email, password, role, no_hp) VALUES (?, ?, ?, ?, ?)',
            [nama, email, hashed, role, no_hp || null]
        );

        const userId = result.insertId;

        if (role === 'guru') {
            await db.execute(
                'INSERT INTO guru (user_id, nip, spesialisasi) VALUES (?, ?, ?)',
                [userId, nip || null, spesialisasi || 'Guru Kelas']
            );
        }

        await db.execute(
            'INSERT INTO log_aktivitas (user_id, aksi, detail) VALUES (?, ?, ?)',
            [req.user.id, 'Buat Akun', `Akun baru: ${nama} (${role})`]
        );

        res.status(201).json({ success: true, message: 'Akun berhasil dibuat', data: { id: userId } });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Email sudah terdaftar' });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PUT /api/users/:id
const update = async (req, res) => {
    try {
        const { nama, no_hp, is_aktif, nip, spesialisasi } = req.body;
        await db.execute(
            'UPDATE users SET nama=?, no_hp=?, is_aktif=? WHERE user_id=?',
            [nama, no_hp, is_aktif, req.params.id]
        );

        const [guruRows] = await db.execute('SELECT guru_id AS id FROM guru WHERE user_id = ?', [req.params.id]);
        if (guruRows.length) {
            await db.execute(
                'UPDATE guru SET nip=?, spesialisasi=? WHERE user_id=?',
                [nip, spesialisasi, req.params.id]
            );
        }

        res.json({ success: true, message: 'Akun berhasil diperbarui' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PUT /api/users/:id/reset-password - Admin reset password
const resetPassword = async (req, res) => {
    try {
        const { password_baru } = req.body;
        const hashed = await bcrypt.hash(password_baru || '12345678', 10);
        await db.execute('UPDATE users SET password=? WHERE user_id=?', [hashed, req.params.id]);

        await db.execute(
            'INSERT INTO log_aktivitas (user_id, aksi, detail) VALUES (?, ?, ?)',
            [req.user.id, 'Reset Password', `Reset password user ID: ${req.params.id}`]
        );

        res.json({ success: true, message: 'Password berhasil direset' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/users/guru - List guru dengan info kelas
const getGuru = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT u.user_id AS id, u.nama, u.email, u.no_hp, u.is_aktif,
                   g.guru_id AS guru_id, g.nip, g.spesialisasi,
                   GROUP_CONCAT(DISTINCT k.nama_kelas ORDER BY k.nama_kelas SEPARATOR ', ') AS kelas,
                   COUNT(DISTINCT kg.kelas_id) AS jml_kelas,
                   (SELECT COUNT(*) FROM perkembangan_harian ph WHERE ph.guru_id = g.guru_id 
                    AND ph.tanggal = CURDATE()) AS input_hari_ini,
                   (SELECT COUNT(DISTINCT s.siswa_id) FROM siswa s 
                    JOIN kelas k2 ON k2.kelas_id = s.kelas_id 
                    JOIN kelas_guru kg2 ON kg2.kelas_id = k2.kelas_id AND kg2.guru_id = g.guru_id) AS total_siswa
            FROM users u
            JOIN guru g ON g.user_id = u.user_id
            LEFT JOIN kelas_guru kg ON kg.guru_id = g.guru_id
            LEFT JOIN kelas k ON k.kelas_id = kg.kelas_id
            GROUP BY u.user_id
            ORDER BY u.nama
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/users/guru/kinerja - Kinerja input guru (kepsek view)
const getKinerjaGuru = async (req, res) => {
    try {
        const { bulan, tahun } = req.query;
        const m = bulan || new Date().getMonth() + 1;
        const y = tahun || new Date().getFullYear();

        const [rows] = await db.execute(`
            SELECT u.user_id AS user_id,
                   u.nama AS nama_guru,
                   GROUP_CONCAT(DISTINCT k.nama_kelas ORDER BY k.nama_kelas SEPARATOR ', ') AS kelas,
                   COUNT(DISTINCT ph.perkembangan_id) AS total_input,
                   COUNT(DISTINCT s.siswa_id) AS total_siswa,
                   ROUND(COUNT(DISTINCT ph.perkembangan_id) / (COUNT(DISTINCT s.siswa_id) * 5) * 100, 0) AS persen_tepat_waktu,
                   MAX(ph.tanggal) AS input_terakhir,
                   CASE WHEN COUNT(DISTINCT ph.perkembangan_id) / (COUNT(DISTINCT s.siswa_id) * 5) >= 0.9 THEN 'Baik'
                        WHEN COUNT(DISTINCT ph.perkembangan_id) / (COUNT(DISTINCT s.siswa_id) * 5) >= 0.6 THEN 'Cukup'
                        ELSE 'Perlu Perhatian' END AS status
            FROM guru g
            JOIN users u ON u.user_id = g.user_id
            LEFT JOIN kelas_guru kg ON kg.guru_id = g.guru_id
            LEFT JOIN kelas k ON k.kelas_id = kg.kelas_id
            LEFT JOIN siswa s ON s.kelas_id = k.kelas_id AND s.is_aktif = 1
            LEFT JOIN perkembangan_harian ph ON ph.guru_id = g.guru_id
                AND MONTH(ph.tanggal) = ? AND YEAR(ph.tanggal) = ?
            GROUP BY g.guru_id
            ORDER BY persen_tepat_waktu ASC
        `, [m, y]);

        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = { getAll, create, update, resetPassword, getGuru, getKinerjaGuru };
