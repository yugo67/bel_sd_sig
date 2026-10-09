const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isAuthenticated } = require("../middleware/auth");

// GET /jurnal - Daftar jurnal pembelajaran
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const [kelasList] = await db.query(
      "SELECT * FROM kelas WHERE aktif = 1 ORDER BY tingkat, nama_kelas"
    );
    const [mapelList] = await db.query(
      "SELECT * FROM mata_pelajaran WHERE aktif = 1 ORDER BY nama"
    );

    const kelasId = req.query.kelas_id || "";
    const tanggal = req.query.tanggal || new Date().toISOString().split("T")[0];

    let whereClause = "WHERE 1=1";
    const params = [];

    if (kelasId) {
      whereClause += " AND jp.kelas_id = ?";
      params.push(kelasId);
    }
    if (tanggal) {
      whereClause += " AND jp.tanggal = ?";
      params.push(tanggal);
    }
    // Guru hanya bisa melihat jurnal miliknya sendiri
    if (req.session.user.role === "guru") {
      whereClause += " AND jp.guru_id = ?";
      params.push(req.session.user.id);
    }

    const [jurnalList] = await db.query(
      `SELECT jp.*, k.nama_kelas, mp.nama as nama_mapel, u.nama as nama_guru
       FROM jurnal_pembelajaran jp
       LEFT JOIN kelas k ON jp.kelas_id = k.id
       LEFT JOIN mata_pelajaran mp ON jp.mata_pelajaran_id = mp.id
       LEFT JOIN users u ON jp.guru_id = u.id
       ${whereClause}
       ORDER BY jp.tanggal DESC, jp.jam_ke ASC`,
      params
    );

    res.render("jurnal/index", {
      title: "Jurnal Pembelajaran",
      layout: "layouts/main",
      user: req.session.user,
      kelasList,
      mapelList,
      jurnalList,
      kelasId,
      tanggal,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memuat data jurnal.");
    res.redirect("/dashboard");
  }
});

// GET /jurnal/tambah
router.get("/tambah", isAuthenticated, async (req, res) => {
  const [kelasList] = await db.query(
    "SELECT * FROM kelas WHERE aktif = 1 ORDER BY tingkat, nama_kelas"
  );
  const [mapelList] = await db.query(
    "SELECT * FROM mata_pelajaran WHERE aktif = 1 ORDER BY nama"
  );
  res.render("jurnal/form", {
    title: "Tambah Jurnal Pembelajaran",
    layout: "layouts/main",
    user: req.session.user,
    kelasList,
    mapelList,
    jurnal: null,
    action: "/jurnal",
    method: "POST",
  });
});

// POST /jurnal
router.post("/", isAuthenticated, async (req, res) => {
  const {
    kelas_id,
    mata_pelajaran_id,
    tanggal,
    jam_ke,
    materi,
    tujuan_pembelajaran,
    kegiatan_pembelajaran,
    media_pembelajaran,
    metode_pembelajaran,
    catatan,
  } = req.body;
  try {
    await db.query(
      `INSERT INTO jurnal_pembelajaran
        (kelas_id, mata_pelajaran_id, guru_id, tanggal, jam_ke, materi, tujuan_pembelajaran, kegiatan_pembelajaran, media_pembelajaran, metode_pembelajaran, catatan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        kelas_id,
        mata_pelajaran_id || null,
        req.session.user.id,
        tanggal,
        jam_ke,
        materi,
        tujuan_pembelajaran,
        kegiatan_pembelajaran,
        media_pembelajaran,
        metode_pembelajaran,
        catatan,
      ]
    );
    req.flash("success", "Jurnal pembelajaran berhasil disimpan!");
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal menyimpan jurnal pembelajaran.");
  }
  res.redirect("/jurnal");
});

// GET /jurnal/:id
router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const [[jurnal]] = await db.query(
      `SELECT jp.*, k.nama_kelas, mp.nama as nama_mapel, u.nama as nama_guru
       FROM jurnal_pembelajaran jp
       LEFT JOIN kelas k ON jp.kelas_id = k.id
       LEFT JOIN mata_pelajaran mp ON jp.mata_pelajaran_id = mp.id
       LEFT JOIN users u ON jp.guru_id = u.id
       WHERE jp.id = ?`,
      [req.params.id]
    );
    if (!jurnal) {
      req.flash("error", "Jurnal tidak ditemukan.");
      return res.redirect("/jurnal");
    }
    res.render("jurnal/detail", {
      title: "Detail Jurnal Pembelajaran",
      layout: "layouts/main",
      user: req.session.user,
      jurnal,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memuat detail jurnal.");
    res.redirect("/jurnal");
  }
});

// GET /jurnal/:id/edit
router.get("/:id/edit", isAuthenticated, async (req, res) => {
  try {
    const [[jurnal]] = await db.query(
      "SELECT * FROM jurnal_pembelajaran WHERE id = ?",
      [req.params.id]
    );
    if (!jurnal) {
      req.flash("error", "Jurnal tidak ditemukan.");
      return res.redirect("/jurnal");
    }
    // Guru hanya bisa edit jurnalnya sendiri
    if (
      req.session.user.role === "guru" &&
      jurnal.guru_id !== req.session.user.id
    ) {
      req.flash("error", "Anda tidak berhak mengedit jurnal ini.");
      return res.redirect("/jurnal");
    }
    const [kelasList] = await db.query(
      "SELECT * FROM kelas WHERE aktif = 1 ORDER BY tingkat, nama_kelas"
    );
    const [mapelList] = await db.query(
      "SELECT * FROM mata_pelajaran WHERE aktif = 1 ORDER BY nama"
    );
    res.render("jurnal/form", {
      title: "Edit Jurnal Pembelajaran",
      layout: "layouts/main",
      user: req.session.user,
      kelasList,
      mapelList,
      jurnal,
      action: `/jurnal/${jurnal.id}?_method=PUT`,
      method: "POST",
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memuat data jurnal.");
    res.redirect("/jurnal");
  }
});

// PUT /jurnal/:id
router.put("/:id", isAuthenticated, async (req, res) => {
  const {
    kelas_id,
    mata_pelajaran_id,
    tanggal,
    jam_ke,
    materi,
    tujuan_pembelajaran,
    kegiatan_pembelajaran,
    media_pembelajaran,
    metode_pembelajaran,
    catatan,
  } = req.body;
  try {
    await db.query(
      `UPDATE jurnal_pembelajaran
       SET kelas_id=?, mata_pelajaran_id=?, tanggal=?, jam_ke=?, materi=?, tujuan_pembelajaran=?,
           kegiatan_pembelajaran=?, media_pembelajaran=?, metode_pembelajaran=?, catatan=?
       WHERE id=?`,
      [
        kelas_id,
        mata_pelajaran_id || null,
        tanggal,
        jam_ke,
        materi,
        tujuan_pembelajaran,
        kegiatan_pembelajaran,
        media_pembelajaran,
        metode_pembelajaran,
        catatan,
        req.params.id,
      ]
    );
    req.flash("success", "Jurnal pembelajaran berhasil diperbarui!");
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memperbarui jurnal pembelajaran.");
  }
  res.redirect("/jurnal");
});

// DELETE /jurnal/:id
router.delete("/:id", isAuthenticated, async (req, res) => {
  try {
    await db.query("DELETE FROM jurnal_pembelajaran WHERE id = ?", [
      req.params.id,
    ]);
    req.flash("success", "Jurnal pembelajaran berhasil dihapus!");
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal menghapus jurnal pembelajaran.");
  }
  res.redirect("/jurnal");
});

module.exports = router;
