# RelayPost Web & License API (Vercel + Supabase)

Folder ini siap langsung di-deploy ke **Vercel** sebagai Root Directory `web`.

## Langkah Deploy

1. **Siapkan Tabel Supabase**
   - Buka **Supabase Dashboard -> SQL Editor**, lalu jalankan isi file `supabase-schema.sql`.
   - Tabel menggunakan prefix `relaypost_` dan RLS aktif, sehingga aman berbagi proyek Supabase dengan aplikasi lain.

2. **Deploy ke Vercel**
   - Import repo ke Vercel dan set **Root Directory** ke `web` (Framework Preset: `Other`).
   - Di **Project Settings -> Environment Variables**, tambahkan:
     - `SUPABASE_URL`
     - `SUPABASE_SECRET_KEY`
   - Deploy. Endpoint dan halaman berikut akan langsung aktif:
     - `https://<domain-anda>.vercel.app/` (Landing page)
     - `https://<domain-anda>.vercel.app/upgrade` (Halaman Upgrade & Pembayaran)
     - `https://<domain-anda>.vercel.app/privacy` (Kebijakan Privasi untuk Chrome Web Store)
     - `POST https://<domain-anda>.vercel.app/api/verify-license` (API validasi lisensi)

3. **Hubungkan Ekstensi Chrome**
   - Edit `../shared/license.js`: isi `verifyEndpoint` dengan `https://<domain-anda>.vercel.app/api/verify-license` dan `checkoutUrl` dengan `https://<domain-anda>.vercel.app/upgrade`.
   - Edit `../manifest.json`: tambahkan `"https://<domain-anda>.vercel.app/*"` ke array `host_permissions`.
   - Edit link tombol pembayaran di `upgrade.html` ke link Mayar / Midtrans / Lemon Squeezy / WhatsApp Anda.
