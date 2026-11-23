# RelayPost

Ekstensi Chrome (Manifest V3) untuk menulis sekali dan mengirim atau menjadwalkan postingan ke banyak grup Facebook dengan jeda aman — dilengkapi backend lisensi & Admin Panel berbasis **Vercel + Supabase**.

> **Status Repositori:** Proyek ini **sementara dibuka secara open source** untuk transparansi kode, pembelajaran, dan uji coba bersama.

---

## Fitur Utama

### Ekstensi Chrome (`Manifest V3`)
- **Multi-Grup Auto-Post** — Kirim postingan ke banyak grup Facebook secara berurutan langsung dari browser Chrome Anda.
- **Jeda Aman (Smart Delay)** — Preset jeda acak antar grup untuk meminimalkan risiko pembatasan.
- **Variasi Konten (Spintax & Multi-Versi)** — Buat variasi kalimat otomatis agar isi postingan berbeda di setiap grup.
- **Media & Set Foto Acak** — Lampirkan foto/video serta rotasi set gambar secara otomatis.
- **Komentar Pertama (First Comment)** — Tambahkan komentar otomatis setelah postingan berhasil terbit.
- **Penjadwalan & Impor CSV** — Jadwalkan postingan harian/mingguan atau impor banyak jadwal sekaligus dari file CSV.
- **Cek Kesehatan Grup & Ekspor Riwayat** — Pantau status grup dan ekspor laporan riwayat pengiriman ke CSV.
- **Lokal & Privat** — Draft, media, daftar grup, dan riwayat tersimpan lokal di browser (`chrome.storage` & IndexedDB) tanpa menyimpan kata sandi Facebook.

### Web, License API & Admin Panel (`web/`)
- **Landing Page, Upgrade & Privacy Policy** (`/`, `/upgrade`, `/privacy`) siap untuk publikasi Chrome Web Store.
- **API Validasi Lisensi** (`POST /api/verify-license`) dengan batas perangkat per lisensi.
- **Admin Panel** (`/admin`) untuk generate kode PRO (`RLY-PRO-XXXX-XXXX`), memberi akses PRO gratis/trial/lifetime, memperpanjang masa aktif, reset perangkat, dan revoke lisensi.

---

## Struktur Proyek

```text
.
├── manifest.json          # Konfigurasi Chrome Extension (Manifest V3)
├── network-rules.json     # Aturan declarativeNetRequest
├── background/            # Service worker (antrean, alarm jadwal, lisensi)
├── content/               # Content scripts (scanner grup, poster, share button)
├── engine/                # Mesin eksekusi pengiriman postingan
├── picker/                # Media picker lokal
├── popup/                 # Antarmuka utama ekstensi
├── shared/                # Modul bersama (i18n, icons, license, media-db, spintax)
├── data/                  # Konfigurasi selector
├── assets/                # Ikon & aset ekstensi
└── web/                   # Website, License API (Vercel), Schema Supabase, & Admin Panel
```

---

## Cara Install Ekstensi Secara Lokal

1. Clone atau unduh repositori ini:
   ```bash
   git clone <url-repositori-anda>
   cd MultiPost
   ```
2. Buka Google Chrome dan kunjungi `chrome://extensions/`.
3. Aktifkan **Developer mode** di pojok kanan atas.
4. Klik **Load unpacked** lalu pilih folder root repositori ini.
5. Buka RelayPost lewat ikon ekstensi di toolbar atau shortcut **`Alt+Shift+R`**.

> **Mode Uji Coba Lokal:** Selama `verifyEndpoint` di [`shared/license.js`](shared/license.js) dibiarkan kosong (`""`), Anda dapat menguji fitur PRO secara offline menggunakan kode demo berawalan `RLY-PRO-`.

---

## Setup Backend Lisensi & Admin Panel (`web/`)

Panduan deploy lengkap tersedia di [`web/README.md`](web/README.md). Ringkasnya:

1. **Supabase** — Jalankan [`web/supabase-schema.sql`](web/supabase-schema.sql) di **Supabase SQL Editor** untuk membuat tabel `relaypost_licenses` dan `relaypost_license_devices` (dengan RLS aktif).
2. **Vercel** — Deploy folder `web/` sebagai **Root Directory** dengan Framework Preset `Other`, lalu isi Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `ADMIN_PASSWORD` *(untuk login ke `/admin`)*
3. **Hubungkan Ekstensi** — Isi `verifyEndpoint` dan `checkoutUrl` di [`shared/license.js`](shared/license.js), serta tambahkan domain Vercel Anda ke `host_permissions` di [`manifest.json`](manifest.json).

---

## Privasi & Keamanan

- Ekstensi berjalan langsung menggunakan sesi browser Anda sendiri dan **tidak pernah meminta atau menyimpan password Facebook**.
- Jangan pernah commit file `.env.local` atau kunci rahasia (`SUPABASE_SECRET_KEY`, `ADMIN_PASSWORD`) ke Git. Gunakan [`web/.env.example`](web/.env.example) sebagai acuan.

---

## Disclaimer & Kontribusi

- Gunakan ekstensi ini secara bertanggung jawab serta patuhi aturan masing-masing grup dan Ketentuan Layanan Facebook.
- Karena repositori ini sementara bersifat open source, silakan buka **Issue** untuk laporan bug/saran fitur atau kirim **Pull Request** jika ingin ikut berkontribusi.
