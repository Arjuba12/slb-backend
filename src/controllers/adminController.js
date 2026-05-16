const db = require('../config/database');

// ============================================================
// PENGATURAN SISTEM
// ============================================================

// GET /api/pengaturan
const getPengaturan = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM pengaturan ORDER BY kunci');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PUT /api/pengaturan - Update multiple settings
const updatePengaturan = async (req, res) => {
    try {
        const { settings } = req.body;
        // settings: [{ kunci, nilai }, ...]
        for (const s of settings) {
            await db.execute(
                'INSERT INTO pengaturan (kunci, nilai) VALUES (?, ?) ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)',
                [s.kunci, s.nilai]
            );
        }
        await db.execute(
            'INSERT INTO log_aktivitas (user_id, aksi, detail) VALUES (?, ?, ?)',
            [req.user.id, 'Update Pengaturan', `${settings.length} pengaturan diperbarui`]
        );
        res.json({ success: true, message: 'Pengaturan berhasil disimpan' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============================================================
// LOG AKTIVITAS
// ============================================================

// GET /api/log
const getLogs = async (req, res) => {
    try {
        const { tanggal, user_id, limit = 50 } = req.query;
        let query = `
            SELECT la.*, u.nama, u.role
            FROM log_aktivitas la
            LEFT JOIN users u ON u.id = la.user_id
            WHERE 1=1
        `;
        const params = [];
        if (tanggal) { query += ' AND DATE(la.created_at) = ?'; params.push(tanggal); }
        if (user_id) { query += ' AND la.user_id = ?'; params.push(user_id); }
        query += ` ORDER BY la.created_at DESC LIMIT ${parseInt(limit)}`;

        const [rows] = await db.execute(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============================================================
// KEGIATAN / KALENDER
// ============================================================

let kegiatanBannerColumnChecked = false;
const ensureKegiatanBannerColumn = async () => {
    if (kegiatanBannerColumnChecked) return;

    const [columns] = await db.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'kegiatan'
          AND COLUMN_NAME = 'banner_url'
    `);

    if (!columns.length) {
        await db.execute('ALTER TABLE kegiatan ADD COLUMN banner_url VARCHAR(500) NULL AFTER lokasi');
    }

    kegiatanBannerColumnChecked = true;
};

// GET /api/kegiatan
const getKegiatan = async (req, res) => {
    try {
        await ensureKegiatanBannerColumn();

        const { bulan, tahun } = req.query;
        let query = `
            SELECT kg.*, u.nama AS nama_pembuat
            FROM kegiatan kg
            LEFT JOIN users u ON u.id = kg.dibuat_oleh
            WHERE 1=1
        `;
        const params = [];
        if (bulan && tahun) {
            query += ' AND MONTH(kg.tanggal) = ? AND YEAR(kg.tanggal) = ?';
            params.push(bulan, tahun);
        }
        query += ' ORDER BY kg.tanggal, kg.waktu_mulai';

        const [rows] = await db.execute(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/kegiatan
const createKegiatan = async (req, res) => {
    try {
        await ensureKegiatanBannerColumn();

        const { judul, deskripsi, tanggal, waktu_mulai, waktu_selesai, lokasi, tipe, banner_url } = req.body;
        const [result] = await db.execute(
            'INSERT INTO kegiatan (judul, deskripsi, tanggal, waktu_mulai, waktu_selesai, lokasi, banner_url, tipe, dibuat_oleh) VALUES (?,?,?,?,?,?,?,?,?)',
            [judul, deskripsi, tanggal, waktu_mulai, waktu_selesai, lokasi, banner_url || null, tipe || 'Lainnya', req.user.id]
        );
        res.status(201).json({ success: true, message: 'Kegiatan berhasil ditambahkan', data: { id: result.insertId } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// DELETE /api/kegiatan/:id
const deleteKegiatan = async (req, res) => {
    try {
        await db.execute('DELETE FROM kegiatan WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Kegiatan berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============================================================
// ASPEK PERKEMBANGAN
// ============================================================

// GET /api/aspek
const getAspek = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM aspek_perkembangan WHERE is_aktif = 1 ORDER BY id');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PUT /api/aspek/:id - Admin only, update bobot
const updateAspek = async (req, res) => {
    try {
        const { bobot, deskripsi } = req.body;
        await db.execute('UPDATE aspek_perkembangan SET bobot=?, deskripsi=? WHERE id=?', [bobot, deskripsi, req.params.id]);
        res.json({ success: true, message: 'Aspek berhasil diperbarui' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/tingkat
const getTingkat = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM tingkat ORDER BY id');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    getPengaturan, updatePengaturan,
    getLogs,
    getKegiatan, createKegiatan, deleteKegiatan,
    getAspek, updateAspek, getTingkat
};
