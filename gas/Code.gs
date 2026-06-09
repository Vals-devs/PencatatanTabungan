/**
 * @fileoverview OurFinance — Google Apps Script (GAS) API Jembatan (Disesuaikan untuk Ival & Nurul + Pencatatan Uang Pribadi Single-Tab)
 * 
 * Kolom Transaksi (Sheet pertama / Utama):
 * A: Tanggal | B: Nama | C: Jenis Transaksi | D: Kategori | E: Nominal | F: Keterangan | G: Metode Pembayaran | H: Status
 * 
 * Metrik Dashboard:
 * Kolom K: K2 (Total Pemasukan), K3 (Total Pengeluaran), K4 (Total Tabungan), K5 (Sisa Saldo)
 * Kolom N: N1 (Pemasukan Bulan Ini), N2 (Pengeluaran Bulan Ini), N3 (Tabungan Bulan Ini)
 */

const SPREADSHEET_ID = ""; // Kosongkan jika container-bound ke spreadsheet

function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {
      throw new Error("Gagal membuka spreadsheet via ID: " + e.message);
    }
  }
  const activeSs = SpreadsheetApp.getActiveSpreadsheet();
  if (!activeSs) {
    throw new Error("Spreadsheet tidak terdeteksi. Pastikan script ini ditempel di Extensions > Apps Script.");
  }
  return activeSs;
}

/**
 * Handler utama untuk request HTTP GET.
 * Merouting data berdasarkan query parameter 'action' & 'isPersonal'.
 */
function doGet(e) {
  try {
    const action = e.parameter ? e.parameter.action : "";
    const isPersonal = e.parameter ? (e.parameter.isPersonal === "true") : false;
    
    if (!action || action === "getDashboard") {
      const data = isPersonal ? getPersonalDashboardData() : getDashboardData();
      return createJsonResponse({ 
        status: "sukses", 
        message: "OK", 
        data: data 
      });
    } 
    
    if (action === "getHistory") {
      const data = isPersonal ? getPersonalTransactions(10) : getLastTransactions(10);
      return createJsonResponse({ 
        status: "sukses", 
        message: "OK", 
        data: data 
      });
    }

    return createJsonResponse({ 
      status: "error", 
      message: "Action '" + action + "' tidak valid." 
    });

  } catch (error) {
    return createJsonResponse({ 
      status: "error", 
      message: "Terjadi kesalahan internal (GET): " + error.toString() 
    });
  }
}

/**
 * Handler utama untuk request HTTP POST.
 * Menerima payload JSON transaksi baru, melakukan validasi, lalu menambahkannya ke tab Utama (index 0).
 */
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return createJsonResponse({ 
        status: "error", 
        message: "Request body tidak boleh kosong." 
      });
    }

    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return createJsonResponse({ 
        status: "error", 
        message: "Format JSON tidak valid dalam request body." 
      });
    }

    // 1. Cek jika ini adalah request untuk menghapus transaksi
    if (data.action === "delete") {
      const result = deleteTransaction(data);
      if (result.success) {
        return createJsonResponse({ 
          status: "sukses", 
          message: result.message 
        });
      } else {
        return createJsonResponse({ 
          status: "error", 
          message: result.message 
        });
      }
    }

    // 2. Validasi server-side untuk pencatatan transaksi baru
    const validation = validatePayload(data);
    if (!validation.valid) {
      return createJsonResponse({ 
        status: "error", 
        message: validation.error 
      });
    }

    var ss = getSpreadsheet();
    var sheet = ss.getSheets()[0]; // Selalu tulis ke tab pertama (Utama)
    
    var tanggal     = data.tanggal || new Date(); 
    var nama        = data.nama;        
    var jenis       = data.jenis;       
    var kategori    = data.kategori;    
    var nominal     = Number(data.nominal); 
    var keterangan  = data.keterangan || "";
    var metode      = data.metode || "";
    var status      = data.status || "Selesai"; 
    
    // Cari baris kosong pertama di kolom A-H agar tidak menabrak sel rumus di sebelah kanan
    var nextRow = getNextTransactionRow(sheet);
    sheet.getRange(nextRow, 1, 1, 8).setValues([[tanggal, nama, jenis, kategori, nominal, keterangan, metode, status]]);
    
    return createJsonResponse({ 
      status: "sukses", 
      message: "Data berhasil dicatat ke Sheets!" 
    });
                         
  } catch(error) {
    return createJsonResponse({ 
      status: "error", 
      message: "Terjadi kesalahan internal (POST): " + error.toString() 
    });
  }
}

