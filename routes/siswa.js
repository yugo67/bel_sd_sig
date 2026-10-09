const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const db = require("../config/db");
const { isAuthenticated } = require("../middleware/auth");
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
    // Regular expression untuk split CSV dengan memperhatikan quote
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

// GET /siswa - Daftar siswa & Manajemen
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const [kelasList] = await db.query(
      "SELECT * FROM kelas WHERE aktif = 1 ORDER BY tingkat, nama_kelas"
    );
    const kelasId = req.query.kelas_id || "";
    const search = req.query.search || "";

    let query = `
      SELECT s.*, k.nama_kelas 
      FROM siswa s 
      LEFT JOIN kelas k ON s.kelas_id = k.id 
      WHERE s.aktif = 1
    `;
    const params = [];

    if (kelasId) {
      query += " AND s.kelas_id = ?";
      params.push(kelasId);
    }
    if (search) {
      query += " AND (s.nama LIKE ? OR s.nis LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    query += " ORDER BY k.tingkat, k.nama_kelas, s.nama";

    const [siswaList] = await db.query(query, params);

    // Hitung total statistik
    const [[{ totalSiswa }]] = await db.query(
      "SELECT COUNT(*) as totalSiswa FROM siswa WHERE aktif = 1"
    );
    const [kelasStats] = await db.query(`
      SELECT k.id, k.nama_kelas, COUNT(s.id) as total_siswa
      FROM kelas k
      LEFT JOIN siswa s ON k.id = s.kelas_id AND s.aktif = 1
      WHERE k.aktif = 1
      GROUP BY k.id, k.nama_kelas
      ORDER BY k.tingkat, k.nama_kelas
    `);

    res.render("siswa/index", {
      title: "Manajemen & Upload Siswa",
      layout: "layouts/main",
      user: req.session.user,
      kelasList,
      kelasId,
      search,
      siswaList,
      totalSiswa,
      kelasStats,
    });
  } catch (err) {
    console.error("Error fetching siswa:", err);
    req.flash("error", "Gagal memuat data siswa.");
    res.redirect("/dashboard");
  }
});

// GET /siswa/template - Download Template CSV untuk upload
router.get("/template", (req, res) => {
  const csvContent =
    "\uFEFF" + // UTF-8 BOM agar Excel dapat membuka file CSV dengan format dan karakter yang benar
    "NIS,Nama,Jenis Kelamin,Tanggal Lahir,Nama Orang Tua,No HP Orang Tua\n" +
    "1001,Ahmad Pratama,L,2017-05-12,Budi Pratama,08123456789\n" +
    "1002,Siti Aminah,P,2017-08-20,Rahmat Hidayat,08198765432\n" +
    "1003,Deni Kurniawan,L,2017-03-15,Agus Kurniawan,085211223344\n";

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="template_upload_siswa.csv"'
  );
  res.send(csvContent);
});

