const db = require('../config/database');

// GET /api/kelas
const getAll = async (req, res) => {
    try {
        const { tahun_ajaran, is_aktif } = req.query;
        let query = `
            SELECT k.id, k.nama_kelas, k.tingkat_id, k.tahun_ajaran, k.kapasitas, k.is_aktif,
                   t.nama AS tingkat_nama,
                   COUNT(DISTINCT s.id) AS jml_siswa,
                   ANY_VALUE(u.nama) AS nama_wali_kelas,
                   ANY_VALUE(g.id) AS guru_id
            FROM kelas k
            JOIN tingkat t ON t.id = k.tingkat_id
            LEFT JOIN siswa s ON s.kelas_id = k.id AND s.is_aktif = 1
            LEFT JOIN kelas_guru kg ON kg.kelas_id = k.id AND kg.is_wali_kelas = 1
            LEFT JOIN guru g ON g.id = kg.guru_id
            LEFT JOIN users u ON u.id = g.user_id
            WHERE 1=1
        `;
        const params = [];
        if (tahun_ajaran) { query += ' AND k.tahun_ajaran = ?'; params.push(tahun_ajaran); }
        if (is_aktif !== undefined) { query += ' AND k.is_aktif = ?'; params.push(is_aktif); }
        query += ' GROUP BY k.id, t.nama ORDER BY k.nama_kelas';

        const [rows] = await db.execute(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('kelasController.getAll error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/kelas/:id
const getById = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT k.*, t.nama AS tingkat_nama
            FROM kelas k JOIN tingkat t ON t.id = k.tingkat_id
            WHERE k.id = ?
        `, [req.params.id]);

        if (!rows.length) return res.status(404).json({ success: false, message: 'Kelas tidak ditemukan' });

        const [siswa] = await db.execute(
            'SELECT id, nama, nisn, kebutuhan_khusus, foto FROM siswa WHERE kelas_id = ? AND is_aktif = 1 ORDER BY nama',
            [req.params.id]
        );

        const [guru] = await db.execute(`
            SELECT g.id, u.nama, u.email, g.spesialisasi, kg.is_wali_kelas
            FROM kelas_guru kg
            JOIN guru g ON g.id = kg.guru_id
            JOIN users u ON u.id = g.user_id
            WHERE kg.kelas_id = ?
        `, [req.params.id]);

        res.json({ success: true, data: { ...rows[0], siswa, guru } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/kelas - Admin only
const create = async (req, res) => {
    try {
        const { nama_kelas, tingkat_id, tahun_ajaran, kapasitas } = req.body;
        const [result] = await db.execute(
            'INSERT INTO kelas (nama_kelas, tingkat_id, tahun_ajaran, kapasitas) VALUES (?, ?, ?, ?)',
            [nama_kelas, tingkat_id, tahun_ajaran, kapasitas || 10]
        );
        res.status(201).json({ success: true, message: 'Kelas berhasil dibuat', data: { id: result.insertId } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PUT /api/kelas/:id
const update = async (req, res) => {
    try {
        const { nama_kelas, kapasitas, is_aktif } = req.body;
        await db.execute(
            'UPDATE kelas SET nama_kelas=?, kapasitas=?, is_aktif=? WHERE id=?',
            [nama_kelas, kapasitas, is_aktif, req.params.id]
        );
        res.json({ success: true, message: 'Kelas berhasil diperbarui' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/kelas/:id/guru - Assign guru ke kelas
const assignGuru = async (req, res) => {
    try {
        const { guru_id, is_wali_kelas } = req.body;
        await db.execute(
            `INSERT INTO kelas_guru (kelas_id, guru_id, is_wali_kelas) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE is_wali_kelas = VALUES(is_wali_kelas)`,
            [req.params.id, guru_id, is_wali_kelas || false]
        );
        res.json({ success: true, message: 'Guru berhasil ditugaskan' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// DELETE /api/kelas/:kelasId/guru/:guruId
const removeGuru = async (req, res) => {
    try {
        await db.execute(
            'DELETE FROM kelas_guru WHERE kelas_id = ? AND guru_id = ?',
            [req.params.kelasId, req.params.guruId]
        );
        res.json({ success: true, message: 'Guru berhasil dihapus dari kelas' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/kelas/guru/saya - Kelas milik guru yang login
const getKelasSaya = async (req, res) => {
    try {
        const [guruRows] = await db.execute('SELECT id FROM guru WHERE user_id = ?', [req.user.id]);
        if (!guruRows.length) return res.json({ success: true, data: [] });

        const [rows] = await db.execute(`
            SELECT k.id, k.nama_kelas, k.tingkat_id, k.tahun_ajaran, k.kapasitas, k.is_aktif,
                   ANY_VALUE(t.nama) AS tingkat_nama,
                   ANY_VALUE(kg.is_wali_kelas) AS is_wali_kelas,
                   COUNT(DISTINCT s.id) AS jml_siswa,
                   (SELECT COUNT(*) FROM perkembangan_harian ph 
                    JOIN siswa s2 ON s2.id = ph.siswa_id AND s2.kelas_id = k.id
                    WHERE ph.guru_id = ? AND ph.tanggal = CURDATE()) AS input_hari_ini,
                   (SELECT COUNT(*) FROM pesan p WHERE p.penerima_id = ? AND p.is_dibaca = 0) AS pesan_masuk
            FROM kelas k
            JOIN tingkat t ON t.id = k.tingkat_id
            JOIN kelas_guru kg ON kg.kelas_id = k.id AND kg.guru_id = ?
            LEFT JOIN siswa s ON s.kelas_id = k.id AND s.is_aktif = 1
            WHERE k.is_aktif = 1
            GROUP BY k.id
        `, [guruRows[0].id, req.user.id, guruRows[0].id]);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('kelasController.getKelasSaya error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = { getAll, getById, create, update, assignGuru, removeGuru, getKelasSaya };
