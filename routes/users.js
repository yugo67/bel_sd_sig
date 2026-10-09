const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const db = require("../config/db");
const { isAuthenticated, isAdmin } = require("../middleware/auth");
const bcrypt = require("bcryptjs");
const upload = require("../config/multer");

// Helper parser untuk CSV jika xlsx belum dimuat
function parseCSV(bufferString) {
  const lines = bufferString
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(",").map((h) =>
    h
      .trim()
      .replace(/^["']|["']$/g, "")
      .toLowerCase()
  );
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values =
      lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(",");
    const rowObj = {};
    headers.forEach((h, idx) => {
      const val = values[idx]
        ? values[idx].trim().replace(/^["']|["']$/g, "")
        : "";
      rowObj[h] = val;
    });
    rows.push(rowObj);
  }
  return rows;
}

// GET /users - Daftar pengguna
router.get("/", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const [users] = await db.query(
      "SELECT id, nama, username, role, nip, email, aktif, created_at FROM users ORDER BY role, nama"
    );
    res.render("users/index", {
      title: "Manajemen Pengguna",
      layout: "layouts/main",
      user: req.session.user,
      users,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memuat data pengguna.");
    res.redirect("/dashboard");
  }
});

// GET /users/template-guru - Download template CSV untuk upload data guru
router.get("/template-guru", isAuthenticated, isAdmin, (req, res) => {
  const csvContent =
    "\uFEFF" +
    "NIP,Nama,Username,Password,Email\n" +
    "198501012010011001,Budi Santoso,budiguru,guru123,budi@sdsig.sch.id\n" +
    "198803122011022002,Siti Rahmawati,sitiguru,guru123,siti@sdsig.sch.id\n";

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="template_upload_guru.csv"'
  );
  res.send(csvContent);
});

// POST /users/upload-guru - Upload file Excel / CSV data guru
router.post(
  "/upload-guru",
  isAuthenticated,
  isAdmin,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      req.flash("error", "Pilih file CSV atau Excel terlebih dahulu.");
      return res.redirect("/users");
    }

    const filePath = req.file.path;
    let rows = [];

    try {
      let xlsx;
      try {
        xlsx = require("xlsx");
      } catch (e) {
        xlsx = null;
      }

      if (xlsx) {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });
      } else {
        const fileBuffer = fs.readFileSync(filePath, "utf8");
        rows = parseCSV(fileBuffer);
      }

      if (!rows || rows.length === 0) {
        req.flash(
          "error",
          "File yang diupload kosong atau format tidak sesuai."
        );
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        return res.redirect("/users");
      }

      let successCount = 0;
      let skipCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const keys = Object.keys(row);
        const getKey = (possibleNames) => {
          const foundKey = keys.find((k) =>
            possibleNames.includes(k.trim().toLowerCase())
          );
          return foundKey ? String(row[foundKey]).trim() : "";
        };

        const nip = getKey(["nip", "no nip", "nomor nip"]);
        const nama = getKey(["nama", "nama guru", "nama lengkap", "guru"]);
        const username = getKey(["username", "user", "nama user"]);
        const rawPassword = getKey(["password", "pass"]) || "guru123";
        const email = getKey(["email", "e-mail"]);

        if (!(nama && username)) {
          skipCount++;
          continue;
        }

        try {
          const hashedPassword = await bcrypt.hash(rawPassword, 10);
          await db.query(
            `INSERT INTO users (nama, username, password, role, nip, email, aktif)
           VALUES (?, ?, ?, 'guru', ?, ?, 1)
           ON DUPLICATE KEY UPDATE nama=VALUES(nama), nip=VALUES(nip), email=VALUES(email)`,
            [nama, username, hashedPassword, nip || null, email || null]
          );
          successCount++;
        } catch (err) {
          console.error(`Error inserting guru row ${i + 1}:`, err.message);
          skipCount++;
        }
      }

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      req.flash(
        "success",
        `Berhasil memproses upload data guru! ${successCount} guru berhasil diproses/ditambahkan.`
      );
    } catch (err) {
      console.error("Error processing guru upload:", err);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      req.flash(
        "error",
        `Gagal memproses file upload data guru: ${err.message}`
      );
    }
    res.redirect("/users");
  }
);

// GET /users/tambah
router.get("/tambah", isAuthenticated, isAdmin, (req, res) => {
  res.render("users/form", {
    title: "Tambah Pengguna",
    layout: "layouts/main",
    user: req.session.user,
    editUser: null,
    action: "/users",
    method: "POST",
  });
});

// POST /users
router.post("/", isAuthenticated, isAdmin, async (req, res) => {
  const { nama, username, password, role, nip, email } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      "INSERT INTO users (nama, username, password, role, nip, email) VALUES (?, ?, ?, ?, ?, ?)",
      [
        nama,
        username,
        hashedPassword,
        role || "guru",
        nip || null,
        email || null,
      ]
    );
    req.flash("success", `Pengguna "${nama}" berhasil ditambahkan!`);
  } catch (err) {
    console.error(err);
    if (err.code === "ER_DUP_ENTRY") {
      req.flash("error", "Username sudah digunakan!");
    } else {
      req.flash("error", "Gagal menambahkan pengguna.");
    }
  }
  res.redirect("/users");
});

// GET /users/:id/edit
router.get("/:id/edit", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const [[editUser]] = await db.query(
      "SELECT id, nama, username, role, nip, email, aktif FROM users WHERE id = ?",
      [req.params.id]
    );
    if (!editUser) {
      req.flash("error", "Pengguna tidak ditemukan.");
      return res.redirect("/users");
    }
    res.render("users/form", {
      title: "Edit Pengguna",
      layout: "layouts/main",
      user: req.session.user,
      editUser,
      action: `/users/${editUser.id}?_method=PUT`,
      method: "POST",
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memuat data pengguna.");
    res.redirect("/users");
  }
});

// PUT /users/:id
router.put("/:id", isAuthenticated, isAdmin, async (req, res) => {
  const { nama, username, password, role, nip, email, aktif } = req.body;
  try {
    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.query(
        "UPDATE users SET nama=?, username=?, password=?, role=?, nip=?, email=?, aktif=? WHERE id=?",
        [
          nama,
          username,
          hashedPassword,
          role,
          nip || null,
          email || null,
          aktif ? 1 : 0,
          req.params.id,
        ]
      );
    } else {
      await db.query(
        "UPDATE users SET nama=?, username=?, role=?, nip=?, email=?, aktif=? WHERE id=?",
        [
          nama,
          username,
          role,
          nip || null,
          email || null,
          aktif ? 1 : 0,
          req.params.id,
        ]
      );
    }
    req.flash("success", "Data pengguna berhasil diperbarui!");
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memperbarui data pengguna.");
  }
  res.redirect("/users");
});

// DELETE /users/:id
router.delete("/:id", isAuthenticated, isAdmin, async (req, res) => {
  if (Number.parseInt(req.params.id) === req.session.user.id) {
    req.flash("error", "Tidak dapat menghapus akun yang sedang aktif!");
    return res.redirect("/users");
  }
  try {
    await db.query("DELETE FROM users WHERE id = ?", [req.params.id]);
    req.flash("success", "Pengguna berhasil dihapus!");
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal menghapus pengguna.");
  }
  res.redirect("/users");
});

module.exports = router;