/**
 * Menghapus baris transaksi yang cocok dari sheet Utama.
 */
function deleteTransaction(payload) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: false, message: "Sheet transaksi kosong." };
  }

  // Safety check: Jika request dari personal app, cegah menghapus transaksi bersama
  if (payload.isPersonal && payload.nama !== "Ival (Pribadi)") {
    return { success: false, message: "Keamanan: Transaksi Bersama tidak dapat dihapus dari Aplikasi Pribadi." };
  }
  
  // Ambil data dari baris 2 (kolom A sampai F)
  const range = sheet.getRange(2, 1, lastRow - 1, 6);
  const values = range.getValues();
  
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    
    // Sesuaikan format tanggal untuk dicocokkan (DD/MM/YYYY)
    let rowTanggal = "";
    if (row[0]) {
      if (row[0] instanceof Date) {
        rowTanggal = Utilities.formatDate(row[0], ss.getSpreadsheetTimeZone(), "dd/MM/yyyy");
      } else {
        rowTanggal = String(row[0]);
      }
    }
    
    const matchTanggal = (rowTanggal === payload.tanggal);
    const matchNama = (String(row[1]) === payload.nama);
    const matchJenis = (String(row[2]) === payload.jenis);
    const matchKategori = (String(row[3]) === payload.kategori);
    const matchNominal = (Number(row[4]) === Number(payload.nominal));
    const matchKeterangan = (String(row[5]) === payload.keterangan);
    
    if (matchTanggal && matchNama && matchJenis && matchKategori && matchNominal && matchKeterangan) {
      sheet.getRange(i + 2, 1, 1, 8).deleteCells(SpreadsheetApp.Dimension.ROWS);
      return { success: true, message: "Transaksi berhasil dihapus dari Sheets!" };
    }
  }
  
  return { success: false, message: "Transaksi tidak ditemukan di database." };
}

/**
 * Membaca nilai metrik dashboard bersama dari spreadsheet (eksklusif Ival (Pribadi)).
 */
function getDashboardData() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheets()[0];
  
  // Membaca nilai dari sel rumus di kolom K
  var totalPemasukan   = Number(sheet.getRange("K2").getValue()) || 0;
  var totalPengeluaran = Number(sheet.getRange("K3").getValue()) || 0;
  var totalTabungan    = Number(sheet.getRange("K4").getValue()) || 0;
  var sisaSaldo        = Number(sheet.getRange("K5").getValue()) || 0;
  
  // Membaca nilai dari sel rumus metrik bulan ini di kolom N
  var pemasukanBulanIni   = Number(sheet.getRange("N2").getValue()) || 0;
  var pengeluaranBulanIni = Number(sheet.getRange("N3").getValue()) || 0;
  var tabunganBulanIni    = Number(sheet.getRange("N4").getValue()) || 0;
  var pengeluaranIvalBulanIni  = Number(sheet.getRange("N5").getValue()) || 0;
  var pengeluaranNurulBulanIni = Number(sheet.getRange("N6").getValue()) || 0;
  var pemasukanIvalBulanIni    = Number(sheet.getRange("N7").getValue()) || 0;
  var pemasukanNurulBulanIni   = Number(sheet.getRange("N8").getValue()) || 0;
  
  return {
    totalPemasukan: totalPemasukan,
    totalPengeluaran: totalPengeluaran,
    totalTabungan: totalTabungan,
    saldoEfektif: sisaSaldo, 
    pemasukanBulanIni: pemasukanBulanIni,
    pengeluaranBulanIni: pengeluaranBulanIni,
    tabunganBulanIni: tabunganBulanIni,
    pengeluaranIvalBulanIni: pengeluaranIvalBulanIni,
    pengeluaranNurulBulanIni: pengeluaranNurulBulanIni,
    pemasukanIvalBulanIni: pemasukanIvalBulanIni,
    pemasukanNurulBulanIni: pemasukanNurulBulanIni
  };
}

