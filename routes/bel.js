const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isAuthenticated, isAdmin } = require("../middleware/auth");
const { uploadSuaraBel, uploadDocument } = require("../config/multer");
const { reloadScheduler } = require("../services/scheduler");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

// Helper waktu untuk bel
function parseTimeString(val) {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "number") {
    const frac = val % 1;
    const totalSeconds = Math.round(frac * 86400);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  }
  const s = String(val).trim().replace(".", ":");
  const match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const hh = String(parseInt(match[1], 10)).padStart(2, "0");
    const mm = match[2];
    const ss = match[3] || "00";
    return `${hh}:${mm}:${ss}`;
  }
  return null;
}

// GET /bel - Daftar jadwal bel
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const [jadwalBel] = await db.query(
      `SELECT jb.*, sb.nama as nama_suara, sb.filename as filename_suara
       FROM jadwal_bel jb
       LEFT JOIN suara_bel sb ON jb.suara_bel_id = sb.id
       ORDER BY jb.waktu ASC`
    );

    const [suaraBelList] = await db.query(
      "SELECT * FROM suara_bel WHERE aktif = 1 ORDER BY nama ASC"
    );

    const [logBel] = await db.query(
      `SELECT lb.*, u.nama as nama_user
       FROM log_bel lb
       LEFT JOIN users u ON lb.dibunyikan_oleh = u.id
       ORDER BY lb.waktu_bunyi DESC
       LIMIT 50`
    );

    res.render("bel/index", {
      title: "Manajemen Bel Sekolah",
      layout: "layouts/main",
      user: req.session.user,
      jadwalBel,
      suaraBelList,
      logBel,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memuat data bel.");
    res.redirect("/dashboard");
  }
});

// GET /bel/template - Download template Excel jadwal bel (Admin)
router.get("/template", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const [suaraBelList] = await db.query(
      "SELECT id, nama, filename FROM suara_bel WHERE aktif = 1 ORDER BY nama ASC"
    );

    const sampleRows = [
      {
        "Nama Jadwal": "Masuk Sekolah",
        "Waktu": "07:00",
        "Hari": "senin, selasa, rabu, kamis, jumat, sabtu",
        "Suara Bel": suaraBelList[0] ? suaraBelList[0].nama : "",
        "Keterangan": "Bel masuk sekolah pagi",
        "Status": "Aktif",
      },
      {
        "Nama Jadwal": "Istirahat 1",
        "Waktu": "09:30",
        "Hari": "senin, selasa, rabu, kamis, jumat, sabtu",
        "Suara Bel": suaraBelList[0] ? suaraBelList[0].nama : "",
        "Keterangan": "Bel istirahat pertama",
        "Status": "Aktif",
      },
      {
        "Nama Jadwal": "Pulang Sekolah",
        "Waktu": "13:00",
        "Hari": "senin, selasa, rabu, kamis, jumat",
        "Suara Bel": suaraBelList[0] ? suaraBelList[0].nama : "",
        "Keterangan": "Bel pulang sekolah reguler",
        "Status": "Aktif",
      },
    ];

    const wb = XLSX.utils.book_new();
    const wsJadwal = XLSX.utils.json_to_sheet(sampleRows);
    wsJadwal["!cols"] = [
      { wch: 25 },
      { wch: 12 },
      { wch: 40 },
      { wch: 25 },
      { wch: 30 },
      { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, wsJadwal, "Jadwal Bel");

    // Sheet Referensi Suara Bel
    const wsSuara = XLSX.utils.json_to_sheet(
      suaraBelList.map((s) => ({
        "ID": s.id,
        "Nama Suara Bel": s.nama,
        "File Audio": s.filename,
      }))
    );
    wsSuara["!cols"] = [{ wch: 8 }, { wch: 30 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsSuara, "Daftar Suara Bel");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="template_jadwal_bel.xlsx"'
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  } catch (err) {
    console.error("Error GET /bel/template:", err);
    req.flash("error", "Gagal mengunduh template jadwal bel.");
    res.redirect("/bel");
  }
});

