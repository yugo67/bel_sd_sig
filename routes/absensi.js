const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isAuthenticated } = require("../middleware/auth");

// GET /absensi - Form input absensi
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const [kelasList] = await db.query(
      "SELECT * FROM kelas WHERE aktif = 1 ORDER BY tingkat, nama_kelas"
    );
    const tanggal = req.query.tanggal || new Date().toISOString().split("T")[0];

    // Ambil hari dalam bahasa Indonesia
    const hariMap = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];
    const tglObj = new Date(tanggal);
    const hariNama = hariMap[tglObj.getDay()];

    // Ambil jadwal mengajar guru login pada hari tersebut
    const [jadwalHariIni] = await db.query(
      `SELECT jp.*, k.nama_kelas, mp.nama as nama_mapel, mp.kode as kode_mapel
       FROM jadwal_pelajaran jp
       JOIN kelas k ON jp.kelas_id = k.id
       JOIN mata_pelajaran mp ON jp.mata_pelajaran_id = mp.id
       WHERE jp.guru_id = ? AND jp.hari = ? AND jp.aktif = 1
       ORDER BY jp.jam_mulai ASC`,
      [req.session.user.id, hariNama]
    );

    // Auto select kelas jika kelas_id belum dipilihat & ada jadwal mengajar
    let kelasId = req.query.kelas_id || "";
    if (!kelasId && jadwalHariIni.length > 0) {
      kelasId = String(jadwalHariIni[0].kelas_id);
    }

    let siswaList = [];
    const absensiData = {};

    if (kelasId) {
      const [siswa] = await db.query(
        "SELECT * FROM siswa WHERE kelas_id = ? AND aktif = 1 ORDER BY nama",
        [kelasId]
      );
      siswaList = siswa;

      const [absensiRows] = await db.query(
        "SELECT * FROM absensi WHERE kelas_id = ? AND tanggal = ?",
        [kelasId, tanggal]
      );
      for (const row of absensiRows) {
        absensiData[row.siswa_id] = row;
      }
    }

    res.render("absensi/index", {
      title: "Absensi Siswa",
      layout: "layouts/main",
      user: req.session.user,
      kelasList,
      tanggal,
      kelasId,
      siswaList,
      absensiData,
      jadwalHariIni,
      hariNama,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memuat data absensi.");
    res.redirect("/dashboard");
  }
});

// POST /absensi - Simpan absensi
router.post("/", isAuthenticated, async (req, res) => {
  const { kelas_id, tanggal, absensi } = req.body;

  try {
    // absensi = { siswa_id: { status, keterangan } }
    const entries = Object.entries(absensi || {});

    for (const [siswaId, data] of entries) {
      const { status, keterangan } = data;
      await db.query(
        `INSERT INTO absensi (siswa_id, kelas_id, tanggal, status, keterangan, dicatat_oleh)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status=?, keterangan=?, dicatat_oleh=?`,
        [
          siswaId,
          kelas_id,
          tanggal,
          status,
          keterangan || null,
          req.session.user.id,
          status,
          keterangan || null,
          req.session.user.id,
        ]
      );
    }

    req.flash("success", "Absensi berhasil disimpan!");
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal menyimpan absensi.");
  }
  res.redirect(`/absensi?kelas_id=${kelas_id}&tanggal=${tanggal}`);
});

// GET /absensi/rekap - Rekap absensi
router.get("/rekap", isAuthenticated, async (req, res) => {
  try {
    const [kelasList] = await db.query(
      "SELECT * FROM kelas WHERE aktif = 1 ORDER BY tingkat, nama_kelas"
    );
    const kelasId = req.query.kelas_id || "";
    const bulan = req.query.bulan || new Date().toISOString().slice(0, 7);

    let rekapData = [];

    if (kelasId) {
      const [rows] = await db.query(
        `SELECT s.id, s.nis, s.nama,
                COUNT(CASE WHEN a.status = 'hadir' THEN 1 END) as hadir,
                COUNT(CASE WHEN a.status = 'sakit' THEN 1 END) as sakit,
                COUNT(CASE WHEN a.status = 'izin' THEN 1 END) as izin,
                COUNT(CASE WHEN a.status = 'alpha' THEN 1 END) as alpha,
                COUNT(a.id) as total
         FROM siswa s
         LEFT JOIN absensi a ON s.id = a.siswa_id
           AND DATE_FORMAT(a.tanggal, '%Y-%m') = ?
         WHERE s.kelas_id = ? AND s.aktif = 1
         GROUP BY s.id, s.nis, s.nama
         ORDER BY s.nama`,
        [bulan, kelasId]
      );
      rekapData = rows;
    }

    res.render("absensi/rekap", {
      title: "Rekap Absensi",
      layout: "layouts/main",
      user: req.session.user,
      kelasList,
      kelasId,
      bulan,
      rekapData,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memuat rekap absensi.");
    res.redirect("/absensi");
  }
});

module.exports = router;