/**
 * Menghitung nilai metrik dashboard pribadi secara pemrograman.
 * Memuat data Ival (Shared) + Ival (Pribadi), dan mengeksklusi Tabungan Bersama.
 */
function getPersonalDashboardData() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return {
      totalPemasukan: 0,
      totalPengeluaran: 0,
      totalTabungan: 0,
      saldoEfektif: 0,
      pemasukanBulanIni: 0,
      pengeluaranBulanIni: 0,
      tabunganBulanIni: 0
    };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues(); // A to F
  
  let totalPemasukan = 0;
  let totalPengeluaran = 0;
  let totalTabungan = 0;
  
  let pemasukanBulanIni = 0;
  let pengeluaranBulanIni = 0;
  let tabunganBulanIni = 0;
  
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const nama = String(row[1]);
    const jenis = String(row[2]);
    const nominal = Number(row[4]) || 0;
    
    const isIvalShared = (nama === "Ival");
    const isIvalPersonal = (nama === "Ival (Pribadi)");
    
    if (!isIvalShared && !isIvalPersonal) {
      continue;
    }
    
    let dateObj = null;
    if (row[0] instanceof Date) {
      dateObj = row[0];
    } else {
      dateObj = parseDateStr(String(row[0]));
    }
    
    const isThisMonth = dateObj && (dateObj.getMonth() === currentMonth) && (dateObj.getFullYear() === currentYear);

    if (jenis === "Pemasukan") {
      totalPemasukan += nominal;
      if (isThisMonth) pemasukanBulanIni += nominal;
    } else if (jenis === "Pengeluaran") {
      totalPengeluaran += nominal;
      if (isThisMonth) pengeluaranBulanIni += nominal;
    } else if (jenis === "Tabungan") {
      // Hanya tabungan pribadi yang masuk ke perhitungan personal, tabungan bersama dilewati
      if (isIvalPersonal) {
        totalTabungan += nominal;
        if (isThisMonth) tabunganBulanIni += nominal;
      }
    }
  }

  return {
    totalPemasukan: totalPemasukan,
    totalPengeluaran: totalPengeluaran,
    totalTabungan: totalTabungan,
    saldoEfektif: totalPemasukan - totalPengeluaran - totalTabungan,
    pemasukanBulanIni: pemasukanBulanIni,
    pengeluaranBulanIni: pengeluaranBulanIni,
    tabunganBulanIni: tabunganBulanIni
  };
}

/**
 * Mengambil 10 transaksi terakhir milik bersama (eksklusif Ival (Pribadi)).
 */
function getLastTransactions(n) {
  n = n || 10;
  const ss = getSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return []; 
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 8);
  const values = range.getValues();
  const transactions = [];

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    if (!row[1] && !row[2]) {
      continue;
    }

    const nama = String(row[1]);
    
    // Eksklusi transaksi pribadi dari history aplikasi bersama
    if (nama === "Ival (Pribadi)") {
      continue;
    }

    let tglStr = "";
    if (row[0]) {
      if (row[0] instanceof Date) {
        tglStr = Utilities.formatDate(row[0], ss.getSpreadsheetTimeZone(), "dd/MM/yyyy");
      } else {
        tglStr = String(row[0]);
      }
    }

    transactions.push({
      tanggal: tglStr,
      nama: nama,
      jenis: row[2] ? String(row[2]) : "",
      kategori: row[3] ? String(row[3]) : "",
      nominal: Number(row[4]) || 0,
      catatan: row[5] ? String(row[5]) : "",
      isShared: false
    });

    if (transactions.length >= n) {
      break;
    }
  }

  return transactions;
}

