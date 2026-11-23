/* Vercel Serverless Function: POST /api/verify-license
 * Validates a RelayPost license key against Supabase PostgREST using service/secret key.
 * Required Vercel Environment Variables:
 *   SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_SECRET_KEY=sb_secret_... (or service_role key)
 */

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
}

async function sbFetch(path, options = {}) {
  const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!baseUrl || !secretKey) {
    throw new Error("Server misconfigured: missing SUPABASE_URL or SUPABASE_SECRET_KEY.");
  }

  const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, data: json, raw: text };
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ valid: false, error: "Method not allowed. Use POST." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const licenseKey = String(body.licenseKey || "").trim().toUpperCase();
    const deviceId = String(body.deviceId || "").trim().slice(0, 120);

    if (!licenseKey || licenseKey.length < 6) {
      return res.status(400).json({ valid: false, error: "Kode lisensi tidak valid." });
    }

    // 1. Lookup license key in public.relaypost_licenses
    const lookup = await sbFetch(
      `relaypost_licenses?license_key=eq.${encodeURIComponent(licenseKey)}&select=id,license_key,plan,status,max_devices,customer_email,expires_at&limit=1`
    );
    if (!lookup.ok) {
      return res.status(502).json({ valid: false, error: "Gagal membaca database lisensi." });
    }

    const lic = Array.isArray(lookup.data) ? lookup.data[0] : null;
    if (!lic) {
      return res.status(404).json({ valid: false, error: "Kode lisensi tidak ditemukan." });
    }

    if (lic.status !== "active") {
      return res.status(403).json({ valid: false, error: "Lisensi tidak aktif atau telah dinonaktifkan." });
    }

    if (lic.expires_at && Date.parse(lic.expires_at) < Date.now()) {
      return res.status(403).json({ valid: false, error: "Masa berlaku lisensi sudah habis." });
    }

    // 2. Enforce device quota in public.relaypost_license_devices
    let devicesUsed = 0;
    const maxDevices = Math.max(1, Number(lic.max_devices) || 2);

    if (deviceId) {
      const devLookup = await sbFetch(
        `relaypost_license_devices?license_id=eq.${encodeURIComponent(lic.id)}&select=id,device_id`
      );
      const devices = Array.isArray(devLookup.data) ? devLookup.data : [];
      const existing = devices.find((d) => d.device_id === deviceId);

      if (existing) {
        await sbFetch(`relaypost_license_devices?id=eq.${encodeURIComponent(existing.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ last_seen_at: new Date().toISOString() })
        });
        devicesUsed = devices.length;
      } else {
        if (devices.length >= maxDevices) {
          return res.status(403).json({
            valid: false,
            error: `Batas perangkat tercapai (${devices.length}/${maxDevices}). Nonaktifkan lisensi di perangkat lama terlebih dahulu.`
          });
        }
        const ins = await sbFetch("relaypost_license_devices", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            license_id: lic.id,
            device_id: deviceId,
            last_seen_at: new Date().toISOString()
          })
        });
        if (!ins.ok) {
          return res.status(502).json({ valid: false, error: "Gagal mendaftarkan perangkat." });
        }
        devicesUsed = devices.length + 1;
      }
    }

    return res.status(200).json({
      valid: true,
      plan: lic.plan || "pro",
      expiresAt: lic.expires_at || null,
      customerEmail: lic.customer_email || null,
      devicesUsed,
      maxDevices
    });
  } catch (err) {
    return res.status(500).json({
      valid: false,
      error: err && err.message ? err.message : "Internal license verification error."
    });
  }
};