// POST /siswa/upload - Process upload file siswa per kelas
router.post(
  "/upload",
  isAuthenticated,
  upload.single("file"),
  async (req, res) => {
    const { kelas_id, mode } = req.body;

    if (!req.file) {
      req.flash("error", "Pilih file CSV atau Excel terlebih dahulu.");
      return res.redirect(`/siswa?kelas_id=${kelas_id || ""}`);
    }

    if (!kelas_id) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      req.flash("error", "Pilih kelas tujuan upload terlebih dahulu.");
      return res.redirect("/siswa");
    }

    const filePath = req.file.path;
    let rows = [];

    try {
      // Coba gunakan modul xlsx jika terinstal
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
        // Fallback menggunakan parser CSV bawaan
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
        return res.redirect(`/siswa?kelas_id=${kelas_id}`);
      }

      // Dapatkan informasi kelas
      const [[kelas]] = await db.query(
        "SELECT nama_kelas FROM kelas WHERE id = ?",
        [kelas_id]
      );
      const namaKelas = kelas ? kelas.nama_kelas : `Kelas #${kelas_id}`;

      let successCount = 0;
      let updateCount = 0;
      let skipCount = 0;
      const errorRows = [];

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];

        // Normalisasi nama kolom (case insensitive)
        const keys = Object.keys(row);
        const getKey = (possibleNames) => {
          const foundKey = keys.find((k) =>
            possibleNames.includes(k.trim().toLowerCase())
          );
          return foundKey ? String(row[foundKey]).trim() : "";
        };

        const nis = getKey(["nis", "no nis", "nomor nis", "nisn"]);
        const nama = getKey(["nama", "nama siswa", "nama lengkap", "siswa"]);
        let jk = getKey([
          "jenis kelamin",
          "jk",
          "l/p",
          "gender",
          "jenis_kelamin",
        ]).toUpperCase();
        const tglLahir = getKey([
          "tanggal lahir",
          "tgl lahir",
          "tanggal_lahir",
          "tgl_lahir",
        ]);
        const namaOrtu = getKey([
          "nama orang tua",
          "nama ortu",
          "orang tua",
          "nama_orang_tua",
        ]);
        const noHpOrtu = getKey([
          "no hp orang tua",
          "no hp ortu",
          "no hp",
          "no_hp_orang_tua",
          "no_hp",
        ]);

        // Validasi baris wajib
        if (!(nis && nama)) {
          skipCount++;
          continue;
        }

        // Normalisasi Jenis Kelamin
        if (
          jk.startsWith("L") ||
          jk.startsWith("PRIA") ||
          jk.startsWith("LAKI")
        ) {
          jk = "L";
        } else if (
          jk.startsWith("P") ||
          jk.startsWith("WANITA") ||
          jk.startsWith("PEREMPUAN")
        ) {
          jk = "P";
        } else {
          jk = "L"; // Default jika tidak valid
        }

        // Format Tanggal Lahir jika ada
        let formattedTglLahir = null;
        if (tglLahir) {
          const d = new Date(tglLahir);
          if (!isNaN(d.getTime())) {
            formattedTglLahir = d.toISOString().split("T")[0];
          }
        }

        try {
          if (mode === "update") {
            // Check if NIS exists
            const [existing] = await db.query(
              "SELECT id FROM siswa WHERE nis = ?",
              [nis]
            );
            if (existing.length > 0) {
              await db.query(
                `UPDATE siswa 
               SET nama = ?, kelas_id = ?, jenis_kelamin = ?, tanggal_lahir = ?, 
                   nama_orang_tua = ?, no_hp_orang_tua = ?, aktif = 1 
               WHERE nis = ?`,
                [
                  nama,
                  kelas_id,
                  jk,
                  formattedTglLahir,
                  namaOrtu || null,
                  noHpOrtu || null,
                  nis,
                ]
              );
              updateCount++;
            } else {
              await db.query(
                `INSERT INTO siswa (nis, nama, kelas_id, jenis_kelamin, tanggal_lahir, nama_orang_tua, no_hp_orang_tua, aktif)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                  nis,
                  nama,
                  kelas_id,
                  jk,
                  formattedTglLahir,
                  namaOrtu || null,
                  noHpOrtu || null,
                ]
              );
              successCount++;
            }
          } else {
            // Mode Insert Only / Skip If Exists
            const [result] = await db.query(
              `INSERT INTO siswa (nis, nama, kelas_id, jenis_kelamin, tanggal_lahir, nama_orang_tua, no_hp_orang_tua, aktif)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE kelas_id = VALUES(kelas_id), nama = VALUES(nama)`,
              [
                nis,
                nama,
                kelas_id,
                jk,
                formattedTglLahir,
                namaOrtu || null,
                noHpOrtu || null,
              ]
            );
            if (result.affectedRows === 1) {
              successCount++;
            } else {
              updateCount++;
            }
          }
        } catch (dbErr) {
          console.error(`Error inserting row ${index + 1}:`, dbErr.message);
          errorRows.push(`Baris ${index + 1} (${nama}): ${dbErr.message}`);
        }
      }

      // Hapus file setelah diproses
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      let msg = `Berhasil memproses upload data siswa untuk ${namaKelas}! `;
      if (successCount > 0) {
        msg += `${successCount} siswa baru ditambahkan. `;
      }
      if (updateCount > 0) {
        msg += `${updateCount} data siswa diperbarui. `;
      }
      if (skipCount > 0) {
        msg += `${skipCount} baris diabaikan karena kolom tidak lengkap.`;
      }

      req.flash("success", msg);
      res.redirect(`/siswa?kelas_id=${kelas_id}`);
    } catch (err) {
      console.error("Error processing upload:", err);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      req.flash("error", `Gagal memproses file upload: ${err.message}`);
      res.redirect(`/siswa?kelas_id=${kelas_id}`);
    }
  }
);

// POST /siswa/add - Tambah siswa manual
router.post("/add", isAuthenticated, async (req, res) => {
  const {
    nis,
    nama,
    kelas_id,
    jenis_kelamin,
    tanggal_lahir,
    nama_orang_tua,
    no_hp_orang_tua,
  } = req.body;

  try {
    await db.query(
      `INSERT INTO siswa (nis, nama, kelas_id, jenis_kelamin, tanggal_lahir, nama_orang_tua, no_hp_orang_tua, aktif)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        nis,
        nama,
        kelas_id,
        jenis_kelamin,
        tanggal_lahir || null,
        nama_orang_tua || null,
        no_hp_orang_tua || null,
      ]
    );
    req.flash("success", `Siswa ${nama} (NIS: ${nis}) berhasil ditambahkan!`);
  } catch (err) {
    console.error(err);
    if (err.code === "ER_DUP_ENTRY") {
      req.flash("error", `NIS ${nis} sudah terdaftar dalam sistem.`);
    } else {
      req.flash("error", "Gagal menambahkan siswa.");
    }
  }
  res.redirect(`/siswa?kelas_id=${kelas_id || ""}`);
});

// POST /siswa/edit/:id - Edit data siswa
router.post("/edit/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const {
    nis,
    nama,
    kelas_id,
    jenis_kelamin,
    tanggal_lahir,
    nama_orang_tua,
    no_hp_orang_tua,
  } = req.body;

  try {
    await db.query(
      `UPDATE siswa 
       SET nis = ?, nama = ?, kelas_id = ?, jenis_kelamin = ?, tanggal_lahir = ?, 
           nama_orang_tua = ?, no_hp_orang_tua = ?
       WHERE id = ?`,
      [
        nis,
        nama,
        kelas_id,
        jenis_kelamin,
        tanggal_lahir || null,
        nama_orang_tua || null,
        no_hp_orang_tua || null,
        id,
      ]
    );
    req.flash("success", `Data siswa ${nama} berhasil diperbarui!`);
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memperbarui data siswa.");
  }
  res.redirect(`/siswa?kelas_id=${kelas_id || ""}`);
});

// POST /siswa/delete/:id - Hapus siswa (soft delete)
router.post("/delete/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { kelas_id } = req.body;

  try {
    await db.query("UPDATE siswa SET aktif = 0 WHERE id = ?", [id]);
    req.flash("success", "Data siswa berhasil dihapus.");
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal menghapus data siswa.");
  }
  res.redirect(`/siswa?kelas_id=${kelas_id || ""}`);
});

module.exports = router;
