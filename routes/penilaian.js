const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { isAuthenticated } = require("../middleware/auth");
const XLSX = require("xlsx");

// GET /penilaian - Daftar penilaian
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const [kelasList] = await db.query(
      "SELECT * FROM kelas WHERE aktif = 1 ORDER BY tingkat, nama_kelas"
    );
    const [mapelList] = await db.query(
      "SELECT * FROM mata_pelajaran WHERE aktif = 1 ORDER BY nama"
    );

    const kelasId = req.query.kelas_id || "";
    const mapelId = req.query.mapel_id || "";
    const tanggal = req.query.tanggal || "";

    let whereClause = "WHERE 1=1";
    const params = [];

    if (kelasId) {
      whereClause += " AND ph.kelas_id = ?";
      params.push(kelasId);
    }
    if (mapelId) {
      whereClause += " AND ph.mata_pelajaran_id = ?";
      params.push(mapelId);
    }
    if (tanggal) {
      whereClause += " AND ph.tanggal = ?";
      params.push(tanggal);
    }
    if (req.session.user.role === "guru") {
      whereClause += " AND ph.guru_id = ?";
      params.push(req.session.user.id);
    }

    const [penilaianList] = await db.query(
      `SELECT ph.*, s.nama as nama_siswa, s.nis, k.nama_kelas, mp.nama as nama_mapel, u.nama as nama_guru
       FROM penilaian_harian ph
       LEFT JOIN siswa s ON ph.siswa_id = s.id
       LEFT JOIN kelas k ON ph.kelas_id = k.id
       LEFT JOIN mata_pelajaran mp ON ph.mata_pelajaran_id = mp.id
       LEFT JOIN users u ON ph.guru_id = u.id
       ${whereClause}
       ORDER BY ph.tanggal DESC, s.nama ASC`,
      params
    );

    res.render("penilaian/index", {
      title: "Penilaian Harian",
      layout: "layouts/main",
      user: req.session.user,
      kelasList,
      mapelList,
      penilaianList,
      kelasId,
      mapelId,
      tanggal,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memuat data penilaian.");
    res.redirect("/dashboard");
  }
});

