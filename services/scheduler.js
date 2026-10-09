const cron = require("node-cron");
const db = require("../config/db");

// Map untuk menyimpan task cron yang sedang berjalan
const activeCronTasks = new Map();
// SSE clients yang terhubung
const sseClients = new Set();

// Fungsi untuk mengirim notifikasi ke semua SSE client
const notifyClients = (data) => {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
};

// Fungsi untuk menghapus semua cron tasks
const clearAllTasks = () => {
  for (const [id, task] of activeCronTasks) {
    task.destroy();
    activeCronTasks.delete(id);
  }
};

// Daftar hari dalam bahasa Indonesia ke angka cron (0=Minggu)
const hariToCron = {
  minggu: "0",
  senin: "1",
  selasa: "2",
  rabu: "3",
  kamis: "4",
  jumat: "5",
  sabtu: "6",
};

// Load dan jadwalkan semua bel aktif dari database
const loadAndScheduleBells = async () => {
  try {
    clearAllTasks();

    const [jadwalList] = await db.query(
      `SELECT jb.*, sb.filename as filename_suara, sb.filepath as filepath_suara, sb.nama as nama_suara
       FROM jadwal_bel jb
       LEFT JOIN suara_bel sb ON jb.suara_bel_id = sb.id
       WHERE jb.aktif = 1`
    );

    for (const jadwal of jadwalList) {
      const hari =
        typeof jadwal.hari === "string" ? JSON.parse(jadwal.hari) : jadwal.hari;
      const [jam, menit] = jadwal.waktu.split(":");
      const hariCron = hari
        .map((h) => hariToCron[h.toLowerCase()])
        .filter(Boolean)
        .join(",");

      if (!hariCron) {
        continue;
      }

      const cronExpression = `${menit} ${jam} * * ${hariCron}`;

      try {
        const task = cron.schedule(
          cronExpression,
          async () => {
            console.log(
              `[BEL] ${new Date().toLocaleString("id-ID")} - Membunyikan: ${jadwal.nama}`
            );

            // Log ke database
            try {
              await db.query(
                `INSERT INTO log_bel (jadwal_bel_id, nama_jadwal, waktu_bunyi, tipe, suara_bel_id)
               VALUES (?, ?, NOW(), 'otomatis', ?)`,
                [jadwal.id, jadwal.nama, jadwal.suara_bel_id || null]
              );
            } catch (logErr) {
              console.error("[BEL] Gagal menyimpan log bel:", logErr.message);
            }

            // Notifikasi ke semua browser yang terhubung via SSE
            notifyClients({
              type: "bel",
              jadwal: {
                id: jadwal.id,
                nama: jadwal.nama,
                waktu: jadwal.waktu,
                filepath_suara: jadwal.filepath_suara,
                nama_suara: jadwal.nama_suara,
              },
              waktu: new Date().toISOString(),
            });
          },
          {
            timezone: "Asia/Jakarta",
          }
        );

        activeCronTasks.set(jadwal.id, task);
        console.log(
          `[BEL SCHEDULER] Jadwal "${jadwal.nama}" (${jadwal.waktu}) dijadwalkan - Cron: ${cronExpression}`
        );
      } catch (cronErr) {
        console.error(
          `[BEL SCHEDULER] Gagal menjadwalkan "${jadwal.nama}":`,
          cronErr.message
        );
      }
    }

    console.log(
      `[BEL SCHEDULER] ${activeCronTasks.size} jadwal bel aktif dimuat.`
    );
    return activeCronTasks.size;
  } catch (err) {
    console.error("[BEL SCHEDULER] Gagal memuat jadwal:", err.message);
    return 0;
  }
};

// Reload scheduler (dipanggil setelah perubahan jadwal)
const reloadScheduler = async () => {
  console.log("[BEL SCHEDULER] Memuat ulang jadwal bel...");
  const count = await loadAndScheduleBells();
  notifyClients({ type: "scheduler_reloaded", count });
  return count;
};

module.exports = {
  loadAndScheduleBells,
  reloadScheduler,
  notifyClients,
  sseClients,
};
