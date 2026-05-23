const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { auth, authorize } = require('../middleware/auth');
const db = require('../config/database');

// Controllers
const authCtrl = require('../controllers/authController');
const siswaCtrl = require('../controllers/siswaController');
const kelasCtrl = require('../controllers/kelasController');
const perkembanganCtrl = require('../controllers/perkembanganController');
const absensiCtrl = require('../controllers/absensiController');
const ppiCtrl = require('../controllers/ppiController');
const komCtrl = require('../controllers/komunikasiController');
const dashCtrl = require('../controllers/dashboardController');
const adminCtrl = require('../controllers/adminController');
const userCtrl = require('../controllers/userController');

const uploadDir = path.join(__dirname, '..', 'uploads', 'kegiatan');
fs.mkdirSync(uploadDir, { recursive: true });

const getSupabaseConfig = () => ({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'kegiatan'
});

const requireSupabaseConfig = () => {
    const cfg = getSupabaseConfig();
    if (!cfg.url || !cfg.key) {
        const err = new Error('Konfigurasi Supabase Storage belum diisi di .env backend');
        err.status = 500;
        throw err;
    }
    return cfg;
};

const safeStorageName = (name = 'banner.jpg') => {
    const ext = path.extname(name).toLowerCase() || '.jpg';
    const base = path.basename(name, ext).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'banner';
    return `${base}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
};

const supabaseStorageUrl = (cfg, objectPath) => {
    const baseUrl = cfg.url.replace(/\/$/, '');
    return `${baseUrl}/storage/v1/object/public/${cfg.bucket}/${objectPath}`;
};

const uploadToSupabase = async (file, folder = 'kegiatan') => {
    const cfg = requireSupabaseConfig();
    const objectPath = `${folder}/${safeStorageName(file.originalname)}`;
    const endpoint = `${cfg.url.replace(/\/$/, '')}/storage/v1/object/${cfg.bucket}/${objectPath}`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            apikey: cfg.key,
            Authorization: `Bearer ${cfg.key}`,
            'Content-Type': file.mimetype,
            'x-upsert': 'false'
        },
        body: file.buffer
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Upload Supabase gagal: ${detail}`);
    }

    return {
        path: objectPath,
        url: supabaseStorageUrl(cfg, objectPath)
    };
};

const listSupabaseImages = async () => {
    const cfg = requireSupabaseConfig();
    const endpoint = `${cfg.url.replace(/\/$/, '')}/storage/v1/object/list/${cfg.bucket}`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            apikey: cfg.key,
            Authorization: `Bearer ${cfg.key}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            prefix: 'kegiatan',
            limit: 100,
            offset: 0,
            sortBy: { column: 'created_at', order: 'desc' }
        })
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Gagal memuat gambar Supabase: ${detail}`);
    }

    const rows = await response.json();
    return rows
        .filter(item => item.name && item.id)
        .map(item => {
            const objectPath = item.name.startsWith('kegiatan/') ? item.name : `kegiatan/${item.name}`;
            return {
                ...item,
                path: objectPath,
                url: supabaseStorageUrl(cfg, objectPath)
            };
        });
};

const deleteSupabaseImage = async (objectPath) => {
    const cfg = requireSupabaseConfig();
    const endpoint = `${cfg.url.replace(/\/$/, '')}/storage/v1/object/${cfg.bucket}`;
    const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
            apikey: cfg.key,
            Authorization: `Bearer ${cfg.key}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prefixes: [objectPath] })
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Gagal menghapus gambar Supabase: ${detail}`);
    }
};

const kegiatanBannerUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            return cb(new Error('File harus berupa gambar'));
        }
        cb(null, true);
    }
});

const laporanUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('File laporan harus berupa PDF'));
        }
        cb(null, true);
    }
});

const ensureLaporanFilePathColumn = async () => {
    await db.execute('ALTER TABLE laporan MODIFY COLUMN file_path VARCHAR(500) NULL');
};

// ============================================================
// AUTH
// ============================================================
router.post('/auth/login', authCtrl.login);
router.get('/auth/me', auth, authCtrl.getMe);
router.put('/auth/profile', auth, authCtrl.updateProfile);
router.put('/auth/change-password', auth, authCtrl.changePassword);

// ============================================================
// DASHBOARD
// ============================================================
router.get('/dashboard/admin', auth, authorize('admin'), dashCtrl.getDashboardAdmin);
router.get('/dashboard/kepsek', auth, authorize('kepsek', 'admin'), dashCtrl.getDashboardKepsek);
router.get('/dashboard/guru', auth, authorize('guru'), dashCtrl.getDashboardGuru);
router.get('/dashboard/wali', auth, authorize('wali'), dashCtrl.getDashboardWali);

