/**
 * @fileoverview OurFinance PWA — Entry Point
 *
 * Arsitektur: Single Page Application (SPA) berbasis Vanilla JS.
 * Berkomunikasi dengan Google Apps Script (GAS) sebagai REST API
 * dan Google Sheets sebagai database.
 *
 * Modul yang terdapat di file ini:
 *  - Konfigurasi & Konstanta
 *  - Navigasi Tab
 *  - UI Utilities (Toast, Loading, Currency Masking, formatRupiah)
 *  - API & Network Layer (fetchWithTimeout, apiFetch, fetchDashboard, fetchHistory, postTransaksi)
 *  - Modul Dashboard (loadDashboard, renderDashboard)
 *  - Modul Form Transaksi (initForm, updateKategori, validateForm, collectFormData, handleSubmit, resetForm)
 *  - Modul History (loadHistory, renderHistory, createHistoryItem)
 *  - Inisialisasi Aplikasi (initApp)
 */

"use strict";

// ============================================================
// TASK 4.1 — KONFIGURASI
// ============================================================

/**
 * Konfigurasi global aplikasi OurFinance.
 * Ganti GAS_URL dengan URL deploy Google Apps Script Anda.
 * Ganti NAMA_USERS dengan nama pasangan yang sebenarnya.
 *
 * @type {{
 *   GAS_URL: string,
 *   NAMA_USERS: string[],
 *   KATEGORI: Record<string, string[]>
 * }}
 */
const CONFIG = {
  GAS_URL: "https://script.google.com/macros/s/AKfycbxtbAFUYo4FPqqKSXBAFrFqI6APWwLGSGtHfDNL7NnyDOoXUaShLYynZiLyswEFY0aa/exec",

  /** Daftar nama penginput — disesuaikan untuk Ival & Nurul. */
  NAMA_USERS: ["Ival", "Nurul"],

  /**
   * Mapping kategori per jenis transaksi.
   * Digunakan untuk populate dropdown kategori secara dinamis.
   */
  KATEGORI: {
    Pemasukan: ["Gaji", "Sampingan", "Bonus", "Lainnya"],
    Pengeluaran: ["Makan/Minum", "Kencan", "Transportasi", "Belanja", "Tagihan", "Lainnya"],
    Tabungan: ["Investasi", "Dana Darurat", "Tabungan Liburan", "Lainnya"],
  },
};

// ============================================================
// TASK 5.1 — UI UTILITY: formatRupiah
// ============================================================

/**
 * Format angka menjadi string mata uang Rupiah Indonesia.
 *
 * @param {number} nominal - Angka yang akan diformat (contoh: 1500000)
 * @returns {string} String berformat Rupiah (contoh: "Rp 1.500.000")
 *
 * @example
 * formatRupiah(1500000); // "Rp 1.500.000"
 * formatRupiah(0);       // "Rp 0"
 */
function formatRupiah(nominal) {
  if (typeof nominal !== "number" || isNaN(nominal)) {
    return "Rp 0";
  }
  return "Rp " + nominal.toLocaleString("id-ID");
}

// ============================================================
// TASK 5.2 — UI UTILITY: showToast
// ============================================================

