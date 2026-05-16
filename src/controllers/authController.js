const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const getPrimaryWaliSiswa = async (userId) => {
    const [rows] = await db.execute(
        `SELECT ws.siswa_id,
                s.nama AS nama_siswa,
                s.kelas_id,
                k.nama_kelas,
                ws.hubungan
         FROM wali_siswa ws
         JOIN siswa s ON s.id = ws.siswa_id
         LEFT JOIN kelas k ON k.id = s.kelas_id
         WHERE ws.user_id = ? AND s.is_aktif = 1
         ORDER BY ws.id
         LIMIT 1`,
        [userId]
    );

    return rows[0] || null;
};

// POST /api/auth/login
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email dan password wajib diisi' });
        }

        const [rows] = await db.execute(
            'SELECT * FROM users WHERE email = ? AND is_aktif = 1',
            [email]
        );

        if (!rows.length) {
            return res.status(401).json({ success: false, message: 'Email atau password salah' });
        }

        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ success: false, message: 'Email atau password salah' });
        }

        // Update last login
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await db.execute(
            'UPDATE users SET last_login = NOW(), login_ip = ? WHERE id = ?',
            [ip, user.id]
        );

        // Log aktivitas
        await db.execute(
            'INSERT INTO log_aktivitas (user_id, aksi, detail, ip_address) VALUES (?, ?, ?, ?)',
            [user.id, 'Login', `Login berhasil`, ip]
        );

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        const waliSiswa = user.role === 'wali' ? await getPrimaryWaliSiswa(user.id) : null;

        res.json({
            success: true,
            message: 'Login berhasil',
            data: {
                token,
                user: {
                    id: user.id,
                    nama: user.nama,
                    email: user.email,
                    role: user.role,
                    foto: user.foto,
                    siswa_id: waliSiswa ? waliSiswa.siswa_id : null,
                    nama_siswa: waliSiswa ? waliSiswa.nama_siswa : null,
                    kelas_id: waliSiswa ? waliSiswa.kelas_id : null,
                    nama_kelas: waliSiswa ? waliSiswa.nama_kelas : null,
                    hubungan: waliSiswa ? waliSiswa.hubungan : null
                }
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/auth/me
const getMe = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT u.id, u.nama, u.email, u.role, u.no_hp, u.foto, u.last_login,
             g.id AS guru_id, g.nip, g.spesialisasi
             FROM users u
             LEFT JOIN guru g ON g.user_id = u.id
             WHERE u.id = ?`,
            [req.user.id]
        );
        const data = rows[0];
        if (data && data.role === 'wali') {
            const waliSiswa = await getPrimaryWaliSiswa(data.id);
            if (waliSiswa) {
                data.siswa_id = waliSiswa.siswa_id;
                data.nama_siswa = waliSiswa.nama_siswa;
                data.kelas_id = waliSiswa.kelas_id;
                data.nama_kelas = waliSiswa.nama_kelas;
                data.hubungan = waliSiswa.hubungan;
            }
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PUT /api/auth/change-password
const changePassword = async (req, res) => {
    try {
        const { password_lama, password_baru } = req.body;
        if (!password_lama || !password_baru) {
            return res.status(400).json({ success: false, message: 'Password lama dan baru wajib diisi' });
        }
        if (password_baru.length < 6) {
            return res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter' });
        }
        const [rows] = await db.execute('SELECT password FROM users WHERE id = ?', [req.user.id]);
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }
        const valid = await bcrypt.compare(password_lama, rows[0].password);
        if (!valid) {
            return res.status(400).json({ success: false, message: 'Password lama salah' });
        }
        const hashed = await bcrypt.hash(password_baru, 10);
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
        res.json({ success: true, message: 'Password berhasil diubah' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PUT /api/auth/profile
const updateProfile = async (req, res) => {
    try {
        const { nama, email, no_hp, nip, spesialisasi } = req.body;

        if (!nama || !email) {
            return res.status(400).json({ success: false, message: 'Nama dan email wajib diisi' });
        }

        const [duplicateEmail] = await db.execute(
            'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1',
            [email, req.user.id]
        );

        if (duplicateEmail.length) {
            return res.status(400).json({ success: false, message: 'Email sudah digunakan user lain' });
        }

        await db.execute(
            'UPDATE users SET nama = ?, email = ?, no_hp = ? WHERE id = ?',
            [nama, email, no_hp || null, req.user.id]
        );

        if (req.user.role === 'guru') {
            await db.execute(
                'UPDATE guru SET nip = ?, spesialisasi = ? WHERE user_id = ?',
                [nip || null, spesialisasi || null, req.user.id]
            );
        }

        const [rows] = await db.execute(
            `SELECT u.id, u.nama, u.email, u.role, u.no_hp, u.foto, u.last_login,
             g.id AS guru_id, g.nip, g.spesialisasi
             FROM users u
             LEFT JOIN guru g ON g.user_id = u.id
             WHERE u.id = ?`,
            [req.user.id]
        );

        const data = rows[0];
        if (data && data.role === 'wali') {
            const waliSiswa = await getPrimaryWaliSiswa(data.id);
            if (waliSiswa) {
                data.siswa_id = waliSiswa.siswa_id;
                data.nama_siswa = waliSiswa.nama_siswa;
                data.kelas_id = waliSiswa.kelas_id;
                data.nama_kelas = waliSiswa.nama_kelas;
                data.hubungan = waliSiswa.hubungan;
            }
        }

        res.json({ success: true, message: 'Profil berhasil diperbarui', data });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = { login, getMe, changePassword, updateProfile };
