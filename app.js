require("dotenv").config();
const express = require("express");
const ejsMate = require("ejs-mate");
const session = require("express-session");
const flash = require("connect-flash");
const methodOverride = require("method-override");
const path = require("path");

const app = express();

// Import routes
const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const belRoutes = require("./routes/bel");
const usersRoutes = require("./routes/users");
const absensiRoutes = require("./routes/absensi");
const jurnalRoutes = require("./routes/jurnal");
const penilaianRoutes = require("./routes/penilaian");
const siswaRoutes = require("./routes/siswa");
const jadwalPelajaranRoutes = require("./routes/jadwalPelajaran");
const kelasRoutes = require("./routes/kelas");

// Import scheduler & SSE
const {
  loadAndScheduleBells,
  sseClients,
  notifyClients,
} = require("./services/scheduler");

// ========== VIEW ENGINE ==========
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ========== MIDDLEWARE ==========
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));
app.use(methodOverride("_method"));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "sd_sig_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000, // 1 hari
    },
  })
);
app.use(flash());

// Global template variables
app.use((req, res, next) => {
  res.locals.successMsg = req.flash("success");
  res.locals.errorMsg = req.flash("error");
  res.locals.user = req.session.user || null;
  res.locals.appName = "Bel Sekolah SD SIG";
  res.locals.year = new Date().getFullYear();
  next();
});

// ========== ROUTES ==========
app.get("/", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  res.redirect("/auth/login");
});

app.use("/auth", authRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/bel", belRoutes);
app.use("/users", usersRoutes);
app.use("/absensi", absensiRoutes);
app.use("/jurnal", jurnalRoutes);
app.use("/penilaian", penilaianRoutes);
app.use("/siswa", siswaRoutes);
app.use("/jadwal-pelajaran", jadwalPelajaranRoutes);
app.use("/kelas", kelasRoutes);

// ========== SSE - Server-Sent Events untuk notifikasi bel real-time ==========
app.get("/sse/bel", (req, res) => {
  if (!req.session.user) {
    return res.status(401).end();
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write('data: {"type":"connected"}\n\n');

  sseClients.add(res);

  // Heartbeat setiap 30 detik agar koneksi tidak putus
  const heartbeat = setInterval(() => {
    try {
      res.write(":heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 30_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// API: Reload scheduler setelah perubahan jadwal
app.post("/api/reload-scheduler", async (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Akses ditolak." });
  }
  const { reloadScheduler } = require("./services/scheduler");
  const count = await reloadScheduler();
  res.json({
    success: true,
    message: `Scheduler diperbarui. ${count} jadwal aktif.`,
  });
});

// ========== ERROR HANDLER ==========
app.use((req, res) => {
  res.status(404).render("errors/404", {
    title: "Halaman Tidak Ditemukan",
    layout: "layouts/main",
    user: req.session.user || null,
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render("errors/500", {
    title: "Terjadi Kesalahan",
    layout: "layouts/main",
    user: req.session.user || null,
    error: err.message,
  });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log("=".repeat(50));
  console.log("  🔔 Bel Sekolah SD SIG");
  console.log(`  📡 Server berjalan di: http://localhost:${PORT}`);
  console.log("  👤 Login Admin: admin / admin123");
  console.log("  👤 Login Guru : guru / admin123");
  console.log("=".repeat(50));

  // Cek koneksi database & muat jadwal bel
  try {
    const db = require("./config/db");
    await db.query("SELECT 1");
    console.log("  ✅ Koneksi database MySQL berhasil.");
    await loadAndScheduleBells();
  } catch (err) {
    console.error("  ❌ [DATABASE ERROR] Gagal terhubung ke database MySQL!");
    console.error(`     Pesan: ${err.message}`);
    console.error("     💡 Solusi:");
    console.error("        1. Pastikan Service MySQL / MariaDB / XAMPP / Laragon sudah di-START.");
    console.error("        2. Jika database belum dibuat, jalankan: npm run db:init");
  }
});

module.exports = app;
