# 💚 OurFinance App

OurFinance adalah **Progressive Web App (PWA)** pencatatan keuangan mandiri untuk pasangan yang dirancang agar sangat ringan, responsif mobile-first, dan dapat di-install langsung di HP tanpa melalui App Store atau Play Store. 

Aplikasi ini menggunakan arsitektur **Serverless** gratis memanfaatkan ekosistem Google: **Google Sheets** sebagai database utama dan **Google Apps Script (GAS)** sebagai REST API jembatan.

---

## 🚀 Fitur Utama

* **Dashboard Finansial Real-time**: Menampilkan akumulasi Saldo Efektif, Total Tabungan, dan Pengeluaran berjalan bulan ini secara instan.
* **Breakdown Finansial Personal (Bulanan)**: Menampilkan rincian terpisah secara visual untuk **Pemasukan** dan **Pengeluaran** yang dilakukan oleh **Ival** dan **Nurul** masing-masing pada bulan berjalan secara real-time.
* **Formulir Input Dinamis**:
  * *Currency Masking*: Format nominal Rupiah secara otomatis saat mengetik (`Rp 150.000`).
  * *Dynamic Category Dropdown*: Pilihan kategori berubah secara otomatis berdasarkan jenis transaksi (Pemasukan, Pengeluaran, atau Tabungan) yang dipilih.
  * *User Toggle*: Memilih penginput transaksi secara instan (👨‍💻 **Ival** atau 👩‍💻 **Nurul**).
* **Riwayat Transaksi (History) dengan Fitur Hapus**: Menampilkan 10 transaksi terakhir secara kronologis terbalik, lengkap dengan badge warna dan tombol hapus (ikon tempat sampah) untuk menghapus transaksi dari database Sheets tanpa merusak sel rumus.
* **PWA & Offline Support**:
  * Dapat di-install di Android & iOS (*Add to Home Screen*) dengan splash screen dan icon custom.
  * Dilengkapi strategi caching *Cache First* (Service Worker) dan halaman *Offline Fallback* (`offline.html`) yang anggun saat internet terputus.

---

## 🛠️ Arsitektur Sistem

```
[ FRONTEND PWA ]                        [ API / BACKEND ]               [ DATABASE ]
Aplikasi Statis   ==( Fetch API )==>   Google Apps Script  <========>  Google Sheets
(HTML, CSS, JS)                        (doGet & doPost)                 (Penyimpanan Data)
```

---

## 📋 Panduan Setup & Instalasi (Panduan Open-Source)

### Langkah 1: Siapkan Google Spreadsheet (Database)

1. Buat Google Spreadsheet baru di akun Google Drive Anda.
2. Di lembar kerja pertama (indeks 0, pastikan letaknya di tab paling kiri), siapkan kolom header dari **A** sampai **H** seperti berikut:

| Kolom | Header | Tipe Data / Keterangan |
| :---: | :--- | :--- |
| **A** | Tanggal | Format string `DD/MM/YYYY` |
| **B** | Nama | Nama penginput (`Ival` atau `Nurul`) |
| **C** | Jenis Transaksi | `Pemasukan` · `Pengeluaran` · `Tabungan` |
| **D** | Kategori | Nama kategori (misal: Makan/Minum, Gaji, dll.) |
| **E** | Nominal | Nilai angka murni transaksi (diubah menjadi tipe angka otomatis) |
| **F** | Keterangan | Keterangan opsional tambahan (catatan) |
| **G** | Metode Pembayaran | Diisi string kosong secara default oleh aplikasi |
| **H** | Status | Berstatus `"Selesai"` secara default |

3. Tambahkan rumus perhitungan metrik berikut di lembar kerja yang sama:

#### Metrik Keseluruhan (Kolom K)
* **K2** (Total Pemasukan):  
  `=SUMIF(C:C; "Pemasukan"; E:E)` atau `=SUMIF(C:C, "Pemasukan", E:E)`
* **K3** (Total Pengeluaran):  
  `=SUMIF(C:C; "Pengeluaran"; E:E)` atau `=SUMIF(C:C, "Pengeluaran", E:E)`
* **K4** (Total Tabungan):  
  `=SUMIF(C:C; "Tabungan"; E:E)` atau `=SUMIF(C:C, "Tabungan", E:E)`
* **K5** (Sisa Saldo / Saldo Efektif):  
  `=K2-K3-K4`

#### Metrik Bulanan (Kolom N)
Semua rumus berikut menggunakan standar regional Indonesia dengan pemisah titik koma (`;`). Jika Google Sheets Anda disetel ke regional Amerika/English, ganti `;` menjadi koma `,`.
* **N2** (Pemasukan Bulan Ini):  
  `=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pemasukan") * (E2:E))`
* **N3** (Pengeluaran Bulan Ini):  
  `=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pengeluaran") * (E2:E))`
* **N4** (Tabungan Bulan Ini):  
  `=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Tabungan") * (E2:E))`
* **N5** (Pengeluaran Ival Bulan Ini):  
  `=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pengeluaran") * (B2:B="Ival") * (E2:E))`
* **N6** (Pengeluaran Nurul Bulan Ini):  
  `=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pengeluaran") * (B2:B="Nurul") * (E2:E))`
