-- ============================================================
-- SLB Monitoring Siswa - Schema untuk phpMyAdmin
-- Jalankan di database: slb_monitoring
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'kepsek', 'guru', 'wali') NOT NULL,
    no_hp VARCHAR(20),
    foto VARCHAR(255),
    is_aktif BOOLEAN DEFAULT TRUE,
    last_login DATETIME,
    login_ip VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tingkat (
    tingkat_id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(10) NOT NULL,
    keterangan VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS kelas (
    kelas_id INT AUTO_INCREMENT PRIMARY KEY,
    nama_kelas VARCHAR(20) NOT NULL,
    tingkat_id INT NOT NULL,
    tahun_ajaran VARCHAR(10) NOT NULL,
    kapasitas INT DEFAULT 10,
    is_aktif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tingkat_id) REFERENCES tingkat(tingkat_id)
);

CREATE TABLE IF NOT EXISTS guru (
    guru_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    nip VARCHAR(30),
    spesialisasi ENUM('Guru Kelas', 'Terapis', 'Guru Mapel') DEFAULT 'Guru Kelas',
    tgl_bergabung DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kelas_guru (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kelas_id INT NOT NULL,
    guru_id INT NOT NULL,
    is_wali_kelas BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (kelas_id) REFERENCES kelas(kelas_id) ON DELETE CASCADE,
    FOREIGN KEY (guru_id) REFERENCES guru(guru_id) ON DELETE CASCADE,
    UNIQUE KEY uk_kelas_guru (kelas_id, guru_id)
);

CREATE TABLE IF NOT EXISTS siswa (
    siswa_id INT AUTO_INCREMENT PRIMARY KEY,
    nisn VARCHAR(20) UNIQUE NOT NULL,
    nama VARCHAR(100) NOT NULL,
    tgl_lahir DATE NOT NULL,
    jenis_kelamin ENUM('L', 'P') NOT NULL,
    alamat TEXT,
    kebutuhan_khusus VARCHAR(100),
    kelas_id INT,
    tahun_masuk YEAR,
    foto VARCHAR(255),
    is_aktif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (kelas_id) REFERENCES kelas(kelas_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS wali_siswa (
    wali_id INT AUTO_INCREMENT PRIMARY KEY,
    siswa_id INT NOT NULL,
    user_id INT NOT NULL,
    hubungan ENUM('Ayah', 'Ibu', 'Wali') DEFAULT 'Wali',
    is_primer BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (siswa_id) REFERENCES siswa(siswa_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS aspek_perkembangan (
    aspek_id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(50) NOT NULL,
    kode VARCHAR(20) UNIQUE NOT NULL,
    deskripsi TEXT,
    bobot INT DEFAULT 20,
    is_aktif BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS perkembangan_harian (
    perkembangan_id INT AUTO_INCREMENT PRIMARY KEY,
    siswa_id INT NOT NULL,
    guru_id INT NOT NULL,
    tanggal DATE NOT NULL,
    aspek_id INT NOT NULL,
    capaian INT NOT NULL,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (siswa_id) REFERENCES siswa(siswa_id) ON DELETE CASCADE,
    FOREIGN KEY (guru_id) REFERENCES guru(guru_id),
    FOREIGN KEY (aspek_id) REFERENCES aspek_perkembangan(aspek_id),
    UNIQUE KEY uk_perk_harian (siswa_id, tanggal, aspek_id)
);

CREATE TABLE IF NOT EXISTS absensi (
    absensi_id INT AUTO_INCREMENT PRIMARY KEY,
    siswa_id INT NOT NULL,
    kelas_id INT NOT NULL,
    tanggal DATE NOT NULL,
    status ENUM('Hadir', 'Sakit', 'Izin', 'Alpha') NOT NULL,
    keterangan TEXT,
    dicatat_oleh INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (siswa_id) REFERENCES siswa(siswa_id) ON DELETE CASCADE,
    FOREIGN KEY (kelas_id) REFERENCES kelas(kelas_id),
    FOREIGN KEY (dicatat_oleh) REFERENCES users(user_id),
    UNIQUE KEY uk_absensi (siswa_id, tanggal)
);

CREATE TABLE IF NOT EXISTS ppi (
    ppi_id INT AUTO_INCREMENT PRIMARY KEY,
    siswa_id INT NOT NULL,
    guru_id INT NOT NULL,
    semester VARCHAR(20) NOT NULL,
    tahun_ajaran VARCHAR(10) NOT NULL,
    potensi TEXT,
    hambatan TEXT,
    target_utama TEXT,
    target_akademik TEXT,
    target_motorik TEXT,
    target_komunikasi TEXT,
    target_bina_diri TEXT,
    status ENUM('Aktif', 'Selesai', 'Draft') DEFAULT 'Draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (siswa_id) REFERENCES siswa(siswa_id) ON DELETE CASCADE,
    FOREIGN KEY (guru_id) REFERENCES guru(guru_id)
);

CREATE TABLE IF NOT EXISTS ppi_detail (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ppi_id INT NOT NULL,
    aspek_id INT NOT NULL,
    target TEXT NOT NULL,
    progress INT DEFAULT 0,
    status ENUM('Belum', 'Berjalan', 'Tercapai') DEFAULT 'Belum',
    catatan TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (ppi_id) REFERENCES ppi(ppi_id) ON DELETE CASCADE,
    FOREIGN KEY (aspek_id) REFERENCES aspek_perkembangan(aspek_id)
);

CREATE TABLE IF NOT EXISTS laporan (
    laporan_id INT AUTO_INCREMENT PRIMARY KEY,
    judul VARCHAR(200) NOT NULL,
    tipe ENUM('Bulanan', 'Semester', 'Tahunan', 'Kelas') NOT NULL,
    periode VARCHAR(50) NOT NULL,
    kelas_id INT,
    dibuat_oleh INT NOT NULL,
    file_path VARCHAR(255),
    total_siswa INT,
    total_kelas INT,
    status ENUM('Draft', 'Final') DEFAULT 'Final',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kelas_id) REFERENCES kelas(kelas_id) ON DELETE SET NULL,
    FOREIGN KEY (dibuat_oleh) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS pesan (
    pesan_id INT AUTO_INCREMENT PRIMARY KEY,
    pengirim_id INT NOT NULL,
    penerima_id INT NOT NULL,
    siswa_id INT,
    subjek VARCHAR(200),
    isi TEXT NOT NULL,
    is_dibaca BOOLEAN DEFAULT FALSE,
    dibaca_pada DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pengirim_id) REFERENCES users(user_id),
    FOREIGN KEY (penerima_id) REFERENCES users(user_id),
    FOREIGN KEY (siswa_id) REFERENCES siswa(siswa_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pengumuman (
    pengumuman_id INT AUTO_INCREMENT PRIMARY KEY,
    pengirim_id INT NOT NULL,
    judul VARCHAR(200) NOT NULL,
    isi TEXT NOT NULL,
    target_role ENUM('semua', 'guru', 'wali', 'kepsek') DEFAULT 'semua',
    kelas_id INT,
    status ENUM('Draft', 'Terkirim') DEFAULT 'Terkirim',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pengirim_id) REFERENCES users(user_id),
    FOREIGN KEY (kelas_id) REFERENCES kelas(kelas_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pengumuman_read (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pengumuman_id INT NOT NULL,
    user_id INT NOT NULL,
    dibaca_pada TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pengumuman_id) REFERENCES pengumuman(pengumuman_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY uk_pengumuman_read (pengumuman_id, user_id)
);

CREATE TABLE IF NOT EXISTS log_aktivitas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    aksi VARCHAR(100) NOT NULL,
    detail TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pengaturan (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kunci VARCHAR(100) UNIQUE NOT NULL,
    nilai TEXT,
    keterangan VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kegiatan (
    kegiatan_id INT AUTO_INCREMENT PRIMARY KEY,
    judul VARCHAR(200) NOT NULL,
    deskripsi TEXT,
    tanggal DATE NOT NULL,
    waktu_mulai TIME,
    waktu_selesai TIME,
    lokasi VARCHAR(200),
    banner_url VARCHAR(500),
    tipe ENUM('Konsultasi', 'Acara Sekolah', 'Pembagian Rapor', 'Lainnya') DEFAULT 'Lainnya',
    dibuat_oleh INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dibuat_oleh) REFERENCES users(user_id)
);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- SEED DATA AWAL
-- ============================================================

INSERT IGNORE INTO aspek_perkembangan (nama, kode, deskripsi, bobot) VALUES
('Kognitif', 'kognitif', 'Kemampuan berpikir, mengingat, dan memecahkan masalah', 25),
('Emosi & Sosial', 'sosial', 'Kemampuan berinteraksi dan mengelola emosi', 25),
('Motorik', 'motorik', 'Kemampuan gerak kasar dan halus', 20),
('Komunikasi', 'komunikasi', 'Kemampuan berbahasa verbal dan non-verbal', 20),
('Bina Diri', 'bina_diri', 'Kemandirian dalam aktivitas sehari-hari', 10);

INSERT IGNORE INTO tingkat (nama, keterangan) VALUES
('SDLB', 'Sekolah Dasar Luar Biasa'),
('SMPLB', 'Sekolah Menengah Pertama Luar Biasa'),
('SMALB', 'Sekolah Menengah Atas Luar Biasa');

INSERT IGNORE INTO pengaturan (kunci, nilai, keterangan) VALUES
('nama_sekolah', 'SLB Generasi Emas', 'Nama sekolah'),
('tahun_ajaran_aktif', '2024/2025', 'Tahun ajaran yang sedang berjalan'),
('semester_aktif', '1', 'Semester aktif (1 atau 2)'),
('notif_input_ke_kepsek', 'true', 'Notifikasi input terlambat ke kepsek'),
('notif_email_wali', 'true', 'Email laporan ke wali murid'),
('pengingat_absensi_guru', 'true', 'Pengingat absensi untuk guru'),
('backup_otomatis', 'true', 'Backup otomatis harian'),
('alert_absen_3x', 'true', 'Alert siswa absen 3x berturut-turut');
