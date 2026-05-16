const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: '🏫 SLB Monitoring API',
            version: '1.0.0',
            description: 'REST API untuk Aplikasi Monitoring Siswa SLB Generasi Emas',
        },
        servers: [{ url: '/api', description: 'Local server' }],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Masukkan token dari endpoint /auth/login'
                }
            },
            schemas: {
                LoginRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', example: 'admin@slb.sch.id' },
                        password: { type: 'string', example: 'admin123' }
                    }
                },
                SuccessResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        message: { type: 'string' },
                        data: { type: 'object' }
                    }
                }
            }
        },
        security: [{ bearerAuth: [] }],
        tags: [
            { name: '🔑 Auth', description: 'Login & profil' },
            { name: '📊 Dashboard', description: 'Dashboard per role' },
            { name: '👦 Siswa', description: 'Manajemen data siswa' },
            { name: '🏫 Kelas', description: 'Manajemen kelas' },
            { name: '📈 Perkembangan', description: 'Input & rekap perkembangan harian' },
            { name: '✅ Absensi', description: 'Input & rekap absensi' },
            { name: '📋 PPI', description: 'Program Pembelajaran Individual' },
            { name: '💬 Pesan', description: 'Direct message antar user' },
            { name: '📢 Pengumuman', description: 'Broadcast pengumuman' },
            { name: '📄 Laporan', description: 'Generate & unduh laporan' },
            { name: '👤 Users', description: 'Manajemen akun (admin)' },
            { name: '⚙️ Admin', description: 'Pengaturan sistem, log, kalender' },
        ],
        paths: {
            // ── AUTH ──────────────────────────────────────────────
            '/auth/login': {
                post: {
                    tags: ['🔑 Auth'], summary: 'Login',
                    security: [],
                    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
                    responses: {
                        200: { description: 'Login berhasil, mendapatkan token JWT' },
                        401: { description: 'Email atau password salah' }
                    }
                }
            },
            '/auth/me': {
                get: {
                    tags: ['🔑 Auth'], summary: 'Profil user yang sedang login',
                    responses: { 200: { description: 'Data user' } }
                }
            },
            '/auth/change-password': {
                put: {
                    tags: ['🔑 Auth'], summary: 'Ganti password sendiri',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { password_lama: { type: 'string' }, password_baru: { type: 'string' } } } } } },
                    responses: { 200: { description: 'Password berhasil diubah' } }
                }
            },
            // ── DASHBOARD ─────────────────────────────────────────
            '/dashboard/admin': { get: { tags: ['📊 Dashboard'], summary: 'Dashboard Admin — total siswa, guru, log aktivitas, status DB', responses: { 200: { description: 'OK' } } } },
            '/dashboard/kepsek': { get: { tags: ['📊 Dashboard'], summary: 'Dashboard Kepala Sekolah — rekap kehadiran, capaian per kelas, status siswa', responses: { 200: { description: 'OK' } } } },
            '/dashboard/guru': { get: { tags: ['📊 Dashboard'], summary: 'Dashboard Guru — kelas saya, siswa perlu perhatian, pesan masuk', responses: { 200: { description: 'OK' } } } },
            '/dashboard/wali': { get: { tags: ['📊 Dashboard'], summary: 'Dashboard Wali Murid — data anak, capaian, catatan guru', responses: { 200: { description: 'OK' } } } },
            // ── SISWA ─────────────────────────────────────────────
            '/siswa': {
                get: {
                    tags: ['👦 Siswa'], summary: 'Daftar semua siswa (filter otomatis per role)',
                    parameters: [
                        { name: 'kelas_id', in: 'query', schema: { type: 'integer' } },
                        { name: 'is_aktif', in: 'query', schema: { type: 'boolean' } },
                        { name: 'search', in: 'query', schema: { type: 'string' } }
                    ],
                    responses: { 200: { description: 'Daftar siswa' } }
                },
                post: {
                    tags: ['👦 Siswa'], summary: 'Tambah siswa baru (admin only)',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nisn','nama','tgl_lahir'], properties: { nisn: { type: 'string', example: '1234567899' }, nama: { type: 'string', example: 'Budi Santoso' }, tgl_lahir: { type: 'string', example: '2010-05-20' }, jenis_kelamin: { type: 'string', enum: ['L','P'] }, kebutuhan_khusus: { type: 'string', example: 'Tunagrahita ringan' }, kelas_id: { type: 'integer' }, tahun_masuk: { type: 'integer', example: 2019 }, wali_user_id: { type: 'integer' } } } } } },
                    responses: { 201: { description: 'Siswa berhasil ditambahkan' } }
                }
            },
            '/siswa/perlu-perhatian': { get: { tags: ['👦 Siswa'], summary: 'Siswa dengan capaian rata-rata < 60% (perlu intervensi)', responses: { 200: { description: 'OK' } } } },
            '/siswa/{id}': {
                get: { tags: ['👦 Siswa'], summary: 'Detail siswa + rekap capaian aspek + absensi', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
                put: { tags: ['👦 Siswa'], summary: 'Update data siswa (admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'OK' } } },
                delete: { tags: ['👦 Siswa'], summary: 'Nonaktifkan siswa (soft delete, admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
            },
            // ── KELAS ─────────────────────────────────────────────
            '/kelas': {
                get: { tags: ['🏫 Kelas'], summary: 'Daftar semua kelas', parameters: [{ name: 'tahun_ajaran', in: 'query', schema: { type: 'string', example: '2024/2025' } }], responses: { 200: { description: 'OK' } } },
                post: { tags: ['🏫 Kelas'], summary: 'Tambah kelas baru (admin)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { nama_kelas: { type: 'string', example: 'VII-A' }, tingkat_id: { type: 'integer', example: 2 }, tahun_ajaran: { type: 'string', example: '2024/2025' }, kapasitas: { type: 'integer', example: 10 } } } } } }, responses: { 201: { description: 'OK' } } }
            },
            '/kelas/guru/saya': { get: { tags: ['🏫 Kelas'], summary: 'Kelas yang diajar guru yang sedang login', responses: { 200: { description: 'OK' } } } },
            '/kelas/{id}': { get: { tags: ['🏫 Kelas'], summary: 'Detail kelas + daftar siswa + guru', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
            '/kelas/{id}/guru': { post: { tags: ['🏫 Kelas'], summary: 'Assign guru ke kelas (admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { guru_id: { type: 'integer' }, is_wali_kelas: { type: 'boolean' } } } } } }, responses: { 200: { description: 'OK' } } } },
            // ── PERKEMBANGAN ──────────────────────────────────────
            '/perkembangan': {
                post: {
                    tags: ['📈 Perkembangan'], summary: 'Input perkembangan 1 aspek (guru)',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['siswa_id','tanggal','aspek_id','capaian'], properties: { siswa_id: { type: 'integer' }, tanggal: { type: 'string', example: '2024-11-14' }, aspek_id: { type: 'integer', example: 1, description: '1=Kognitif, 2=Sosial, 3=Motorik, 4=Komunikasi, 5=Bina Diri' }, capaian: { type: 'integer', example: 80, description: '0-100' }, catatan: { type: 'string' } } } } } },
                    responses: { 200: { description: 'Tersimpan' } }
                }
            },
            '/perkembangan/batch': {
                post: {
                    tags: ['📈 Perkembangan'], summary: 'Input perkembangan semua aspek sekaligus (guru) — DIREKOMENDASIKAN',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['siswa_id','tanggal','aspek_list'], properties: { siswa_id: { type: 'integer', example: 1 }, tanggal: { type: 'string', example: '2024-11-14' }, aspek_list: { type: 'array', items: { type: 'object', properties: { aspek_id: { type: 'integer' }, capaian: { type: 'integer' }, catatan: { type: 'string' } } }, example: [{ aspek_id: 1, capaian: 80, catatan: 'Aktif' }, { aspek_id: 2, capaian: 75 }, { aspek_id: 3, capaian: 65 }, { aspek_id: 4, capaian: 70 }, { aspek_id: 5, capaian: 72 }] } } } } } },
                    responses: { 200: { description: 'Semua aspek tersimpan' } }
                }
            },
            '/perkembangan/siswa/{siswaId}': { get: { tags: ['📈 Perkembangan'], summary: 'Riwayat perkembangan satu siswa', parameters: [{ name: 'siswaId', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'aspek_id', in: 'query', schema: { type: 'integer' } }, { name: 'tahun_ajaran', in: 'query', schema: { type: 'string', example: '2024/2025' } }], responses: { 200: { description: 'OK' } } } },
            '/perkembangan/siswa/{siswaId}/ringkasan': { get: { tags: ['📈 Perkembangan'], summary: 'Ringkasan tren per aspek (untuk grafik)', parameters: [{ name: 'siswaId', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'bulan_count', in: 'query', schema: { type: 'integer', example: 5 } }], responses: { 200: { description: 'OK' } } } },
            '/perkembangan/kelas/{kelasId}/rekap': { get: { tags: ['📈 Perkembangan'], summary: 'Rekap capaian semua siswa dalam satu kelas', parameters: [{ name: 'kelasId', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
            '/perkembangan/sekolah/rekap': { get: { tags: ['📈 Perkembangan'], summary: 'Rekap semua kelas se-sekolah (kepsek/admin)', responses: { 200: { description: 'OK' } } } },
            // ── ABSENSI ───────────────────────────────────────────
            '/absensi': {
                post: {
                    tags: ['✅ Absensi'], summary: 'Input absensi harian (guru)',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['kelas_id','tanggal','absensi_list'], properties: { kelas_id: { type: 'integer' }, tanggal: { type: 'string', example: '2024-11-14' }, absensi_list: { type: 'array', items: { type: 'object', properties: { siswa_id: { type: 'integer' }, status: { type: 'string', enum: ['Hadir','Sakit','Izin','Alpha'] }, keterangan: { type: 'string' } } }, example: [{ siswa_id: 1, status: 'Hadir' }, { siswa_id: 2, status: 'Sakit', keterangan: 'Demam' }] } } } } } },
                    responses: { 200: { description: 'OK' } }
                }
            },
            '/absensi/kelas/{kelasId}': { get: { tags: ['✅ Absensi'], summary: 'Absensi per kelas', parameters: [{ name: 'kelasId', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'tanggal', in: 'query', schema: { type: 'string' } }, { name: 'bulan', in: 'query', schema: { type: 'integer' } }, { name: 'tahun', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
            '/absensi/siswa/{siswaId}/rekap': { get: { tags: ['✅ Absensi'], summary: 'Rekap absensi satu siswa', parameters: [{ name: 'siswaId', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'bulan', in: 'query', schema: { type: 'integer' } }, { name: 'tahun', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
            '/absensi/rekap-bulanan': { get: { tags: ['✅ Absensi'], summary: 'Rekap absensi semua siswa per bulan', parameters: [{ name: 'kelas_id', in: 'query', schema: { type: 'integer' } }, { name: 'bulan', in: 'query', schema: { type: 'integer' } }, { name: 'tahun', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
            // ── PPI ───────────────────────────────────────────────
            '/ppi': { post: { tags: ['📋 PPI'], summary: 'Buat PPI baru (guru)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['siswa_id','semester','tahun_ajaran'], properties: { siswa_id: { type: 'integer' }, semester: { type: 'string', example: '1' }, tahun_ajaran: { type: 'string', example: '2024/2025' }, target_utama: { type: 'string' }, detail: { type: 'array', items: { type: 'object', properties: { aspek_id: { type: 'integer' }, target: { type: 'string' }, progress: { type: 'integer' } } } } } } } } }, responses: { 201: { description: 'PPI dibuat' } } } },
            '/ppi/siswa/{siswaId}': { get: { tags: ['📋 PPI'], summary: 'Semua PPI milik siswa', parameters: [{ name: 'siswaId', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
            '/ppi/{id}': { get: { tags: ['📋 PPI'], summary: 'Detail PPI', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }, put: { tags: ['📋 PPI'], summary: 'Update PPI', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'OK' } } } },
            // ── PESAN ─────────────────────────────────────────────
            '/pesan/inbox': { get: { tags: ['💬 Pesan'], summary: 'Inbox pesan masuk + jumlah unread', responses: { 200: { description: 'OK' } } } },
            '/pesan/kontak': { get: { tags: ['💬 Pesan'], summary: 'Daftar kontak yang bisa dikirimi pesan', responses: { 200: { description: 'OK' } } } },
            '/pesan/percakapan/{userId}': { get: { tags: ['💬 Pesan'], summary: 'Thread percakapan dengan user tertentu (auto mark-read)', parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
            '/pesan': { post: { tags: ['💬 Pesan'], summary: 'Kirim pesan', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['penerima_id','isi'], properties: { penerima_id: { type: 'integer' }, isi: { type: 'string' }, siswa_id: { type: 'integer', description: 'Opsional, konteks tentang siswa' }, subjek: { type: 'string' } } } } } }, responses: { 201: { description: 'Terkirim' } } } },
            // ── PENGUMUMAN ────────────────────────────────────────
            '/pengumuman': {
                get: { tags: ['📢 Pengumuman'], summary: 'Daftar pengumuman (filter otomatis by role)', responses: { 200: { description: 'OK' } } },
                post: { tags: ['📢 Pengumuman'], summary: 'Buat pengumuman (admin/kepsek/guru)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['judul','isi'], properties: { judul: { type: 'string' }, isi: { type: 'string' }, target_role: { type: 'string', enum: ['semua','guru','wali','kepsek'], default: 'semua' }, kelas_id: { type: 'integer', description: 'Opsional, null = semua kelas' }, status: { type: 'string', enum: ['Draft','Terkirim'], default: 'Terkirim' } } } } } }, responses: { 201: { description: 'OK' } } }
            },
            '/pengumuman/{id}/baca': { put: { tags: ['📢 Pengumuman'], summary: 'Tandai pengumuman sudah dibaca', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
            // ── LAPORAN ───────────────────────────────────────────
            '/laporan': { get: { tags: ['📄 Laporan'], summary: 'Daftar laporan yang sudah digenerate', parameters: [{ name: 'tipe', in: 'query', schema: { type: 'string', enum: ['Bulanan','Semester','Tahunan','Kelas'] } }], responses: { 200: { description: 'OK' } } } },
            '/laporan/generate': { post: { tags: ['📄 Laporan'], summary: 'Generate laporan baru', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['tipe','periode'], properties: { tipe: { type: 'string', enum: ['Bulanan','Semester','Tahunan','Kelas'] }, periode: { type: 'string', example: 'November 2024' }, kelas_id: { type: 'integer' }, tahun_ajaran: { type: 'string' } } } } } }, responses: { 200: { description: 'OK' } } } },
            '/laporan/kelas/{kelasId}': { get: { tags: ['📄 Laporan'], summary: 'Data laporan detail per kelas (semua siswa + capaian + absensi)', parameters: [{ name: 'kelasId', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'bulan', in: 'query', schema: { type: 'integer' } }, { name: 'tahun', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
            // ── USERS ─────────────────────────────────────────────
            '/users': {
                get: { tags: ['👤 Users'], summary: 'Semua user (admin)', parameters: [{ name: 'role', in: 'query', schema: { type: 'string', enum: ['admin','kepsek','guru','wali'] } }, { name: 'search', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
                post: { tags: ['👤 Users'], summary: 'Buat akun baru (admin)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nama','email','password','role'], properties: { nama: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' }, role: { type: 'string', enum: ['admin','kepsek','guru','wali'] }, no_hp: { type: 'string' }, nip: { type: 'string', description: 'Khusus guru' }, spesialisasi: { type: 'string', enum: ['Guru Kelas','Terapis','Guru Mapel'], description: 'Khusus guru' } } } } } }, responses: { 201: { description: 'Akun dibuat' } } }
            },
            '/users/guru': { get: { tags: ['👤 Users'], summary: 'Daftar guru + info kelas & input hari ini (admin/kepsek)', responses: { 200: { description: 'OK' } } } },
            '/users/guru/kinerja': { get: { tags: ['👤 Users'], summary: 'Kinerja guru — % input tepat waktu (admin/kepsek)', parameters: [{ name: 'bulan', in: 'query', schema: { type: 'integer' } }, { name: 'tahun', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
            '/users/{id}/reset-password': { put: { tags: ['👤 Users'], summary: 'Reset password user (admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { password_baru: { type: 'string', default: '12345678' } } } } } }, responses: { 200: { description: 'OK' } } } },
            // ── ADMIN ─────────────────────────────────────────────
            '/pengaturan': {
                get: { tags: ['⚙️ Admin'], summary: 'Baca semua pengaturan sistem', responses: { 200: { description: 'OK' } } },
                put: { tags: ['⚙️ Admin'], summary: 'Update pengaturan (admin)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { settings: { type: 'array', items: { type: 'object', properties: { kunci: { type: 'string' }, nilai: { type: 'string' } } }, example: [{ kunci: 'nama_sekolah', nilai: 'SLB Generasi Emas' }, { kunci: 'notif_input_ke_kepsek', nilai: 'true' }] } } } } } }, responses: { 200: { description: 'OK' } } }
            },
            '/log': { get: { tags: ['⚙️ Admin'], summary: 'Log aktivitas sistem (admin)', parameters: [{ name: 'tanggal', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }], responses: { 200: { description: 'OK' } } } },
            '/kegiatan': {
                get: { tags: ['⚙️ Admin'], summary: 'Kalender kegiatan/jadwal', parameters: [{ name: 'bulan', in: 'query', schema: { type: 'integer' } }, { name: 'tahun', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
                post: { tags: ['⚙️ Admin'], summary: 'Tambah kegiatan (admin/kepsek)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['judul','tanggal'], properties: { judul: { type: 'string' }, deskripsi: { type: 'string' }, tanggal: { type: 'string', example: '2024-11-23' }, waktu_mulai: { type: 'string', example: '08:00' }, waktu_selesai: { type: 'string', example: '10:00' }, lokasi: { type: 'string' }, tipe: { type: 'string', enum: ['Konsultasi','Acara Sekolah','Pembagian Rapor','Lainnya'] } } } } } }, responses: { 201: { description: 'OK' } } }
            },
            '/aspek': { get: { tags: ['⚙️ Admin'], summary: 'Daftar aspek perkembangan', responses: { 200: { description: 'OK' } } } },
            '/tingkat': { get: { tags: ['⚙️ Admin'], summary: 'Daftar tingkat (SDLB, SMPLB, SMALB)', responses: { 200: { description: 'OK' } } } },
        }
    },
    apis: []
};

module.exports = swaggerJsdoc(options);