// POST /bel/upload - Upload & Import jadwal bel dari Excel/CSV (Admin)
router.post(
  "/upload",
  isAuthenticated,
  isAdmin,
  uploadDocument.single("file"),
  async (req, res) => {
    if (!req.file) {
      req.flash("error", "Silakan pilih file Excel (.xlsx / .xls) atau CSV.");
      return res.redirect("/bel");
    }

    const filePath = req.file.path;

    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!rows || rows.length === 0) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        req.flash("error", "File kosong atau format data tidak valid.");
        return res.redirect("/bel");
      }

      const [suaraBelList] = await db.query(
        "SELECT id, nama, filename FROM suara_bel WHERE aktif = 1"
      );

      const findSuara = (val) => {
        if (!val) return null;
        const str = String(val).trim().toLowerCase();
        const clean = str.replace(/[^a-z0-9]/g, "");
        return (
          suaraBelList.find((s) => String(s.id) === str) ||
          suaraBelList.find(
            (s) => s.nama.toLowerCase().replace(/[^a-z0-9]/g, "") === clean
          ) ||
          suaraBelList.find(
            (s) => s.filename.toLowerCase().replace(/[^a-z0-9]/g, "") === clean
          ) ||
          suaraBelList.find((s) => s.nama.toLowerCase().includes(str)) ||
          null
        );
      };

      const parseHari = (val) => {
        if (!val) return ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];
        const validHari = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"];
        const parts = String(val)
          .toLowerCase()
          .split(/[,;\s]+/)
          .map((h) => h.trim().replace(/['"]/g, ""))
          .filter(Boolean);

        const resHari = parts
          .map((h) => {
            if (h.startsWith("sen")) return "senin";
            if (h.startsWith("sel")) return "selasa";
            if (h.startsWith("rab")) return "rabu";
            if (h.startsWith("kam")) return "kamis";
            if (h.startsWith("jum")) return "jumat";
            if (h.startsWith("sab")) return "sabtu";
            if (h.startsWith("min")) return "minggu";
            return h;
          })
          .filter((h) => validHari.includes(h));

        return resHari.length > 0
          ? resHari
          : ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];
      };

      let successCount = 0;
      let skipCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const keys = Object.keys(row);
        const getVal = (aliases) => {
          const key = keys.find((k) =>
            aliases.includes(k.trim().toLowerCase())
          );
          return key ? row[key] : "";
        };

        const nama = getVal(["nama", "nama jadwal", "nama_jadwal"]);
        const rawWaktu = getVal(["waktu", "jam", "time"]);
        const rawHari = getVal(["hari", "days", "hari kerja"]);
        const rawSuara = getVal(["suara bel", "suara_bel", "suara", "audio"]);
        const rawKet = getVal(["keterangan", "deskripsi", "catatan"]);
        const rawStatus = getVal(["status", "aktif"]);

        const waktu = parseTimeString(rawWaktu);
        if (!nama || !waktu) {
          skipCount++;
          continue;
        }

        const hariArr = parseHari(rawHari);
        const suaraObj = findSuara(rawSuara);
        const aktifVal =
          rawStatus === "" ||
          String(rawStatus).toLowerCase() === "aktif" ||
          String(rawStatus) === "1"
            ? 1
            : 0;

        // Cek apakah jadwal dengan waktu dan nama yang sama sudah ada
        const [existing] = await db.query(
          "SELECT id FROM jadwal_bel WHERE waktu = ? AND nama = ?",
          [waktu, nama.trim()]
        );

        if (existing.length > 0) {
          await db.query(
            `UPDATE jadwal_bel 
             SET hari = ?, suara_bel_id = ?, keterangan = ?, aktif = ?
             WHERE id = ?`,
            [
              JSON.stringify(hariArr),
              suaraObj ? suaraObj.id : null,
              rawKet ? String(rawKet).trim() : null,
              aktifVal,
              existing[0].id,
            ]
          );
        } else {
          await db.query(
            `INSERT INTO jadwal_bel 
             (nama, waktu, hari, suara_bel_id, keterangan, aktif)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              nama.trim(),
              waktu,
              JSON.stringify(hariArr),
              suaraObj ? suaraObj.id : null,
              rawKet ? String(rawKet).trim() : null,
              aktifVal,
            ]
          );
        }
        successCount++;
      }

      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      // Reload scheduler bel
      try {
        await reloadScheduler();
      } catch (schErr) {
        console.error("Gagal reload scheduler:", schErr);
      }

      let msg = `Berhasil mengimpor ${successCount} jadwal bel!`;
      if (skipCount > 0) {
        msg += ` (${skipCount} baris diabaikan karena nama atau format waktu tidak valid)`;
      }

      req.flash("success", msg);
      res.redirect("/bel");
    } catch (err) {
      console.error("Error POST /bel/upload:", err);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      req.flash("error", "Gagal memproses file upload: " + err.message);
      res.redirect("/bel");
    }
  }
);

// GET /bel/jadwal/tambah - Form tambah jadwal
router.get("/jadwal/tambah", isAuthenticated, isAdmin, async (req, res) => {
  const [suaraBelList] = await db.query(
    "SELECT * FROM suara_bel WHERE aktif = 1 ORDER BY nama"
  );
  res.render("bel/form-jadwal", {
    title: "Tambah Jadwal Bel",
    layout: "layouts/main",
    user: req.session.user,
    suaraBelList,
    jadwal: null,
    action: "/bel/jadwal",
    method: "POST",
  });
});

// POST /bel/jadwal - Simpan jadwal baru
router.post("/jadwal", isAuthenticated, isAdmin, async (req, res) => {
  const { nama, waktu, hari, suara_bel_id, keterangan, aktif } = req.body;
  const hariArray = Array.isArray(hari) ? hari : [hari].filter(Boolean);

  try {
    const formattedWaktu = parseTimeString(waktu) || waktu;

    await db.query(
      "INSERT INTO jadwal_bel (nama, waktu, hari, suara_bel_id, keterangan, aktif) VALUES (?, ?, ?, ?, ?, ?)",
      [
        nama,
        formattedWaktu,
        JSON.stringify(hariArray),
        suara_bel_id || null,
        keterangan,
        aktif ? 1 : 0,
      ]
    );

    try {
      await reloadScheduler();
    } catch {}

    req.flash("success", "Jadwal bel berhasil ditambahkan!");
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal menambahkan jadwal bel.");
  }
  res.redirect("/bel");
});

// GET /bel/jadwal/:id/edit - Form edit jadwal
router.get("/jadwal/:id/edit", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const [[jadwal]] = await db.query("SELECT * FROM jadwal_bel WHERE id = ?", [
      req.params.id,
    ]);
    if (!jadwal) {
      req.flash("error", "Jadwal tidak ditemukan.");
      return res.redirect("/bel");
    }
    const [suaraBelList] = await db.query(
      "SELECT * FROM suara_bel WHERE aktif = 1 ORDER BY nama"
    );
    res.render("bel/form-jadwal", {
      title: "Edit Jadwal Bel",
      layout: "layouts/main",
      user: req.session.user,
      suaraBelList,
      jadwal,
      action: `/bel/jadwal/${jadwal.id}?_method=PUT`,
      method: "POST",
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memuat data jadwal.");
    res.redirect("/bel");
  }
});

// PUT /bel/jadwal/:id - Update jadwal
router.put("/jadwal/:id", isAuthenticated, isAdmin, async (req, res) => {
  const { nama, waktu, hari, suara_bel_id, keterangan, aktif } = req.body;
  const hariArray = Array.isArray(hari) ? hari : [hari].filter(Boolean);

  try {
    const formattedWaktu = parseTimeString(waktu) || waktu;

    await db.query(
      "UPDATE jadwal_bel SET nama=?, waktu=?, hari=?, suara_bel_id=?, keterangan=?, aktif=? WHERE id=?",
      [
        nama,
        formattedWaktu,
        JSON.stringify(hariArray),
        suara_bel_id || null,
        keterangan,
        aktif ? 1 : 0,
        req.params.id,
      ]
    );

    try {
      await reloadScheduler();
    } catch {}

    req.flash("success", "Jadwal bel berhasil diperbarui!");
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memperbarui jadwal bel.");
  }
  res.redirect("/bel");
});

// DELETE /bel/jadwal/:id - Hapus jadwal
router.delete("/jadwal/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    await db.query("DELETE FROM jadwal_bel WHERE id = ?", [req.params.id]);

    try {
      await reloadScheduler();
    } catch {}

    req.flash("success", "Jadwal bel berhasil dihapus!");
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal menghapus jadwal bel.");
  }
  res.redirect("/bel");
});

// ============ MANAJEMEN SUARA BEL ============

// GET /bel/suara - Daftar suara bel
router.get("/suara", isAuthenticated, async (req, res) => {
  try {
    const [suaraBelList] = await db.query(
      "SELECT * FROM suara_bel ORDER BY created_at DESC"
    );
    res.render("bel/suara", {
      title: "Manajemen Suara Bel",
      layout: "layouts/main",
      user: req.session.user,
      suaraBelList,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memuat data suara bel.");
    res.redirect("/bel");
  }
});

// POST /bel/suara - Upload suara bel baru
router.post("/suara", isAuthenticated, isAdmin, (req, res) => {
  uploadSuaraBel.single("file_audio")(req, res, async (err) => {
    if (err) {
      req.flash("error", err.message);
      return res.redirect("/bel/suara");
    }

    if (!req.file) {
      req.flash("error", "File audio harus dipilih!");
      return res.redirect("/bel/suara");
    }

    const { nama } = req.body;
    const filepath = `/uploads/suara/${req.file.filename}`;
    const ukuran = req.file.size;

    try {
      await db.query(
        "INSERT INTO suara_bel (nama, filename, filepath, ukuran) VALUES (?, ?, ?, ?)",
        [nama, req.file.filename, filepath, ukuran]
      );
      req.flash("success", `Suara bel "${nama}" berhasil diunggah!`);
    } catch (dbErr) {
      console.error(dbErr);
      req.flash("error", "Gagal menyimpan data suara bel.");
    }
    res.redirect("/bel/suara");
  });
});

// DELETE /bel/suara/:id - Hapus suara bel
router.delete("/suara/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const [[suara]] = await db.query("SELECT * FROM suara_bel WHERE id = ?", [
      req.params.id,
    ]);
    if (!suara) {
      req.flash("error", "Suara bel tidak ditemukan.");
      return res.redirect("/bel/suara");
    }

    // Hapus file fisik
    const filePath = path.join(
      __dirname,
      "../public",
      suara.filepath
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await db.query("DELETE FROM suara_bel WHERE id = ?", [req.params.id]);
    req.flash("success", "Suara bel berhasil dihapus!");
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal menghapus suara bel.");
  }
  res.redirect("/bel");
});

// GET /bel/api/jadwal-aktif - API untuk cron scheduler (SSE)
router.get("/api/jadwal-aktif", isAuthenticated, async (req, res) => {
  try {
    const [jadwal] = await db.query(
      `SELECT jb.*, sb.filename as filename_suara, sb.filepath as filepath_suara
       FROM jadwal_bel jb
       LEFT JOIN suara_bel sb ON jb.suara_bel_id = sb.id
       WHERE jb.aktif = 1
       ORDER BY jb.waktu ASC`
    );
    res.json({ success: true, data: jadwal });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
