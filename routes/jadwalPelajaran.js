const express = require("express");
const router = express.Router();
const db = require("../config/db");
const uploadDocument = require("../config/multer");
const XLSX = require("xlsx");
const fs = require("fs");

// Middleware: Autentikasi
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    req.flash("error", "Silakan login terlebih dahulu.");
    return res.redirect("/auth/login");
  }
  next();
};

// Middleware: Admin
const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    req.flash("error", "Akses ditolak. Fitur ini hanya untuk Admin.");
    return res.redirect("/dashboard");
  }
  next();
};

router.use(requireAuth);

// Helper fungsi konversi waktu
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

// Helper normalisasi nama hari
function normalizeHari(val) {
  if (!val) return null;
  const s = String(val).trim().toLowerCase();
  const map = {
    senin: "senin",
    sen: "senin",
    monday: "senin",
    mon: "senin",
    selasa: "selasa",
    sel: "selasa",
    tuesday: "selasa",
    tue: "selasa",
    rabu: "rabu",
    rab: "rabu",
    wednesday: "rabu",
    wed: "rabu",
    kamis: "kamis",
    kam: "kamis",
    thursday: "kamis",
    thu: "kamis",
    jumat: "jumat",
    "jum'at": "jumat",
    jum: "jumat",
    friday: "jumat",
    fri: "jumat",
    sabtu: "sabtu",
    sab: "sabtu",
    saturday: "sabtu",
    sat: "sabtu",
  };
  return map[s] || null;
}