/**
 * Mengambil 10 transaksi terakhir milik Ival (gabungan Bersama & Pribadi, minus Tabungan Bersama).
 */
function getPersonalTransactions(n) {
  n = n || 10;
  const ss = getSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return [];
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 8);
  const values = range.getValues();
  const transactions = [];

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    if (!row[1] && !row[2]) {
      continue;
    }

    const nama = String(row[1]);
    const jenis = String(row[2]);

    const isIvalShared = (nama === "Ival");
    const isIvalPersonal = (nama === "Ival (Pribadi)");

    if (!isIvalShared && !isIvalPersonal) {
      continue;
    }

    // Eksklusi Tabungan Bersama
    if (jenis === "Tabungan" && isIvalShared) {
      continue;
    }

    let tglStr = "";
    if (row[0]) {
      if (row[0] instanceof Date) {
        tglStr = Utilities.formatDate(row[0], ss.getSpreadsheetTimeZone(), "dd/MM/yyyy");
      } else {
        tglStr = String(row[0]);
      }
    }

    transactions.push({
      tanggal: tglStr,
      nama: nama,
      jenis: jenis,
      kategori: row[3] ? String(row[3]) : "",
      nominal: Number(row[4]) || 0,
      catatan: row[5] ? String(row[5]) : "",
      isShared: isIvalShared
    });

    if (transactions.length >= n) {
      break;
    }
  }

  return transactions;
}

/**
 * Helper untuk parsing tanggal format DD/MM/YYYY ke objek Date
 */