// ============================================================
// SISWA
// ============================================================

router.get(
    '/siswa',
    auth,
    authorize('admin', 'kepsek', 'guru', 'wali'),
    siswaCtrl.getAll
);

router.get(
    '/siswa/rekap',
    auth,
    authorize('admin', 'kepsek', 'guru', 'wali'),
    siswaCtrl.getRekap
);

router.get(
    '/siswa/:id',
    auth,
    siswaCtrl.getById
);

// DEBUG SEMENTARA
// router.get('/siswa/perlu-perhatian', auth, authorize('admin', 'kepsek', 'guru'), siswaCtrl.perluPerhatian);
// router.post('/siswa', auth, authorize('admin'), siswaCtrl.create);
// router.put('/siswa/:id', auth, authorize('admin'), siswaCtrl.update);
// router.delete('/siswa/:id', auth, authorize('admin'), siswaCtrl.remove);



// ============================================================
// KELAS
// ============================================================
router.get('/kelas', auth, kelasCtrl.getAll);
router.get('/kelas/guru/saya', auth, authorize('guru'), kelasCtrl.getKelasSaya);
router.get('/kelas/:id', auth, kelasCtrl.getById);
router.post('/kelas', auth, authorize('admin'), kelasCtrl.create);
router.put('/kelas/:id', auth, authorize('admin'), kelasCtrl.update);
router.post('/kelas/:id/guru', auth, authorize('admin'), kelasCtrl.assignGuru);
router.delete('/kelas/:kelasId/guru/:guruId', auth, authorize('admin'), kelasCtrl.removeGuru);

// ============================================================
// PERKEMBANGAN
// ============================================================
router.get('/perkembangan/siswa/:siswaId', auth, perkembanganCtrl.getBySiswa);
router.get('/perkembangan/siswa/:siswaId/ringkasan', auth, perkembanganCtrl.getRingkasanSiswa);
router.get('/perkembangan/kelas/:kelasId/rekap', auth, authorize('admin', 'kepsek', 'guru'), perkembanganCtrl.getRekapKelas);
router.get('/perkembangan/sekolah/rekap', auth, authorize('admin', 'kepsek'), perkembanganCtrl.getRekapSekolah);
router.post('/perkembangan', auth, authorize('guru'), perkembanganCtrl.create);
router.post('/perkembangan/batch', auth, authorize('guru'), perkembanganCtrl.createBatch);

// ============================================================
// ABSENSI
// ============================================================
router.get('/absensi/kelas/:kelasId', auth, absensiCtrl.getByKelas);
router.get('/absensi/siswa/:siswaId/rekap', auth, absensiCtrl.getRekapSiswa);
router.get('/absensi/rekap-bulanan', auth, authorize('admin', 'kepsek', 'guru'), absensiCtrl.getRekapBulanan);
router.post('/absensi', auth, authorize('guru', 'admin'), absensiCtrl.create);

// ============================================================
// PPI
// ============================================================
router.get('/ppi/siswa/:siswaId', auth, ppiCtrl.getBySiswa);
router.get('/ppi/kelas/:kelasId', auth, authorize('admin', 'kepsek', 'guru'), ppiCtrl.getByKelas);
router.get('/ppi/:id', auth, ppiCtrl.getById);
router.post('/ppi', auth, authorize('guru'), ppiCtrl.create);
router.put('/ppi/:id', auth, authorize('guru', 'admin'), ppiCtrl.update);

// ============================================================
// KOMUNIKASI - PESAN
// ============================================================
router.get('/pesan/inbox', auth, komCtrl.getInbox);
router.get('/pesan/kontak', auth, komCtrl.getKontak);
router.get('/pesan/percakapan/:userId', auth, komCtrl.getPercakapan);
router.post('/pesan', auth, komCtrl.kirimPesan);
router.put('/pesan/:id/baca', auth, komCtrl.bacaPesan);

// ============================================================
// KOMUNIKASI - PENGUMUMAN
// ============================================================
router.get('/pengumuman', auth, komCtrl.getPengumuman);
router.post('/pengumuman', auth, authorize('admin', 'kepsek', 'guru'), komCtrl.buatPengumuman);
router.put('/pengumuman/:id/baca', auth, komCtrl.bacaPengumuman);

