const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Middleware: Cek autentikasi
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    req.flash("error", "Silakan login terlebih dahulu.");
    return res.redirect("/auth/login");
  }
  next();
};

// Middleware: Cek role admin
const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    req.flash("error", "Akses ditolak. Fitur ini hanya untuk Admin.");
    return res.redirect("/dashboard");
  }
  next();
};

router.use(requireAuth);

// GET /kelas - Daftar semua kelas
router.get("/", async (req, res) => {
  try {
    const [kelasList] = await db.query(
      `SELECT k.*, u.nama as nama_wali_kelas, COUNT(s.id) as total_siswa
       FROM kelas k
       LEFT JOIN users u ON k.wali_kelas_id = u.id
       LEFT JOIN siswa s ON k.id = s.kelas_id AND s.aktif = 1
       GROUP BY k.id
       ORDER BY k.tingkat ASC, k.nama_kelas ASC`
    );

    const [guruList] = await db.query(
      "SELECT id, nama, nip FROM users WHERE role = 'guru' AND aktif = 1 ORDER BY nama ASC"
    );

    res.render("kelas/index", {
      title: "Kelola Kelas - SD SIG",
      currentPage: "kelas",
      kelasList,
      guruList,
      user: req.session.user,
    });
  } catch (err) {
    console.error("Error GET /kelas:", err);
    req.flash("error", "Gagal memuat data kelas.");
    res.redirect("/dashboard");
  }
});

// POST /kelas - Tambah Kelas Baru (Admin)
router.post("/", requireAdmin, async (req, res) => {
  const { nama_kelas, tingkat, wali_kelas_id, tahun_ajaran } = req.body;

  if (!nama_kelas || !tingkat) {
    req.flash("error", "Nama kelas dan tingkat wajib diisi.");
    return res.redirect("/kelas");
  }

  try {
    await db.query(
      `INSERT INTO kelas (nama_kelas, tingkat, wali_kelas_id, tahun_ajaran)
       VALUES (?, ?, ?, ?)`,
      [
        nama_kelas.trim(),
        parseInt(tingkat, 10),
        wali_kelas_id || null,
        tahun_ajaran || "2024/2025",
      ]
    );

    req.flash("success", `Kelas ${nama_kelas} berhasil ditambahkan!`);
    res.redirect("/kelas");
  } catch (err) {
    console.error("Error POST /kelas:", err);
    req.flash("error", "Gagal menambahkan kelas.");
    res.redirect("/kelas");
  }
});

// PUT /kelas/:id - Update Kelas (Admin)
router.put("/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nama_kelas, tingkat, wali_kelas_id, tahun_ajaran, aktif } = req.body;

  try {
    await db.query(
      `UPDATE kelas 
       SET nama_kelas = ?, tingkat = ?, wali_kelas_id = ?, tahun_ajaran = ?, aktif = ?
       WHERE id = ?`,
      [
        nama_kelas.trim(),
        parseInt(tingkat, 10),
        wali_kelas_id || null,
        tahun_ajaran || "2024/2025",
        aktif === "0" ? 0 : 1,
        id,
      ]
    );

    req.flash("success", "Data kelas berhasil diperbarui!");
    res.redirect("/kelas");
  } catch (err) {
    console.error("Error PUT /kelas/:id:", err);
    req.flash("error", "Gagal memperbarui data kelas.");
    res.redirect("/kelas");
  }
});

// DELETE /kelas/:id - Hapus Kelas (Admin)
router.delete("/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("DELETE FROM kelas WHERE id = ?", [id]);
    req.flash("success", "Kelas berhasil dihapus!");
    res.redirect("/kelas");
  } catch (err) {
    console.error("Error DELETE /kelas/:id:", err);
    req.flash("error", "Gagal menghapus kelas.");
    res.redirect("/kelas");
  }
});

module.exports = router;
