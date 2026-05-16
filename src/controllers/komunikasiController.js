const db = require('../config/database');

// ============================================================
// PESAN (Direct Messages)
// ============================================================

// GET /api/pesan/inbox
const getInbox = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT p.*, u.nama AS nama_pengirim, u.role AS role_pengirim,
                   s.nama AS nama_siswa
            FROM pesan p
            JOIN users u ON u.id = p.pengirim_id
            LEFT JOIN siswa s ON s.id = p.siswa_id
            WHERE p.penerima_id = ?
            ORDER BY p.created_at DESC
        `, [req.user.id]);

        const unreadCount = rows.filter(r => !r.is_dibaca).length;
        res.json({ success: true, data: rows, unread: unreadCount });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/pesan/percakapan/:userId - Thread dengan user tertentu
const getPercakapan = async (req, res) => {
    try {
        const otherId = req.params.userId;
        const [rows] = await db.execute(`
            SELECT p.*, u_from.nama AS nama_pengirim
            FROM pesan p
            JOIN users u_from ON u_from.id = p.pengirim_id
            WHERE (p.pengirim_id = ? AND p.penerima_id = ?)
               OR (p.pengirim_id = ? AND p.penerima_id = ?)
            ORDER BY p.created_at ASC
        `, [req.user.id, otherId, otherId, req.user.id]);

        // Mark as read
        await db.execute(
            'UPDATE pesan SET is_dibaca = 1, dibaca_pada = NOW() WHERE penerima_id = ? AND pengirim_id = ? AND is_dibaca = 0',
            [req.user.id, otherId]
        );

        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/pesan/kontak - Daftar kontak yang bisa dikirim pesan
const getKontak = async (req, res) => {
    try {
        let query = `SELECT u.id, u.nama, u.role, u.foto FROM users u WHERE u.id != ? AND u.is_aktif = 1`;
        const params = [req.user.id];

        // Guru hanya chat dengan wali murid dari kelas yang dia ampu.
        if (req.user.role === 'guru') {
            query += ` AND u.role = 'wali' AND u.id IN (
                SELECT DISTINCT ws.user_id
                FROM wali_siswa ws
                JOIN siswa s ON s.id = ws.siswa_id
                JOIN kelas_guru kg ON kg.kelas_id = s.kelas_id
                JOIN guru g ON g.id = kg.guru_id
                WHERE g.user_id = ?
            )`;
            params.push(req.user.id);
        }

        // Wali hanya bisa chat dengan guru kelasnya
        if (req.user.role === 'wali') {
            query += ` AND u.role = 'guru' AND u.id IN (
                SELECT DISTINCT gu.id FROM users gu
                JOIN guru g ON g.user_id = gu.id
                JOIN kelas_guru kg ON kg.guru_id = g.id
                JOIN siswa s ON s.kelas_id = kg.kelas_id
                JOIN wali_siswa ws ON ws.siswa_id = s.id AND ws.user_id = ?
            )`;
            params.push(req.user.id);
        }

        query += ' ORDER BY u.role, u.nama';
        const [rows] = await db.execute(query, params);

        // Tambahkan ringkasan percakapan per kontak
        for (const kontak of rows) {
            const [unread] = await db.execute(
                'SELECT COUNT(*) AS cnt FROM pesan WHERE pengirim_id = ? AND penerima_id = ? AND is_dibaca = 0',
                [kontak.id, req.user.id]
            );
            kontak.unread = unread[0].cnt;

            const [lastMessages] = await db.execute(`
                SELECT isi, created_at
                FROM pesan
                WHERE (pengirim_id = ? AND penerima_id = ?)
                   OR (pengirim_id = ? AND penerima_id = ?)
                ORDER BY created_at DESC
                LIMIT 1
            `, [req.user.id, kontak.id, kontak.id, req.user.id]);

            kontak.last_message = lastMessages[0]?.isi || null;
            kontak.last_message_at = lastMessages[0]?.created_at || null;

            let siswaQuery = `
                SELECT GROUP_CONCAT(DISTINCT s.nama ORDER BY s.nama SEPARATOR ', ') AS nama_siswa
                FROM wali_siswa ws
                JOIN siswa s ON s.id = ws.siswa_id
                WHERE ws.user_id = ?
            `;
            const siswaParams = [kontak.id];

            if (req.user.role === 'guru') {
                siswaQuery += `
                    AND s.kelas_id IN (
                        SELECT kg.kelas_id
                        FROM kelas_guru kg
                        JOIN guru g ON g.id = kg.guru_id
                        WHERE g.user_id = ?
                    )
                `;
                siswaParams.push(req.user.id);
            }

            if (req.user.role === 'wali') {
                siswaQuery += `
                    AND s.kelas_id IN (
                        SELECT kg.kelas_id
                        FROM kelas_guru kg
                        JOIN guru g ON g.id = kg.guru_id
                        WHERE g.user_id = ?
                    )
                `;
                siswaParams.push(kontak.id);
            }

            const [siswaRows] = await db.execute(siswaQuery, siswaParams);
            kontak.nama_siswa = siswaRows[0]?.nama_siswa || null;
        }

        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/pesan
const kirimPesan = async (req, res) => {
    try {
        const { penerima_id, isi, siswa_id, subjek } = req.body;
        if (!penerima_id || !isi) {
            return res.status(400).json({ success: false, message: 'Penerima dan isi pesan wajib diisi' });
        }

        const [penerimaRows] = await db.execute(
            'SELECT id, role FROM users WHERE id = ? AND is_aktif = 1',
            [penerima_id]
        );

        if (!penerimaRows.length) {
            return res.status(404).json({ success: false, message: 'Penerima tidak ditemukan' });
        }

        if (req.user.role === 'guru') {
            const [allowedRows] = await db.execute(`
                SELECT 1
                FROM wali_siswa ws
                JOIN siswa s ON s.id = ws.siswa_id
                JOIN kelas_guru kg ON kg.kelas_id = s.kelas_id
                JOIN guru g ON g.id = kg.guru_id
                WHERE g.user_id = ? AND ws.user_id = ?
                LIMIT 1
            `, [req.user.id, penerima_id]);

            if (!allowedRows.length) {
                return res.status(403).json({ success: false, message: 'Anda hanya dapat mengirim pesan ke wali murid kelas yang diampu' });
            }
        }

        if (req.user.role === 'wali') {
            const [allowedRows] = await db.execute(`
                SELECT 1
                FROM guru g
                JOIN kelas_guru kg ON kg.guru_id = g.id
                JOIN siswa s ON s.kelas_id = kg.kelas_id
                JOIN wali_siswa ws ON ws.siswa_id = s.id
                WHERE ws.user_id = ? AND g.user_id = ?
                LIMIT 1
            `, [req.user.id, penerima_id]);

            if (!allowedRows.length) {
                return res.status(403).json({ success: false, message: 'Anda hanya dapat mengirim pesan ke guru kelas anak' });
            }
        }

        const [result] = await db.execute(
            'INSERT INTO pesan (pengirim_id, penerima_id, siswa_id, subjek, isi) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, penerima_id, siswa_id || null, subjek || null, isi]
        );

        res.status(201).json({ success: true, message: 'Pesan terkirim', data: { id: result.insertId } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PUT /api/pesan/:id/baca
const bacaPesan = async (req, res) => {
    try {
        await db.execute(
            'UPDATE pesan SET is_dibaca = 1, dibaca_pada = NOW() WHERE id = ? AND penerima_id = ?',
            [req.params.id, req.user.id]
        );
        res.json({ success: true, message: 'Pesan ditandai dibaca' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============================================================
// PENGUMUMAN (Announcements)
// ============================================================

// GET /api/pengumuman
const getPengumuman = async (req, res) => {
    try {
        const role = req.user.role;
        const params = [req.user.id, role];
        let visibilityFilter = `
              AND (pg.target_role = 'semua' OR pg.target_role = ?)
        `;

        if (role === 'wali') {
            visibilityFilter += `
              AND (
                    pg.kelas_id IS NULL
                    OR pg.kelas_id IN (
                        SELECT s.kelas_id
                        FROM wali_siswa ws
                        JOIN siswa s ON s.id = ws.siswa_id
                        WHERE ws.user_id = ?
                    )
              )
            `;
            params.push(req.user.id);
        }

        const [rows] = await db.execute(`
            SELECT pg.*, u.nama AS nama_pengirim, k.nama_kelas,
                   (SELECT COUNT(*) FROM pengumuman_read pr WHERE pr.pengumuman_id = pg.id) AS total_dibaca,
                   CASE
                       WHEN pg.target_role = 'wali' AND pg.kelas_id IS NOT NULL THEN (
                           SELECT COUNT(DISTINCT ws.user_id)
                           FROM wali_siswa ws
                           JOIN siswa s ON s.id = ws.siswa_id
                           JOIN users u2 ON u2.id = ws.user_id AND u2.is_aktif = 1
                           WHERE s.kelas_id = pg.kelas_id
                       )
                       ELSE (
                           SELECT COUNT(*)
                           FROM users u2
                           WHERE u2.is_aktif = 1
                             AND (pg.target_role = 'semua' OR u2.role = pg.target_role)
                       )
                   END AS total_penerima,
                   EXISTS(SELECT 1 FROM pengumuman_read pr WHERE pr.pengumuman_id = pg.id AND pr.user_id = ?) AS sudah_dibaca
            FROM pengumuman pg
            JOIN users u ON u.id = pg.pengirim_id
            LEFT JOIN kelas k ON k.id = pg.kelas_id
            WHERE pg.status = 'Terkirim'
              ${visibilityFilter}
            ORDER BY pg.created_at DESC
        `, params);

        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/pengumuman - Admin/Kepsek/Guru
const buatPengumuman = async (req, res) => {
    try {
        const { judul, isi, target_role, kelas_id, status } = req.body;
        if (!judul || !isi) {
            return res.status(400).json({ success: false, message: 'Judul dan isi wajib diisi' });
        }

        let targetRole = target_role || 'semua';
        let kelasId = kelas_id || null;

        if (req.user.role === 'guru') {
            targetRole = 'wali';

            if (!kelasId) {
                return res.status(400).json({ success: false, message: 'Guru wajib memilih kelas tujuan' });
            }

            const [allowedRows] = await db.execute(`
                SELECT 1
                FROM guru g
                JOIN kelas_guru kg ON kg.guru_id = g.id
                WHERE g.user_id = ? AND kg.kelas_id = ?
                LIMIT 1
            `, [req.user.id, kelasId]);

            if (!allowedRows.length) {
                return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke kelas ini' });
            }
        }

        const [result] = await db.execute(
            'INSERT INTO pengumuman (pengirim_id, judul, isi, target_role, kelas_id, status) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, judul, isi, targetRole, kelasId, status || 'Terkirim']
        );

        res.status(201).json({ success: true, message: 'Pengumuman berhasil dibuat', data: { id: result.insertId } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PUT /api/pengumuman/:id/baca
const bacaPengumuman = async (req, res) => {
    try {
        await db.execute(
            'INSERT IGNORE INTO pengumuman_read (pengumuman_id, user_id) VALUES (?, ?)',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    getInbox, getPercakapan, getKontak, kirimPesan, bacaPesan,
    getPengumuman, buatPengumuman, bacaPengumuman
};