/**
 * Tampilkan notifikasi toast sementara yang auto-dismiss setelah 3 detik.
 *
 * @param {string} message - Pesan yang ditampilkan di dalam toast.
 * @param {'success'|'error'|'info'} [type='success'] - Jenis toast (menentukan warna).
 *   - 'success' → hijau (primary-500)
 *   - 'error'   → merah (red-500)
 *   - 'info'    → abu / biru (gray-700)
 */
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  // Tentukan kelas warna berdasarkan tipe
  const colorMap = {
    success: "bg-primary-500 text-white",
    error: "bg-red-500 text-white",
    info: "bg-gray-700 text-white",
  };
  const colorClass = colorMap[type] || colorMap.info;

  // Buat elemen toast
  const toast = document.createElement("div");
  toast.className = [
    "pointer-events-auto",
    "flex items-center gap-3",
    "px-4 py-3 rounded-xl shadow-lg",
    "text-sm font-medium",
    "transition-all duration-300 ease-in-out",
    "opacity-0 translate-y-2",
    colorClass,
  ].join(" ");

  // Ikon per tipe
  const iconMap = {
    success: "✓",
    error: "✕",
    info: "ℹ",
  };
  const icon = iconMap[type] || iconMap.info;

  toast.innerHTML = `<span class="shrink-0 font-bold">${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  // Animasi masuk (trigger setelah satu frame)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.remove("opacity-0", "translate-y-2");
      toast.classList.add("opacity-100", "translate-y-0");
    });
  });

  // Auto-dismiss setelah 3 detik
  setTimeout(() => {
    toast.classList.remove("opacity-100", "translate-y-0");
    toast.classList.add("opacity-0", "translate-y-2");
    // Hapus dari DOM setelah animasi selesai (300 ms)
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

// ============================================================
// TASK 5.3 — UI UTILITY: setLoadingState
// ============================================================

/**
 * Toggle visibilitas tombol Simpan dan spinner loading.
 * Saat loading = true: tombol dinonaktifkan, teks disembunyikan, spinner tampil.
 * Saat loading = false: kondisi normal dikembalikan.
 *
 * @param {boolean} isLoading - `true` untuk menampilkan loading state.
 */
function setLoadingState(isLoading) {
  const btnSimpan = document.getElementById("btn-simpan");
  const btnText = document.getElementById("btn-simpan-text");
  const spinner = document.getElementById("spinner-loading");

  if (!btnSimpan || !btnText || !spinner) return;

  if (isLoading) {
    btnSimpan.disabled = true;
    btnSimpan.classList.add("opacity-75", "cursor-not-allowed");
    spinner.classList.remove("hidden");
    btnText.textContent = "Menyimpan...";
  } else {
    btnSimpan.disabled = false;
    btnSimpan.classList.remove("opacity-75", "cursor-not-allowed");
    spinner.classList.add("hidden");
    btnText.textContent = "Simpan Transaksi";
  }
}

// ============================================================
// TASK 5.4 — UI UTILITY: handleCurrencyInput
// ============================================================

/**
 * Currency masking untuk field input nominal.
 * Menghapus semua karakter non-angka, memformat dengan pemisah ribuan (id-ID),
 * dan menyimpan nilai mentah (integer) di `dataset.rawValue`.
 *
 * Algoritma:
 *  1. Ambil nilai dari input
 *  2. Hapus semua karakter selain angka (0-9)
 *  3. Parse menjadi integer
 *  4. Format dengan toLocaleString("id-ID")
 *  5. Set kembali ke input.value dan simpan angka murni di dataset.rawValue
 *
 * @param {Event} event - Input event dari elemen <input id="input-nominal">
 */
function handleCurrencyInput(event) {
  const input = event.target;
  const rawValue = input.value;

  // Langkah 1: Hapus semua karakter selain digit
  const digitsOnly = rawValue.replace(/[^0-9]/g, "");

  if (digitsOnly === "") {
    input.value = "";
    input.dataset.rawValue = "";
    return;
  }

  // Langkah 2: Konversi ke integer
  const numericValue = parseInt(digitsOnly, 10);

  // Langkah 3: Format sebagai angka Rupiah (tanpa simbol "Rp")
  const formatted = numericValue.toLocaleString("id-ID");

  // Langkah 4: Update input dan simpan raw value
  input.value = formatted;
  input.dataset.rawValue = String(numericValue);
}

// ============================================================
// TASK 6.1 — API: fetchWithTimeout
// ============================================================

/**
 * Wrapper Fetch API dengan dukungan timeout menggunakan `AbortController`.
 * Jika request melebihi `timeoutMs`, request dibatalkan dan melempar Error("TIMEOUT").
 *
 * @param {string} url - URL endpoint yang dituju.
 * @param {RequestInit} [options={}] - Opsi fetch standar (method, headers, body, dll).
 * @param {number} [timeoutMs=10000] - Batas waktu dalam milidetik (default: 10 detik).
 * @returns {Promise<Response>} Response dari fetch.
 * @throws {Error} Error dengan message "TIMEOUT" jika melebihi batas waktu.
 * @throws {Error} Error jaringan jika tidak ada koneksi internet.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// TASK 6.2 — API: apiFetch
// ============================================================

/**
 * Wrapper fetch tingkat tinggi untuk semua panggilan ke GAS.
 * Menangani:
 *  - Timeout (melempar error dengan message "TIMEOUT")
 *  - Network error (tidak ada koneksi internet)
 *  - HTTP error (status non-2xx)
 *  - Parsing JSON
 *
 * @param {string} url - URL lengkap termasuk query string jika GET.
 * @param {RequestInit} [options={}] - Opsi fetch.
 * @returns {Promise<object>} Objek JSON yang di-parse dari response body.
 * @throws {Error} Dengan message "TIMEOUT", "NETWORK_ERROR", atau pesan error lainnya.
 */
async function apiFetch(url, options = {}) {
  let response;

  try {
    response = await fetchWithTimeout(url, options, 10000);
  } catch (error) {
    if (error.message === "TIMEOUT") {
      throw new Error("TIMEOUT");
    }
    // Error jaringan (fetch gagal sebelum menerima respons)
    throw new Error("NETWORK_ERROR");
  }

  // Parse JSON (GAS selalu mengembalikan JSON)
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Respons server tidak valid (bukan JSON).");
  }

  return data;
}

// ============================================================
// TASK 6.3 — API: fetchDashboard
// ============================================================

/**
 * Ambil data ringkasan keuangan dari endpoint GAS (action=getDashboard).
 *
 * @returns {Promise<{
 *   totalPemasukan: number,
 *   totalPengeluaran: number,
 *   totalTabungan: number,
 *   saldoEfektif: number,
 *   pengeluaranBulanIni: number
 * }>} Objek data dashboard.
 * @throws {Error} Jika request gagal atau GAS mengembalikan status error.
 */
async function fetchDashboard() {
  const url = `${CONFIG.GAS_URL}?action=getDashboard`;
  const result = await apiFetch(url);

  if (result.status === "error") {
    throw new Error(result.message || "Gagal mengambil data dashboard.");
  }

  return result.data;
}

// ============================================================
// TASK 6.4 — API: fetchHistory
// ============================================================

/**
 * Ambil 10 transaksi terakhir dari endpoint GAS (action=getHistory).
 *
 * @returns {Promise<Array<{
 *   tanggal: string,
 *   nama: string,
 *   jenis: string,
 *   kategori: string,
 *   nominal: number,
 *   catatan: string
 * }>>} Array transaksi (terbaru di indeks 0).
 * @throws {Error} Jika request gagal atau GAS mengembalikan status error.
 */
async function fetchHistory() {
  const url = `${CONFIG.GAS_URL}?action=getHistory`;
  const result = await apiFetch(url);

  if (result.status === "error") {
    throw new Error(result.message || "Gagal mengambil data history.");
  }

  return result.data || result.transactions || [];
}

// ============================================================
// TASK 6.5 — API: postTransaksi
// ============================================================

/**
 * Kirim data transaksi baru ke GAS via HTTP POST dengan payload JSON.
 *
 * @param {{
 *   nama: string,
 *   jenis: string,
 *   kategori: string,
 *   nominal: number,
 *   catatan: string,
 *   tanggal: string
 * }} transaksiData - Data transaksi tanpa timestamp (diisi server).
 * @returns {Promise<{ status: string, message: string }>} Respons dari GAS.
 * @throws {Error} Jika request gagal.
 */
async function postTransaksi(transaksiData) {
  const result = await apiFetch(CONFIG.GAS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain", // GAS tidak menerima application/json dengan CORS
    },
    body: JSON.stringify(transaksiData),
  });

  return result;
}

// ============================================================
// TASK 4.2 — NAVIGASI: initNavigation
// ============================================================

/**
 * Inisialisasi event listener untuk navigasi bottom tab.
 * Setiap tombol tab sudah memiliki onclick handler di HTML (switchTab),
 * fungsi ini menangani inisialisasi tambahan jika diperlukan,
 * termasuk update atribut aria-selected secara sinkron.
 */
function initNavigation() {
  // Tombol tab sudah memiliki onclick="switchTab(...)" di HTML.
  // Tidak ada event listener tambahan yang perlu dipasang di sini.
  // Fungsi ini sengaja ringan agar inisialisasi tidak duplikat.
  console.log("[Nav] Navigation initialized.");
}

// ============================================================
// TASK 4.3 — NAVIGASI: switchTab
// ============================================================

/**
 * Pindah ke tab yang ditentukan:
 * 1. Sembunyikan semua section (dashboard, form, history)
 * 2. Tampilkan section yang sesuai dengan tabId
 * 3. Update active state (aria-selected + style) pada tombol navigasi
 *
 * @param {'dashboard'|'form'|'history'} tabId - ID tab yang akan ditampilkan.
 */
function switchTab(tabId) {
  const tabs = ["dashboard", "form", "history"];

  // Sembunyikan semua section
  tabs.forEach((id) => {
    const section = document.getElementById(`section-${id}`);
    if (section) {
      section.classList.add("hidden");
    }
  });

  // Tampilkan section yang aktif
  const activeSection = document.getElementById(`section-${tabId}`);
  if (activeSection) {
    activeSection.classList.remove("hidden");
  }

  // Update state tombol navigasi
  tabs.forEach((id) => {
    const btn = document.getElementById(`btn-tab-${id}`);
    if (!btn) return;

    if (id === tabId) {
      // Tombol aktif
      btn.setAttribute("aria-selected", "true");
      btn.classList.remove("text-gray-400");
      btn.classList.add("text-primary-500");
    } else {
      // Tombol tidak aktif
      btn.setAttribute("aria-selected", "false");
      btn.classList.remove("text-primary-500");
      btn.classList.add("text-gray-400");
    }
  });
}

// ============================================================
// TASK 7.1 — DASHBOARD: loadDashboard
// ============================================================

/**
 * Ambil data dashboard dari GAS dan render ke DOM.
 * Dipanggil saat aplikasi pertama kali dimuat dan setelah transaksi berhasil disimpan.
 * Error ditangkap dan ditampilkan sebagai Toast, antarmuka tetap terjaga.
 *
 * @returns {Promise<void>}
 */
async function loadDashboard() {
  try {
    const data = await fetchDashboard();
    renderDashboard(data);
  } catch (error) {
    if (error.message === "TIMEOUT") {
      showToast("Server lambat merespons. Coba lagi.", "error");
    } else if (error.message === "NETWORK_ERROR") {
      showToast("Tidak ada koneksi internet. Coba lagi.", "error");
    } else {
      showToast(error.message || "Gagal memuat data dashboard.", "error");
    }
    console.error("[Dashboard] loadDashboard error:", error);
  }
}

// ============================================================
// TASK 7.2 — DASHBOARD: renderDashboard
// ============================================================

/**
 * Render data dashboard ke elemen-elemen DOM widget.
 * Update nilai Saldo Efektif, Total Tabungan, dan Pengeluaran Bulan Ini.
 *
 * Struktur HTML yang diharapkan:
 *  - #widget-saldo        → cari <p data-value> untuk update teks
 *  - #widget-tabungan     → cari <p data-value> untuk update teks
 *  - #widget-pengeluaran-bulan → cari <p data-value> untuk update teks
 *
 * @param {{
 *   saldoEfektif: number,
 *   totalTabungan: number,
 *   pengeluaranBulanIni: number
 * }} data - Objek data dashboard dari API.
 */
function renderDashboard(data) {
  if (!data) return;

  // Helper: update elemen [data-value] di dalam widget
  const updateWidget = (widgetId, value) => {
    const widget = document.getElementById(widgetId);
    if (!widget) return;
    const el = widget.querySelector("[data-value]");
    if (el) {
      el.textContent = formatRupiah(value ?? 0);
    }
  };

  updateWidget("widget-saldo", data.saldoEfektif);
  updateWidget("widget-tabungan", data.totalTabungan);
  updateWidget("widget-pengeluaran-bulan", data.pengeluaranBulanIni);
}

// ============================================================
// TASK 8.1 — FORM: initForm
// ============================================================

/**
 * Inisialisasi semua event listener pada form transaksi:
 *  - Currency masking pada input nominal
 *  - Klik toggle jenis transaksi (jenis-btn)
 *  - Klik toggle penginput (user-btn)
 *  - Submit form
 */
function initForm() {
  // Currency masking pada input nominal
  const inputNominal = document.getElementById("input-nominal");
  if (inputNominal) {
    inputNominal.addEventListener("input", handleCurrencyInput);
  }

  // Toggle jenis transaksi
  const jenisBtns = document.querySelectorAll(".jenis-btn");
  jenisBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const jenis = btn.dataset.jenis;

      // Update aria-pressed dan visual state semua tombol jenis
      jenisBtns.forEach((b) => {
        b.setAttribute("aria-pressed", "false");
        b.classList.remove(
          "border-primary-500", "bg-primary-50", "text-primary-700",
          "border-red-400", "bg-red-50", "text-red-700",
          "border-blue-400", "bg-blue-50", "text-blue-700"
        );
        b.classList.add("border-gray-200", "text-gray-500");
      });

      // Tandai tombol yang dipilih
      btn.setAttribute("aria-pressed", "true");
      btn.classList.remove("border-gray-200", "text-gray-500");

      // Warna aktif berbeda per jenis
      if (jenis === "Pemasukan") {
        btn.classList.add("border-primary-500", "bg-primary-50", "text-primary-700");
      } else if (jenis === "Pengeluaran") {
        btn.classList.add("border-red-400", "bg-red-50", "text-red-700");
      } else if (jenis === "Tabungan") {
        btn.classList.add("border-blue-400", "bg-blue-50", "text-blue-700");
      }

      // Simpan jenis terpilih di dataset form
      const form = document.getElementById("form-transaksi");
      if (form) form.dataset.selectedJenis = jenis;

      // Update dropdown kategori
      updateKategori(jenis);
    });
  });

  // Toggle penginput (user-btn)
  const userBtns = document.querySelectorAll(".user-btn");
  userBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const user = btn.dataset.user;

      // Reset semua tombol user
      userBtns.forEach((b) => {
        b.setAttribute("aria-pressed", "false");
        b.classList.remove("border-primary-500", "bg-primary-50", "text-primary-700");
        b.classList.add("border-gray-200", "text-gray-500");
      });

      // Tandai tombol user yang dipilih
      btn.setAttribute("aria-pressed", "true");
      btn.classList.remove("border-gray-200", "text-gray-500");
      btn.classList.add("border-primary-500", "bg-primary-50", "text-primary-700");

      // Simpan user terpilih di dataset form
      const form = document.getElementById("form-transaksi");
      if (form) form.dataset.selectedUser = user;
    });
  });

  // Submit form
  const form = document.getElementById("form-transaksi");
  if (form) {
    form.addEventListener("submit", handleSubmit);
  }

  console.log("[Form] Form initialized.");
}

// ============================================================
// TASK 8.2 — FORM: updateKategori
// ============================================================

/**
 * Update opsi dropdown kategori secara dinamis berdasarkan jenis transaksi yang dipilih.
 * Mengaktifkan dropdown dan mengisinya dengan opsi yang sesuai dari CONFIG.KATEGORI.
 *
 * @param {'Pemasukan'|'Pengeluaran'|'Tabungan'} jenis - Jenis transaksi yang dipilih.
 */
function updateKategori(jenis) {
  const select = document.getElementById("select-kategori");
  if (!select) return;

  const options = CONFIG.KATEGORI[jenis];

  // Kosongkan dan isi ulang dropdown
  select.innerHTML = "";
  select.disabled = false;

  // Opsi placeholder
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— Pilih kategori —";
  select.appendChild(placeholder);

  if (options && options.length > 0) {
    options.forEach((kategori) => {
      const option = document.createElement("option");
      option.value = kategori;
      option.textContent = kategori;
      select.appendChild(option);
    });
  }

  // Reset ke pilihan default (placeholder)
  select.value = "";
}

// ============================================================
// TASK 8.3 — FORM: validateForm
// ============================================================

/**
 * Validasi semua field wajib pada form transaksi sebelum pengiriman data.
 *
 * Aturan validasi:
 *  1. Nominal harus ada dan lebih dari 0
 *  2. Jenis transaksi harus dipilih (Pemasukan/Pengeluaran/Tabungan)
 *  3. Kategori harus dipilih (tidak boleh kosong)
 *  4. Penginput harus dipilih
 *
 * @returns {{ valid: boolean, errors: string[] }} Objek hasil validasi.
 */
function validateForm() {
  const errors = [];

  // Aturan 1: Nominal > 0
  const inputNominal = document.getElementById("input-nominal");
  const rawValue = inputNominal ? parseInt(inputNominal.dataset.rawValue || "0", 10) : 0;
  if (!rawValue || rawValue <= 0) {
    errors.push("Nominal harus lebih dari 0.");
  }

  // Aturan 2: Jenis transaksi harus dipilih
  const form = document.getElementById("form-transaksi");
  const validJenis = ["Pemasukan", "Pengeluaran", "Tabungan"];
  const selectedJenis = form ? form.dataset.selectedJenis : null;
  if (!selectedJenis || !validJenis.includes(selectedJenis)) {
    errors.push("Jenis transaksi harus dipilih.");
  }

  // Aturan 3: Kategori harus dipilih
  const selectKategori = document.getElementById("select-kategori");
  const selectedKategori = selectKategori ? selectKategori.value : "";
  if (!selectedKategori || selectedKategori === "") {
    errors.push("Kategori harus dipilih.");
  }

  // Aturan 4: Penginput harus dipilih
  const selectedUser = form ? form.dataset.selectedUser : null;
  if (!selectedUser || selectedUser === "") {
    errors.push("Penginput harus dipilih.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================
// TASK 8.4 — FORM: collectFormData
// ============================================================

/**
 * Kumpulkan semua nilai field form menjadi objek transaksi siap kirim ke API.
 *
 * - nominal   : diambil dari `dataset.rawValue` (integer, bukan string berformat)
 * - tanggal   : format DD/MM/YYYY dari tanggal hari ini
 * - jenis     : dari dataset.selectedJenis pada elemen form
 * - kategori  : dari nilai dropdown #select-kategori
 * - nama      : dari dataset.selectedUser pada elemen form
 * - catatan   : dari textarea #input-catatan (boleh kosong)
 *
 * @returns {{
 *   nama: string,
 *   jenis: string,
 *   kategori: string,
 *   nominal: number,
 *   catatan: string,
 *   tanggal: string
 * }} Objek transaksi tanpa timestamp (diisi oleh server).
 */
function collectFormData() {
  const form = document.getElementById("form-transaksi");
  const inputNominal = document.getElementById("input-nominal");
  const selectKategori = document.getElementById("select-kategori");
  const inputCatatan = document.getElementById("input-catatan");

  // Format tanggal hari ini sebagai DD/MM/YYYY
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const tanggal = `${day}/${month}/${year}`;

  return {
    nama: (form && form.dataset.selectedUser) || "",
    jenis: (form && form.dataset.selectedJenis) || "",
    kategori: selectKategori ? selectKategori.value : "",
    nominal: inputNominal ? parseInt(inputNominal.dataset.rawValue || "0", 10) : 0,
    keterangan: inputCatatan ? inputCatatan.value.trim() : "", // Dipetakan ke 'keterangan' sesuai Apps Script
    metode: "", // Metode pembayaran kosong (default)
    status: "Selesai", // Status default selesai
    tanggal,
  };
}

// ============================================================
// TASK 8.5 — FORM: handleSubmit
// ============================================================

/**
 * Handle submit event form transaksi.
 *
 * Alur:
 *  1. preventDefault (cegah reload halaman)
 *  2. Validasi form → jika tidak valid, tampilkan toast error pertama
 *  3. setLoadingState(true) → tampilkan spinner
 *  4. collectFormData() → kumpulkan data
 *  5. postTransaksi(data) → kirim ke GAS
 *  6. Jika sukses: toast sukses, resetForm(), loadDashboard()
 *     Jika error API: toast dengan pesan dari server
 *  7. Tangkap error jaringan/timeout dengan pesan yang sesuai
 *  8. setLoadingState(false) di blok finally
 *
 * @param {Event} event - Submit event dari form.
 * @returns {Promise<void>}
 */
async function handleSubmit(event) {
  event.preventDefault();

  // Langkah 1: Validasi
  const validation = validateForm();
  if (!validation.valid) {
    showToast(validation.errors[0], "error");
    return;
  }

  // Langkah 2: Aktifkan loading
  setLoadingState(true);

  try {
    // Langkah 3: Kumpulkan data
    const transaksiData = collectFormData();

    // Langkah 4: Kirim ke API
    const response = await postTransaksi(transaksiData);

    if (response.status === "success" || response.status === "sukses") {
      showToast("Transaksi berhasil disimpan! ✓", "success");
      resetForm();
      await loadDashboard();
    } else {
      showToast(response.message || "Gagal menyimpan transaksi.", "error");
    }
  } catch (error) {
    if (error.message === "TIMEOUT") {
      showToast("Server lambat merespons. Coba lagi.", "error");
    } else if (error.message === "NETWORK_ERROR") {
      showToast("Tidak ada koneksi internet. Coba lagi.", "error");
    } else {
      showToast("Terjadi kesalahan. Silakan coba lagi.", "error");
      console.error("[Form] handleSubmit error:", error);
    }
  } finally {
    // Langkah 5: Nonaktifkan loading (selalu dijalankan)
    setLoadingState(false);
  }
}

// ============================================================
// TASK 8.6 — FORM: resetForm
// ============================================================

/**
 * Reset semua field form ke nilai default setelah transaksi berhasil disimpan.
 *
 * State default:
 *  - input nominal: kosong, dataset.rawValue = ""
 *  - Semua tombol jenis: tidak ada yang aktif
 *  - Dropdown kategori: disabled, kembali ke placeholder awal
 *  - Semua tombol user: tidak ada yang aktif
 *  - Textarea catatan: kosong
 *  - dataset.selectedJenis dan dataset.selectedUser dihapus
 */
function resetForm() {
  // Reset input nominal
  const inputNominal = document.getElementById("input-nominal");
  if (inputNominal) {
    inputNominal.value = "";
    inputNominal.dataset.rawValue = "";
  }

  // Reset tombol jenis — hapus semua active state
  const jenisBtns = document.querySelectorAll(".jenis-btn");
  jenisBtns.forEach((btn) => {
    btn.setAttribute("aria-pressed", "false");
    btn.classList.remove(
      "border-primary-500", "bg-primary-50", "text-primary-700",
      "border-red-400", "bg-red-50", "text-red-700",
      "border-blue-400", "bg-blue-50", "text-blue-700"
    );
    btn.classList.add("border-gray-200", "text-gray-500");
  });

  // Reset dropdown kategori ke state awal (disabled)
  const selectKategori = document.getElementById("select-kategori");
  if (selectKategori) {
    selectKategori.innerHTML = '<option value="">— Pilih jenis transaksi dulu —</option>';
    selectKategori.disabled = true;
    selectKategori.value = "";
  }

  // Reset tombol user — hapus semua active state
  const userBtns = document.querySelectorAll(".user-btn");
  userBtns.forEach((btn) => {
    btn.setAttribute("aria-pressed", "false");
    btn.classList.remove("border-primary-500", "bg-primary-50", "text-primary-700");
    btn.classList.add("border-gray-200", "text-gray-500");
  });

  // Reset textarea catatan
  const inputCatatan = document.getElementById("input-catatan");
  if (inputCatatan) {
    inputCatatan.value = "";
  }

  // Hapus dataset state dari form
  const form = document.getElementById("form-transaksi");
  if (form) {
    delete form.dataset.selectedJenis;
    delete form.dataset.selectedUser;
  }
}

// ============================================================
// TASK 9.1 — HISTORY: loadHistory
// ============================================================

/**
 * Ambil 10 transaksi terakhir dari GAS dan render ke daftar History.
 * Error ditangkap dan ditampilkan sebagai Toast, daftar tidak dikosongkan saat error.
 *
 * @returns {Promise<void>}
 */
async function loadHistory() {
  try {
    const transactions = await fetchHistory();
    renderHistory(transactions);
  } catch (error) {
    if (error.message === "TIMEOUT") {
      showToast("Server lambat merespons. Coba lagi.", "error");
    } else if (error.message === "NETWORK_ERROR") {
      showToast("Tidak ada koneksi internet. Coba lagi.", "error");
    } else {
      showToast(error.message || "Gagal memuat riwayat transaksi.", "error");
    }
    console.error("[History] loadHistory error:", error);
  }
}

// ============================================================
// TASK 9.2 — HISTORY: renderHistory
// ============================================================

/**
 * Render daftar transaksi ke elemen `#list-history`.
 * Mengosongkan isi list terlebih dahulu, lalu mengisi ulang dari array transaksi.
 * Jika array kosong, tampilkan pesan "Belum ada transaksi".
 *
 * @param {Array<{
 *   tanggal: string,
 *   nama: string,
 *   jenis: string,
 *   kategori: string,
 *   nominal: number,
 *   catatan: string
 * }>} transactions - Array transaksi (terbaru di indeks 0).
 */