// GET /jadwal-pelajaran - Halaman utama Jadwal Pelajaran
router.get("/", async (req, res) => {
  const { kelas_id, guru_id, hari } = req.query;

  try {
    let query = `
      SELECT jp.*, k.nama_kelas, mp.nama as nama_mapel, mp.kode as kode_mapel, u.nama as nama_guru
      FROM jadwal_pelajaran jp
      JOIN kelas k ON jp.kelas_id = k.id
      JOIN mata_pelajaran mp ON jp.mata_pelajaran_id = mp.id
      JOIN users u ON jp.guru_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (kelas_id) {
      query += " AND jp.kelas_id = ?";
      params.push(kelas_id);
    }
    if (guru_id) {
      query += " AND jp.guru_id = ?";
      params.push(guru_id);
    }
    if (hari) {
      query += " AND jp.hari = ?";
      params.push(hari);
    }

    query += ` ORDER BY FIELD(jp.hari, 'senin','selasa','rabu','kamis','jumat','sabtu'), jp.jam_mulai ASC`;

    const [jadwalList] = await db.query(query, params);
    const [kelasList] = await db.query(
      "SELECT id, nama_kelas, tingkat FROM kelas WHERE aktif = 1 ORDER BY tingkat ASC, nama_kelas ASC"
    );
    const [mapelList] = await db.query(
      "SELECT id, nama, kode FROM mata_pelajaran WHERE aktif = 1 ORDER BY nama ASC"
    );
    const [guruList] = await db.query(
      "SELECT id, nama, nip FROM users WHERE role = 'guru' AND aktif = 1 ORDER BY nama ASC"
    );

    res.render("jadwal-pelajaran/index", {
      title: "Jadwal Pelajaran - SD SIG",
      currentPage: "jadwal-pelajaran",
      jadwalList,
      kelasList,
      mapelList,
      guruList,
      filter: { kelas_id: kelas_id || "", guru_id: guru_id || "", hari: hari || "" },
      user: req.session.user,
    });
  } catch (err) {
    console.error("Error GET /jadwal-pelajaran:", err);
    req.flash("error", "Gagal memuat jadwal pelajaran.");
    res.redirect("/dashboard");
  }
});

// GET /jadwal-pelajaran/template - Unduh Template Excel Import Jadwal
router.get("/template", requireAdmin, async (req, res) => {
  try {
    const [kelasList] = await db.query(
      "SELECT id, nama_kelas FROM kelas WHERE aktif = 1 ORDER BY tingkat ASC, nama_kelas ASC"
    );
    const [mapelList] = await db.query(
      "SELECT id, nama, kode FROM mata_pelajaran WHERE aktif = 1 ORDER BY nama ASC"
    );
    const [guruList] = await db.query(
      "SELECT id, nama, nip FROM users WHERE role = 'guru' AND aktif = 1 ORDER BY nama ASC"
    );

    // Contoh baris jadwal
    const sampleRows = [
      {
        "Hari": "Senin",
        "Jam Mulai": "07:30",
        "Jam Selesai": "09:00",
        "Kelas": kelasList[0] ? kelasList[0].nama_kelas : "Kelas 1A",
        "Mata Pelajaran": mapelList[0] ? mapelList[0].nama : "Matematika",
        "Guru Pengampu": guruList[0] ? guruList[0].nama : "Guru Demo",
        "Ruangan": "R. 1A",
      },
      {
        "Hari": "Senin",
        "Jam Mulai": "09:30",
        "Jam Selesai": "11:00",
        "Kelas": kelasList[0] ? kelasList[0].nama_kelas : "Kelas 1A",
        "Mata Pelajaran": mapelList[1] ? mapelList[1].nama : "Bahasa Indonesia",
        "Guru Pengampu": guruList[0] ? guruList[0].nama : "Guru Demo",
        "Ruangan": "R. 1A",
      },
      {
        "Hari": "Selasa",
        "Jam Mulai": "07:30",
        "Jam Selesai": "09:00",
        "Kelas": kelasList[1] ? kelasList[1].nama_kelas : "Kelas 1B",
        "Mata Pelajaran": mapelList[2] ? mapelList[2].nama : "Ilmu Pengetahuan Alam",
        "Guru Pengampu": guruList[0] ? guruList[0].nama : "Guru Demo",
        "Ruangan": "R. 1B",
      },
    ];

    const wb = XLSX.utils.book_new();

    // Sheet 1: Template Jadwal
    const wsJadwal = XLSX.utils.json_to_sheet(sampleRows);
    wsJadwal["!cols"] = [
      { wch: 12 }, // Hari
      { wch: 12 }, // Jam Mulai
      { wch: 14 }, // Jam Selesai
      { wch: 15 }, // Kelas
      { wch: 25 }, // Mata Pelajaran
      { wch: 25 }, // Guru Pengampu
      { wch: 12 }, // Ruangan
    ];
    XLSX.utils.book_append_sheet(wb, wsJadwal, "Jadwal Pelajaran");

    // Sheet 2: Data Referensi
    const refKelas = kelasList.map((k) => ({ "Daftar Kelas": k.nama_kelas }));
    const refMapel = mapelList.map((m) => ({
      "Kode": m.kode || "-",
      "Nama Mata Pelajaran": m.nama,
    }));
    const refGuru = guruList.map((g) => ({
      "NIP": g.nip || "-",
      "Nama Guru": g.nama,
    }));

    const maxRows = Math.max(refKelas.length, refMapel.length, refGuru.length);
    const combinedRef = [];
    for (let i = 0; i < maxRows; i++) {
      combinedRef.push({
        "Nama Kelas": refKelas[i] ? refKelas[i]["Daftar Kelas"] : "",
        "Kode Mapel": refMapel[i] ? refMapel[i]["Kode"] : "",
        "Nama Mapel": refMapel[i] ? refMapel[i]["Nama Mata Pelajaran"] : "",
        "NIP Guru": refGuru[i] ? refGuru[i]["NIP"] : "",
        "Nama Guru": refGuru[i] ? refGuru[i]["Nama Guru"] : "",
      });
    }

    const wsRef = XLSX.utils.json_to_sheet(combinedRef);
    wsRef["!cols"] = [
      { wch: 18 },
      { wch: 12 },
      { wch: 25 },
      { wch: 20 },
      { wch: 25 },
    ];
    XLSX.utils.book_append_sheet(wb, wsRef, "Referensi Data");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="template_jadwal_pelajaran.xlsx"'
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  } catch (err) {
    console.error("Error GET /jadwal-pelajaran/template:", err);
    req.flash("error", "Gagal mengunduh template jadwal pelajaran.");
    res.redirect("/jadwal-pelajaran");
  }
});

// POST /jadwal-pelajaran/upload - Upload & Import Jadwal dari Excel/CSV (Admin)
router.post(
  "/upload",
  requireAdmin,
  uploadDocument.single("file"),
  async (req, res) => {
    if (!req.file) {
      req.flash("error", "Silakan pilih file Excel (.xlsx / .xls) atau CSV.");
      return res.redirect("/jadwal-pelajaran");
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
        return res.redirect("/jadwal-pelajaran");
      }

      // Ambil data referensi
      const [kelasList] = await db.query(
        "SELECT id, nama_kelas, tingkat FROM kelas WHERE aktif = 1"
      );
      const [mapelList] = await db.query(
        "SELECT id, nama, kode FROM mata_pelajaran WHERE aktif = 1"
      );
      const [guruList] = await db.query(
        "SELECT id, nama, nip FROM users WHERE role = 'guru' AND aktif = 1"
      );

      // Matcher Kelas
      const findKelas = (val) => {
        if (!val) return null;
        const str = String(val).trim().toLowerCase();
        const clean = str.replace(/[^a-z0-9]/g, "");
        return (
          kelasList.find((k) => String(k.id) === str) ||
          kelasList.find(
            (k) => k.nama_kelas.toLowerCase().replace(/[^a-z0-9]/g, "") === clean
          ) ||
          kelasList.find((k) =>
            k.nama_kelas
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "")
              .includes(clean)
          ) ||
          kelasList.find((k) =>
            clean.includes(
              k.nama_kelas.toLowerCase().replace(/[^a-z0-9]/g, "")
            )
          )
        );
      };

      // Matcher Mapel
      const findMapel = async (val) => {
        if (!val) return null;
        const str = String(val).trim().toLowerCase();
        const clean = str.replace(/[^a-z0-9]/g, "");
        let m =
          mapelList.find((x) => String(x.id) === str) ||
          mapelList.find(
            (x) =>
              x.kode &&
              x.kode.toLowerCase().replace(/[^a-z0-9]/g, "") === clean
          ) ||
          mapelList.find(
            (x) => x.nama.toLowerCase().replace(/[^a-z0-9]/g, "") === clean
          ) ||
          mapelList.find(
            (x) =>
              x.nama.toLowerCase().includes(str) ||
              (x.kode && x.kode.toLowerCase().includes(str))
          );

        if (!m && String(val).trim().length > 1) {
          // Buat mapel baru jika belum terdaftar
          const [ins] = await db.query(
            "INSERT INTO mata_pelajaran (nama, kode) VALUES (?, ?)",
            [String(val).trim(), String(val).trim().slice(0, 5).toUpperCase()]
          );
          m = {
            id: ins.insertId,
            nama: String(val).trim(),
            kode: String(val).trim().slice(0, 5).toUpperCase(),
          };
          mapelList.push(m);
        }
        return m;
      };

      // Matcher Guru
      const findGuru = (val) => {
        if (!val) return guruList[0] || null;
        const str = String(val).trim().toLowerCase();
        const cleanNip = str.replace(/[^0-9]/g, "");
        if (cleanNip.length >= 4) {
          const byNip = guruList.find(
            (g) => g.nip && g.nip.replace(/[^0-9]/g, "") === cleanNip
          );
          if (byNip) return byNip;
        }
        const clean = str.replace(/[^a-z0-9]/g, "");
        return (
          guruList.find((g) => String(g.id) === str) ||
          guruList.find(
            (g) => g.nama.toLowerCase().replace(/[^a-z0-9]/g, "") === clean
          ) ||
          guruList.find((g) => g.nama.toLowerCase().includes(str)) ||
          guruList[0] ||
          null
        );
      };

      let successCount = 0;
      let skipCount = 0;
      const errorDetails = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const keys = Object.keys(row);
        const getVal = (aliases) => {
          const key = keys.find((k) =>
            aliases.includes(k.trim().toLowerCase())
          );
          return key ? row[key] : "";
        };

        const rawHari = getVal(["hari", "day"]);
        const rawMulai = getVal(["jam mulai", "jam_mulai", "mulai", "start_time", "jam"]);
        const rawSelesai = getVal(["jam selesai", "jam_selesai", "selesai", "end_time"]);
        const rawKelas = getVal(["kelas", "nama kelas", "nama_kelas", "class"]);
        const rawMapel = getVal(["mata pelajaran", "mata_pelajaran", "mapel", "pelajaran"]);
        const rawGuru = getVal(["guru pengampu", "guru", "nama guru", "nama_guru", "pengampu", "nip"]);
        const rawRuang = getVal(["ruangan", "ruang", "room"]);

        const hari = normalizeHari(rawHari);
        const jamMulai = parseTimeString(rawMulai);
        const jamSelesai = parseTimeString(rawSelesai);
        const targetKelas = findKelas(rawKelas);
        const targetMapel = await findMapel(rawMapel);
        const targetGuru = findGuru(rawGuru);

        if (!hari || !jamMulai || !jamSelesai || !targetKelas || !targetMapel || !targetGuru) {
          skipCount++;
          const missing = [];
          if (!hari) missing.push("Hari");
          if (!jamMulai) missing.push("Jam Mulai");
          if (!jamSelesai) missing.push("Jam Selesai");
          if (!targetKelas) missing.push("Kelas");
          if (!targetMapel) missing.push("Mata Pelajaran");
          if (!targetGuru) missing.push("Guru");
          errorDetails.push(`Baris ${i + 2}: Kolom (${missing.join(", ")}) tidak valid.`);
          continue;
        }

        // Cek duplikasi di hari, jam, dan kelas yang sama
        const [existing] = await db.query(
          "SELECT id FROM jadwal_pelajaran WHERE kelas_id = ? AND hari = ? AND jam_mulai = ?",
          [targetKelas.id, hari, jamMulai]
        );

        if (existing.length > 0) {
          // Update jadwal yang sudah ada
          await db.query(
            `UPDATE jadwal_pelajaran 
             SET mata_pelajaran_id = ?, guru_id = ?, jam_selesai = ?, ruangan = ?, aktif = 1 
             WHERE id = ?`,
            [
              targetMapel.id,
              targetGuru.id,
              jamSelesai,
              rawRuang ? String(rawRuang).trim() : null,
              existing[0].id,
            ]
          );
        } else {
          // Insert jadwal baru
          await db.query(
            `INSERT INTO jadwal_pelajaran 
             (kelas_id, mata_pelajaran_id, guru_id, hari, jam_mulai, jam_selesai, ruangan, aktif) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
            [
              targetKelas.id,
              targetMapel.id,
              targetGuru.id,
              hari,
              jamMulai,
              jamSelesai,
              rawRuang ? String(rawRuang).trim() : null,
            ]
          );
        }
        successCount++;
      }

      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      let msg = `Berhasil memproses upload! ${successCount} jadwal pelajaran berhasil diimpor.`;
      if (skipCount > 0) {
        msg += ` (${skipCount} baris diabaikan/format tidak valid)`;
      }

      req.flash("success", msg);
      res.redirect("/jadwal-pelajaran");
    } catch (err) {
      console.error("Error POST /jadwal-pelajaran/upload:", err);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      req.flash("error", "Gagal memproses file upload: " + err.message);
      res.redirect("/jadwal-pelajaran");
    }
  }
);

