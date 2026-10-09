# 🔔 Bel Sekolah SD SIG

Aplikasi Sistem Informasi Sekolah lengkap dengan fitur **Bel Otomatis**, **Absensi Siswa**, **Jurnal Pembelajaran**, dan **Penilaian Harian**.

---

## 🚀 Fitur Utama

### 🔔 Bel Sekolah
- **Bel Otomatis** berdasarkan jadwal yang diatur Admin (menggunakan `node-cron`)
- **Bel Manual** - bunyikan bel kapan saja dengan 1 klik
- **Upload Suara Bel** - import file MP3/WAV/OGG/AAC dari komputer
- **Notifikasi Real-time** via Server-Sent Events (SSE) ke semua browser
- **Log Histori Bel** - tercatat otomatis setiap bel berbunyi

### 👥 Manajemen Pengguna
- Role **Admin** (akses penuh) dan **Guru** (akses terbatas)
- Admin dapat tambah, edit, hapus, nonaktifkan akun pengguna

### 📋 Absensi Siswa
- Input absensi harian per kelas (Hadir/Sakit/Izin/Alpha)
- Rekap absensi bulanan dengan persentase kehadiran

### 📓 Jurnal Pembelajaran
- Guru mencatat materi, tujuan, kegiatan, media, dan metode pembelajaran
- Guru hanya bisa melihat/edit jurnal miliknya sendiri
- Admin dapat melihat semua jurnal

### 📊 Penilaian Harian
- Input nilai per kelas dan mata pelajaran
- Berbagai jenis penilaian: Tugas, Kuis, Ulangan Harian, Praktik, Proyek
- Rekap nilai dengan predikat (A/B/C/D/E)

---

## ⚙️ Cara Instalasi

### Prasyarat
- Node.js v18+
- MySQL 5.7+ / MariaDB 10.3+

### Langkah Instalasi

**1. Import Database**
```bash
# Buka MySQL client lalu jalankan:
mysql -u root -p < database/schema.sql
```

**2. Konfigurasi `.env`**
```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password_mysql_anda
DB_NAME=sd_sig_bel
SESSION_SECRET=rahasia_session_anda
```

**3. Jalankan Aplikasi**
```bash
# Mode development (auto-restart)
npm run dev

# Mode production
npm start
```

**4. Buka Browser**
```
http://localhost:3000
```

---

## 🔑 Akun Default

| Role  | Username | Password |
|-------|----------|----------|
| Admin | `admin`  | `admin123` |
| Guru  | `guru`   | `admin123` |

> ⚠️ **Segera ganti password setelah pertama kali login!**

---

## 📁 Struktur Proyek

```
SD_SIG/
├── app.js                 # Entry point Express
├── .env                   # Konfigurasi environment
├── config/
│   ├── db.js              # Koneksi MySQL
│   └── multer.js          # Konfigurasi upload file
├── middleware/
│   └── auth.js            # Middleware autentikasi & role
├── routes/
│   ├── auth.js            # Login/Logout
│   ├── dashboard.js       # Dashboard & bel manual
│   ├── bel.js             # Jadwal & suara bel
│   ├── users.js           # Manajemen pengguna
│   ├── absensi.js         # Absensi siswa
│   ├── jurnal.js          # Jurnal pembelajaran
│   └── penilaian.js       # Penilaian harian
├── services/
│   └── scheduler.js       # Cron job bel otomatis + SSE
├── views/
│   ├── layouts/           # Template layout EJS
│   ├── auth/              # Halaman login
│   ├── dashboard/         # Dashboard
│   ├── bel/               # Halaman bel
│   ├── absensi/           # Halaman absensi
│   ├── jurnal/            # Halaman jurnal
│   ├── penilaian/         # Halaman penilaian
│   ├── users/             # Halaman pengguna
│   └── errors/            # Halaman error
├── public/
│   ├── css/style.css      # Stylesheet utama
│   ├── js/app.js          # JavaScript utama
│   ├── img/               # Gambar/ikon
│   └── uploads/           # File yang diupload
└── database/
    └── schema.sql         # Skema database MySQL
```

---

## 🛠️ Teknologi

- **Backend:** Node.js + Express.js
- **Database:** MySQL (tanpa ORM/Prisma)
- **Template Engine:** EJS + ejs-mate
- **Scheduler:** node-cron
- **Real-time:** Server-Sent Events (SSE)
- **Auth:** express-session + bcryptjs
- **Upload:** multer
- **Frontend:** Bootstrap 5 + Vanilla JS

---

## 📌 Pengembangan Selanjutnya

- [ ] Manajemen data siswa (CRUD)
- [ ] Manajemen kelas dan mata pelajaran
- [ ] Export rekap ke PDF/Excel
- [ ] Notifikasi WhatsApp ke orang tua
- [ ] Raport digital
- [ ] Kalender akademik