* **N7** (Pemasukan Ival Bulan Ini):  
  `=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pemasukan") * (B2:B="Ival") * (E2:E))`
* **N8** (Pemasukan Nurul Bulan Ini):  
  `=SUMPRODUCT((A2:A<>"") * (VALUE(MID(A2:A; 4; 2))=MONTH(TODAY())) * (VALUE(RIGHT(A2:A; 4))=YEAR(TODAY())) * (C2:C="Pemasukan") * (B2:B="Nurul") * (E2:E))`

---

### Langkah 2: Deploy Google Apps Script (API)

1. Pada Google Spreadsheet Anda, buka menu **Extensions** (Ekstensi) > **Apps Script**.
2. Hapus semua kode default di editor Apps Script Anda.
3. Salin seluruh isi berkas [`gas/Code.gs`](file:///C:/Project/PencatatanTabungan/gas/Code.gs) di folder proyek ini dan tempel (paste) di editor tersebut.
4. Klik tombol **Save** (ikon disket) atau tekan `Ctrl + S`.
5. Klik **Deploy** di kanan atas > **New deployment** (Penerapan baru).
6. Konfigurasikan penerapan:
   * **Select type**: Web app (Aplikasi web)
   * **Execute as**: Me (email Anda)
   * **Who has access**: Anyone (Siapa saja) — *ini wajib agar aplikasi dapat mengirim data tanpa login.*
7. Klik **Deploy**. Jika diminta memberikan izin keamanan, klik **Authorize Access**, pilih akun Google Anda, klik **Advanced** (Lanjutan) > **Go to API (unsafe)**, lalu pilih **Allow** (Izinkan).
8. Salin **Web App URL** yang diberikan oleh Google.

---

### Langkah 3: Konfigurasi Frontend PWA

1. Buka berkas [`js/app.js`](file:///C:/Project/PencatatanTabungan/js/app.js) di editor kode Anda.
2. Temukan konstanta `CONFIG` di bagian atas file, lalu ganti nilai `GAS_URL` dengan URL Penerapan Web App yang Anda salin di langkah sebelumnya:
   ```javascript
   const CONFIG = {
     GAS_URL: "URL_WEB_APP_APPS_SCRIPT_ANDA",
     NAMA_USERS: ["Ival", "Nurul"],
     // ...
   };
   ```
3. *(Opsional)* Jika Anda ingin mengubah pilihan kategori, Anda dapat mengedit bagian `KATEGORI` di dalam `CONFIG` pada berkas `js/app.js` serta menyesuaikannya di berkas `gas/Code.gs` bagian fungsi `validatePayload`.

---

### Langkah 4: Jalankan Aplikasi secara Lokal / Hosting

#### Menjalankan Lokal
Karena aplikasi ini adalah web statis murni tanpa build step, Anda dapat membukanya langsung di browser:
* Klik kanan berkas `index.html` dan pilih **Open with browser** (atau gunakan ekstensi *Live Server* di VS Code).

#### Mendeploy ke Hosting Gratis
Agar aplikasi dapat di-install di HP, ia wajib disajikan melalui protokol aman HTTPS. Anda dapat menghosting proyek ini secara gratis di:
* **GitHub Pages**
* **Vercel**
* **Netlify**

---

## 📱 Cara Menginstal PWA di Handphone

Setelah aplikasi dideploy ke hosting HTTPS:

### Di iOS (Safari)
1. Buka URL web aplikasi Anda di browser **Safari**.
2. Ketuk tombol **Share** (ikon persegi dengan panah ke atas) di bagian bawah.
3. Gulir ke bawah dan ketuk opsi **Add to Home Screen** (Tambahkan ke Layar Utama).
4. Klik **Add**.

### Di Android (Chrome)
1. Buka URL web aplikasi Anda di browser **Chrome**.
2. Biasanya akan muncul pop-up instan di bagian bawah: **"Add OurFinance to Home Screen"**.
3. Jika tidak muncul, ketuk tombol **Menu titik tiga** di kanan atas, lalu pilih **Install app** atau **Add to Home Screen**.

---

## 📂 Struktur Direktori Proyek

```
ourfinance-pwa/
├── index.html          # Halaman utama aplikasi (Dashboard, Form & History)
├── offline.html        # Halaman fallback ketika tidak ada koneksi internet
├── manifest.json       # Konfigurasi identitas PWA (nama, ikon, warna tema)
├── sw.js               # Service Worker untuk caching aset & offline mode
├── README.md           # Dokumentasi proyek (file ini)
├── css/
│   └── style.css       # Custom CSS pendukung (Safe Area & Overscroll)
├── js/
│   └── app.js          # Logika aplikasi (Form, Fetch API ke GAS, & UI State)
├── assets/
│   ├── icon-192.png    # Ikon PWA ukuran 192x192 px
│   └── icon-512.png    # Ikon PWA ukuran 512x512 px
└── gas/
    └── Code.gs         # Salinan kode Google Apps Script untuk rujukan
```

---

## ⚖️ Lisensi
Proyek ini dilisensikan di bawah **MIT License** — bebas digunakan, dimodifikasi, dan didistribusikan secara gratis untuk keperluan pribadi maupun komunitas.
