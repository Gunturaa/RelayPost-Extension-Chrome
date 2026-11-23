/* Vercel Serverless Function: /api/admin-licenses
 * Admin CRUD endpoint for managing RelayPost licenses in Supabase.
 * Required Vercel Environment Variables:
 *   SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_SECRET_KEY=sb_secret_... (or service_role key)
 *   ADMIN_PASSWORD=<strong-secret-password>
 */

const crypto = require("crypto");

const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateLicenseKey() {
  const randomBlock = (len) => {
    const bytes = crypto.randomBytes(len);
    let out = "";
    for (let i = 0; i < len; i += 1) {
      out += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
    }
    return out;
  };
  return `RLY-PRO-${randomBlock(4)}-${randomBlock(4)}`;
}

function safeEqual(a, b) {
  const hashA = crypto.createHash("sha256").update(String(a || "")).digest();
  const hashB = crypto.createHash("sha256").update(String(b || "")).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function getProvidedPassword(req) {
  const headerPw = req.headers["x-admin-password"];
  if (typeof headerPw === "string" && headerPw.trim()) {
    return headerPw.trim();
  }
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return req.body;
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

function isMissingNoteColumnError(resp) {
  const msg = JSON.stringify(resp && (resp.data || resp.raw || "")).toLowerCase();
  return msg.includes("note") && (msg.includes("column") || msg.includes("schema cache"));
}

async function handleList(res) {
  let licResp = await sbFetch(
    "relaypost_licenses?select=id,license_key,plan,status,max_devices,customer_email,note,expires_at,created_at&order=created_at.desc"
  );
  let supportsNote = true;

  if (!licResp.ok && isMissingNoteColumnError(licResp)) {
    supportsNote = false;
    licResp = await sbFetch(
      "relaypost_licenses?select=id,license_key,plan,status,max_devices,customer_email,expires_at,created_at&order=created_at.desc"
    );
  }

  if (!licResp.ok) {
    return res.status(502).json({ ok: false, error: "Gagal membaca daftar lisensi dari Supabase." });
  }

  const devResp = await sbFetch(
    "relaypost_license_devices?select=id,license_id,device_id,last_seen_at&order=last_seen_at.desc"
  );
  const devicesByLicense = new Map();
  if (devResp.ok && Array.isArray(devResp.data)) {
    for (const dev of devResp.data) {
      if (!devicesByLicense.has(dev.license_id)) {
        devicesByLicense.set(dev.license_id, []);
      }
      devicesByLicense.get(dev.license_id).push(dev);
    }
  }

  const rows = (Array.isArray(licResp.data) ? licResp.data : []).map((lic) => {
    const devs = devicesByLicense.get(lic.id) || [];
    return {
      ...lic,
      note: lic.note || "",
      devices_used: devs.length,
      devices: devs
    };
  });

  return res.status(200).json({ ok: true, supportsNote, licenses: rows });
}

async function handleCreate(req, res) {
  const body = parseBody(req);
  const rawKey = String(body.licenseKey || "").trim().toUpperCase();
  const licenseKey = rawKey || generateLicenseKey();

  if (licenseKey.length < 6 || licenseKey.length > 64) {
    return res.status(400).json({ ok: false, error: "Kode lisensi harus 6–64 karakter." });
  }

  const plan = String(body.plan || "pro").trim().toLowerCase() === "free" ? "free" : "pro";
  const maxDevices = Math.min(50, Math.max(1, Number(body.maxDevices) || 2));
  const customerEmail = String(body.customerEmail || "").trim().slice(0, 160) || null;
  const note = String(body.note || "").trim().slice(0, 300) || null;

  let expiresAt = null;
  if (body.expiresAt) {
    const parsed = Date.parse(body.expiresAt);
    if (!Number.isFinite(parsed)) {
      return res.status(400).json({ ok: false, error: "Format tanggal kadaluarsa tidak valid." });
    }
    expiresAt = new Date(parsed).toISOString();
  } else if (body.durationDays !== null && body.durationDays !== undefined && body.durationDays !== "") {
    const days = Number(body.durationDays);
    if (!Number.isFinite(days) || days <= 0) {
      return res.status(400).json({ ok: false, error: "Durasi hari harus lebih dari 0." });
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  const payload = {
    license_key: licenseKey,
    plan,
    status: "active",
    max_devices: maxDevices,
    customer_email: customerEmail,
    expires_at: expiresAt
  };
  if (note !== null) {
    payload.note = note;
  }

  let insertResp = await sbFetch("relaypost_licenses", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });

  if (!insertResp.ok && payload.note !== undefined && isMissingNoteColumnError(insertResp)) {
    delete payload.note;
    insertResp = await sbFetch("relaypost_licenses", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });
  }

  if (!insertResp.ok) {
    const rawMsg = JSON.stringify(insertResp.data || insertResp.raw || "").toLowerCase();
    if (insertResp.status === 409 || rawMsg.includes("duplicate") || rawMsg.includes("unique")) {
      return res.status(409).json({ ok: false, error: `Kode lisensi "${licenseKey}" sudah digunakan.` });
    }
    return res.status(502).json({ ok: false, error: "Gagal membuat lisensi baru di Supabase." });
  }

  const created = Array.isArray(insertResp.data) ? insertResp.data[0] : insertResp.data;
  return res.status(201).json({
    ok: true,
    license: {
      ...created,
      note: (created && created.note) || "",
      devices_used: 0,
      devices: []
    }
  });
}

async function handlePatch(req, res) {
  const body = parseBody(req);
  const id = String(body.id || "").trim();
  if (!id) {
    return res.status(400).json({ ok: false, error: "Parameter id lisensi wajib diisi." });
  }

  if (body.action === "reset_devices") {
    const delResp = await sbFetch(`relaypost_license_devices?license_id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    if (!delResp.ok) {
      return res.status(502).json({ ok: false, error: "Gagal mereset daftar perangkat." });
    }
    return res.status(200).json({ ok: true, resetDevices: true });
  }

  const patch = {};

  if (body.status === "active" || body.status === "revoked") {
    patch.status = body.status;
  }

  if (body.maxDevices !== undefined) {
    patch.max_devices = Math.min(50, Math.max(1, Number(body.maxDevices) || 2));
  }

  if (body.customerEmail !== undefined) {
    patch.customer_email = String(body.customerEmail || "").trim().slice(0, 160) || null;
  }

  if (body.note !== undefined) {
    patch.note = String(body.note || "").trim().slice(0, 300) || null;
  }

  if (body.extendDays !== undefined) {
    const days = Number(body.extendDays);
    if (!Number.isFinite(days) || days <= 0) {
      return res.status(400).json({ ok: false, error: "Jumlah hari perpanjangan tidak valid." });
    }
    const curResp = await sbFetch(
      `relaypost_licenses?id=eq.${encodeURIComponent(id)}&select=expires_at&limit=1`
    );
    const cur = curResp.ok && Array.isArray(curResp.data) ? curResp.data[0] : null;
    const baseMs =
      cur && cur.expires_at && Date.parse(cur.expires_at) > Date.now()
        ? Date.parse(cur.expires_at)
        : Date.now();
    patch.expires_at = new Date(baseMs + days * 24 * 60 * 60 * 1000).toISOString();
    patch.status = "active";
  } else if (body.expiresAt !== undefined) {
    if (body.expiresAt === null || body.expiresAt === "") {
      patch.expires_at = null;
    } else {
      const parsed = Date.parse(body.expiresAt);
      if (!Number.isFinite(parsed)) {
        return res.status(400).json({ ok: false, error: "Format tanggal kadaluarsa tidak valid." });
      }
      patch.expires_at = new Date(parsed).toISOString();
    }
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ ok: false, error: "Tidak ada perubahan yang dikirim." });
  }

  let updateResp = await sbFetch(`relaypost_licenses?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });

  if (!updateResp.ok && patch.note !== undefined && isMissingNoteColumnError(updateResp)) {
    delete patch.note;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Kolom 'note' belum ada di Supabase. Jalankan ulang supabase-schema.sql."
      });
    }
    updateResp = await sbFetch(`relaypost_licenses?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
  }

  if (!updateResp.ok) {
    return res.status(502).json({ ok: false, error: "Gagal memperbarui lisensi." });
  }

  const updated = Array.isArray(updateResp.data) ? updateResp.data[0] : updateResp.data;
  return res.status(200).json({ ok: true, license: updated });
}

async function handleDelete(req, res) {
  const body = parseBody(req);
  const id = String((req.query && req.query.id) || body.id || "").trim();
  if (!id) {
    return res.status(400).json({ ok: false, error: "Parameter id lisensi wajib diisi." });
  }

  const delResp = await sbFetch(`relaypost_licenses?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });

  if (!delResp.ok) {
    return res.status(502).json({ ok: false, error: "Gagal menghapus lisensi." });
  }

  return res.status(200).json({ ok: true, deleted: id });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const expectedPassword = String(process.env.ADMIN_PASSWORD || "").trim();
  if (!expectedPassword) {
    return res.status(500).json({
      ok: false,
      error: "Server misconfigured: ADMIN_PASSWORD belum diatur di environment variables."
    });
  }

  const providedPassword = getProvidedPassword(req);
  if (!providedPassword || !safeEqual(providedPassword, expectedPassword)) {
    return res.status(401).json({ ok: false, error: "Password admin salah." });
  }

  try {
    if (req.method === "GET") return await handleList(res);
    if (req.method === "POST") return await handleCreate(req, res);
    if (req.method === "PATCH") return await handlePatch(req, res);
    if (req.method === "DELETE") return await handleDelete(req, res);
    return res.status(405).json({ ok: false, error: "Method tidak didukung." });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : "Terjadi kesalahan internal server."
    });
  }
};
