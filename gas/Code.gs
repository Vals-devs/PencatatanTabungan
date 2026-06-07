/**
 * @fileoverview OurFinance — Google Apps Script (GAS) API Jembatan (Disesuaikan untuk Ival & Nurul)
 * 
 * Kolom Transaksi (Sheet pertama):
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
 * Merouting data berdasarkan query parameter 'action'.
 * Jika action kosong, otomatis mengembalikan data dashboard agar kompatibel.
 */
function doGet(e) {
  try {
    const action = e.parameter ? e.parameter.action : "";
    
    if (!action || action === "getDashboard") {
      const data = getDashboardData();
      return createJsonResponse({ 
        status: "sukses", 
        message: "OK", 
        data: data 
      });
    } 
    
    if (action === "getHistory") {
      const data = getLastTransactions(10);
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
 * Menerima payload JSON transaksi baru, melakukan validasi, lalu menambahkannya ke tab Transaksi.
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
    var sheet = ss.getSheets()[0]; 
    
    var tanggal     = data.tanggal || new Date(); 
    var nama        = data.nama;        
    var jenis       = data.jenis;       
    var kategori    = data.kategori;    
    var nominal     = Number(data.nominal); 
    var keterangan  = data.keterangan || "";
    var metode      = data.metode || "";
    var status      = data.status || "Selesai"; 
    
    // Memasukkan data ke baris paling bawah secara berurutan (Kolom A sampai H)
    sheet.appendRow([tanggal, nama, jenis, kategori, nominal, keterangan, metode, status]);
    
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
 * Menghapus baris transaksi yang cocok dari sheet.
 */
function deleteTransaction(payload) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: false, message: "Sheet transaksi kosong." };
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
      // Indeks baris di sheet = i + 2 (karena values mulai dari baris 2, index i 0-based)
      sheet.deleteRow(i + 2);
      return { success: true, message: "Transaksi berhasil dihapus dari Sheets!" };
    }
  }
  
  return { success: false, message: "Transaksi tidak ditemukan di database." };
}

/**
 * Membaca nilai metrik dashboard dari spreadsheet.
 */
function getDashboardData() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheets()[0];
  
  // Membaca nilai dari sel rumus di kolom K (Metrik Keseluruhan)
  var totalPemasukan   = Number(sheet.getRange("K2").getValue()) || 0;
  var totalPengeluaran = Number(sheet.getRange("K3").getValue()) || 0;
  var totalTabungan    = Number(sheet.getRange("K4").getValue()) || 0;
  var sisaSaldo        = Number(sheet.getRange("K5").getValue()) || 0;
  
  // Membaca nilai dari sel rumus metrik bulan ini di kolom N
  var pemasukanBulanIni   = Number(sheet.getRange("N2").getValue()) || 0;
  var pengeluaranBulanIni = Number(sheet.getRange("N3").getValue()) || 0;
  var tabunganBulanIni    = Number(sheet.getRange("N4").getValue()) || 0;
  
  return {
    totalPemasukan: totalPemasukan,
    totalPengeluaran: totalPengeluaran,
    totalTabungan: totalTabungan,
    saldoEfektif: sisaSaldo, // sisaSaldo dipetakan ke saldoEfektif agar dibaca oleh frontend
    pemasukanBulanIni: pemasukanBulanIni,
    pengeluaranBulanIni: pengeluaranBulanIni,
    tabunganBulanIni: tabunganBulanIni
  };
}

/**
 * Mengambil 10 transaksi terakhir dari sheet.
 */
function getLastTransactions(n = 10) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheets()[0];
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return []; 
  }

  const startRow = Math.max(2, lastRow - n + 1);
  const numRows = lastRow - startRow + 1;

  // Kolom A sampai H (8 kolom)
  const range = sheet.getRange(startRow, 1, numRows, 8);
  const values = range.getValues();

  const transactions = [];
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    
    // Konversi objek Tanggal ke format DD/MM/YYYY agar seragam
    let tglStr = "";
    if (row[0]) {
      if (row[0] instanceof Date) {
        // Format tanggal sesuai timezone spreadsheet
        tglStr = Utilities.formatDate(row[0], ss.getSpreadsheetTimeZone(), "dd/MM/yyyy");
      } else {
        tglStr = String(row[0]);
      }
    }

    transactions.push({
      tanggal: tglStr,                          // Kolom A
      nama: row[1] ? String(row[1]) : "",       // Kolom B
      jenis: row[2] ? String(row[2]) : "",      // Kolom C
      kategori: row[3] ? String(row[3]) : "",   // Kolom D
      nominal: Number(row[4]) || 0,             // Kolom E
      catatan: row[5] ? String(row[5]) : ""     // Kolom F (Keterangan) kita jadikan sebagai catatan di UI
    });
  }

  return transactions;
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
 * Menu ini memudahkan Anda melakukan setup struktur kolom dan rumus secara otomatis.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("OurFinance")
    .addItem("Setup Spreadsheet (Rumus & Header)", "setupSpreadsheet")
    .addToUi();
}

/**
 * Menyiapkan struktur header, label, dan rumus formula secara otomatis di Google Sheets.
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
  
  // Tulis rumus metrik keseluruhan di K2:K5 (menggunakan standar locale Indonesia dengan titik koma ';')
  sheet.getRange("K2").setFormula('=SUMIF(C:C; "Pemasukan"; E:E)');
  sheet.getRange("K3").setFormula('=SUMIF(C:C; "Pengeluaran"; E:E)');
  sheet.getRange("K4").setFormula('=SUMIF(C:C; "Tabungan"; E:E)');
  sheet.getRange("K5").setFormula('=K2-K3-K4');
  
  // 3. Tulis Header Metrik Bulanan di M1:N1
  sheet.getRange("M1").setValue("METRIK BULAN INI").setFontWeight("bold");
  sheet.getRange("N1").setValue("Nilai").setFontWeight("bold");
  
  // Tulis label metrik bulanan di M2:M4
  sheet.getRange("M2").setValue("Pemasukan Bulan Ini");
  sheet.getRange("M3").setValue("Pengeluaran Bulan Ini");
  sheet.getRange("M4").setValue("Tabungan Bulan Ini");
  
  // Tulis rumus metrik bulanan di N2:N4
  sheet.getRange("N2").setFormula('=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pemasukan") * (E2:E))');
  sheet.getRange("N3").setFormula('=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pengeluaran") * (E2:E))');
  sheet.getRange("N4").setFormula('=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Tabungan") * (E2:E))');
  
  // Atur format nominal agar mudah dibaca di Sheet (K2:K5 dan N2:N4) sebagai Rupiah
  sheet.getRange("K2:K5").setNumberFormat('"Rp"#,##0');
  sheet.getRange("N2:N4").setNumberFormat('"Rp"#,##0');
  
  // Auto-fit kolom agar pas dengan teks
  sheet.autoResizeColumns(1, 8);
  sheet.autoResizeColumns(10, 2);
  sheet.autoResizeColumns(13, 2);
  
  SpreadsheetApp.getUi().alert("Setup Selesai! Rumus, header, dan label metrik telah otomatis ditulis ke Google Sheets Anda.");
}
