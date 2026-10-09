-- ============================================
-- Database Schema: sd_sig_bel
-- Aplikasi Bel Sekolah SD SIG
-- ============================================

CREATE DATABASE IF NOT EXISTS sd_sig_bel
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sd_sig_bel;

-- Tabel Users (Admin & Guru)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'guru') NOT NULL DEFAULT 'guru',
  nip VARCHAR(20),
  email VARCHAR(100),
  foto VARCHAR(255),
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabel Kelas
CREATE TABLE IF NOT EXISTS kelas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama_kelas VARCHAR(20) NOT NULL,
  tingkat TINYINT NOT NULL COMMENT '1-6 untuk SD',
  wali_kelas_id INT,
  tahun_ajaran VARCHAR(9) NOT NULL DEFAULT '2024/2025',
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wali_kelas_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Tabel Siswa
CREATE TABLE IF NOT EXISTS siswa (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nis VARCHAR(20) NOT NULL UNIQUE,
  nama VARCHAR(100) NOT NULL,
  kelas_id INT,
  jenis_kelamin ENUM('L', 'P') NOT NULL,
  tanggal_lahir DATE,
  nama_orang_tua VARCHAR(100),
  no_hp_orang_tua VARCHAR(20),
  foto VARCHAR(255),
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE SET NULL
);

-- Tabel Suara Bel
CREATE TABLE IF NOT EXISTS suara_bel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  filepath VARCHAR(500) NOT NULL,
  durasi INT COMMENT 'Durasi dalam detik',
  ukuran INT COMMENT 'Ukuran file dalam bytes',
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Jadwal Bel
CREATE TABLE IF NOT EXISTS jadwal_bel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  waktu TIME NOT NULL,
  hari JSON NOT NULL COMMENT 'Array hari: ["senin","selasa",...]',
  suara_bel_id INT,
  keterangan VARCHAR(255),
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (suara_bel_id) REFERENCES suara_bel(id) ON DELETE SET NULL
);

-- Tabel Log Bel (Histori bunyi bel)
CREATE TABLE IF NOT EXISTS log_bel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jadwal_bel_id INT,
  nama_jadwal VARCHAR(100),
  waktu_bunyi DATETIME NOT NULL,
  tipe ENUM('otomatis', 'manual') NOT NULL DEFAULT 'otomatis',
  dibunyikan_oleh INT,
  suara_bel_id INT,
  keterangan VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (jadwal_bel_id) REFERENCES jadwal_bel(id) ON DELETE SET NULL,
  FOREIGN KEY (dibunyikan_oleh) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (suara_bel_id) REFERENCES suara_bel(id) ON DELETE SET NULL
);