// GET /penilaian/export - Export daftar penilaian ke Excel
router.get("/export", isAuthenticated, async (req, res) => {
  try {
    const { kelas_id, mapel_id, tanggal } = req.query;

    let whereClause = "WHERE 1=1";
    const params = [];

    if (kelas_id) {
      whereClause += " AND ph.kelas_id = ?";
      params.push(kelas_id);
    }
    if (mapel_id) {
      whereClause += " AND ph.mata_pelajaran_id = ?";
      params.push(mapel_id);
    }
    if (tanggal) {
      whereClause += " AND ph.tanggal = ?";
      params.push(tanggal);
    }
    if (req.session.user.role === "guru") {
      whereClause += " AND ph.guru_id = ?";
      params.push(req.session.user.id);
    }

    const [rows] = await db.query(
      `SELECT ph.*, s.nama as nama_siswa, s.nis, k.nama_kelas, mp.nama as nama_mapel, u.nama as nama_guru
       FROM penilaian_harian ph
       LEFT JOIN siswa s ON ph.siswa_id = s.id
       LEFT JOIN kelas k ON ph.kelas_id = k.id
       LEFT JOIN mata_pelajaran mp ON ph.mata_pelajaran_id = mp.id
       LEFT JOIN users u ON ph.guru_id = u.id
       ${whereClause}
       ORDER BY ph.tanggal DESC, s.nama ASC`,
      params
    );

    const exportData = rows.map((p, idx) => ({
      No: idx + 1,
      Tanggal: p.tanggal ? new Date(p.tanggal).toISOString().split("T")[0] : "",
      NIS: p.nis || "",
      "Nama Siswa": p.nama_siswa || "",
      Kelas: p.nama_kelas || "",
      "Mata Pelajaran": p.nama_mapel || "",
      "Jenis Penilaian": (p.jenis_penilaian || "")
        .replace("_", " ")
        .toUpperCase(),
      Judul: p.judul || "",
      Nilai: Number.parseFloat(p.nilai),
      "Nilai Max": Number.parseFloat(p.nilai_max),
      Catatan: p.catatan || "",
      Guru: p.nama_guru || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Penilaian Harian");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Jurnal_Penilaian_${Date.now()}.xlsx"`
    );
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting penilaian to Excel:", err);
    req.flash("error", "Gagal mengeksport data penilaian ke Excel.");
    res.redirect("/penilaian");
  }
});

// GET /penilaian/input - Form input penilaian
router.get("/input", isAuthenticated, async (req, res) => {
  try {
    const [kelasList] = await db.query(
      "SELECT * FROM kelas WHERE aktif = 1 ORDER BY tingkat, nama_kelas"
    );
    const [mapelList] = await db.query(
      "SELECT * FROM mata_pelajaran WHERE aktif = 1 ORDER BY nama"
    );

    const kelasId = req.query.kelas_id || "";
    const mapelId = req.query.mapel_id || "";
    const tanggal = req.query.tanggal || new Date().toISOString().split("T")[0];
    const jenisPenilaian = req.query.jenis_penilaian || "tugas";
    const judul = req.query.judul || "";

    let siswaList = [];
    const existingValues = {};

    if (kelasId && mapelId && judul) {
      const [siswa] = await db.query(
        "SELECT * FROM siswa WHERE kelas_id = ? AND aktif = 1 ORDER BY nama",
        [kelasId]
      );
      siswaList = siswa;

      const [existing] = await db.query(
        `SELECT siswa_id, nilai, catatan FROM penilaian_harian
         WHERE kelas_id = ? AND mata_pelajaran_id = ? AND tanggal = ?
           AND jenis_penilaian = ? AND judul = ?`,
        [kelasId, mapelId, tanggal, jenisPenilaian, judul]
      );
      for (const row of existing) {
        existingValues[row.siswa_id] = row;
      }
    }

    res.render("penilaian/input", {
      title: "Input Penilaian Harian",
      layout: "layouts/main",
      user: req.session.user,
      kelasList,
      mapelList,
      siswaList,
      existingValues,
      kelasId,
      mapelId,
      tanggal,
      jenisPenilaian,
      judul,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memuat form penilaian.");
    res.redirect("/penilaian");
  }
});

// POST /penilaian/input - Simpan penilaian
router.post("/input", isAuthenticated, async (req, res) => {
  const {
    kelas_id,
    mata_pelajaran_id,
    tanggal,
    jenis_penilaian,
    judul,
    nilai_max,
    nilaiSiswa,
  } = req.body;

  try {
    const entries = Object.entries(nilaiSiswa || {});
    for (const [siswaId, data] of entries) {
      if (data.nilai !== "" && data.nilai !== undefined) {
        await db.query(
          `INSERT INTO penilaian_harian
             (siswa_id, kelas_id, mata_pelajaran_id, guru_id, tanggal, jenis_penilaian, judul, nilai, nilai_max, catatan)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE nilai=?, catatan=?`,
          [
            siswaId,
            kelas_id,
            mata_pelajaran_id,
            req.session.user.id,
            tanggal,
            jenis_penilaian,
            judul,
            data.nilai,
            nilai_max || 100,
            data.catatan || null,
            data.nilai,
            data.catatan || null,
          ]
        );
      }
    }
    req.flash("success", "Penilaian berhasil disimpan!");
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal menyimpan penilaian.");
  }
  res.redirect(
    `/penilaian?kelas_id=${kelas_id}&mapel_id=${mata_pelajaran_id}&tanggal=${tanggal}`
  );
});

// GET /penilaian/rekap - Rekap nilai per siswa
router.get("/rekap", isAuthenticated, async (req, res) => {
  try {
    const [kelasList] = await db.query(
      "SELECT * FROM kelas WHERE aktif = 1 ORDER BY tingkat, nama_kelas"
    );
    const [mapelList] = await db.query(
      "SELECT * FROM mata_pelajaran WHERE aktif = 1 ORDER BY nama"
    );

    const kelasId = req.query.kelas_id || "";
    const mapelId = req.query.mapel_id || "";

    let rekapData = [];

    if (kelasId && mapelId) {
      const [rows] = await db.query(
        `SELECT s.id, s.nis, s.nama,
                AVG(ph.nilai) as rata_rata,
                MIN(ph.nilai) as nilai_min,
                MAX(ph.nilai) as nilai_max_nilai,
                COUNT(ph.id) as jumlah_penilaian
         FROM siswa s
         LEFT JOIN penilaian_harian ph ON s.id = ph.siswa_id
           AND ph.kelas_id = ? AND ph.mata_pelajaran_id = ?
         WHERE s.kelas_id = ? AND s.aktif = 1
         GROUP BY s.id, s.nis, s.nama
         ORDER BY s.nama`,
        [kelasId, mapelId, kelasId]
      );
      rekapData = rows;
    }

    res.render("penilaian/rekap", {
      title: "Rekap Nilai",
      layout: "layouts/main",
      user: req.session.user,
      kelasList,
      mapelList,
      kelasId,
      mapelId,
      rekapData,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Gagal memuat rekap nilai.");
    res.redirect("/penilaian");
  }
});

// GET /penilaian/rekap/export - Export rekap nilai ke Excel
router.get("/rekap/export", isAuthenticated, async (req, res) => {
  try {
    const { kelas_id, mapel_id } = req.query;

    if (!(kelas_id && mapel_id)) {
      req.flash(
        "error",
        "Pilih kelas dan mata pelajaran terlebih dahulu untuk export rekap."
      );
      return res.redirect("/penilaian/rekap");
    }

    const [[kelasInfo]] = await db.query(
      "SELECT nama_kelas FROM kelas WHERE id = ?",
      [kelas_id]
    );
    const [[mapelInfo]] = await db.query(
      "SELECT nama FROM mata_pelajaran WHERE id = ?",
      [mapel_id]
    );

    const [rows] = await db.query(
      `SELECT s.id, s.nis, s.nama,
              AVG(ph.nilai) as rata_rata,
              MIN(ph.nilai) as nilai_min,
              MAX(ph.nilai) as nilai_max_nilai,
              COUNT(ph.id) as jumlah_penilaian
       FROM siswa s
       LEFT JOIN penilaian_harian ph ON s.id = ph.siswa_id
         AND ph.kelas_id = ? AND ph.mata_pelajaran_id = ?
       WHERE s.kelas_id = ? AND s.aktif = 1
       GROUP BY s.id, s.nis, s.nama
       ORDER BY s.nama`,
      [kelas_id, mapel_id, kelas_id]
    );

    const exportData = rows.map((r, idx) => {
      const rata = r.rata_rata
        ? Number.parseFloat(r.rata_rata).toFixed(1)
        : "-";
      let predikat = "-";
      if (r.rata_rata) {
        if (r.rata_rata >= 90) {
          predikat = "A (Sangat Baik)";
        } else if (r.rata_rata >= 80) {
          predikat = "B (Baik)";
        } else if (r.rata_rata >= 70) {
          predikat = "C (Cukup)";
        } else if (r.rata_rata >= 60) {
          predikat = "D (Perlu Bimbingan)";
        } else {
          predikat = "E (Sangat Kurang)";
        }
      }

      return {
        No: idx + 1,
        NIS: r.nis || "",
        "Nama Siswa": r.nama || "",
        "Jumlah Penilaian": r.jumlah_penilaian || 0,
        "Nilai Terendah": r.nilai_min ? Number.parseFloat(r.nilai_min) : "-",
        "Nilai Tertinggi": r.nilai_max_nilai
          ? Number.parseFloat(r.nilai_max_nilai)
          : "-",
        "Rata-Rata": rata === "-" ? "-" : Number.parseFloat(rata),
        Predikat: predikat,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    const sheetName = "Rekap Nilai";
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const namaKelas = kelasInfo
      ? kelasInfo.nama_kelas.replace(/\s+/g, "_")
      : "Kelas";
    const namaMapel = mapelInfo ? mapelInfo.nama.replace(/\s+/g, "_") : "Mapel";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Rekap_Nilai_${namaKelas}_${namaMapel}.xlsx"`
    );
    res.send(buffer);
  } catch (err) {
    console.error("Error exporting rekap to Excel:", err);
    req.flash("error", "Gagal mengeksport rekap nilai ke Excel.");
    res.redirect("/penilaian/rekap");
  }
});

module.exports = router;
