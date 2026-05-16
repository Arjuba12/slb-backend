const db = require('../config/database');

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

// ============================================================
// DASHBOARD
// ============================================================

// GET /api/dashboard/admin
const getDashboardAdmin = async (req, res) => {
    try {
        const [[totalSiswa]] = await db.execute("SELECT COUNT(*) AS total FROM siswa WHERE is_aktif = 1");
        const [[totalGuru]] = await db.execute("SELECT COUNT(*) AS total FROM guru g JOIN users u ON u.id = g.user_id WHERE u.is_aktif = 1");
        const [[totalTerapis]] = await db.execute("SELECT COUNT(*) AS total FROM guru WHERE spesialisasi = 'Terapis'");
        const [[totalKelas]] = await db.execute("SELECT COUNT(*) AS total FROM kelas WHERE is_aktif = 1");

        const [aktivitas] = await db.execute(`
            SELECT la.*, u.nama AS nama_user, u.role
            FROM log_aktivitas la
            LEFT JOIN users u ON u.id = la.user_id
            ORDER BY la.created_at DESC LIMIT 20
        `);

        const [[dbStatus]] = await db.execute("SELECT 1 AS status");
        const [[backupInfo]] = await db.execute(
            "SELECT nilai FROM pengaturan WHERE kunci = 'last_backup'"
        ).catch(() => [[{ nilai: null }]]);

        res.json({
            success: true, data: {
                total_siswa: totalSiswa.total,
                total_guru: totalGuru.total,
                total_terapis: totalTerapis.total,
                total_kelas: totalKelas.total,
                db_status: dbStatus ? 'Online' : 'Offline',
                last_backup: backupInfo?.nilai || null,
                aktivitas_terbaru: aktivitas
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/dashboard/kepsek
const getDashboardKepsek = async (req, res) => {
    try {
        const [[totalSiswa]] = await db.execute("SELECT COUNT(*) AS total FROM siswa WHERE is_aktif = 1");
        const [[totalGuru]] = await db.execute("SELECT COUNT(*) AS g, SUM(spesialisasi='Terapis') AS t FROM guru g JOIN users u ON u.id = g.user_id WHERE u.is_aktif = 1");

        // Kehadiran rata-rata bulan ini
        const [[kehadiran]] = await db.execute(`
            SELECT ROUND(SUM(status='Hadir') / COUNT(*) * 100, 0) AS persen
            FROM absensi
            WHERE MONTH(tanggal) = MONTH(CURDATE()) AND YEAR(tanggal) = YEAR(CURDATE())
        `);

        // Capaian rata-rata semua aspek
        const [[capaian]] = await db.execute(`
            SELECT ROUND(AVG(capaian), 0) AS rata_rata
            FROM perkembangan_harian
            WHERE tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        `);

        // Status siswa: berkembang baik, cukup, perlu intervensi
        const [statusSiswa] = await db.execute(`
            SELECT 
                SUM(CASE WHEN avg_cap >= 75 THEN 1 ELSE 0 END) AS berkembang_baik,
                SUM(CASE WHEN avg_cap BETWEEN 60 AND 74 THEN 1 ELSE 0 END) AS cukup_berkembang,
                SUM(CASE WHEN avg_cap < 60 OR avg_cap IS NULL THEN 1 ELSE 0 END) AS perlu_intervensi
            FROM (
                SELECT s.id, ROUND(AVG(ph.capaian), 0) AS avg_cap
                FROM siswa s
                LEFT JOIN perkembangan_harian ph ON ph.siswa_id = s.id
                    AND ph.tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                WHERE s.is_aktif = 1
                GROUP BY s.id
            ) sub
        `);

        // Capaian rata per kelas
        const [capaianKelas] = await db.execute(`
            SELECT k.nama_kelas, ROUND(AVG(ph.capaian), 0) AS rata_rata
            FROM kelas k
            JOIN siswa s ON s.kelas_id = k.id AND s.is_aktif = 1
            LEFT JOIN perkembangan_harian ph ON ph.siswa_id = s.id
                AND ph.tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            WHERE k.is_aktif = 1
            GROUP BY k.id
            ORDER BY k.nama_kelas
        `);

        res.json({
            success: true, data: {
                total_siswa: totalSiswa.total,
                total_guru: totalGuru.g,
                total_terapis: totalGuru.t,
                kehadiran_rata: kehadiran.persen || 0,
                capaian_rata: capaian.rata_rata || 0,
                status_siswa: statusSiswa[0],
                capaian_per_kelas: capaianKelas
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/dashboard/guru
const getDashboardGuru = async (req, res) => {
    try {
        await ensureKegiatanBannerColumn();

        const [guruRows] = await db.execute('SELECT id FROM guru WHERE user_id = ?', [req.user.id]);
        if (!guruRows.length) return res.status(404).json({ success: false, message: 'Data guru tidak ditemukan' });
        const guruId = guruRows[0].id;

        // Kelas saya
        const [kelas] = await db.execute(`
            SELECT k.id, k.nama_kelas, kg.is_wali_kelas,
                   COUNT(DISTINCT s.id) AS jml_siswa,
                   COUNT(DISTINCT ph.siswa_id) AS input_hari_ini
            FROM kelas_guru kg
            JOIN kelas k ON k.id = kg.kelas_id
            LEFT JOIN siswa s ON s.kelas_id = k.id AND s.is_aktif = 1
            LEFT JOIN perkembangan_harian ph ON ph.siswa_id = s.id 
                AND ph.guru_id = ? AND ph.tanggal = CURDATE()
            WHERE kg.guru_id = ? AND k.is_aktif = 1
            GROUP BY k.id, k.nama_kelas, kg.is_wali_kelas
        `, [guruId, guruId]);

        // Siswa perlu perhatian
        const [siswaPerlu] = await db.execute(`
            SELECT s.id, s.nisn, s.nama, s.kebutuhan_khusus, s.kelas_id, k.nama_kelas,
                   ROUND(AVG(ph.capaian), 0) AS capaian_rata,
                   (SELECT COUNT(*) FROM absensi a WHERE a.siswa_id = s.id 
                    AND a.status='Hadir' AND MONTH(a.tanggal) = MONTH(CURDATE())) AS hadir
            FROM siswa s
            JOIN kelas k ON k.id = s.kelas_id
            JOIN kelas_guru kg ON kg.kelas_id = k.id AND kg.guru_id = ?
            LEFT JOIN perkembangan_harian ph ON ph.siswa_id = s.id
                AND ph.tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            WHERE s.is_aktif = 1
            GROUP BY s.id
            HAVING capaian_rata < 60 OR capaian_rata IS NULL
            LIMIT 5
        `, [guruId]);

        // Pesan masuk belum dibaca
        const [[pesanMasuk]] = await db.execute(
            'SELECT COUNT(*) AS cnt FROM pesan WHERE penerima_id = ? AND is_dibaca = 0',
            [req.user.id]
        );

        // Progress laporan bulan ini (siswa yang belum diisi)
        const [[progressInput]] = await db.execute(`
            SELECT 
                COUNT(DISTINCT s.id) AS total_siswa,
                COUNT(DISTINCT ph.siswa_id) AS sudah_input
            FROM siswa s
            JOIN kelas k ON k.id = s.kelas_id
            JOIN kelas_guru kg ON kg.kelas_id = k.id AND kg.guru_id = ?
            LEFT JOIN perkembangan_harian ph ON ph.siswa_id = s.id AND ph.tanggal = CURDATE()
            WHERE s.is_aktif = 1
        `, [guruId]);

        // Notifikasi
        const [notifikasi] = await db.execute(`
            SELECT 'pesan' AS tipe,
                   COALESCE(p.subjek, 'Pesan baru') AS judul,
                   p.isi AS deskripsi,
                   p.created_at AS tanggal
            FROM pesan p
            WHERE p.penerima_id = ? AND p.is_dibaca = 0
            UNION ALL
            SELECT 'pengumuman' AS tipe,
                   pg.judul,
                   pg.isi AS deskripsi,
                   pg.created_at AS tanggal
            FROM pengumuman pg
            LEFT JOIN pengumuman_read pr ON pr.pengumuman_id = pg.id AND pr.user_id = ?
            WHERE pg.status = 'Terkirim'
              AND pg.target_role IN ('semua', 'guru')
              AND pr.id IS NULL
            ORDER BY tanggal DESC
            LIMIT 5
        `, [req.user.id, req.user.id]);

        const tugasPending = [];
        const totalSiswa = progressInput?.total_siswa || 0;
        const sudahInput = progressInput?.sudah_input || 0;
        const belumInput = Math.max(totalSiswa - sudahInput, 0);

        if (belumInput > 0) {
            tugasPending.push({
                tipe: 'input_perkembangan',
                judul: `Input perkembangan harian belum lengkap`,
                deskripsi: `${belumInput} dari ${totalSiswa} siswa belum diinput hari ini`
            });
        }

        if (pesanMasuk.cnt > 0) {
            tugasPending.push({
                tipe: 'pesan',
                judul: 'Pesan belum dibaca',
                deskripsi: `${pesanMasuk.cnt} pesan perlu ditindaklanjuti`
            });
        }

        if (siswaPerlu.length > 0) {
            tugasPending.push({
                tipe: 'siswa',
                judul: 'Siswa perlu perhatian',
                deskripsi: `${siswaPerlu.length} siswa perlu dipantau`
            });
        }

        const [kegiatan] = await db.execute(`
            SELECT id, judul, deskripsi, tanggal, waktu_mulai, waktu_selesai,
                   lokasi, tipe, banner_url
            FROM kegiatan
            WHERE tanggal >= CURDATE()
            ORDER BY tanggal ASC, waktu_mulai ASC
            LIMIT 3
        `);

        res.json({
            success: true, data: {
                kelas,
                siswa_perlu_perhatian: siswaPerlu,
                pesan_masuk: pesanMasuk.cnt,
                progress_input: progressInput,
                tugas_pending: tugasPending,
                kegiatan,
                notifikasi
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/dashboard/wali
const getDashboardWali = async (req, res) => {
    try {
        await ensureKegiatanBannerColumn();

        // Anak wali
        const [anak] = await db.execute(`
            SELECT s.id, s.nama, s.nisn, s.foto, s.kebutuhan_khusus, s.kelas_id,
                   k.nama_kelas, ws.hubungan,
                   ROUND(AVG(ph.capaian), 0) AS capaian_rata,
                   (SELECT COUNT(*) FROM absensi a WHERE a.siswa_id = s.id 
                    AND a.status='Hadir' AND MONTH(a.tanggal)=MONTH(CURDATE())) AS hadir_bulan,
                   (SELECT COUNT(*) FROM absensi a WHERE a.siswa_id = s.id 
                    AND MONTH(a.tanggal)=MONTH(CURDATE())) AS total_hari,
                   (SELECT a.status FROM absensi a WHERE a.siswa_id = s.id
                    AND a.tanggal = CURDATE() LIMIT 1) AS kehadiran_hari_ini,
                   CASE WHEN ROUND(AVG(ph.capaian),0) >= 75 THEN 'Berkembang'
                        WHEN ROUND(AVG(ph.capaian),0) >= 60 THEN 'Cukup Berkembang'
                        ELSE 'Perlu Intervensi' END AS status
            FROM wali_siswa ws
            JOIN siswa s ON s.id = ws.siswa_id
            LEFT JOIN kelas k ON k.id = s.kelas_id
            LEFT JOIN perkembangan_harian ph ON ph.siswa_id = s.id
                AND ph.tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            WHERE ws.user_id = ?
            GROUP BY s.id, s.nama, s.nisn, s.foto, s.kebutuhan_khusus, s.kelas_id,
                     k.nama_kelas, ws.hubungan
        `, [req.user.id]);

        if (!anak.length) return res.json({ success: true, data: { anak: [] } });

        const siswaId = anak[0].id;

        // Catatan terbaru dari guru
        const [catatan] = await db.execute(`
            SELECT ph.catatan, ph.tanggal, ap.nama AS aspek, u.nama AS nama_guru
            FROM perkembangan_harian ph
            JOIN aspek_perkembangan ap ON ap.id = ph.aspek_id
            JOIN guru g ON g.id = ph.guru_id
            JOIN users u ON u.id = g.user_id
            WHERE ph.siswa_id = ? AND ph.catatan IS NOT NULL AND ph.catatan != ''
            ORDER BY ph.tanggal DESC LIMIT 5
        `, [siswaId]);

        // Notifikasi untuk wali: pesan belum dibaca, pengumuman kelas, dan laporan.
        const [notifikasi] = await db.execute(`
            SELECT *
            FROM (
                SELECT COALESCE(p.subjek, 'Pesan baru dari guru') AS judul,
                       p.isi AS deskripsi,
                       p.created_at AS tanggal,
                       'pesan' AS tipe
                FROM pesan p
                WHERE p.penerima_id = ?
                  AND p.is_dibaca = 0

                UNION ALL

                SELECT pg.judul,
                       pg.isi AS deskripsi,
                       pg.created_at AS tanggal,
                       'pengumuman' AS tipe
                FROM pengumuman pg
                LEFT JOIN pengumuman_read pr
                  ON pr.pengumuman_id = pg.id
                 AND pr.user_id = ?
                WHERE pg.status = 'Terkirim'
                  AND (pg.target_role = 'semua' OR pg.target_role = 'wali')
                  AND (pg.kelas_id IS NULL OR pg.kelas_id = ?)
                  AND pg.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                  AND pr.id IS NULL

                UNION ALL

                SELECT l.judul,
                       l.periode AS deskripsi,
                       l.created_at AS tanggal,
                       'laporan' AS tipe
                FROM laporan l
                WHERE l.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ) notif
            ORDER BY tanggal DESC
            LIMIT 5
        `, [req.user.id, req.user.id, anak[0].kelas_id]);

        const [kegiatan] = await db.execute(`
            SELECT id, judul, deskripsi, tanggal, waktu_mulai, waktu_selesai,
                   lokasi, tipe, banner_url
            FROM kegiatan
            WHERE tanggal >= CURDATE()
            ORDER BY tanggal ASC, waktu_mulai ASC
            LIMIT 3
        `);

        res.json({
            success: true,
            data: { anak, catatan_terbaru: catatan, notifikasi, kegiatan }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============================================================
// LAPORAN
// ============================================================

// GET /api/laporan
const getLaporan = async (req, res) => {
    try {
        const { tipe, kelas_id } = req.query;
        let query = `
            SELECT l.*, u.nama AS nama_pembuat, k.nama_kelas
            FROM laporan l
            JOIN users u ON u.id = l.dibuat_oleh
            LEFT JOIN kelas k ON k.id = l.kelas_id
            WHERE 1=1
        `;
        const params = [];
        if (tipe) { query += ' AND l.tipe = ?'; params.push(tipe); }
        if (kelas_id) { query += ' AND l.kelas_id = ?'; params.push(kelas_id); }
        if (req.user.role === 'wali') {
            query += `
                AND l.file_path IS NOT NULL
                AND l.kelas_id IN (
                    SELECT s.kelas_id
                    FROM wali_siswa ws
                    JOIN siswa s ON s.id = ws.siswa_id
                    WHERE ws.user_id = ?
                )
            `;
            params.push(req.user.id);
        }
        query += ' ORDER BY l.created_at DESC';

        const [rows] = await db.execute(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/laporan/generate - Generate dan simpan laporan
const generateLaporan = async (req, res) => {
    try {
        const { tipe, periode, kelas_id, tahun_ajaran } = req.body;

        let judul = `Laporan ${tipe} ${periode}`;
        if (kelas_id) {
            const [[kelasInfo]] = await db.execute('SELECT nama_kelas FROM kelas WHERE id = ?', [kelas_id]);
            if (kelasInfo) judul += ` - ${kelasInfo.nama_kelas}`;
        }

        const [[countInfo]] = await db.execute(
            'SELECT COUNT(DISTINCT s.id) AS total_siswa, COUNT(DISTINCT s.kelas_id) AS total_kelas FROM siswa s WHERE s.is_aktif = 1' + (kelas_id ? ' AND s.kelas_id = ?' : ''),
            kelas_id ? [kelas_id] : []
        );

        const [result] = await db.execute(
            'INSERT INTO laporan (judul, tipe, periode, kelas_id, dibuat_oleh, total_siswa, total_kelas) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [judul, tipe, periode, kelas_id || null, req.user.id, countInfo.total_siswa, countInfo.total_kelas]
        );

        await db.execute(
            'INSERT INTO log_aktivitas (user_id, aksi, detail) VALUES (?, ?, ?)',
            [req.user.id, 'Generate Laporan', judul]
        );

        res.json({ success: true, message: 'Laporan berhasil dibuat', data: { id: result.insertId, judul } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/laporan/kelas/:kelasId - Laporan detail kelas untuk guru
const getLaporanKelas = async (req, res) => {
    try {
        const { bulan, tahun } = req.query;
        const kelasId = req.params.kelasId;
        const m = bulan || new Date().getMonth() + 1;
        const y = tahun || new Date().getFullYear();

        const [[kelasInfo]] = await db.execute(
            'SELECT k.*, t.nama AS tingkat FROM kelas k JOIN tingkat t ON t.id = k.tingkat_id WHERE k.id = ?',
            [kelasId]
        );

        const [siswaData] = await db.execute(`
            SELECT s.id, s.nama,
                   ph.kognitif,
                   ph.sosial,
                   ph.motorik,
                   ph.komunikasi,
                   ph.bina_diri,
                   COALESCE(a.hadir, 0) AS hadir,
                   COALESCE(a.sakit, 0) AS sakit,
                   COALESCE(a.izin, 0) AS izin,
                   COALESCE(a.alpha, 0) AS alpha
            FROM siswa s
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
                       SUM(CASE WHEN a.status='Sakit' THEN 1 ELSE 0 END) AS sakit,
                       SUM(CASE WHEN a.status='Izin' THEN 1 ELSE 0 END) AS izin,
                       SUM(CASE WHEN a.status='Alpha' THEN 1 ELSE 0 END) AS alpha
                FROM absensi a
                WHERE MONTH(a.tanggal) = ? AND YEAR(a.tanggal) = ?
                GROUP BY a.siswa_id
            ) a ON a.siswa_id = s.id
            WHERE s.kelas_id = ? AND s.is_aktif = 1
            ORDER BY s.nama
        `, [m, y, m, y, kelasId]);

        // Catatan naratif otomatis
        const totalSiswa = siswaData.length;
        const avgKognitif = totalSiswa > 0
            ? siswaData.reduce((a, b) => a + (b.kognitif || 0), 0) / totalSiswa
            : 0;
        const avgKomunikasi = totalSiswa > 0
            ? siswaData.reduce((a, b) => a + (b.komunikasi || 0), 0) / totalSiswa
            : 0;

        const catatan = totalSiswa > 0
            ? `Kelas ${kelasInfo.nama_kelas} menunjukkan ${avgKognitif >= 70 ? 'peningkatan' : 'perkembangan'} ` +
              `di aspek kognitif dan komunikasi. ` +
              `${siswaData.filter(s => (s.kognitif || 0) < 60).length} siswa masih memerlukan perhatian lebih.`
            : `Belum ada siswa aktif pada kelas ${kelasInfo.nama_kelas} untuk periode ini.`;

        res.json({
            success: true,
            data: {
                kelas: kelasInfo,
                siswa: siswaData,
                catatan_naratif: catatan,
                periode: `${m}/${y}`
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    getDashboardAdmin, getDashboardKepsek, getDashboardGuru, getDashboardWali,
    getLaporan, generateLaporan, getLaporanKelas
};