function parseDateStr(str) {
  if (!str) return new Date(0);
  var parts = String(str).split("/");
  if (parts.length === 3) {
    return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  return new Date(str);
}

/**
 * Validasi payload server-side
 */
function validatePayload(payload) {
  if (!payload) {
    return { valid: false, error: "Payload kosong." };
  }
  const nominal = Number(payload.nominal);
  if (isNaN(nominal) || nominal <= 0) {
    return { valid: false, error: "Nominal harus berupa angka positif lebih dari 0." };
  }
  const validJenis = ["Pemasukan", "Pengeluaran", "Tabungan"];
  if (!payload.jenis || !validJenis.includes(payload.jenis)) {
    return { valid: false, error: "Jenis transaksi wajib dipilih (Pemasukan, Pengeluaran, atau Tabungan)." };
  }
  if (!payload.kategori || payload.kategori.trim() === "") {
    return { valid: false, error: "Kategori wajib dipilih." };
  }
  if (!payload.nama || payload.nama.trim() === "") {
    return { valid: false, error: "Nama penginput wajib dipilih." };
  }
  return { valid: true, error: null };
}

/**
 * Membuat response JSON dengan CORS header
 */
function createJsonResponse(data) {
  const jsonString = JSON.stringify(data);
  return ContentService.createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Membuat menu kustom di Google Sheets saat dokumen dibuka.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("OurFinance")
    .addItem("Setup Spreadsheet (Rumus & Header Baru)", "setupSpreadsheet")
    .addToUi();
}

/**
 * Menyiapkan struktur header, label, dan rumus formula secara otomatis di Google Sheets Utama.
 * Rumus menggunakan SUMIFS dan SUMPRODUCT untuk mengeksklusi transaksi pribadi (Nama = "Ival (Pribadi)").
 */
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  
  // 1. Tulis Header Transaksi di A1:H1
  const headers = [
    "Tanggal", 
    "Nama", 
    "Jenis Transaksi", 
    "Kategori", 
    "Nominal", 
    "Keterangan", 
    "Metode Pembayaran", 
    "Status"
  ];
  sheet.getRange("A1:H1").setValues([headers]);
  sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#ecfdf5").setHorizontalAlignment("center");
  
  // 2. Tulis Header Metrik Keseluruhan di J1:K1
  sheet.getRange("J1").setValue("METRIK KESELURUHAN").setFontWeight("bold");
  sheet.getRange("K1").setValue("Nilai").setFontWeight("bold");
  
  // Tulis label metrik keseluruhan di J2:J5
  sheet.getRange("J2").setValue("Total Pemasukan");
  sheet.getRange("J3").setValue("Total Pengeluaran");
  sheet.getRange("J4").setValue("Total Tabungan");
  sheet.getRange("J5").setValue("Saldo Efektif");
  
  // Tulis rumus metrik keseluruhan di K2:K5 (Menggunakan SUMIFS untuk mengeksklusi nama yang mengandung "Pribadi")
  sheet.getRange("K2").setFormula('=SUMIFS(E:E; C:C; "Pemasukan"; B:B; "<>*Pribadi*")');
  sheet.getRange("K3").setFormula('=SUMIFS(E:E; C:C; "Pengeluaran"; B:B; "<>*Pribadi*")');
  sheet.getRange("K4").setFormula('=SUMIFS(E:E; C:C; "Tabungan"; B:B; "<>*Pribadi*")');
  sheet.getRange("K5").setFormula('=K2-K3-K4');
  
  // 3. Tulis Header Metrik Bulanan di M1:N1
  sheet.getRange("M1").setValue("METRIK BULAN INI").setFontWeight("bold");
  sheet.getRange("N1").setValue("Nilai").setFontWeight("bold");
  
  // Tulis label metrik bulanan di M2:M8
  sheet.getRange("M2").setValue("Pemasukan Bulan Ini");
  sheet.getRange("M3").setValue("Pengeluaran Bulan Ini");
  sheet.getRange("M4").setValue("Tabungan Bulan Ini");
  sheet.getRange("M5").setValue("Pengeluaran Ival Bulan Ini");
  sheet.getRange("M6").setValue("Pengeluaran Nurul Bulan Ini");
  sheet.getRange("M7").setValue("Pemasukan Ival Bulan Ini");
  sheet.getRange("M8").setValue("Pemasukan Nurul Bulan Ini");
  
  // Tulis rumus metrik bulanan di N2:N8 (Mengeksklusi Ival (Pribadi))
  sheet.getRange("N2").setFormula('=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pemasukan") * (B2:B<>"Ival (Pribadi)") * (E2:E))');
  sheet.getRange("N3").setFormula('=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pengeluaran") * (B2:B<>"Ival (Pribadi)") * (E2:E))');
  sheet.getRange("N4").setFormula('=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Tabungan") * (B2:B<>"Ival (Pribadi)") * (E2:E))');
  sheet.getRange("N5").setFormula('=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pengeluaran") * (B2:B="Ival") * (E2:E))');
  sheet.getRange("N6").setFormula('=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pengeluaran") * (B2:B="Nurul") * (E2:E))');
  sheet.getRange("N7").setFormula('=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pemasukan") * (B2:B="Ival") * (E2:E))');
  sheet.getRange("N8").setFormula('=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pemasukan") * (B2:B="Nurul") * (E2:E))');
  
  // Atur format nominal Rupiah
  sheet.getRange("K2:K5").setNumberFormat('"Rp"#,##0');
  sheet.getRange("N2:N8").setNumberFormat('"Rp"#,##0');
  
  // Auto-fit kolom agar pas dengan teks
  sheet.autoResizeColumns(1, 8);
  sheet.autoResizeColumns(10, 2);
  sheet.autoResizeColumns(13, 2);
  
  SpreadsheetApp.getUi().alert("Setup Selesai! Rumus, header, dan label metrik telah otomatis diperbarui di Google Sheets Anda.");
}

/**
 * Mencari baris kosong pertama khusus untuk kolom A-H (tabel transaksi)
 */
function getNextTransactionRow(sheet) {
  var values = sheet.getRange("A:A").getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === "" || values[i][0] === null || values[i][0] === undefined) {
      return i + 1;
    }
  }
  return values.length + 1;
}
