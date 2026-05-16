# 🏫 SLB Monitoring - Backend API

Backend REST API untuk aplikasi Android monitoring siswa SLB (Sekolah Luar Biasa), dibangun dengan **Express.js + MySQL**.

---

## 📁 Struktur Proyek

```
slb-backend/
├── src/
│   ├── index.js                    # Entry point
│   ├── routes/
│   │   └── index.js                # Semua routes
│   ├── controllers/
│   │   ├── authController.js       # Login, profil
│   │   ├── siswaController.js      # CRUD siswa
│   │   ├── kelasController.js      # CRUD kelas
│   │   ├── perkembanganController.js # Input & rekap perkembangan
│   │   ├── absensiController.js    # Absensi harian
│   │   ├── ppiController.js        # Program Pembelajaran Individual
│   │   ├── komunikasiController.js # Pesan & pengumuman
│   │   ├── dashboardController.js  # Dashboard & laporan
│   │   ├── userController.js       # Manajemen akun
│   │   └── adminController.js      # Setting, log, kegiatan
│   ├── middleware/
│   │   └── auth.js                 # JWT auth + role guard
│   └── config/
│       ├── database.js             # MySQL pool
│       ├── schema.sql              # DDL + seed awal
│       └── seed.js                 # Data sample untuk testing
├── .env.example
└── package.json
```

---

## ⚙️ Setup & Instalasi

### 1. Clone & Install
```bash
cd slb-backend
npm install
```

### 2. Buat file `.env`
```bash
cp .env.example .env
# Edit sesuai konfigurasi MySQL kamu
```

### 3. Buat database & tabel
```bash
mysql -u root -p < src/config/schema.sql
```

### 4. Isi data awal (opsional, untuk testing)
```bash
node src/config/seed.js
```

### 5. Jalankan server
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server berjalan di: `http://localhost:3000`

---

## 🔑 Autentikasi