// POST /jadwal-pelajaran - Tambah Jadwal Pelajaran Manual (Admin)
router.post("/", requireAdmin, async (req, res) => {
  const { kelas_id, mata_pelajaran_id, guru_id, hari, jam_mulai, jam_selesai, ruangan } = req.body;

  if (!kelas_id || !mata_pelajaran_id || !guru_id || !hari || !jam_mulai || !jam_selesai) {
    req.flash("error", "Semua bidang bertanda bintang (*) wajib diisi.");
    return res.redirect("/jadwal-pelajaran");
  }

  try {
    const formattedMulai = parseTimeString(jam_mulai) || jam_mulai;
    const formattedSelesai = parseTimeString(jam_selesai) || jam_selesai;

    await db.query(
      `INSERT INTO jadwal_pelajaran 
       (kelas_id, mata_pelajaran_id, guru_id, hari, jam_mulai, jam_selesai, ruangan, aktif)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        kelas_id,
        mata_pelajaran_id,
        guru_id,
        hari.toLowerCase(),
        formattedMulai,
        formattedSelesai,
        ruangan ? ruangan.trim() : null,
      ]
    );

    req.flash("success", "Jadwal pelajaran berhasil ditambahkan!");
    res.redirect("/jadwal-pelajaran");
  } catch (err) {
    console.error("Error POST /jadwal-pelajaran:", err);
    req.flash("error", "Gagal menambahkan jadwal pelajaran: " + err.message);
    res.redirect("/jadwal-pelajaran");
  }
});

// PUT /jadwal-pelajaran/:id - Update Jadwal (Admin)
router.put("/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { kelas_id, mata_pelajaran_id, guru_id, hari, jam_mulai, jam_selesai, ruangan, aktif } = req.body;

  try {
    const formattedMulai = parseTimeString(jam_mulai) || jam_mulai;
    const formattedSelesai = parseTimeString(jam_selesai) || jam_selesai;

    await db.query(
      `UPDATE jadwal_pelajaran
       SET kelas_id = ?, mata_pelajaran_id = ?, guru_id = ?, hari = ?, jam_mulai = ?, jam_selesai = ?, ruangan = ?, aktif = ?
       WHERE id = ?`,
      [
        kelas_id,
        mata_pelajaran_id,
        guru_id,
        hari.toLowerCase(),
        formattedMulai,
        formattedSelesai,
        ruangan ? ruangan.trim() : null,
        aktif === "0" ? 0 : 1,
        id,
      ]
    );

    req.flash("success", "Jadwal pelajaran berhasil diperbarui!");
    res.redirect("/jadwal-pelajaran");
  } catch (err) {
    console.error("Error PUT /jadwal-pelajaran/:id:", err);
    req.flash("error", "Gagal memperbarui jadwal pelajaran: " + err.message);
    res.redirect("/jadwal-pelajaran");
  }
});

// POST /jadwal-pelajaran/edit/:id - Fallback Edit POST method
router.post("/edit/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { kelas_id, mata_pelajaran_id, guru_id, hari, jam_mulai, jam_selesai, ruangan, aktif } = req.body;

  try {
    const formattedMulai = parseTimeString(jam_mulai) || jam_mulai;
    const formattedSelesai = parseTimeString(jam_selesai) || jam_selesai;

    await db.query(
      `UPDATE jadwal_pelajaran
       SET kelas_id = ?, mata_pelajaran_id = ?, guru_id = ?, hari = ?, jam_mulai = ?, jam_selesai = ?, ruangan = ?, aktif = ?
       WHERE id = ?`,
      [
        kelas_id,
        mata_pelajaran_id,
        guru_id,
        hari.toLowerCase(),
        formattedMulai,
        formattedSelesai,
        ruangan ? ruangan.trim() : null,
        aktif === "0" ? 0 : 1,
        id,
      ]
    );

    req.flash("success", "Jadwal pelajaran berhasil diperbarui!");
    res.redirect("/jadwal-pelajaran");
  } catch (err) {
    console.error("Error POST /jadwal-pelajaran/edit/:id:", err);
    req.flash("error", "Gagal memperbarui jadwal pelajaran: " + err.message);
    res.redirect("/jadwal-pelajaran");
  }
});

// DELETE /jadwal-pelajaran/:id - Hapus Jadwal (Admin)
router.delete("/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("DELETE FROM jadwal_pelajaran WHERE id = ?", [id]);
    req.flash("success", "Jadwal pelajaran berhasil dihapus!");
    res.redirect("/jadwal-pelajaran");
  } catch (err) {
    console.error("Error DELETE /jadwal-pelajaran/:id:", err);
    req.flash("error", "Gagal menghapus jadwal pelajaran.");
    res.redirect("/jadwal-pelajaran");
  }
});

// POST /jadwal-pelajaran/delete/:id - Fallback Hapus POST method
router.post("/delete/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("DELETE FROM jadwal_pelajaran WHERE id = ?", [id]);
    req.flash("success", "Jadwal pelajaran berhasil dihapus!");
    res.redirect("/jadwal-pelajaran");
  } catch (err) {
    console.error("Error POST /jadwal-pelajaran/delete/:id:", err);
    req.flash("error", "Gagal menghapus jadwal pelajaran.");
    res.redirect("/jadwal-pelajaran");
  }
});

module.exports = router;