// ============================================================
// LAPORAN
// ============================================================
router.get('/laporan', auth, dashCtrl.getLaporan);
router.post('/laporan/upload', auth, authorize('guru', 'admin', 'kepsek'), laporanUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File laporan wajib diunggah' });
        }

        await ensureLaporanFilePathColumn();

        const { tipe = 'Kelas', periode, kelas_id, tahun_ajaran } = req.body;
        if (!periode || !kelas_id) {
            return res.status(400).json({ success: false, message: 'Periode dan kelas wajib diisi' });
        }

        let judul = `Laporan ${tipe} ${periode}`;
        const [[kelasInfo]] = await db.execute('SELECT nama_kelas FROM kelas WHERE kelas_id = ?', [kelas_id]);
        if (kelasInfo) judul += ` - ${kelasInfo.nama_kelas}`;

        const [[countInfo]] = await db.execute(
            'SELECT COUNT(DISTINCT s.siswa_id) AS total_siswa, COUNT(DISTINCT s.kelas_id) AS total_kelas FROM siswa s WHERE s.is_aktif = 1 AND s.kelas_id = ?',
            [kelas_id]
        );

        const uploaded = await uploadToSupabase(req.file, 'laporan');
        const [result] = await db.execute(
            'INSERT INTO laporan (judul, tipe, periode, kelas_id, dibuat_oleh, file_path, total_siswa, total_kelas, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [judul, tipe, periode, kelas_id, req.user.id, uploaded.url, countInfo.total_siswa, countInfo.total_kelas, 'Final']
        );

        await db.execute(
            'INSERT INTO log_aktivitas (user_id, aksi, detail) VALUES (?, ?, ?)',
            [req.user.id, 'Upload Laporan', judul]
        );

        res.status(201).json({
            success: true,
            message: 'Laporan berhasil diupload',
            data: { id: result.insertId, judul, file_path: uploaded.url, tahun_ajaran }
        });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message || 'Upload laporan gagal' });
    }
});
router.post('/laporan/generate', auth, authorize('admin', 'kepsek', 'guru'), dashCtrl.generateLaporan);
router.delete('/laporan/:id', auth, authorize('admin'), dashCtrl.deleteLaporan);
router.get('/laporan/kelas/:kelasId', auth, authorize('admin', 'kepsek', 'guru'), dashCtrl.getLaporanKelas);

// ============================================================
// USERS (ADMIN)
// ============================================================
router.get('/users', auth, authorize('admin'), userCtrl.getAll);
router.get('/users/guru', auth, authorize('admin', 'kepsek'), userCtrl.getGuru);
router.get('/users/guru/kinerja', auth, authorize('admin', 'kepsek'), userCtrl.getKinerjaGuru);
router.post('/users', auth, authorize('admin'), userCtrl.create);
router.put('/users/:id', auth, authorize('admin'), userCtrl.update);
router.put('/users/:id/reset-password', auth, authorize('admin'), userCtrl.resetPassword);

// ============================================================
// ADMIN - PENGATURAN & UTILITAS
// ============================================================
router.get('/pengaturan', auth, adminCtrl.getPengaturan);
router.put('/pengaturan', auth, authorize('admin'), adminCtrl.updatePengaturan);
router.get('/log', auth, authorize('admin'), adminCtrl.getLogs);
router.get('/kegiatan', auth, adminCtrl.getKegiatan);
router.get('/upload/kegiatan-images', auth, authorize('admin'), async (req, res) => {
    try {
        const images = await listSupabaseImages();
        res.json({ success: true, data: images });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message || 'Gagal memuat gambar' });
    }
});
router.post('/upload/kegiatan-banner', auth, authorize('admin', 'kepsek'), kegiatanBannerUpload.single('banner'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File banner wajib diunggah' });
        }

        const uploaded = await uploadToSupabase(req.file);
        res.status(201).json({
            success: true,
            data: {
                filename: path.basename(uploaded.path),
                path: uploaded.path,
                url: uploaded.url
            }
        });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message || 'Upload banner gagal' });
    }
});
router.delete('/upload/kegiatan-images', auth, authorize('admin'), async (req, res) => {
    try {
        const { path: objectPath } = req.body;
        if (!objectPath || !objectPath.startsWith('kegiatan/')) {
            return res.status(400).json({ success: false, message: 'Path gambar tidak valid' });
        }

        await deleteSupabaseImage(objectPath);
        res.json({ success: true, message: 'Gambar berhasil dihapus' });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message || 'Gagal menghapus gambar' });
    }
});
router.post('/kegiatan', auth, authorize('admin', 'kepsek'), adminCtrl.createKegiatan);
router.delete('/kegiatan/:id', auth, authorize('admin', 'kepsek'), adminCtrl.deleteKegiatan);
router.get('/aspek', auth, adminCtrl.getAspek);
router.put('/aspek/:id', auth, authorize('admin'), adminCtrl.updateAspek);
router.get('/tingkat', auth, adminCtrl.getTingkat);

module.exports = router;
