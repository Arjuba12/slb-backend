const db = require('../config/database');

// GET /api/siswa - Admin/Kepsek/Guru
const getAll = async (req, res) => {
    try {

        console.log("\n========== DEBUG SISWA ==========");
        console.log("REQ.USER:", req.user);
        console.log("REQ.QUERY:", req.query);

        const { kelas_id, is_aktif, search } = req.query;

        let query = `
            SELECT s.id, s.nisn, s.nama, s.tgl_lahir, s.jenis_kelamin, s.alamat, s.kebutuhan_khusus,
                   s.kelas_id, s.tahun_masuk, s.foto, s.is_aktif, s.created_at, s.updated_at,
                   k.nama_kelas, k.tahun_ajaran,
                   ANY_VALUE(u_wali.nama) AS nama_wali,
                   ANY_VALUE((
                        SELECT COUNT(*)
                        FROM absensi a
                        WHERE a.siswa_id = s.id
                        AND a.status = 'Alpha'
                        AND a.tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                   )) AS alpha_bulan_ini
            FROM siswa s
            LEFT JOIN kelas k ON k.id = s.kelas_id
            LEFT JOIN wali_siswa ws ON ws.siswa_id = s.id AND ws.is_primer = 1
            LEFT JOIN users u_wali ON u_wali.id = ws.user_id
            WHERE 1=1
        `;

        const params = [];

        // =====================================================
        // GURU HANYA BISA LIHAT SISWA DI KELASNYA
        // =====================================================
        if (req.user.role === 'guru') {

            console.log("\nROLE USER = GURU");

            const [guruRows] = await db.execute(
                'SELECT id FROM guru WHERE user_id = ?',
                [req.user.id]
            );

            console.log("GURU ROWS:", guruRows);

            if (guruRows.length) {

                const guruId = guruRows[0].id;

                console.log("GURU ID:", guruId);

                const [kelasGuruRows] = await db.execute(
                    'SELECT * FROM kelas_guru WHERE guru_id = ?',
                    [guruId]
                );

                console.log("KELAS_GURU ROWS:", kelasGuruRows);

                query += `
                    AND k.id IN (
                        SELECT kelas_id
                        FROM kelas_guru
                        WHERE guru_id = ?
                    )
                `;

                params.push(guruId);

            } else {

                console.log("❌ DATA GURU TIDAK DITEMUKAN");

            }
        }

        // =====================================================
        // WALI HANYA LIHAT ANAKNYA
        // =====================================================
        if (req.user.role === 'wali') {

            console.log("\nROLE USER = WALI");

            query += `
                AND s.id IN (
                    SELECT siswa_id
                    FROM wali_siswa
                    WHERE user_id = ?
                )
            `;

            params.push(req.user.id);
        }

        // =====================================================
        // FILTER KELAS
        // =====================================================
        if (kelas_id) {
            query += ' AND s.kelas_id = ?';
            params.push(kelas_id);
        }

        // =====================================================
        // FILTER STATUS AKTIF
        // =====================================================
        if (is_aktif !== undefined) {
            query += ' AND s.is_aktif = ?';
            params.push(is_aktif);
        }

        // =====================================================
        // FILTER SEARCH NAMA
        // =====================================================
        if (search) {
            query += ' AND s.nama LIKE ?';
            params.push(`%${search}%`);
        }

        query += `
            GROUP BY s.id, k.nama_kelas, k.tahun_ajaran
            ORDER BY k.nama_kelas, s.nama
        `;

        console.log("\nFINAL QUERY:");
        console.log(query);

        console.log("\nFINAL PARAMS:");
        console.log(params);

        const [rows] = await db.execute(query, params);

        console.log("\nHASIL SISWA:");
        console.log(rows);

        console.log("\nTOTAL SISWA:", rows.length);

        console.log("========== END DEBUG ==========\n");

        res.json({
            success: true,
            total: rows.length,
            data: rows
        });

    } catch (err) {

        console.error("\n========== ERROR SISWA ==========");
        console.error(err);
        console.error("========== END ERROR ==========\n");

        res.status(500).json({
            success: false,
            message: 'Server error',
            error: err.message
        });
    }
};