function renderHistory(transactions) {
  const list = document.getElementById("list-history");
  if (!list) return;

  // Kosongkan list
  list.innerHTML = "";

  if (!transactions || transactions.length === 0) {
    list.innerHTML = `
      <li class="text-center text-gray-400 text-sm py-10">
        <div class="text-4xl mb-2">📋</div>
        <p>Belum ada transaksi tercatat.</p>
      </li>`;
    return;
  }

  // Isi ulang dengan item-item transaksi
  transactions.forEach((tx) => {
    const item = createHistoryItem(tx);
    list.appendChild(item);
  });
}

// ============================================================
// TASK 9.3 — HISTORY: createHistoryItem
// ============================================================

/**
 * Buat satu elemen DOM `<li>` untuk satu item transaksi di daftar History.
 *
 * Tampilan:
 *  - Badge jenis: hijau untuk Pemasukan/Tabungan, merah untuk Pengeluaran
 *  - Informasi: tanggal, nama penginput, jenis, kategori, nominal (format Rupiah), catatan
 *
 * @param {{
 *   tanggal: string,
 *   nama: string,
 *   jenis: string,
 *   kategori: string,
 *   nominal: number,
 *   catatan?: string
 * }} tx - Data satu transaksi.
 * @returns {HTMLLIElement} Elemen `<li>` yang sudah diisi konten transaksi.
 */
