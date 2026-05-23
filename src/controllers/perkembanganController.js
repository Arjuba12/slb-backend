const db = require('../config/database');

// GET /api/perkembangan/siswa/:siswaId
const getBySiswa = async (req, res) => {
    try {
        const { semester, tahun_ajaran, aspek_id } = req.query;
        const siswaId = req.params.siswaId;

        let query = `
            SELECT ph.*, ph.perkembangan_id AS id, ap.nama AS aspek_nama, ap.kode AS aspek_kode,
                   u.nama AS nama_guru
            FROM perkembangan_harian ph
            JOIN aspek_perkembangan ap ON ap.aspek_id = ph.aspek_id
            JOIN guru g ON g.guru_id = ph.guru_id
            JOIN users u ON u.user_id = g.user_id
            WHERE ph.siswa_id = ?
        `;
        const params = [siswaId];

        if (aspek_id) { query += ' AND ph.aspek_id = ?'; params.push(aspek_id); }
        if (tahun_ajaran) {
            const [y1, y2] = tahun_ajaran.split('/');
            query += ` AND ph.tanggal BETWEEN '${y1}-07-01' AND '${y2}-06-30'`;
        }

        query += ' ORDER BY ph.tanggal DESC';
        const [rows] = await db.execute(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/perkembangan/siswa/:siswaId/ringkasan - per aspek per bulan
const getRingkasanSiswa = async (req, res) => {
    try {
        const siswaId = req.params.siswaId;
        const requestedMonthCount = parseInt(req.query.bulan_count || 5, 10);
        const bulanCount = Number.isNaN(requestedMonthCount)
            ? 5
            : Math.min(Math.max(requestedMonthCount, 1), 12);

        const [rows] = await db.execute(`
            SELECT 
                DATE_FORMAT(ph.tanggal, '%b') AS bulan_label,
                DATE_FORMAT(ph.tanggal, '%Y-%m') AS bulan_key,
                ap.nama AS aspek,
                ap.kode,
                ROUND(AVG(ph.capaian), 1) AS rata_rata
            FROM perkembangan_harian ph
            JOIN aspek_perkembangan ap ON ap.aspek_id = ph.aspek_id
            WHERE ph.siswa_id = ?
              AND ph.tanggal >= DATE_SUB(CURDATE(), INTERVAL ${bulanCount} MONTH)
            GROUP BY bulan_key, bulan_label, ap.aspek_id, ap.nama, ap.kode
            ORDER BY bulan_key, ap.aspek_id
        `, [siswaId]);

        // Trend terbaru per aspek
        const [trendRows] = await db.execute(`
            SELECT ap.nama, ap.kode,
                   ROUND(AVG(CASE WHEN ph.tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN ph.capaian END), 1) AS bulan_ini,
                   ROUND(AVG(CASE WHEN ph.tanggal BETWEEN DATE_SUB(CURDATE(), INTERVAL 60 DAY) AND DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN ph.capaian END), 1) AS bulan_lalu
            FROM aspek_perkembangan ap
            LEFT JOIN perkembangan_harian ph ON ph.aspek_id = ap.aspek_id AND ph.siswa_id = ?
            WHERE ap.is_aktif = 1
            GROUP BY ap.aspek_id, ap.nama, ap.kode
        `, [siswaId]);

        const trend = trendRows.map(r => ({
            ...r,
            trend: r.bulan_ini && r.bulan_lalu
                ? r.bulan_ini > r.bulan_lalu ? 'Naik' : r.bulan_ini < r.bulan_lalu ? 'Lambat' : 'Stabil'
                : 'Belum ada data'
        }));

        res.json({ success: true, data: { history: rows, trend } });
    } catch (err) {
        console.error('getRingkasanSiswa error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/perkembangan - Guru input harian
const create = async (req, res) => {
    try {
        const { siswa_id, tanggal, aspek_id, capaian, catatan } = req.body;
        if (!siswa_id || !tanggal || !aspek_id || capaian === undefined) {
            return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
        }

        const [guruRows] = await db.execute('SELECT guru_id AS id FROM guru WHERE user_id = ?', [req.user.id]);
        if (!guruRows.length) return res.status(403).json({ success: false, message: 'Hanya guru yang bisa input perkembangan' });

        const guruId = guruRows[0].id;

        const [existing] = await db.execute(
            'SELECT perkembangan_id AS id FROM perkembangan_harian WHERE siswa_id = ? AND tanggal = ? AND aspek_id = ? LIMIT 1',
            [siswa_id, tanggal, aspek_id]
        );

        if (existing.length) {
            await db.execute(`
                UPDATE perkembangan_harian
                SET guru_id = ?, capaian = ?, catatan = ?, updated_at = NOW()
                WHERE perkembangan_id = ?
            `, [guruId, capaian, catatan, existing[0].id]);
        } else {
            await db.execute(`
                INSERT INTO perkembangan_harian (siswa_id, guru_id, tanggal, aspek_id, capaian, catatan)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [siswa_id, guruId, tanggal, aspek_id, capaian, catatan]);
        }

        res.json({ success: true, message: 'Perkembangan berhasil disimpan' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/perkembangan/batch - Input semua aspek sekaligus
const createBatch = async (req, res) => {
    try {
        const { siswa_id, tanggal, aspek_list } = req.body;
        // aspek_list: [{ aspek_id, capaian, catatan }, ...]

        if (!siswa_id || !tanggal || !Array.isArray(aspek_list) || !aspek_list.length) {
            return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
        }

        const [guruRows] = await db.execute('SELECT guru_id AS id FROM guru WHERE user_id = ?', [req.user.id]);
        if (!guruRows.length) return res.status(403).json({ success: false, message: 'Akses ditolak' });

        const guruId = guruRows[0].id;
        let saved = 0;

        for (const item of aspek_list) {
            if (item.capaian !== null && item.capaian !== undefined) {
                const [existing] = await db.execute(
                    'SELECT perkembangan_id AS id FROM perkembangan_harian WHERE siswa_id = ? AND tanggal = ? AND aspek_id = ? LIMIT 1',
                    [siswa_id, tanggal, item.aspek_id]
                );

                if (existing.length) {
                    await db.execute(`
                        UPDATE perkembangan_harian
                        SET guru_id = ?, capaian = ?, catatan = ?, updated_at = NOW()
                        WHERE perkembangan_id = ?
                    `, [guruId, item.capaian, item.catatan || null, existing[0].id]);
                } else {
                    await db.execute(`
                        INSERT INTO perkembangan_harian (siswa_id, guru_id, tanggal, aspek_id, capaian, catatan)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [siswa_id, guruId, tanggal, item.aspek_id, item.capaian, item.catatan || null]);
                }
                saved++;
            }
        }

        res.json({ success: true, message: `${saved} aspek berhasil disimpan` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/perkembangan/kelas/:kelasId/rekap - Rekap per kelas
const getRekapKelas = async (req, res) => {
    try {
        const kelasId = req.params.kelasId;
        const { semester, tahun_ajaran } = req.query;

        const [rows] = await db.execute(`
            SELECT s.siswa_id AS siswa_id, s.nama,
                   ROUND(AVG(CASE WHEN ap.kode='kognitif' THEN ph.capaian END), 0) AS kognitif,
                   ROUND(AVG(CASE WHEN ap.kode='sosial' THEN ph.capaian END), 0) AS sosial,
                   ROUND(AVG(CASE WHEN ap.kode='motorik' THEN ph.capaian END), 0) AS motorik,
                   ROUND(AVG(CASE WHEN ap.kode='komunikasi' THEN ph.capaian END), 0) AS komunikasi,
                   ROUND(AVG(CASE WHEN ap.kode='bina_diri' THEN ph.capaian END), 0) AS bina_diri,
                   ROUND(AVG(ph.capaian), 0) AS rata_rata,
                   (SELECT COUNT(*) FROM absensi a WHERE a.siswa_id = s.siswa_id 
                    AND a.status = 'Hadir' AND MONTH(a.tanggal) = MONTH(CURDATE())) AS hadir,
                   (SELECT COUNT(*) FROM absensi a WHERE a.siswa_id = s.siswa_id 
                    AND a.status = 'Sakit' AND MONTH(a.tanggal) = MONTH(CURDATE())) AS sakit,
                   (SELECT COUNT(*) FROM absensi a WHERE a.siswa_id = s.siswa_id 
                    AND a.status = 'Izin' AND MONTH(a.tanggal) = MONTH(CURDATE())) AS izin,
                   (SELECT COUNT(*) FROM absensi a WHERE a.siswa_id = s.siswa_id 
                    AND a.status = 'Alpha' AND MONTH(a.tanggal) = MONTH(CURDATE())) AS alpha
            FROM siswa s
            LEFT JOIN perkembangan_harian ph ON ph.siswa_id = s.siswa_id
                AND ph.tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            LEFT JOIN aspek_perkembangan ap ON ap.aspek_id = ph.aspek_id
            WHERE s.kelas_id = ? AND s.is_aktif = 1
            GROUP BY s.siswa_id
            ORDER BY s.nama
        `, [kelasId]);

        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/perkembangan/sekolah/rekap - Rekap semua kelas (kepsek/admin)
const getRekapSekolah = async (req, res) => {
    try {
        const { tahun_ajaran } = req.query;

        const [rows] = await db.execute(`
            SELECT k.kelas_id AS kelas_id, k.nama_kelas,
                   COUNT(DISTINCT s.siswa_id) AS jml_siswa,
                   ROUND(AVG(CASE WHEN a_abs.status='Hadir' THEN 1 ELSE 0 END)*100, 0) AS hadir_rata,
                   ROUND(AVG(CASE WHEN ap.kode='kognitif' THEN ph.capaian END), 0) AS kognitif,
                   ROUND(AVG(CASE WHEN ap.kode='sosial' THEN ph.capaian END), 0) AS sosial,
                   ROUND(AVG(CASE WHEN ap.kode='motorik' THEN ph.capaian END), 0) AS motorik,
                   ROUND(AVG(CASE WHEN ap.kode='komunikasi' THEN ph.capaian END), 0) AS komunikasi,
                   ROUND(AVG(ph.capaian), 0) AS rata_rata,
                   CASE WHEN AVG(ph.capaian) >= 75 THEN 'Baik'
                        WHEN AVG(ph.capaian) >= 60 THEN 'Cukup'
                        ELSE 'Perlu Perhatian' END AS status
            FROM kelas k
            LEFT JOIN siswa s ON s.kelas_id = k.kelas_id AND s.is_aktif = 1
            LEFT JOIN perkembangan_harian ph ON ph.siswa_id = s.siswa_id
                AND ph.tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            LEFT JOIN aspek_perkembangan ap ON ap.aspek_id = ph.aspek_id
            LEFT JOIN absensi a_abs ON a_abs.siswa_id = s.siswa_id
                AND MONTH(a_abs.tanggal) = MONTH(CURDATE())
            WHERE k.is_aktif = 1
            GROUP BY k.kelas_id
            ORDER BY k.nama_kelas
        `);

        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = { getBySiswa, getRingkasanSiswa, create, createBatch, getRekapKelas, getRekapSekolah };
