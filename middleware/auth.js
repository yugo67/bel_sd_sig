// Middleware: Pastikan user sudah login
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  req.flash("error", "Silakan login terlebih dahulu.");
  res.redirect("/auth/login");
};

// Middleware: Pastikan user adalah Admin
const isAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === "admin") {
    return next();
  }
  req.flash("error", "Akses ditolak. Halaman ini hanya untuk Admin.");
  res.redirect("/dashboard");
};

// Middleware: Pastikan user adalah Guru atau Admin
const isGuruOrAdmin = (req, res, next) => {
  if (
    req.session &&
    req.session.user &&
    ["admin", "guru"].includes(req.session.user.role)
  ) {
    return next();
  }
  req.flash("error", "Akses ditolak.");
  res.redirect("/auth/login");
};

module.exports = { isAuthenticated, isAdmin, isGuruOrAdmin };
