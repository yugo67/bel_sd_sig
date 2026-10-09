/* ============================================
   Bel Sekolah SD SIG - Main JavaScript
   ============================================ */

// ========================================
// JAM DIGITAL REAL-TIME
// ========================================
function updateClock() {
  const now = new Date();
  const hariNama = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
  ];
  const bulanNama = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  const jam = String(now.getHours()).padStart(2, "0");
  const menit = String(now.getMinutes()).padStart(2, "0");
  const detik = String(now.getSeconds()).padStart(2, "0");
  const timeStr = `${jam}:${menit}:${detik}`;

  const hari = hariNama[now.getDay()];
  const tgl = now.getDate();
  const bulan = bulanNama[now.getMonth()];
  const tahun = now.getFullYear();

  // Topbar clock
  const topbarClock = document.getElementById("clockDisplay");
  if (topbarClock) {
    topbarClock.textContent = timeStr;
  }

  // Hero clock
  const heroClock = document.getElementById("clockHero");
  if (heroClock) {
    heroClock.textContent = timeStr;
  }

  const heroDate = document.getElementById("dateHero");
  if (heroDate) {
    heroDate.textContent = `${tgl} ${bulan} ${tahun}`;
  }

  const heroHari = document.getElementById("hariHero");
  if (heroHari) {
    heroHari.textContent = hari;
  }
}

updateClock();
setInterval(updateClock, 1000);

// ========================================
// SIDEBAR TOGGLE & ANIMATION
// ========================================
const sidebar = document.getElementById("sidebar");
const mainWrapper = document.getElementById("mainWrapper");
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebarClose = document.getElementById("sidebarClose");
const sidebarOverlay = document.getElementById("sidebarOverlay");

// Pulihkan state collapsed pada layar desktop dari localStorage
if (window.innerWidth >= 992) {
  const isCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
  if (isCollapsed) {
    document.body.classList.add("sidebar-collapsed");
  }
}

function toggleSidebar() {
  if (window.innerWidth < 992) {
    // Mode Mobile: Slide In / Out
    if (sidebar && sidebar.classList.contains("open")) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
  } else {
    // Mode Desktop: Toggle Collapse (Animasi Buka-Tutup)
    document.body.classList.toggle("sidebar-collapsed");
    const isNowCollapsed = document.body.classList.contains("sidebar-collapsed");
    localStorage.setItem("sidebarCollapsed", isNowCollapsed ? "true" : "false");
  }
}

function openMobileSidebar() {
  if (sidebar) {
    sidebar.classList.add("open");
  }
  if (sidebarOverlay) {
    sidebarOverlay.classList.add("show");
  }
  document.body.style.overflow = "hidden";
}

function closeMobileSidebar() {
  if (sidebar) {
    sidebar.classList.remove("open");
  }
  if (sidebarOverlay) {
    sidebarOverlay.classList.remove("show");
  }
  document.body.style.overflow = "";
}

if (sidebarToggle) {
  sidebarToggle.addEventListener("click", toggleSidebar);
}

if (sidebarClose) {
  sidebarClose.addEventListener("click", closeMobileSidebar);
}
if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", closeMobileSidebar);
}

// Auto-close sidebar pada mobile ketika link menu diklik
document.querySelectorAll(".sidebar-menu a").forEach((link) => {
  link.addEventListener("click", () => {
    if (window.innerWidth < 992) {
      closeMobileSidebar();
    }
  });
});

// ========================================
// SERVER-SENT EVENTS (SSE) - BEL REAL-TIME
// ========================================
const belAudio = document.getElementById("belAudio");
const belToastEl = document.getElementById("belToast");
const belToastBody = document.getElementById("belToastBody");
let belToast = null;

if (belToastEl) {
  belToast = new bootstrap.Toast(belToastEl, { autohide: false });
}

function connectSSE() {
  const evtSource = new EventSource("/sse/bel");

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "bel") {
        // Mainkan suara bel
        if (data.jadwal && data.jadwal.filepath_suara && belAudio) {
          belAudio.src = data.jadwal.filepath_suara;
          belAudio.play().catch(() => {
            // Autoplay mungkin diblokir, tampilkan notifikasi saja
          });
        }

        // Tampilkan toast notifikasi
        if (belToastBody) {
          belToastBody.innerHTML = `
            <div class="d-flex align-items-center gap-2">
              <span class="fs-4">🔔</span>
              <div>
                <strong>${data.jadwal.nama}</strong><br>
                <small>Waktu: ${data.jadwal.waktu ? data.jadwal.waktu.slice(0, 5) : new Date(data.waktu).toLocaleTimeString("id-ID")}</small>
              </div>
            </div>`;
        }
        if (belToast) {
          belToast.show();
        }

        // Animasi body
        document.body.style.transition = "background 0.2s";
        document.body.style.background = "rgba(245,158,11,0.05)";
        setTimeout(() => {
          document.body.style.background = "";
        }, 500);
      }
    } catch (e) {
      // Ignore parse errors
    }
  };

  evtSource.onerror = () => {
    // Reconnect setelah 5 detik
    evtSource.close();
    setTimeout(connectSSE, 5000);
  };
}

connectSSE();

// ========================================
// MODAL BEL MANUAL - Load suara bel via API
// ========================================
const modalBelManual = document.getElementById("modalBelManual");
if (modalBelManual) {
  modalBelManual.addEventListener("show.bs.modal", async () => {
    try {
      const resp = await fetch("/bel/api/jadwal-aktif");
      // Ambil suara bel tersedia
      const sbResp = await fetch("/bel/api/jadwal-aktif");
    } catch {
      /* ignore */
    }
  });

  document
    .getElementById("manualSuaraBelId")
    ?.addEventListener("change", function () {
      const option = this.selectedOptions[0];
      const preview = document.getElementById("belManualPreview");
      const previewAudio = document.getElementById("previewAudio");

      if (option && option.dataset.filepath) {
        if (previewAudio) {
          previewAudio.src = option.dataset.filepath;
        }
        if (preview) {
          preview.classList.remove("d-none");
        }
      } else if (preview) {
        preview.classList.add("d-none");
      }
    });

  document
    .getElementById("btnBunyikanBel")
    ?.addEventListener("click", async () => {
      const suaraId = document.getElementById("manualSuaraBelId")?.value;
      const keterangan = document.getElementById("manualKeterangan")?.value;

      try {
        const resp = await fetch("/dashboard/bel-manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            suara_bel_id: suaraId || null,
            keterangan: keterangan || "Bel manual",
          }),
        });
        const data = await resp.json();
        if (data.success) {
          bootstrap.Modal.getInstance(modalBelManual)?.hide();
        }
      } catch (err) {
        alert("Gagal membunyikan bel");
      }
    });
}

// ========================================
// AUTO DISMISS ALERTS
// ========================================
setTimeout(() => {
  document
    .querySelectorAll(".alert.alert-success, .alert.alert-danger")
    .forEach((alert) => {
      const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
      bsAlert.close();
    });
}, 5000);