function createHistoryItem(tx) {
  const isIncome = tx.jenis === "Pemasukan" || tx.jenis === "Tabungan";

  // Warna badge dan nominal berdasarkan jenis
  const badgeClass = isIncome
    ? "bg-green-100 text-green-700 border border-green-200"
    : "bg-red-100 text-red-600 border border-red-200";

  const nominalClass = isIncome ? "text-green-600 font-bold" : "text-red-500 font-bold";
  const nominalPrefix = isIncome ? "+" : "−";

  // Emoji per jenis
  const emojiMap = {
    Pemasukan: "💰",
    Pengeluaran: "🛍️",
    Tabungan: "🏦",
  };
  const emoji = emojiMap[tx.jenis] || "📝";

  const li = document.createElement("li");
  li.className =
    "bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-start gap-3";

  // Struktur item dengan tombol hapus (trash bin icon)
  li.innerHTML = `
    <div class="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl ${isIncome ? "bg-green-50" : "bg-red-50"} text-xl" aria-hidden="true">
      ${emoji}
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-xs px-2 py-0.5 rounded-full font-semibold ${badgeClass}">${tx.jenis}</span>
          <span class="text-xs text-gray-500 font-medium">${tx.kategori || "—"}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="${nominalClass} text-sm shrink-0">${nominalPrefix}${formatRupiah(tx.nominal ?? 0)}</span>
          <button type="button" class="delete-btn text-gray-300 hover:text-red-500 p-1.5 rounded-lg transition-colors" aria-label="Hapus transaksi">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="mt-1.5 flex items-center gap-2 flex-wrap">
        <span class="text-xs text-gray-400">${tx.tanggal || "—"}</span>
        <span class="text-gray-300 text-xs">•</span>
        <span class="text-xs text-gray-500 font-medium">${tx.nama || "—"}</span>
      </div>
      ${
        tx.catatan
          ? `<p class="mt-1 text-xs text-gray-400 truncate" title="${tx.catatan}">${tx.catatan}</p>`
          : ""
      }
    </div>
  `;

  // Pasang event listener pada tombol hapus
  const deleteBtn = li.querySelector(".delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const confirmDelete = confirm(`Hapus transaksi ${tx.kategori} sejumlah ${formatRupiah(tx.nominal)}?`);
      if (!confirmDelete) return;

      showToast("Menghapus data...", "info");

      try {
        const response = await apiFetch(CONFIG.GAS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
          },
          body: JSON.stringify({
            action: "delete",
            tanggal: tx.tanggal,
            nama: tx.nama,
            jenis: tx.jenis,
            kategori: tx.kategori,
            nominal: tx.nominal,
            keterangan: tx.catatan || ""
          })
        });

        if (response.status === "success" || response.status === "sukses") {
          showToast("Transaksi berhasil dihapus! ✓", "success");
          // Refresh Dashboard dan History secara paralel
          await Promise.allSettled([
            loadDashboard(),
            loadHistory()
          ]);
        } else {
          showToast(response.message || "Gagal menghapus data.", "error");
        }
      } catch (err) {
        showToast("Terjadi kesalahan koneksi.", "error");
        console.error("[Delete] Error deleting row:", err);
      }
    });
  }

  return li;
}

