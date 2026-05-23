// seed.js - Jalankan sekali untuk data awal
// node src/config/seed.js

const bcrypt = require('bcryptjs');
require('dotenv').config();
const db = require('./database');

async function seed() {
    console.log('🌱 Seeding database...');

    try {
        // ==============================
        // USERS
        // ==============================
        const users = [
            { nama: 'Admin Sistem', email: 'admin@slb.sch.id', password: 'admin123', role: 'admin' },
            { nama: 'Bpk. Putra', email: 'kepsek@slb.sch.id', password: 'kepsek123', role: 'kepsek' },
            { nama: 'Bu Hartini Sri Rahayu', email: 'bu.hartini@slb.sch.id', password: 'guru123', role: 'guru' },
            { nama: 'Pak Hendra', email: 'pak.hendra@slb.sch.id', password: 'guru123', role: 'guru' },
            { nama: 'Bu Sari', email: 'bu.sari@slb.sch.id', password: 'guru123', role: 'guru' },
            { nama: 'Pak Dod', email: 'pak.dod@slb.sch.id', password: 'guru123', role: 'guru' },
            { nama: 'Bu Dewi', email: 'bu.dewi@slb.sch.id', password: 'guru123', role: 'guru' },
            { nama: 'Pak Rudi', email: 'pak.rudi@slb.sch.id', password: 'guru123', role: 'guru' },
            { nama: 'Bu Sari (Wali Andi)', email: 'wali.andi@gmail.com', password: 'wali123', role: 'wali' },
            { nama: 'Pak Budi (Wali Deni)', email: 'wali.deni@gmail.com', password: 'wali123', role: 'wali' },
        ];

        const userIds = {};
        for (const u of users) {
            const hashed = await bcrypt.hash(u.password, 10);
            const [r] = await db.execute(
                'INSERT IGNORE INTO users (nama, email, password, role) VALUES (?, ?, ?, ?)',
                [u.nama, u.email, hashed, u.role]
            );
            if (r.insertId) userIds[u.email] = r.insertId;
            else {
                const [existing] = await db.execute('SELECT user_id AS id FROM users WHERE email = ?', [u.email]);
                userIds[u.email] = existing[0].id;
            }
        }
        console.log('✅ Users seeded');

        // ==============================
        // GURU
        // ==============================
        const guruEmails = ['bu.hartini@slb.sch.id', 'pak.hendra@slb.sch.id', 'bu.sari@slb.sch.id', 'pak.dod@slb.sch.id', 'bu.dewi@slb.sch.id', 'pak.rudi@slb.sch.id'];
        const guruIds = {};
        for (const email of guruEmails) {
            const [r] = await db.execute(
                'INSERT IGNORE INTO guru (user_id, spesialisasi) VALUES (?, "Guru Kelas")',
                [userIds[email]]
            );
            if (r.insertId) guruIds[email] = r.insertId;
            else {
                const [existing] = await db.execute('SELECT guru_id AS id FROM guru WHERE user_id = ?', [userIds[email]]);
                guruIds[email] = existing[0].id;
            }
        }
        console.log('✅ Guru seeded');

        // ==============================
        // KELAS
        // ==============================
        const kelasList = [
            { nama_kelas: 'VI-A', tingkat_id: 1, tahun_ajaran: '2024/2025' },
            { nama_kelas: 'VI-B', tingkat_id: 1, tahun_ajaran: '2024/2025' },
            { nama_kelas: 'VII-A', tingkat_id: 2, tahun_ajaran: '2024/2025' },
            { nama_kelas: 'VII-B', tingkat_id: 2, tahun_ajaran: '2024/2025' },
            { nama_kelas: 'VIII-A', tingkat_id: 2, tahun_ajaran: '2024/2025' },
            { nama_kelas: 'VIII-B', tingkat_id: 2, tahun_ajaran: '2024/2025' },
        ];
        const kelasIds = {};
        for (const k of kelasList) {
            const [r] = await db.execute(
                'INSERT IGNORE INTO kelas (nama_kelas, tingkat_id, tahun_ajaran) VALUES (?, ?, ?)',
                [k.nama_kelas, k.tingkat_id, k.tahun_ajaran]
            );
            if (r.insertId) kelasIds[k.nama_kelas] = r.insertId;
            else {
                const [existing] = await db.execute('SELECT kelas_id AS id FROM kelas WHERE nama_kelas = ? AND tahun_ajaran = ?', [k.nama_kelas, k.tahun_ajaran]);
                kelasIds[k.nama_kelas] = existing[0].id;
            }
        }
        console.log('✅ Kelas seeded');

        // ==============================
        // KELAS-GURU
        // ==============================
        const assignments = [
            { kelas: 'VII-A', guru: 'bu.hartini@slb.sch.id', wali_kelas: true },
            { kelas: 'VII-B', guru: 'pak.rudi@slb.sch.id', wali_kelas: true },
            { kelas: 'VI-A', guru: 'pak.hendra@slb.sch.id', wali_kelas: true },
            { kelas: 'VI-B', guru: 'bu.sari@slb.sch.id', wali_kelas: true },
            { kelas: 'VIII-A', guru: 'bu.dewi@slb.sch.id', wali_kelas: true },
            { kelas: 'VIII-B', guru: 'pak.dod@slb.sch.id', wali_kelas: false },
        ];
        for (const a of assignments) {
            await db.execute(
                'INSERT IGNORE INTO kelas_guru (kelas_id, guru_id, is_wali_kelas) VALUES (?, ?, ?)',
                [kelasIds[a.kelas], guruIds[a.guru], a.wali_kelas]
            );
        }
        console.log('✅ Kelas-Guru assigned');

        // ==============================
        // SISWA
        // ==============================
        const siswaList = [
            { nisn: '1234567890', nama: 'Andi Risky', tgl_lahir: '2010-03-14', jenis_kelamin: 'L', kebutuhan_khusus: 'Tunagrahita ringan', kelas: 'VII-A' },
            { nisn: '1234567891', nama: 'Budi S', tgl_lahir: '2011-05-20', jenis_kelamin: 'L', kebutuhan_khusus: 'Tunarungu', kelas: 'VII-A' },
            { nisn: '1234567892', nama: 'Citra M', tgl_lahir: '2010-08-10', jenis_kelamin: 'P', kebutuhan_khusus: 'Autis', kelas: 'VII-A' },
            { nisn: '1234567893', nama: 'Deni W', tgl_lahir: '2010-12-01', jenis_kelamin: 'L', kebutuhan_khusus: 'Tunagrahita sedang', kelas: 'VII-A' },
            { nisn: '1234567894', nama: 'Fahmi R', tgl_lahir: '2012-02-15', jenis_kelamin: 'L', kebutuhan_khusus: 'Tunagrahita', kelas: 'VII-B' },
            { nisn: '1234567895', nama: 'Gita S', tgl_lahir: '2011-07-22', jenis_kelamin: 'P', kebutuhan_khusus: 'Tunarungu', kelas: 'VII-B' },
        ];
        const siswaIds = {};
        for (const s of siswaList) {
            const [r] = await db.execute(
                'INSERT IGNORE INTO siswa (nisn, nama, tgl_lahir, jenis_kelamin, kebutuhan_khusus, kelas_id, tahun_masuk) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [s.nisn, s.nama, s.tgl_lahir, s.jenis_kelamin, s.kebutuhan_khusus, kelasIds[s.kelas], 2019]
            );
            if (r.insertId) siswaIds[s.nisn] = r.insertId;
            else {
                const [existing] = await db.execute('SELECT siswa_id AS id FROM siswa WHERE nisn = ?', [s.nisn]);
                siswaIds[s.nisn] = existing[0].id;
            }
        }
        console.log('✅ Siswa seeded');

        // ==============================
        // WALI SISWA
        // ==============================
        await db.execute(
            'INSERT IGNORE INTO wali_siswa (siswa_id, user_id, hubungan, is_primer) VALUES (?, ?, "Ibu", 1)',
            [siswaIds['1234567890'], userIds['wali.andi@gmail.com']]
        );
        await db.execute(
            'INSERT IGNORE INTO wali_siswa (siswa_id, user_id, hubungan, is_primer) VALUES (?, ?, "Ayah", 1)',
            [siswaIds['1234567893'], userIds['wali.deni@gmail.com']]
        );
        console.log('✅ Wali siswa seeded');

        // ==============================
        // SAMPLE PERKEMBANGAN HARIAN
        // ==============================
        const [aspekRows] = await db.execute('SELECT aspek_id AS id, kode FROM aspek_perkembangan');
        const guruHartiniId = guruIds['bu.hartini@slb.sch.id'];
        const dates = [];
        for (let i = 30; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().split('T')[0]);
        }

        for (const nisn of ['1234567890', '1234567891', '1234567892', '1234567893']) {
            const siswaId = siswaIds[nisn];
            for (const date of dates.slice(-10)) {  // Hanya 10 hari terakhir
                for (const aspek of aspekRows) {
                    const capaian = Math.floor(Math.random() * 30) + 60; // 60-90
                    await db.execute(
                        'INSERT IGNORE INTO perkembangan_harian (siswa_id, guru_id, tanggal, aspek_id, capaian) VALUES (?, ?, ?, ?, ?)',
                        [siswaId, guruHartiniId, date, aspek.id, capaian]
                    );
                }
            }
        }
        console.log('✅ Sample perkembangan harian seeded');

        // ==============================
        // SAMPLE ABSENSI
        // ==============================
        for (const nisn of ['1234567890', '1234567891', '1234567892', '1234567893']) {
            const siswaId = siswaIds[nisn];
            for (const date of dates.slice(-20)) {
                const status = Math.random() > 0.1 ? 'Hadir' : (Math.random() > 0.5 ? 'Sakit' : 'Izin');
                await db.execute(
                    'INSERT IGNORE INTO absensi (siswa_id, kelas_id, tanggal, status, dicatat_oleh) VALUES (?, ?, ?, ?, ?)',
                    [siswaId, kelasIds['VII-A'], date, status, userIds['bu.hartini@slb.sch.id']]
                );
            }
        }
        console.log('✅ Sample absensi seeded');

        console.log('\n🎉 Seed selesai!');
        console.log('\n📋 Akun untuk testing:');
        console.log('  Admin    : admin@slb.sch.id / admin123');
        console.log('  Kepsek   : kepsek@slb.sch.id / kepsek123');
        console.log('  Guru     : bu.hartini@slb.sch.id / guru123');
        console.log('  Wali     : wali.andi@gmail.com / wali123');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seed error:', err);
        process.exit(1);
    }
}

seed();