// GET /api/siswa/:id
const getById = async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT s.id, s.nisn, s.nama, s.tgl_lahir, s.jenis_kelamin, s.alamat, s.kebutuhan_khusus,
                   s.kelas_id, s.tahun_masuk, s.foto, s.is_aktif, s.created_at, s.updated_at,
                   k.nama_kelas, k.tahun_ajaran, t.nama AS tingkat,
                   ANY_VALUE(u_wali.nama) AS nama_wali,
                   ANY_VALUE(u_wali.no_hp) AS hp_wali,
                   ANY_VALUE(u_wali.email) AS email_wali
            FROM siswa s
            LEFT JOIN kelas k ON k.id = s.kelas_id
            LEFT JOIN tingkat t ON t.id = k.tingkat_id
            LEFT JOIN wali_siswa ws ON ws.siswa_id = s.id AND ws.is_primer = 1
            LEFT JOIN users u_wali ON u_wali.id = ws.user_id
            WHERE s.id = ?
            GROUP BY s.id, k.nama_kelas, k.tahun_ajaran, t.nama
        `, [req.params.id]);

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: 'Siswa tidak ditemukan'
            });
        }

        const [aspekRows] = await db.execute(`
            SELECT ap.nama, ap.kode, ROUND(AVG(ph.capaian), 0) AS rata_rata
            FROM aspek_perkembangan ap
            LEFT JOIN perkembangan_harian ph
                ON ph.aspek_id = ap.id
               AND ph.siswa_id = ?
               AND MONTH(ph.tanggal) = MONTH(CURDATE())
               AND YEAR(ph.tanggal) = YEAR(CURDATE())
            GROUP BY ap.id, ap.nama, ap.kode
            ORDER BY ap.bobot DESC, ap.id ASC
        `, [req.params.id]);

        const [absensiRows] = await db.execute(`
            SELECT status, COUNT(*) AS jumlah
            FROM absensi
            WHERE siswa_id = ?
              AND MONTH(tanggal) = MONTH(CURDATE())
              AND YEAR(tanggal) = YEAR(CURDATE())
            GROUP BY status
        `, [req.params.id]);

        res.json({
            success: true,
            data: {
                ...rows[0],
                aspek: aspekRows,
                absensi_bulan_ini: absensiRows
            }
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// GET /api/siswa/rekap - Rekap ringkas untuk tabel daftar siswa
const getRekap = async (req, res) => {
    try {
        const { kelas_id, bulan, tahun } = req.query;
        const m = bulan || new Date().getMonth() + 1;
        const y = tahun || new Date().getFullYear();

        let where = 'WHERE s.is_aktif = 1';
        const params = [m, y, m, y];

        if (req.user.role === 'guru') {
            const [guruRows] = await db.execute(
                'SELECT id FROM guru WHERE user_id = ?',
                [req.user.id]
            );

            if (!guruRows.length) {
                return res.json({ success: true, data: [] });
            }

            where += ` AND s.kelas_id IN (
                SELECT kelas_id FROM kelas_guru WHERE guru_id = ?
            )`;
            params.push(guruRows[0].id);
        }

        if (req.user.role === 'wali') {
            where += ` AND s.id IN (
                SELECT siswa_id FROM wali_siswa WHERE user_id = ?
            )`;
            params.push(req.user.id);
        }

        if (kelas_id) {
            where += ' AND s.kelas_id = ?';
            params.push(kelas_id);
        }

        const statusSql = (field) => `
            CASE
                WHEN ${field} IS NULL THEN '-'
                WHEN ${field} >= 80 THEN 'Baik'
                WHEN ${field} >= 60 THEN 'Cukup'
                ELSE 'Perlu Latihan'
            END
        `;

        const [rows] = await db.execute(`
            SELECT base.*,
                   ${statusSql('base.kognitif')} AS kognitif_status,
                   ${statusSql('base.sosial')} AS sosial_status,
                   ${statusSql('base.motorik')} AS motorik_status,
                   ${statusSql('base.komunikasi')} AS komunikasi_status,
                   ${statusSql('base.bina_diri')} AS bina_diri_status
            FROM (
                SELECT s.id, s.nisn, s.nama, s.kelas_id, k.nama_kelas,
                       CASE
                           WHEN a.total_hari IS NULL OR a.total_hari = 0 THEN NULL
                           ELSE ROUND(a.hadir / a.total_hari * 100, 0)
                       END AS hadir_persen,
                       ph.kognitif,
                       ph.sosial,
                       ph.motorik,
                       ph.komunikasi,
                       ph.bina_diri
                FROM siswa s
                LEFT JOIN kelas k ON k.id = s.kelas_id
                LEFT JOIN (
                    SELECT ph.siswa_id,
                           ROUND(AVG(CASE WHEN ap.kode='kognitif' THEN ph.capaian END), 0) AS kognitif,
                           ROUND(AVG(CASE WHEN ap.kode='sosial' THEN ph.capaian END), 0) AS sosial,
                           ROUND(AVG(CASE WHEN ap.kode='motorik' THEN ph.capaian END), 0) AS motorik,
                           ROUND(AVG(CASE WHEN ap.kode='komunikasi' THEN ph.capaian END), 0) AS komunikasi,
                           ROUND(AVG(CASE WHEN ap.kode='bina_diri' THEN ph.capaian END), 0) AS bina_diri
                    FROM perkembangan_harian ph
                    JOIN aspek_perkembangan ap ON ap.id = ph.aspek_id
                    WHERE MONTH(ph.tanggal) = ? AND YEAR(ph.tanggal) = ?
                    GROUP BY ph.siswa_id
                ) ph ON ph.siswa_id = s.id
                LEFT JOIN (
                    SELECT a.siswa_id,
                           SUM(CASE WHEN a.status='Hadir' THEN 1 ELSE 0 END) AS hadir,
                           COUNT(*) AS total_hari
                    FROM absensi a
                    WHERE MONTH(a.tanggal) = ? AND YEAR(a.tanggal) = ?
                    GROUP BY a.siswa_id
                ) a ON a.siswa_id = s.id
                ${where}
            ) base
            ORDER BY base.nama_kelas, base.nama
        `, params);

        res.json({
            success: true,
            total: rows.length,
            data: rows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil rekap siswa'
        });
    }
};

const getSiswa = async (req, res) => {
    try {

        const { kelas_id, is_aktif, search } = req.query;

        let query = `
            SELECT
                s.id,
                s.nisn,
                s.nama,
                s.tgl_lahir,
                s.jenis_kelamin,
                s.alamat,
                s.kebutuhan_khusus,
                s.kelas_id,
                s.tahun_masuk,
                s.is_aktif,
                s.target_akademik,
                s.target_perilaku,
                s.target_sosial,
                s.target_motorik,
                k.nama_kelas,
                ta.tahun_ajaran
            FROM siswa s
            LEFT JOIN kelas k ON s.kelas_id = k.id
            LEFT JOIN tahun_ajaran ta ON k.tahun_ajaran_id = ta.id
            WHERE 1=1
        `;

        const params = [];

        if (kelas_id) {
            query += ` AND s.kelas_id = ?`;
            params.push(kelas_id);
        }

        if (is_aktif !== undefined) {
            query += ` AND s.is_aktif = ?`;
            params.push(is_aktif);
        }

        if (search) {
            query += ` AND s.nama LIKE ?`;
            params.push(`%${search}%`);
        }

        query += ` ORDER BY s.nama ASC`;

        const [rows] = await db.execute(query, params);

        res.json({
            success: true,
            data: rows
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data siswa'
        });
    }
};

module.exports = {
    getAll,
    getById,
    getRekap,
};