Semua endpoint (kecuali `/api/auth/login`) memerlukan header:
```
Authorization: Bearer <token>
```

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "bu.hartini@slb.sch.id",
  "password": "guru123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJ...",
    "user": {
      "id": 3,
      "nama": "Bu Hartini Sri Rahayu",
      "email": "bu.hartini@slb.sch.id",
      "role": "guru"
    }
  }
}
```

---

## 👥 Role & Akses

| Role    | Akses                                                      |
|---------|------------------------------------------------------------|
| admin   | Semua fitur + manajemen akun + pengaturan sistem           |
| kepsek  | Dashboard sekolah, laporan, pengumuman, monitoring guru    |
| guru    | Input perkembangan, absensi, PPI, pesan wali              |
| wali    | Lihat perkembangan anak, pesan guru, kalender              |

---

## 📡 Daftar Endpoint

### AUTH
| Method | Endpoint                    | Akses   | Deskripsi           |
|--------|-----------------------------|---------|---------------------|
| POST   | /api/auth/login             | Publik  | Login               |
| GET    | /api/auth/me                | Semua   | Profil sendiri      |
| PUT    | /api/auth/change-password   | Semua   | Ganti password      |

### DASHBOARD
| Method | Endpoint                 | Role          |
|--------|--------------------------|---------------|
| GET    | /api/dashboard/admin     | admin         |
| GET    | /api/dashboard/kepsek    | kepsek, admin |
| GET    | /api/dashboard/guru      | guru          |
| GET    | /api/dashboard/wali      | wali          |

### SISWA
| Method | Endpoint                     | Akses              |
|--------|------------------------------|--------------------|
| GET    | /api/siswa                   | semua              |
| GET    | /api/siswa/perlu-perhatian   | admin,kepsek,guru  |
| GET    | /api/siswa/:id               | semua              |
| POST   | /api/siswa                   | admin              |
| PUT    | /api/siswa/:id               | admin              |
| DELETE | /api/siswa/:id               | admin              |

### KELAS
| Method | Endpoint                        | Akses      |
|--------|---------------------------------|------------|
| GET    | /api/kelas                      | semua      |
| GET    | /api/kelas/guru/saya            | guru       |
| GET    | /api/kelas/:id                  | semua      |
| POST   | /api/kelas                      | admin      |
| PUT    | /api/kelas/:id                  | admin      |
| POST   | /api/kelas/:id/guru             | admin      |
| DELETE | /api/kelas/:kelasId/guru/:guruId| admin      |

### PERKEMBANGAN HARIAN
| Method | Endpoint                                | Akses             |
|--------|-----------------------------------------|-------------------|
| GET    | /api/perkembangan/siswa/:siswaId        | semua             |
| GET    | /api/perkembangan/siswa/:siswaId/ringkasan | semua          |
| GET    | /api/perkembangan/kelas/:kelasId/rekap  | admin,kepsek,guru |
| GET    | /api/perkembangan/sekolah/rekap         | admin,kepsek      |
| POST   | /api/perkembangan                       | guru              |
| POST   | /api/perkembangan/batch                 | guru              |

**Body input batch (semua aspek sekaligus):**
```json
{
  "siswa_id": 1,
  "tanggal": "2024-11-14",
  "aspek_list": [
    { "aspek_id": 1, "capaian": 80, "catatan": "Bagus" },
    { "aspek_id": 2, "capaian": 75, "catatan": null },
    { "aspek_id": 3, "capaian": 65, "catatan": null }
  ]
}
```

### ABSENSI
| Method | Endpoint                          | Akses             |
|--------|-----------------------------------|-------------------|
| GET    | /api/absensi/kelas/:kelasId       | admin,kepsek,guru |
| GET    | /api/absensi/siswa/:siswaId/rekap | semua             |
| GET    | /api/absensi/rekap-bulanan        | admin,kepsek,guru |
| POST   | /api/absensi                      | guru,admin        |

**Body input absensi:**
```json
{
  "kelas_id": 3,
  "tanggal": "2024-11-14",
  "absensi_list": [
    { "siswa_id": 1, "status": "Hadir" },
    { "siswa_id": 2, "status": "Sakit", "keterangan": "Demam" }
  ]
}
```

### PPI
| Method | Endpoint                   | Akses             |
|--------|----------------------------|-------------------|
| GET    | /api/ppi/siswa/:siswaId    | semua             |
| GET    | /api/ppi/kelas/:kelasId    | admin,kepsek,guru |
| GET    | /api/ppi/:id               | semua             |
| POST   | /api/ppi                   | guru              |
| PUT    | /api/ppi/:id               | guru,admin        |

### PESAN & PENGUMUMAN
| Method | Endpoint                          | Akses             |
|--------|-----------------------------------|-------------------|
| GET    | /api/pesan/inbox                  | semua             |
| GET    | /api/pesan/kontak                 | semua             |
| GET    | /api/pesan/percakapan/:userId     | semua             |
| POST   | /api/pesan                        | semua             |
| PUT    | /api/pesan/:id/baca               | semua             |
| GET    | /api/pengumuman                   | semua             |
| POST   | /api/pengumuman                   | admin,kepsek,guru |
| PUT    | /api/pengumuman/:id/baca          | semua             |

### LAPORAN
| Method | Endpoint                       | Akses             |
|--------|--------------------------------|-------------------|
| GET    | /api/laporan                   | semua             |
| POST   | /api/laporan/generate          | admin,kepsek,guru |
| GET    | /api/laporan/kelas/:kelasId    | admin,kepsek,guru |

### ADMIN
| Method | Endpoint                   | Akses  |
|--------|----------------------------|--------|
| GET    | /api/users                 | admin  |
| GET    | /api/users/guru            | admin,kepsek |
| GET    | /api/users/guru/kinerja    | admin,kepsek |
| POST   | /api/users                 | admin  |
| PUT    | /api/users/:id             | admin  |
| PUT    | /api/users/:id/reset-password | admin |
| GET    | /api/pengaturan            | semua  |
| PUT    | /api/pengaturan            | admin  |
| GET    | /api/log                   | admin  |
| GET    | /api/kegiatan              | semua  |
| POST   | /api/kegiatan              | admin,kepsek |
| DELETE | /api/kegiatan/:id          | admin,kepsek |
| GET    | /api/aspek                 | semua  |
| PUT    | /api/aspek/:id             | admin  |
| GET    | /api/tingkat               | semua  |

---

## 📱 Integrasi Android Studio (Java)

### 1. Tambahkan dependency di `build.gradle`
```gradle
dependencies {
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
    implementation 'com.squareup.okhttp3:logging-interceptor:4.11.0'
}
```

### 2. Buat ApiClient.java
```java
public class ApiClient {
    private static final String BASE_URL = "http://10.0.2.2:3000/api/"; // Emulator
    // Untuk device fisik: "http://192.168.x.x:3000/api/"
    
    private static Retrofit retrofit;
    
    public static Retrofit getClient() {
        if (retrofit == null) {
            OkHttpClient client = new OkHttpClient.Builder()
                .addInterceptor(chain -> {
                    String token = SharedPrefManager.getInstance().getToken();
                    Request req = chain.request().newBuilder()
                        .addHeader("Authorization", "Bearer " + token)
                        .build();
                    return chain.proceed(req);
                })
                .build();
            
            retrofit = new Retrofit.Builder()
                .baseUrl(BASE_URL)
                .client(client)
                .addConverterFactory(GsonConverterFactory.create())
                .build();
        }
        return retrofit;
    }
}
```

### 3. Buat ApiService.java
```java
public interface ApiService {
    @POST("auth/login")
    Call<LoginResponse> login(@Body LoginRequest body);
    
    @GET("dashboard/guru")
    Call<DashboardResponse> getDashboardGuru();
    
    @GET("siswa")
    Call<SiswaListResponse> getSiswa(@Query("kelas_id") int kelasId);
    
    @POST("perkembangan/batch")
    Call<BaseResponse> inputPerkembangan(@Body PerkembanganBatchRequest body);
    
    @POST("absensi")
    Call<BaseResponse> inputAbsensi(@Body AbsensiRequest body);
    
    // ... tambahkan sesuai kebutuhan
}
```

### 4. Format Response
Semua response menggunakan format:
```json
{
  "success": true,
  "message": "...",
  "data": { ... }
}
```

---

## 🗄️ Akun Testing
| Role    | Email                       | Password   |
|---------|-----------------------------|------------|
| Admin   | admin@slb.sch.id            | admin123   |
| Kepsek  | kepsek@slb.sch.id           | kepsek123  |
| Guru    | bu.hartini@slb.sch.id       | guru123    |
| Wali    | wali.andi@gmail.com         | wali123    |