// ============================================================
// TASK 10.1 — INISIALISASI: initApp
// ============================================================

/**
 * Entry point utama aplikasi OurFinance.
 * Dipanggil saat DOM selesai dimuat (DOMContentLoaded).
 *
 * Langkah inisialisasi:
 *  1. Inisialisasi navigasi tab
 *  2. Inisialisasi form transaksi
 *  3. Muat data Dashboard dan History secara paralel (Promise.allSettled)
 *     — error pada satu permintaan tidak memblokir yang lain
 *  4. Tampilkan tab Dashboard sebagai default
 *
 * Catatan: Service Worker sudah didaftarkan di index.html (via window 'load' event),
 * sehingga tidak perlu didaftarkan ulang di sini.
 *
 * @returns {Promise<void>}
 */
async function initApp() {
  console.log("[App] OurFinance PWA starting...");

  // Langkah 1: Inisialisasi navigasi
  initNavigation();

  // Langkah 2: Inisialisasi form
  initForm();

  // Langkah 3: Muat data awal secara paralel
  // Promise.allSettled memastikan kegagalan satu request tidak memblokir yang lain
  await Promise.allSettled([
    loadDashboard(),
    loadHistory(),
  ]);

  // Langkah 4: Tampilkan tab Dashboard sebagai default
  switchTab("dashboard");

  console.log("[App] OurFinance PWA ready.");
}

// ============================================================
// TASK 10.2 — EVENT LISTENER: DOMContentLoaded
// ============================================================

/**
 * Pasang event listener DOMContentLoaded sebagai entry point aplikasi.
 * initApp() dipanggil setelah seluruh DOM selesai diparse oleh browser.
 */
document.addEventListener("DOMContentLoaded", initApp);
