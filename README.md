# UjianKu

Aplikasi web ujian pilihan ganda tanpa server. Guru membuat soal dan mendapat link; siswa membuka link, ujian berjalan dalam layar penuh, dan berakhir saat siswa menekan **Selesai ujian**.

## Fitur

- Editor soal (2–6 pilihan, duplikat, hapus) dan impor cepat dari teks
- Pengaturan durasi, acak soal, acak pilihan, tampil/sembunyikan nilai
- Link ujian berisi seluruh soal (terkompresi di bagian `#` URL), jadi cukup hosting statis
- Mode siswa: layar penuh otomatis, timer, navigasi nomor soal, tanda ragu-ragu
- Deteksi pelanggaran: keluar layar penuh, pindah tab/jendela, kehilangan fokus, muat ulang halaman, pintasan terlarang, klik kanan, salin/tempel
- Batas pelanggaran: ujian diselesaikan otomatis bila terlewati
- Progres tersimpan, sehingga refresh tidak mengulang ujian
- Hasil: kode hasil per siswa, rekap di tab **Hasil siswa**, ekspor CSV
- Opsional: kirim hasil otomatis ke Google Sheets lewat Apps Script

## Deploy ke GitHub Pages

1. Buat repositori baru di GitHub, lalu unggah `index.html`, `style.css`, `app.js`, dan `README.md`.
2. Buka **Settings → Pages**.
3. Pada **Build and deployment**, pilih **Deploy from a branch**, branch `main`, folder `/ (root)`, lalu **Save**.
4. Tunggu ±1 menit. Alamat aplikasi: `https://<username>.github.io/<nama-repo>/`.

Buka alamat itu sebagai guru, buat ujian, klik **Buat link ujian**, lalu bagikan link ke siswa.

## Mengumpulkan hasil

**Cara 1: manual.** Setelah selesai, siswa mendapat kode hasil. Mereka mengirimnya ke guru, dan guru menempelkannya di tab **Hasil siswa**.

**Cara 2: otomatis lewat Google Sheets.**

1. Buat Google Sheet, lalu **Extensions → Apps Script**, dan tempel:

   ```js
   function doPost(e) {
     const sh = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
     sh.appendRow([new Date(), e.postData.contents]);
     return ContentService.createTextOutput('ok');
   }
   ```

2. **Deploy → New deployment → Web app**. Execute as: *Me*, Who has access: *Anyone*.
3. Salin URL `/exec` ke kolom **URL pengumpul hasil otomatis** di pengaturan ujian, lalu buat ulang link.
4. Salin kolom kode dari Sheet ke tab **Hasil siswa**.

## Format impor soal

```
1. Ibu kota Indonesia adalah …
A. Bandung
B. Jakarta
C. Medan
Jawaban: B

2. Hasil dari 2 + 3 adalah …
A. 4
B. 5
Jawaban: B
```

## Batasan yang jujur

- **Browser tidak bisa mengunci tab lain secara mutlak.** Aplikasi hanya dapat mendeteksi dan mencatat. Untuk ujian bertaruhan tinggi, tambahkan pengawas atau gunakan Safe Exam Browser.
- **Kunci jawaban ada di dalam link.** Siswa yang mahir teknis bisa mengekstraknya. Untuk keamanan penuh, jawaban harus dinilai di server (mis. Firebase atau Supabase).
- **Kode hasil dapat dipalsukan** oleh siswa yang paham teknis. Gunakan untuk ulangan harian, bukan ujian akhir.
- Penguncian "satu kali ikut" memakai `localStorage`, jadi siswa bisa mengulang dengan browser lain atau mode incognito.
- iPhone/iPad Safari tidak mendukung layar penuh untuk halaman web. Siswa perlu laptop atau Chrome di Android.
- Link sangat panjang (>6.000 karakter) bisa terpotong di aplikasi chat tertentu.

## Struktur

```
index.html   # kerangka halaman guru + siswa
style.css    # tampilan
app.js       # logika: editor soal, kodek link, ujian, penjaga
```

Tidak ada dependensi atau proses build. Butuh browser modern yang mendukung `CompressionStream` (Chrome/Edge 80+, Firefox 113+, Safari 16.4+).
