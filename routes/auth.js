const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../config/db");

// GET /auth/login
router.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  res.render("auth/login", {
    title: "Login - Bel Sekolah SD SIG",
    layout: "layouts/auth",
  });
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.query(
      "SELECT * FROM users WHERE username = ? AND aktif = 1",
      [username]
    );

    if (rows.length === 0) {
      req.flash("error", "Username atau password salah!");
      return res.redirect("/auth/login");
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      req.flash("error", "Username atau password salah!");
      return res.redirect("/auth/login");
    }

    req.session.user = {
      id: user.id,
      nama: user.nama,
      username: user.username,
      role: user.role,
      nip: user.nip,
      foto: user.foto,
    };

    req.flash("success", `Selamat datang, ${user.nama}!`);
    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    req.flash("error", "Terjadi kesalahan sistem. Coba lagi.");
    res.redirect("/auth/login");
  }
});

// GET /auth/logout
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/auth/login");
  });
});

module.exports = router;