-- Tabel Mata Pelajaran
CREATE TABLE IF NOT EXISTS mata_pelajaran (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  kode VARCHAR(10),
  deskripsi TEXT,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Jadwal Pelajaran (Mengaitkan Kelas, Mata Pelajaran, Guru, Hari, dan Jam)
CREATE TABLE IF NOT EXISTS jadwal_pelajaran (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kelas_id INT NOT NULL,
  mata_pelajaran_id INT NOT NULL,
  guru_id INT NOT NULL,
  hari ENUM('senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu') NOT NULL,
  jam_mulai TIME NOT NULL,
  jam_selesai TIME NOT NULL,
  ruangan VARCHAR(50),
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
  FOREIGN KEY (mata_pelajaran_id) REFERENCES mata_pelajaran(id) ON DELETE CASCADE,
  FOREIGN KEY (guru_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabel Absensi Siswa
CREATE TABLE IF NOT EXISTS absensi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  siswa_id INT NOT NULL,
  kelas_id INT NOT NULL,
  tanggal DATE NOT NULL,
  status ENUM('hadir', 'sakit', 'izin', 'alpha') NOT NULL DEFAULT 'hadir',
  keterangan VARCHAR(255),
  dicatat_oleh INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (siswa_id) REFERENCES siswa(id) ON DELETE CASCADE,
  FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
  FOREIGN KEY (dicatat_oleh) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_absensi (siswa_id, tanggal)
);

-- Tabel Jurnal Pembelajaran
CREATE TABLE IF NOT EXISTS jurnal_pembelajaran (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kelas_id INT NOT NULL,
  mata_pelajaran_id INT,
  guru_id INT NOT NULL,
  tanggal DATE NOT NULL,
  jam_ke TINYINT NOT NULL DEFAULT 1,
  materi VARCHAR(255) NOT NULL,
  tujuan_pembelajaran TEXT,
  kegiatan_pembelajaran TEXT,
  media_pembelajaran VARCHAR(255),
  metode_pembelajaran VARCHAR(255),
  catatan TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
  FOREIGN KEY (mata_pelajaran_id) REFERENCES mata_pelajaran(id) ON DELETE SET NULL,
  FOREIGN KEY (guru_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabel Penilaian Harian
CREATE TABLE IF NOT EXISTS penilaian_harian (
  id INT AUTO_INCREMENT PRIMARY KEY,
  siswa_id INT NOT NULL,
  kelas_id INT NOT NULL,
  mata_pelajaran_id INT NOT NULL,
  guru_id INT NOT NULL,
  tanggal DATE NOT NULL,
  jenis_penilaian ENUM('tugas', 'kuis', 'ulangan_harian', 'praktik', 'proyek') NOT NULL DEFAULT 'tugas',
  judul VARCHAR(255) NOT NULL,
  nilai DECIMAL(5,2) NOT NULL,
  nilai_max DECIMAL(5,2) NOT NULL DEFAULT 100,
  catatan VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (siswa_id) REFERENCES siswa(id) ON DELETE CASCADE,
  FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
  FOREIGN KEY (mata_pelajaran_id) REFERENCES mata_pelajaran(id) ON DELETE CASCADE,
  FOREIGN KEY (guru_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =============================================
-- Data Awal (Seed Data)
-- =============================================

-- Admin default (password: admin123)
INSERT INTO users (nama, username, password, role, nip, email) VALUES 
('Administrator', 'admin', '$2a$10$dwZgH6TBSSbs6efDro/TmuYx6upG9PC9XVIPZzEeGgUwW9Gtj9tEm', 'admin', '000000000000000001', 'admin@sdsig.sch.id'),
('Guru Demo', 'guru', '$2a$10$dwZgH6TBSSbs6efDro/TmuYx6upG9PC9XVIPZzEeGgUwW9Gtj9tEm', 'guru', '198501012010011001', 'guru@sdsig.sch.id')
ON DUPLICATE KEY UPDATE 
  password = VALUES(password),
  nama = VALUES(nama),
  role = VALUES(role);

-- Jadwal bel default
INSERT IGNORE INTO jadwal_bel (id, nama, waktu, hari, keterangan, aktif) VALUES
(1, 'Masuk Sekolah', '07:00:00', '["senin","selasa","rabu","kamis","jumat","sabtu"]', 'Bel masuk sekolah pagi', 1),
(2, 'Istirahat 1', '09:30:00', '["senin","selasa","rabu","kamis","jumat","sabtu"]', 'Bel istirahat pertama', 1),
(3, 'Masuk Kembali 1', '10:00:00', '["senin","selasa","rabu","kamis","jumat","sabtu"]', 'Bel masuk setelah istirahat pertama', 1),
(4, 'Istirahat 2', '11:30:00', '["senin","selasa","rabu","kamis","jumat"]', 'Bel istirahat kedua', 1),
(5, 'Masuk Kembali 2', '12:00:00', '["senin","selasa","rabu","kamis","jumat"]', 'Bel masuk setelah istirahat kedua', 1),
(6, 'Pulang Sekolah', '13:00:00', '["senin","selasa","rabu","kamis","jumat"]', 'Bel pulang sekolah', 1),
(7, 'Pulang Sekolah Sabtu', '11:00:00', '["sabtu"]', 'Bel pulang sekolah hari Sabtu', 1);

-- Mata pelajaran default
INSERT IGNORE INTO mata_pelajaran (id, nama, kode) VALUES
(1, 'Pendidikan Agama', 'PAI'),
(2, 'Pendidikan Pancasila', 'PPKn'),
(3, 'Bahasa Indonesia', 'BIND'),
(4, 'Matematika', 'MTK'),
(5, 'Ilmu Pengetahuan Alam', 'IPA'),
(6, 'Ilmu Pengetahuan Sosial', 'IPS'),
(7, 'Seni Budaya dan Prakarya', 'SBDP'),
(8, 'Pendidikan Jasmani Olahraga dan Kesehatan', 'PJOK'),
(9, 'Bahasa Inggris', 'BING'),
(10, 'Bahasa Daerah', 'BDAE');

-- Kelas default
INSERT IGNORE INTO kelas (id, nama_kelas, tingkat, tahun_ajaran) VALUES
(1, 'Kelas 1A', 1, '2024/2025'),
(2, 'Kelas 1B', 1, '2024/2025'),
(3, 'Kelas 2A', 2, '2024/2025'),
(4, 'Kelas 2B', 2, '2024/2025'),
(5, 'Kelas 3A', 3, '2024/2025'),
(6, 'Kelas 3B', 3, '2024/2025'),
(7, 'Kelas 4A', 4, '2024/2025'),
(8, 'Kelas 4B', 4, '2024/2025'),
(9, 'Kelas 5A', 5, '2024/2025'),
(10, 'Kelas 5B', 5, '2024/2025'),
(11, 'Kelas 6A', 6, '2024/2025'),
(12, 'Kelas 6B', 6, '2024/2025');

-- Jadwal pelajaran default (contoh pengujian untuk Guru ID 2)
INSERT IGNORE INTO jadwal_pelajaran (id, kelas_id, mata_pelajaran_id, guru_id, hari, jam_mulai, jam_selesai, ruangan) VALUES
(1, 1, 4, 2, 'senin', '07:30:00', '09:00:00', 'R. 1A'),
(2, 1, 3, 2, 'senin', '09:30:00', '11:00:00', 'R. 1A'),
(3, 2, 4, 2, 'selasa', '07:30:00', '09:00:00', 'R. 1B'),
(4, 3, 5, 2, 'rabu', '07:30:00', '09:00:00', 'R. 2A'),
(5, 1, 4, 2, 'kamis', '07:30:00', '09:00:00', 'R. 1A'),
(6, 1, 3, 2, 'jumat', '07:30:00', '09:00:00', 'R. 1A');
