const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isAuthenticated } = require("../middleware/auth");

// GET /dashboard
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const today = new Date();
    const hariIni = [
      "minggu",
      "senin",
      "selasa",
      "rabu",
      "kamis",
      "jumat",
      "sabtu",
    ][today.getDay()];
    const tanggalIni = today.toISOString().split("T")[0];
    const jamIni = today.toTimeString().slice(0, 8);

    // Statistik
    const [[{ totalSiswa }]] = await db.query(
      "SELECT COUNT(*) as totalSiswa FROM siswa WHERE aktif = 1"
    );
    const [[{ totalGuru }]] = await db.query(
      'SELECT COUNT(*) as totalGuru FROM users WHERE role = "guru" AND aktif = 1'
    );
    const [[{ totalKelas }]] = await db.query(
      "SELECT COUNT(*) as totalKelas FROM kelas WHERE aktif = 1"
    );
    const [[{ totalJadwalBel }]] = await db.query(
      "SELECT COUNT(*) as totalJadwalBel FROM jadwal_bel WHERE aktif = 1"
    );

    // Jadwal bel hari ini (berikutnya)
    const [jadwalHariIni] = await db.query(
      `SELECT jb.*, sb.nama as nama_suara, sb.filename as filename_suara
       FROM jadwal_bel jb
       LEFT JOIN suara_bel sb ON jb.suara_bel_id = sb.id
       WHERE jb.aktif = 1
         AND JSON_CONTAINS(jb.hari, JSON_QUOTE(?))
       ORDER BY jb.waktu ASC`,
      [hariIni]
    );

    // Cari jadwal bel berikutnya
    let jadwalBerikutnya = null;
    for (const jadwal of jadwalHariIni) {
      if (jadwal.waktu > jamIni) {
        jadwalBerikutnya = jadwal;
        break;
      }
    }

    // Log bel 10 terbaru
    const [logBelTerbaru] = await db.query(
      `SELECT lb.*, u.nama as nama_user
       FROM log_bel lb
       LEFT JOIN users u ON lb.dibunyikan_oleh = u.id
       ORDER BY lb.waktu_bunyi DESC
       LIMIT 10`
    );

    // Absensi hari ini
    const [[{ totalHadir }]] = await db.query(
      'SELECT COUNT(*) as totalHadir FROM absensi WHERE tanggal = ? AND status = "hadir"',
      [tanggalIni]
    );
    const [[{ totalAlpha }]] = await db.query(
      'SELECT COUNT(*) as totalAlpha FROM absensi WHERE tanggal = ? AND status = "alpha"',
      [tanggalIni]
    );
    const [[{ totalIzinSakit }]] = await db.query(
      'SELECT COUNT(*) as totalIzinSakit FROM absensi WHERE tanggal = ? AND status IN ("sakit","izin")',
      [tanggalIni]
    );

    res.render("dashboard/index", {
      title: "Dashboard - Bel Sekolah SD SIG",
      layout: "layouts/main",
      user: req.session.user,
      stats: { totalSiswa, totalGuru, totalKelas, totalJadwalBel },
      jadwalHariIni,
      jadwalBerikutnya,
      logBelTerbaru,
      hariIni,
      absensiHariIni: { totalHadir, totalAlpha, totalIzinSakit },
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Terjadi kesalahan memuat dashboard.");
    res.render("dashboard/index", {
      title: "Dashboard - Bel Sekolah SD SIG",
      layout: "layouts/main",
      user: req.session.user,
      stats: { totalSiswa: 0, totalGuru: 0, totalKelas: 0, totalJadwalBel: 0 },
      jadwalHariIni: [],
      jadwalBerikutnya: null,
      logBelTerbaru: [],
      hariIni: "",
      absensiHariIni: { totalHadir: 0, totalAlpha: 0, totalIzinSakit: 0 },
    });
  }
});

// POST /dashboard/bel-manual - Bunyikan bel manual
router.post("/bel-manual", isAuthenticated, async (req, res) => {
  const { suara_bel_id, keterangan } = req.body;
  const userId = req.session.user.id;

  try {
    const [result] = await db.query(
      `INSERT INTO log_bel (nama_jadwal, waktu_bunyi, tipe, dibunyikan_oleh, suara_bel_id, keterangan)
       VALUES (?, NOW(), 'manual', ?, ?, ?)`,
      [
        "Bel Manual",
        userId,
        suara_bel_id || null,
        keterangan || "Bel dibunyikan manual",
      ]
    );

    // Ambil info suara bel
    let suaraBel = null;
    if (suara_bel_id) {
      const [[sb]] = await db.query("SELECT * FROM suara_bel WHERE id = ?", [
        suara_bel_id,
      ]);
      suaraBel = sb;
    }

    res.json({
      success: true,
      message: "Bel berhasil dibunyikan!",
      logId: result.insertId,
      suaraBel,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Gagal membunyikan bel." });
  }
});

module.exports = router;
