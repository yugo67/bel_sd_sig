const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function initDatabase() {
  console.log("🔄 Memulai inisialisasi database MySQL SD SIG...");
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      multipleStatements: true,
    });

    console.log("✅ Terhubung ke MySQL server");

    const schemaSql = fs.readFileSync(
      path.join(__dirname, "schema.sql"),
      "utf8"
    );
    await connection.query(schemaSql);

    console.log("✅ Database `sd_sig_bel` & tabel berhasil diinisialisasi!");
    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Gagal inisialisasi database:", error);
    process.exit(1);
  }
}

initDatabase();
