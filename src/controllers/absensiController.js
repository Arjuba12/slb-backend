const db = require('../config/database');

// GET /api/absensi/kelas/:kelasId
const getByKelas = async (req, res) => {
    try {
        const { tanggal, bulan, tahun } = req.query;
        const kelasId = req.params.kelasId;

        let query = `
            SELECT a.*, a.absensi_id AS id, s.nama AS nama_siswa, u.nama AS dicatat_nama
            FROM absensi a
            JOIN siswa s ON s.siswa_id = a.siswa_id
            LEFT JOIN users u ON u.user_id = a.dicatat_oleh
            WHERE a.kelas_id = ?
        `;
        const params = [kelasId];

        if (tanggal) { query += ' AND a.tanggal = ?'; params.push(tanggal); }
        else if (bulan && tahun) {
            query += ' AND MONTH(a.tanggal) = ? AND YEAR(a.tanggal) = ?';
            params.push(bulan, tahun);
        }

        query += ' ORDER BY a.tanggal DESC, s.nama';
        const [rows] = await db.execute(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/absensi/siswa/:siswaId/rekap
const getRekapSiswa = async (req, res) => {
    try {
        const { bulan, tahun } = req.query;
        const siswaId = req.params.siswaId;

        const [rows] = await db.execute(`
            SELECT 
                COUNT(*) AS total_hari,
                SUM(CASE WHEN status='Hadir' THEN 1 ELSE 0 END) AS hadir,
                SUM(CASE WHEN status='Sakit' THEN 1 ELSE 0 END) AS sakit,
                SUM(CASE WHEN status='Izin' THEN 1 ELSE 0 END) AS izin,
                SUM(CASE WHEN status='Alpha' THEN 1 ELSE 0 END) AS alpha,
                ROUND(SUM(CASE WHEN status='Hadir' THEN 1 ELSE 0 END)/COUNT(*)*100, 1) AS persen_hadir
            FROM absensi
            WHERE siswa_id = ?
              AND (? IS NULL OR MONTH(tanggal) = ?)
              AND (? IS NULL OR YEAR(tanggal) = ?)
        `, [siswaId, bulan||null, bulan||null, tahun||null, tahun||null]);

        // Detail absensi per tanggal
        const [detail] = await db.execute(`
            SELECT tanggal, status, keterangan
            FROM absensi
            WHERE siswa_id = ?
              AND (? IS NULL OR MONTH(tanggal) = ?)
              AND (? IS NULL OR YEAR(tanggal) = ?)
            ORDER BY tanggal DESC
        `, [siswaId, bulan||null, bulan||null, tahun||null, tahun||null]);

        res.json({ success: true, data: { rekap: rows[0], detail } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/absensi - Input harian
const create = async (req, res) => {
    try {
        const { absensi_list, tanggal, kelas_id } = req.body;
        // absensi_list: [{ siswa_id, status, keterangan }, ...]

        if (!absensi_list || !tanggal || !kelas_id) {
            return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
        }

        let saved = 0;
        for (const item of absensi_list) {
            const [existing] = await db.execute(
                'SELECT absensi_id AS id FROM absensi WHERE siswa_id = ? AND tanggal = ? LIMIT 1',
                [item.siswa_id, tanggal]
            );

            if (existing.length) {
                await db.execute(`
                    UPDATE absensi
                    SET kelas_id = ?, status = ?, keterangan = ?, dicatat_oleh = ?
                    WHERE absensi_id = ?
                `, [kelas_id, item.status, item.keterangan || null, req.user.id, existing[0].id]);
            } else {
                await db.execute(`
                    INSERT INTO absensi (siswa_id, kelas_id, tanggal, status, keterangan, dicatat_oleh)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [item.siswa_id, kelas_id, tanggal, item.status, item.keterangan || null, req.user.id]);
            }
            saved++;
        }

        // Cek siswa yang alpha 3x berturut-turut
        for (const item of absensi_list) {
            if (item.status === 'Alpha') {
                const [alphaCheck] = await db.execute(`
                    SELECT COUNT(*) AS cnt FROM (
                        SELECT status FROM absensi 
                        WHERE siswa_id = ? ORDER BY tanggal DESC LIMIT 3
                    ) last3 WHERE status = 'Alpha'
                `, [item.siswa_id]);

                if (alphaCheck[0].cnt >= 3) {
                    // Kirim notifikasi ke kepsek (simpan sebagai pesan otomatis)
                    const [siswaInfo] = await db.execute('SELECT nama FROM siswa WHERE siswa_id = ?', [item.siswa_id]);
                    const [kepsek] = await db.execute("SELECT user_id AS id FROM users WHERE role='kepsek' LIMIT 1");
                    if (kepsek.length && siswaInfo.length) {
                        await db.execute(`
                            INSERT INTO pesan (pengirim_id, penerima_id, siswa_id, subjek, isi)
                            VALUES (?, ?, ?, ?, ?)
                        `, [req.user.id, kepsek[0].id, item.siswa_id,
                            'Alert: Siswa Alpha 3x Berturut',
                            `${siswaInfo[0].nama} telah absen tanpa keterangan 3 hari berturut-turut.`]);
                    }
                }
            }
        }

        res.json({ success: true, message: `${saved} data absensi disimpan` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/absensi/rekap-bulanan - untuk laporan
const getRekapBulanan = async (req, res) => {
    try {
        const { kelas_id, bulan, tahun } = req.query;

        let query = `
            SELECT s.siswa_id AS id, s.nama, k.nama_kelas,
                   SUM(CASE WHEN a.status='Hadir' THEN 1 ELSE 0 END) AS hadir,
                   SUM(CASE WHEN a.status='Sakit' THEN 1 ELSE 0 END) AS sakit,
                   SUM(CASE WHEN a.status='Izin' THEN 1 ELSE 0 END) AS izin,
                   SUM(CASE WHEN a.status='Alpha' THEN 1 ELSE 0 END) AS alpha,
                   COUNT(a.absensi_id) AS total_hari
            FROM siswa s
            JOIN kelas k ON k.kelas_id = s.kelas_id
            LEFT JOIN absensi a ON a.siswa_id = s.siswa_id
                AND MONTH(a.tanggal) = ? AND YEAR(a.tanggal) = ?
            WHERE s.is_aktif = 1
        `;
        const params = [bulan || new Date().getMonth() + 1, tahun || new Date().getFullYear()];

        if (kelas_id) { query += ' AND s.kelas_id = ?'; params.push(kelas_id); }

        query += ' GROUP BY s.siswa_id ORDER BY k.nama_kelas, s.nama';
        const [rows] = await db.execute(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = { getByKelas, getRekapSiswa, create, getRekapBulanan };
