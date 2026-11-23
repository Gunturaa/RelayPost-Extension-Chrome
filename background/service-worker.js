importScripts("../shared/spintax.js", "../shared/media-db.js", "../shared/license.js");

const FB_TOKEN_TTL_MS = 14 * 60 * 1000;
const SAFETY_DAILY_LIMIT = 200;
const SCHED_ALARM = "__sched_wakeup";
const COMMENT_ALARM = "__comment_wakeup";

const ENGINE_LOG_KEY = "relayEngineLogs";
const MAX_LOG_ENTRIES = 600;

let activeAbort = false;
let activeLoopRunning = false;

async function getOrCreateDeviceId() {
  const { relayDeviceId } = await lsGet("relayDeviceId");
  if (relayDeviceId) return relayDeviceId;
  const fresh = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await lsSet({ relayDeviceId: fresh });
  return fresh;
}

async function verifyLicenseRemote(licenseKey, deviceId) {
  const cfg = self.RelayLicense.LICENSE_CONFIG;
  if (!cfg.verifyEndpoint) {
    // Local / staging mode before production server is connected
    if (/^RLY-PRO-[A-Z0-9-]{4,32}$/.test(licenseKey)) {
      return {
        valid: true,
        plan: "pro",
        expiresAt: null,
        customerEmail: null,
        mode: "local-dev"
      };
    }
    return { valid: false, error: "Format kunci uji lokal harus diawali RLY-PRO- (contoh: RLY-PRO-2026-DEMO)." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(cfg.verifyEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ licenseKey, deviceId, product: "relaypost" }),
      signal: controller.signal
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.valid) {
      return { valid: false, error: data?.error || data?.message || `License validation failed (HTTP ${res.status}).` };
    }
    return {
      valid: true,
      plan: data.plan === "pro" || data.valid ? "pro" : "free",
      expiresAt: data.expiresAt || null,
      customerEmail: data.customerEmail || null,
      mode: "remote"
    };
  } catch (err) {
    return { valid: false, error: err?.name === "AbortError" ? "License server timed out." : "Could not reach license server." };
  } finally {
    clearTimeout(timer);
  }
}

async function getLicenseState(forceRevalidate = false) {
  const { relayLicense = null } = await lsGet("relayLicense");
  const cfg = self.RelayLicense.LICENSE_CONFIG;
  const base = relayLicense || { plan: "free", status: "free", licenseKey: "", expiresAt: null, verifiedAt: 0, mode: cfg.verifyEndpoint ? "remote" : "local-dev" };

  if (
    cfg.verifyEndpoint &&
    base.licenseKey &&
    (forceRevalidate || Date.now() - (Number(base.verifiedAt) || 0) > cfg.revalidateIntervalMs)
  ) {
    const deviceId = await getOrCreateDeviceId();
    const check = await verifyLicenseRemote(base.licenseKey, deviceId);
    if (check.valid) {
      const updated = {
        ...base,
        plan: check.plan,
        status: "active",
        expiresAt: check.expiresAt,
        customerEmail: check.customerEmail,
        verifiedAt: Date.now(),
        mode: check.mode
      };
      await lsSet({ relayLicense: updated });
      return updated;
    }
    if (forceRevalidate) {
      const revoked = { ...base, plan: "free", status: "inactive", verifiedAt: Date.now() };
      await lsSet({ relayLicense: revoked });
      return revoked;
    }
  }
  return base;
}

async function activateLicenseKey(rawKey) {
  const key = self.RelayLicense.normalizeKey(rawKey);
  if (!key || key.length < 8) {
    return { ok: false, error: "Masukkan kode lisensi yang valid." };
  }
  const deviceId = await getOrCreateDeviceId();
  const res = await verifyLicenseRemote(key, deviceId);
  if (!res.valid) {
    return { ok: false, error: res.error || "Kode lisensi tidak valid." };
  }
  const record = {
    licenseKey: key,
    plan: res.plan || "pro",
    status: "active",
    expiresAt: res.expiresAt || null,
    customerEmail: res.customerEmail || null,
    verifiedAt: Date.now(),
    mode: res.mode || "remote"
  };
  await lsSet({ relayLicense: record });
  return { ok: true, license: record };
}

async function deactivateLicense() {
  const freeState = { plan: "free", status: "free", licenseKey: "", expiresAt: null, verifiedAt: Date.now() };
  await lsSet({ relayLicense: freeState });
  return { ok: true, license: freeState };
}

async function setToolbarBadge(text, color) {
  try {
    await chrome.action.setBadgeText({ text: String(text || "") });
    if (color) {
      await chrome.action.setBadgeBackgroundColor({ color });
    }
    if (chrome.action.setBadgeTextColor) {
      await chrome.action.setBadgeTextColor({ color: "#FFFFFF" }).catch(() => {});
    }
  } catch {
    // Ignore badge API errors when action unavailable.
  }
}

function formatBadgeProgress(done, total) {
  const full = `${done}/${total}`;
  return full.length <= 4 ? full : `${done}`;
}

async function checkGroupsHealth(groups) {
  const list = Array.isArray(groups) ? groups.slice(0, 60) : [];
  const results = [];
  for (const g of list) {
    const url = g && g.url;
    if (!url) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        credentials: "include",
        redirect: "follow",
        signal: controller.signal,
        headers: { Accept: "text/html,application/xhtml+xml" }
      });
      if (!res.ok) {
        results.push({ url, status: "unavailable", reason: `HTTP ${res.status}` });
      } else if (res.url.includes("/login") || res.url.includes("/checkpoint")) {
        results.push({ url, status: "unavailable", reason: "Login required" });
      } else {
        const html = await res.text();
        if (/group is archived|grup ini diarsipkan|archived this group|mengarsipkan grup ini/i.test(html)) {
          results.push({ url, status: "archived", reason: "Archived" });
        } else if (/this content isn'?t available|konten ini tidak tersedia|halaman ini tidak tersedia/i.test(html)) {
          results.push({ url, status: "unavailable", reason: "Unavailable" });
        } else {
          results.push({ url, status: "ok", reason: "Active" });
        }
      }
    } catch (err) {
      results.push({ url, status: "unavailable", reason: err?.name === "AbortError" ? "Timeout" : "Network error" });
    } finally {
      clearTimeout(timer);
    }
    await sleep(220);
  }
  return { ok: true, results };
}

async function lsGet(keys) {
  return chrome.storage.local.get(keys);
}

async function lsSet(obj) {
  return chrome.storage.local.set(obj);
}

async function ssGet(keys) {
  return chrome.storage.session.get(keys);
}

async function ssSet(obj) {
  return chrome.storage.session.set(obj);
}

async function engineLog(msg, level = "info") {
  const entry = { t: Date.now(), level, msg: String(msg) };
  try {
    const data = await lsGet(ENGINE_LOG_KEY);
    const list = Array.isArray(data[ENGINE_LOG_KEY]) ? data[ENGINE_LOG_KEY] : [];
    list.push(entry);
    if (list.length > MAX_LOG_ENTRIES) {
      list.splice(0, list.length - MAX_LOG_ENTRIES);
    }
    await lsSet({ [ENGINE_LOG_KEY]: list });
  } catch {
    // Storage write can fail transiently while Chrome shuts down.
  }
  try {
    const tabId = await findEngineTabId();
    if (tabId !== null) {
      await chrome.tabs.sendMessage(tabId, { type: "__ENGINE_LOG", ...entry }).catch(() => {});
    }
  } catch {
    // Engine tab may not be open.
  }
}

async function findEngineTabId() {
  const engineUrl = chrome.runtime.getURL("engine/engine.html");
  const tabs = await chrome.tabs.query({});
  const found = tabs.find((t) => String(t.url || t.pendingUrl || "").startsWith(engineUrl));
  return found && typeof found.id === "number" ? found.id : null;
}

async function getOrCreateEngineTab() {
  const existing = await findEngineTabId();
  if (existing !== null) {
    try {
      const alive = await Promise.race([
        chrome.tabs.sendMessage(existing, { action: "heartbeat" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2500))
      ]);
      if (alive && alive.status === "alive") {
        await chrome.tabs.update(existing, { autoDiscardable: false, pinned: true }).catch(() => {});
        return existing;
      }
    } catch {
      await chrome.tabs.remove(existing).catch(() => {});
    }
  }

  const engineUrl = chrome.runtime.getURL("engine/engine.html");
  let tab;
  try {
    tab = await chrome.tabs.create({ url: engineUrl, active: false, pinned: true });
  } catch {
    const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
    const targetWin = wins.find((w) => !w.incognito);
    if (targetWin) {
      tab = await chrome.tabs.create({ url: engineUrl, active: false, pinned: true, windowId: targetWin.id });
    } else {
      const createdWin = await chrome.windows.create({ url: engineUrl, type: "normal", focused: false });
      tab = createdWin.tabs && createdWin.tabs[0];
    }
  }

  if (!tab || typeof tab.id !== "number") {
    throw new Error("Could not create background Engine tab.");
  }

  await chrome.tabs.update(tab.id, { autoDiscardable: false, pinned: true }).catch(() => {});
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    await sleep(150);
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { action: "heartbeat" });
      if (res && res.status === "alive") return tab.id;
    } catch {
      // Waiting for engine.js to bind listener.
    }
  }
  return tab.id;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFbCookie(name) {
  try {
    const c = await chrome.cookies.get({ url: "https://www.facebook.com/", name });
    return c && c.value ? c.value : null;
  } catch {
    return null;
  }
}

function parseTokensFromHtml(html) {
  const pickJsonField = (obj, targetKey, field) => {
    if (!obj || typeof obj !== "object") return null;
    if (Object.prototype.hasOwnProperty.call(obj, targetKey) && obj[targetKey] && obj[targetKey][field] !== undefined) {
      return String(obj[targetKey][field]);
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object") {
        const hit = pickJsonField(val, targetKey, field);
        if (hit !== null) return hit;
      }
    }
    return null;
  };

  let dtsg = null;
  let uid = null;
  const scriptRe = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (!dtsg) dtsg = pickJsonField(parsed, "DTSGInitialData", "token");
      if (!uid) uid = pickJsonField(parsed, "CurrentUserInitialData", "USER_ID");
      if (dtsg && uid) break;
    } catch {
      // Ignore non-matching inline JSON blocks.
    }
  }

  if (!dtsg) {
    dtsg =
      html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"\}/)?.[1] ||
      html.match(/"token":"([^"]+)","async_get_token"/)?.[1] ||
      html.match(/"fb_dtsg","([^"]+)"/)?.[1] ||
      null;
  }
  if (!uid) {
    uid =
      html.match(/"USER_ID":"(\d+)"/)?.[1] ||
      html.match(/"userID":"(\d+)"/)?.[1] ||
      html.match(/"viewer_actor_id":"(\d+)"/)?.[1] ||
      null;
  }
  if (!dtsg || !uid) return null;

  const lsd =
    html.match(/\["LSD",\[\],\{"token":"([^"]+)"\}/)?.[1] ||
    html.match(/"lsd"\s*:\s*"([^"]+)"/)?.[1] ||
    "";
  const rev = html.match(/"__rev"\s*:\s*(\d+)/)?.[1] || "1017506513";
  const spinR = html.match(/"__spin_r"\s*:\s*(\d+)/)?.[1] || null;
  const spinB = html.match(/"__spin_b"\s*:\s*"([^"]+)"/)?.[1] || null;
  const spinT = html.match(/"__spin_t"\s*:\s*(\d+)/)?.[1] || null;
  const hs = html.match(/"haste_session"\s*:\s*"([^"]+)"/)?.[1] || null;
  const userName =
    html.match(/"NAME":"([^"]+)"/)?.[1] ||
    html.match(/"name":"([^"]+)","userVanity"/)?.[1] ||
    null;
  const rawAvatar =
    html.match(/"profile_picture":\s*\{\s*"uri":\s*"([^"]+)"/)?.[1] ||
    html.match(/"square_profile_picture":\s*\{\s*"uri":\s*"([^"]+)"/)?.[1] ||
    null;
  const userAvatar = rawAvatar
    ? rawAvatar.replace(/\\\//g, "/").replace(/\\u0026/g, "&").replace(/\\u003D/g, "=")
    : null;
  const actorId =
    html.match(/"actorId"\s*:\s*"(\d+)"/)?.[1] ||
    html.match(/"viewer_actor_id"\s*:\s*"(\d+)"/)?.[1] ||
    uid;

  let jazoestSum = 0;
  for (let i = 0; i < dtsg.length; i++) jazoestSum += dtsg.charCodeAt(i);

  return {
    dtsg,
    uid,
    actorId,
    lsd,
    rev,
    spin_r: spinR,
    spin_b: spinB,
    spin_t: spinT,
    hs,
    jazoest: "25" + jazoestSum,
    userName,
    userAvatar,
    lastRefresh: Date.now()
  };
}

async function extractFbTokens(force = false) {
  const iUser = await getFbCookie("i_user");
  const cUser = await getFbCookie("c_user");
  const activeActor = iUser && /^\d+$/.test(iUser) ? iUser : cUser && /^\d+$/.test(cUser) ? cUser : null;

  if (!force) {
    try {
      const { fbSession } = await ssGet("fbSession");
      if (fbSession && fbSession.dtsg && fbSession.uid && Date.now() - fbSession.lastRefresh < FB_TOKEN_TTL_MS) {
        if (!activeActor || String(fbSession.actorId) === activeActor) {
          return fbSession;
        }
      }
    } catch {
      // Continue to network fetch.
    }
  }

  if (!cUser) {
    await lsSet({ _fbAuthState: "signed_out" });
    return null;
  }

  const urls = ["https://www.facebook.com/", "https://www.facebook.com/settings"];
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, {
        credentials: "include",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });
      if (res.url.includes("/login")) {
        await lsSet({ _fbAuthState: "signed_out" });
        return null;
      }
      if (res.url.includes("/checkpoint") || res.url.includes("/two_factor")) {
        await lsSet({ _fbAuthState: "checkpoint_required" });
        return null;
      }
      if (!res.ok) continue;
      const html = await res.text();
      const tokens = parseTokensFromHtml(html);
      if (tokens) {
        if (activeActor) tokens.actorId = activeActor;
        await ssSet({ fbSession: tokens });
        await lsSet({ _fbAuthState: "ok" });
        return tokens;
      }
    } catch {
      // Try next fallback URL.
    } finally {
      clearTimeout(timer);
    }
  }

  // Fallback endpoint for dtsg
  try {
    const res = await fetch("https://www.facebook.com/ajax/dtsg/?__a=1", { credentials: "include" });
    if (res.ok) {
      const text = await res.text();
      const dtsg = text.match(/"token":"([^"]+)"/)?.[1];
      if (dtsg && cUser) {
        let sum = 0;
        for (let i = 0; i < dtsg.length; i++) sum += dtsg.charCodeAt(i);
        const fallbackSession = {
          dtsg,
          uid: cUser,
          actorId: activeActor || cUser,
          lsd: "",
          rev: "1017506513",
          jazoest: "25" + sum,
          userName: null,
          userAvatar: null,
          lastRefresh: Date.now()
        };
        await ssSet({ fbSession: fallbackSession });
        await lsSet({ _fbAuthState: "ok" });
        return fallbackSession;
      }
    }
  } catch {
    // Ignore fallback error.
  }

  return null;
}

async function getFbStatus() {
  const cUser = await getFbCookie("c_user");
  const iUser = await getFbCookie("i_user");
  const session = await extractFbTokens(false);
  const { _fbAuthState, _managedProfiles = [] } = await lsGet(["_fbAuthState", "_managedProfiles"]);
  const activeId = iUser || cUser || (session && session.actorId) || null;
  const activePage = Array.isArray(_managedProfiles)
    ? _managedProfiles.find((p) => String(p.id) === String(activeId))
    : null;

  return {
    signedIn: Boolean(cUser && session && session.dtsg),
    authState: cUser ? (_fbAuthState || "ok") : "signed_out",
    uid: cUser || null,
    actorId: activeId,
    isPage: Boolean(iUser && iUser !== cUser),
    name: activePage ? activePage.name : (session?.userName || (cUser ? `Facebook User (${cUser})` : null)),
    avatar: activePage ? activePage.avatar : (session?.userAvatar || null),
    profiles: _managedProfiles
  };
}

async function fetchManagedPages() {
  const cUser = await getFbCookie("c_user");
  if (!cUser) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://www.facebook.com/pages/?category=your_pages", {
      credentials: "include",
      signal: controller.signal
    });
    if (!res.ok) return [];
    const html = await res.text();
    const pages = [];
    const seen = new Set();
    const re = /"page_id"\s*:\s*"(\d+)"[\s\S]{0,400}?"name"\s*:\s*"([^"]{1,120})"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        pages.push({ id: m[1], name: m[2], kind: "page" });
      }
    }
    await lsSet({ _managedProfiles: pages });
    return pages;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function switchFbActor(actorId) {
  const cUser = await getFbCookie("c_user");
  if (!cUser) throw new Error("Not signed in to Facebook.");
  if (!actorId || String(actorId) === String(cUser)) {
    await chrome.cookies.remove({ url: "https://www.facebook.com/", name: "i_user" });
  } else {
    await chrome.cookies.set({
      url: "https://www.facebook.com/",
      domain: ".facebook.com",
      path: "/",
      name: "i_user",
      value: String(actorId),
      secure: true,
      sameSite: "no_restriction"
    });
  }
  await chrome.storage.session.remove("fbSession");
  await extractFbTokens(true);
  return getFbStatus();
}

async function collectJoinedGroups() {
  const cUser = await getFbCookie("c_user");
  if (!cUser) {
    return { ok: false, error: "Sign in to Facebook in Chrome before scanning your groups." };
  }

  await lsSet({
    _groupScanProgress: { scanning: true, found: 0, status: "Opening Facebook Groups..." }
  });

  let scanTab = null;
  try {
    scanTab = await chrome.tabs.create({
      url: "https://www.facebook.com/groups/joins/?nav_source=tab",
      active: false
    });

    const loaded = await waitForTabComplete(scanTab.id, 20000);
    if (!loaded) {
      throw new Error("Timed out loading Facebook Groups page.");
    }

    await sleep(1800);
    await chrome.scripting.executeScript({
      target: { tabId: scanTab.id },
      files: ["content/group-scanner.js"]
    });

    const result = await chrome.tabs.sendMessage(scanTab.id, { action: "scanJoinedGroups" });
    if (!result || !result.ok) {
      throw new Error(result?.error || "Group scan returned no data.");
    }

    const groups = Array.isArray(result.groups) ? result.groups : [];
    await lsSet({
      joinedFacebookGroups: groups,
      joinedFacebookGroupsAt: Date.now(),
      _groupScanProgress: { scanning: false, found: groups.length, status: "Complete" }
    });
    await engineLog(`Synced ${groups.length} joined Facebook groups.`, "success");
    return { ok: true, groups };
  } catch (err) {
    const msg = err?.message || "Failed to scan Facebook groups.";
    await lsSet({
      _groupScanProgress: { scanning: false, found: 0, error: msg, status: "Error" }
    });
    return { ok: false, error: msg };
  } finally {
    if (scanTab && typeof scanTab.id === "number") {
      await chrome.tabs.remove(scanTab.id).catch(() => {});
    }
  }
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(val);
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === "complete") finish(true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((t) => {
      if (t && t.status === "complete") finish(true);
    }).catch(() => finish(false));
  });
}

function pickGroupMedia(post) {
  if (post.imageSetsEnabled && Array.isArray(post.imageSets) && post.imageSets.length > 0) {
    const nonEmpty = post.imageSets.filter((s) => Array.isArray(s.imageIds) && s.imageIds.length > 0);
    if (nonEmpty.length > 0) {
      const chosen = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
      return { imageIds: chosen.imageIds.slice(), videoId: null, setName: chosen.name || "Set" };
    }
  }
  return {
    imageIds: Array.isArray(post.imageIds) ? post.imageIds.slice() : [],
    videoId: post.videoId || null,
    setName: null
  };
}

function computeDelayMs(delivery, index, postsTodayCount) {
  const baseMin = Math.max(0.2, Number(delivery.waitMinutes) || 2.5);
  const perRound = Math.max(1, Number(delivery.postsPerRound) || 1);
  if ((index + 1) % perRound !== 0) {
    return 1500;
  }

  let factor = 1;
  if (delivery.extraSafePacing) {
    if (postsTodayCount >= 100) factor = 4;
    else if (postsTodayCount >= 60) factor = 2.5;
    else if (postsTodayCount >= 30) factor = 1.5;
  }

  let ms = baseMin * 60 * 1000 * factor;
  if (delivery.randomizeWait !== false) {
    const jitter = 0.75 + Math.random() * 0.5;
    ms = Math.round(ms * jitter);
  }
  return Math.max(2000, ms);
}

async function getPostsTodayCount() {
  const { _postHistory = [] } = await lsGet("_postHistory");
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const minTs = startOfDay.getTime();
  return (Array.isArray(_postHistory) ? _postHistory : []).filter((item) => item && item.ts >= minTs).length;
}

async function recordTodayPost() {
  const { _postHistory = [] } = await lsGet("_postHistory");
  const cutoff = Date.now() - 48 * 3600 * 1000;
  const list = (Array.isArray(_postHistory) ? _postHistory : []).filter((i) => i && i.ts >= cutoff);
  list.push({ ts: Date.now() });
  await lsSet({ _postHistory: list, _lastPostSuccessAt: Date.now() });
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x2000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function postSingleViaSafeDom(job) {
  let win = null;
  let tab = null;
  try {
    const mediaIds = [...(Array.isArray(job.imageIds) ? job.imageIds : [])];
    if (job.videoId && !mediaIds.includes(job.videoId)) mediaIds.push(job.videoId);
    const mediaFiles = [];
    for (const mid of mediaIds) {
      try {
        const rec = await self.RelayMediaDB.getMediaRecord(mid);
        if (rec && rec.blob) {
          const buf = await rec.blob.arrayBuffer();
          mediaFiles.push({
            name: rec.name || "photo.jpg",
            type: rec.type || rec.blob.type || "image/jpeg",
            base64: arrayBufferToBase64(buf)
          });
        }
      } catch {
        // Ignore single unreadable media item.
      }
    }
    const safeJob = { ...job, mediaFiles };

    const createdWin = await chrome.windows.create({
      url: safeJob.groupUrl,
      type: "popup",
      width: 960,
      height: 820,
      focused: true
    });
    win = createdWin;
    tab = createdWin.tabs && createdWin.tabs[0];
    if (!tab || typeof tab.id !== "number") {
      return { success: false, error: "Could not open Safe Mode window." };
    }

    const loaded = await waitForTabComplete(tab.id, 25000);
    if (!loaded) {
      return { success: false, error: "Group page did not finish loading in time." };
    }

    await sleep(1600);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/always-active.js"]
    }).catch(() => {});

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["shared/spintax.js", "content/poster-content.js"]
    });

    const response = await Promise.race([
      chrome.tabs.sendMessage(tab.id, { action: "safePostToGroup", job: safeJob }),
      new Promise((resolve) => setTimeout(() => resolve({ success: false, error: "Safe posting timed out." }), 95000))
    ]);

    return response || { success: false, error: "No response from Facebook page." };
  } catch (err) {
    return { success: false, error: err?.message || "Safe mode execution failed." };
  } finally {
    if (win && typeof win.id === "number") {
      await chrome.windows.remove(win.id).catch(() => {});
    }
  }
}

async function postSingleViaFastEngine(job) {
  const tabId = await getOrCreateEngineTab();
  return chrome.tabs.sendMessage(tabId, { action: "executeFastPost", job });
}

async function runCampaign(payload) {
  if (activeLoopRunning) {
    return { ok: false, error: "Another campaign is currently running." };
  }

  activeLoopRunning = true;
  activeAbort = false;

  const startedAt = Date.now();
  const seed = Math.floor(Math.random() * 100000);
  const post = payload.post || {};
  const delivery = payload.delivery || {};
  let groups = Array.isArray(payload.groups) ? payload.groups.slice() : [];

  const lic = await getLicenseState(false);
  const limits = self.RelayLicense.getLimits(lic);
  if (groups.length > limits.maxGroupsPerCampaign) {
    activeLoopRunning = false;
    return {
      ok: false,
      error: `Free plan supports up to ${limits.maxGroupsPerCampaign} groups per campaign. Upgrade to Pro for unlimited groups.`
    };
  }

  if (delivery.randomizeOrder) {
    for (let i = groups.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [groups[i], groups[j]] = [groups[j], groups[i]];
    }
  }

  const progress = {
    startedAt,
    state: "started",
    total: groups.length,
    done: 0,
    successCount: 0,
    pendingCount: 0,
    failedCount: 0,
    currentGroup: null,
    nextPostAt: null,
    results: []
  };

  await lsSet({
    isPostingInProgress: "started",
    _stopRequested: false,
    campaignProgress: progress,
    postingStatus: `Starting campaign for ${groups.length} group(s)`
  });
  await setToolbarBadge(formatBadgeProgress(0, groups.length), "#0066CC");

  await engineLog(`Campaign started: ${groups.length} group(s) in ${delivery.postingMethod === "safe" ? "Safe" : "Fast"} mode.`, "info");

  const versions = Array.isArray(post.versions)
    ? post.versions.filter((v) => String(v || "").trim().length > 0)
    : [];
  const baseBody = String(post.text || "");
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const inlineComment = comments.find((c) => Number(c.delayMinutes) === 0 && (c.text || c.imageId));
  const delayedComments = comments.filter((c) => Number(c.delayMinutes) > 0 && (c.text || c.imageId));

  try {
    const tokens = await extractFbTokens(false);
    if (!tokens) {
      throw new Error("Facebook session unavailable. Sign in to Facebook and retry.");
    }

    if (delivery.postingMethod !== "safe") {
      await getOrCreateEngineTab();
    }

    for (let i = 0; i < groups.length; i++) {
      // Check pause or stop before each group
      while (true) {
        const flags = await lsGet(["isPostingInProgress", "_stopRequested"]);
        if (activeAbort || flags._stopRequested || flags.isPostingInProgress === "stopped") {
          progress.state = "stopped";
          await engineLog("Campaign stopped by user.", "warn");
          break;
        }
        if (flags.isPostingInProgress === "paused") {
          progress.state = "paused";
          await lsSet({ campaignProgress: progress });
          await setToolbarBadge("II", "#B25000");
          await sleep(1000);
          continue;
        }
        progress.state = "started";
        await setToolbarBadge(formatBadgeProgress(progress.done, progress.total), "#0066CC");
        break;
      }

      if (progress.state === "stopped") break;

      const group = groups[i];
      progress.currentGroup = group;
      progress.nextPostAt = null;
      await lsSet({
        campaignProgress: progress,
        postingStatus: `Posting ${i + 1}/${groups.length}: ${group.name || group.url}`
      });

      const rawTemplate = versions.length >= 2 ? versions[i % versions.length] : baseBody;
      const expandedText = self.RelaySpintax.variantFor(rawTemplate, i, seed);
      const media = pickGroupMedia(post);
      const expandedComment = inlineComment && inlineComment.text
        ? self.RelaySpintax.variantFor(inlineComment.text, i, seed + 17)
        : "";

      const job = {
        groupId: group.id || null,
        groupUrl: group.url,
        groupName: group.name || group.url,
        text: expandedText,
        background: post.background || null,
        imageIds: media.imageIds,
        videoId: media.videoId,
        shareUrl: post.shareUrl || null,
        commentText: expandedComment,
        commentImageId: inlineComment ? inlineComment.imageId || null : null,
        humanLevel: Number(delivery.humanLevel ?? 2),
        tokens
      };

      let outcome;
      try {
        outcome = delivery.postingMethod === "safe"
          ? await postSingleViaSafeDom(job)
          : await postSingleViaFastEngine(job);
      } catch (err) {
        outcome = { success: false, error: err?.message || "Unexpected posting error." };
      }

      const status = outcome?.pending
        ? "pending"
        : outcome?.success
          ? "success"
          : "failed";

      if (status === "success") {
        progress.successCount++;
        await recordTodayPost();
        await engineLog(`Posted to ${group.name || group.url}`, "success");
      } else if (status === "pending") {
        progress.pendingCount++;
        await recordTodayPost();
        await engineLog(`Pending admin approval in ${group.name || group.url}`, "warn");
      } else {
        progress.failedCount++;
        await engineLog(`Failed in ${group.name || group.url}: ${outcome?.error || "Unknown error"}`, "error");
      }

      progress.done++;
      progress.results.push({
        groupId: group.id || null,
        name: group.name || group.url,
        url: group.url,
        status,
        postUrl: outcome?.postUrl || null,
        postId: outcome?.postId || null,
        error: outcome?.error || null,
        ts: Date.now()
      });

      if ((status === "success") && outcome?.postId && delayedComments.length > 0) {
        await enqueueDelayedComments(delayedComments, outcome.postId, group, seed + i * 31);
      }

      await lsSet({ campaignProgress: progress });
      await setToolbarBadge(formatBadgeProgress(progress.done, progress.total), "#0066CC");

      if (i < groups.length - 1) {
        const todayCount = await getPostsTodayCount();
        const waitMs = computeDelayMs(delivery, i, todayCount);
        progress.nextPostAt = Date.now() + waitMs;
        await lsSet({ campaignProgress: progress });
      await setToolbarBadge(formatBadgeProgress(progress.done, progress.total), "#0066CC");

        const waitEnd = Date.now() + waitMs;
        while (Date.now() < waitEnd) {
          const flags = await lsGet(["isPostingInProgress", "_stopRequested"]);
          if (activeAbort || flags._stopRequested || flags.isPostingInProgress === "stopped") {
            progress.state = "stopped";
            break;
          }
          if (flags.isPostingInProgress === "paused") {
            await sleep(800);
            continue;
          }
          await sleep(Math.min(1000, waitEnd - Date.now()));
        }
        if (progress.state === "stopped") break;
      }
    }

    if (progress.state !== "stopped") {
      progress.state = "completed";
    }
    progress.currentGroup = null;
    progress.nextPostAt = null;

    // Save to persistent history
    const { postHistory = [] } = await lsGet("postHistory");
    const historyEntry = {
      id: `run_${startedAt}`,
      startedAt,
      finishedAt: Date.now(),
      textPreview: baseBody.replace(/<[^>]+>/g, " ").trim().slice(0, 140),
      method: delivery.postingMethod || "fast",
      counts: {
        total: progress.total,
        success: progress.successCount,
        pending: progress.pendingCount,
        failed: progress.failedCount
      },
      groups: progress.results
    };
    const nextHistory = [historyEntry, ...(Array.isArray(postHistory) ? postHistory : [])].slice(0, 200);
    await lsSet({
      postHistory: nextHistory,
      campaignProgress: progress,
      isPostingInProgress: "idle",
      postingStatus: "Idle"
    });
    if (progress.state === "stopped") {
      await setToolbarBadge("!", "#C82333");
    } else if (progress.failedCount > 0) {
      await setToolbarBadge(`${progress.failedCount}!`, "#C82333");
    } else {
      await setToolbarBadge("OK", "#1B7E36");
    }

    await engineLog(
      `Campaign finished: ${progress.successCount} posted, ${progress.pendingCount} pending, ${progress.failedCount} failed.`,
      progress.failedCount > 0 ? "warn" : "success"
    );
    return { ok: true, progress };
  } catch (err) {
    const errMsg = err?.message || "Campaign failed.";
    progress.state = "error";
    progress.error = errMsg;
    await lsSet({
      campaignProgress: progress,
      isPostingInProgress: "idle",
      postingStatus: errMsg
    });
    await setToolbarBadge("!", "#C82333");
    await engineLog(`Campaign aborted: ${errMsg}`, "error");
    return { ok: false, error: errMsg, progress };
  } finally {
    activeLoopRunning = false;
  }
}

async function enqueueDelayedComments(delayedComments, postId, group, seed) {
  const { _commentQueue = [] } = await lsGet("_commentQueue");
  const queue = Array.isArray(_commentQueue) ? _commentQueue.slice() : [];
  const now = Date.now();
  for (let idx = 0; idx < delayedComments.length; idx++) {
    const c = delayedComments[idx];
    const delayMin = Math.max(1, Number(c.delayMinutes) || 10);
    queue.push({
      id: `cmt_${now}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      postId: String(postId),
      groupUrl: group.url,
      groupName: group.name || group.url,
      text: c.text ? self.RelaySpintax.variantFor(c.text, idx, seed) : "",
      imageId: c.imageId || null,
      dueAt: now + delayMin * 60 * 1000,
      status: "queued"
    });
  }
  await lsSet({ _commentQueue: queue.slice(-500) });
  await armNextCommentAlarm();
}

async function armNextCommentAlarm() {
  const { _commentQueue = [], _commentQueuePaused = false } = await lsGet(["_commentQueue", "_commentQueuePaused"]);
  if (_commentQueuePaused) {
    await chrome.alarms.clear(COMMENT_ALARM);
    return;
  }
  const queued = (Array.isArray(_commentQueue) ? _commentQueue : []).filter((c) => c.status === "queued");
  if (!queued.length) {
    await chrome.alarms.clear(COMMENT_ALARM);
    return;
  }
  const soonest = Math.min(...queued.map((c) => Number(c.dueAt) || Date.now()));
  await chrome.alarms.create(COMMENT_ALARM, { when: Math.max(Date.now() + 5000, soonest) });
}

async function processDelayedComments() {
  const { _commentQueue = [], _commentQueuePaused = false } = await lsGet(["_commentQueue", "_commentQueuePaused"]);
  if (_commentQueuePaused || !Array.isArray(_commentQueue) || !_commentQueue.length) return;
  const now = Date.now();
  const tokens = await extractFbTokens(false);
  if (!tokens) return;

  const updated = _commentQueue.slice();
  let changed = false;
  for (let i = 0; i < updated.length; i++) {
    const item = updated[i];
    if (item.status !== "queued" || item.dueAt > now) continue;
    try {
      const tabId = await getOrCreateEngineTab();
      const res = await chrome.tabs.sendMessage(tabId, {
        action: "executeFastComment",
        job: {
          postId: item.postId,
          text: item.text,
          imageId: item.imageId,
          tokens
        }
      });
      updated[i] = {
        ...item,
        status: res && res.success ? "sent" : "failed",
        doneAt: Date.now(),
        error: res && !res.success ? res.error : null
      };
      changed = true;
    } catch (err) {
      updated[i] = { ...item, status: "failed", doneAt: Date.now(), error: err?.message || "Comment failed" };
      changed = true;
    }
  }
  if (changed) {
    await lsSet({ _commentQueue: updated });
  }
  await armNextCommentAlarm();
}

function computeNextScheduleRun(schedule, fromMs = Date.now()) {
  if (!schedule || typeof schedule !== "object") return null;
  const [hh, mm] = String(schedule.time || "09:00").split(":").map((n) => Number(n) || 0);
  const type = schedule.frequency || "once";

  if (type === "once") {
    if (!schedule.date) return null;
    const [y, m, d] = schedule.date.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0);
    return dt.getTime() > fromMs ? dt.getTime() : null;
  }

  const base = new Date(fromMs);
  for (let offset = 0; offset <= 35; offset++) {
    const cand = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, hh, mm, 0, 0);
    if (cand.getTime() <= fromMs) continue;
    if (type === "daily") return cand.getTime();
    if (type === "weekly") {
      const days = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [];
      if (days.includes(cand.getDay())) return cand.getTime();
    }
    if (type === "monthly") {
      const dates = Array.isArray(schedule.daysOfMonth) ? schedule.daysOfMonth : [];
      if (dates.includes(cand.getDate())) return cand.getTime();
    }
  }
  return null;
}

async function armNextScheduleAlarm() {
  const { scheduledPosts = [], schedulerPaused = false, keepComputerAwake = true } = await lsGet([
    "scheduledPosts",
    "schedulerPaused",
    "keepComputerAwake"
  ]);

  if (schedulerPaused) {
    await chrome.alarms.clear(SCHED_ALARM);
    chrome.power.releaseKeepAwake();
    return;
  }

  const active = (Array.isArray(scheduledPosts) ? scheduledPosts : []).filter(
    (s) => s && s.state === "scheduled" && Number.isFinite(s.nextRunAt)
  );
  if (!active.length) {
    await chrome.alarms.clear(SCHED_ALARM);
    chrome.power.releaseKeepAwake();
    return;
  }

  const soonest = Math.min(...active.map((s) => s.nextRunAt));
  await chrome.alarms.create(SCHED_ALARM, { when: Math.max(Date.now() + 5000, soonest) });

  if (keepComputerAwake && soonest - Date.now() <= 60 * 60 * 1000) {
    chrome.power.requestKeepAwake("system");
  } else {
    chrome.power.releaseKeepAwake();
  }
}

async function processDueSchedules() {
  const { scheduledPosts = [], schedulerPaused = false } = await lsGet(["scheduledPosts", "schedulerPaused"]);
  if (schedulerPaused || !Array.isArray(scheduledPosts) || !scheduledPosts.length) return;

  const now = Date.now();
  const GRACE_MS = 15 * 60 * 1000;
  let missedCount = 0;
  let dueItem = null;
  const updated = scheduledPosts.map((item) => {
    if (!item || item.state !== "scheduled" || !item.nextRunAt) return item;
    if (item.nextRunAt <= now) {
      if (now - item.nextRunAt > GRACE_MS) {
        missedCount++;
        return { ...item, state: "missed", missedAt: now };
      }
      if (!dueItem) dueItem = item;
    }
    return item;
  });

  if (missedCount > 0) {
    await lsSet({ scheduledPosts: updated, _missedSchedules: { count: missedCount, at: now } });
    await chrome.action.setBadgeText({ text: String(missedCount) });
    await chrome.action.setBadgeBackgroundColor({ color: "#D95D24" });
  }

  if (dueItem && !activeLoopRunning) {
    const nextTime = dueItem.schedule.frequency === "once"
      ? null
      : computeNextScheduleRun(dueItem.schedule, now + 60000);
    const afterList = updated.map((item) =>
      item.id === dueItem.id
        ? {
            ...item,
            state: nextTime ? "scheduled" : "done",
            lastRunAt: now,
            nextRunAt: nextTime
          }
        : item
    );
    await lsSet({ scheduledPosts: afterList });
    await runCampaign({
      post: dueItem.post,
      groups: dueItem.groups,
      delivery: dueItem.delivery
    });
  }

  await armNextScheduleAlarm();
}

async function applyShareButtonSetting() {
  const { shareButtonEnabled = true } = await lsGet("shareButtonEnabled");
  const fbTabs = await chrome.tabs.query({ url: ["https://www.facebook.com/*", "https://*.facebook.com/*"] });
  for (const tab of fbTabs) {
    if (typeof tab.id !== "number") continue;
    if (shareButtonEnabled) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/share-button.js"]
      }).catch(() => {});
    } else {
      await chrome.tabs.sendMessage(tab.id, { action: "removeShareButtons" }).catch(() => {});
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const { shareButtonEnabled } = await lsGet("shareButtonEnabled");
  if (shareButtonEnabled === undefined) {
    await lsSet({ shareButtonEnabled: true, keepComputerAwake: true });
  }
  await armNextScheduleAlarm();
  await armNextCommentAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await processDueSchedules();
  await armNextCommentAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SCHED_ALARM) {
    await processDueSchedules();
  } else if (alarm.name === COMMENT_ALARM) {
    await processDelayedComments();
  }
});

chrome.cookies.onChanged.addListener(async (changeInfo) => {
  const cookie = changeInfo && changeInfo.cookie;
  if (!cookie) return;
  if ((cookie.name === "c_user" || cookie.name === "i_user") && String(cookie.domain || "").includes("facebook.com")) {
    await chrome.storage.session.remove("fbSession").catch(() => {});
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !/^https:\/\/([^/]+\.)?facebook\.com\//i.test(tab.url)) return;
  const { shareButtonEnabled = true } = await lsGet("shareButtonEnabled");
  if (!shareButtonEnabled) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/share-button.js"]
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const action = message && message.action;
    if (action === "getFbStatus") {
      sendResponse({ ok: true, status: await getFbStatus() });
      return;
    }
    if (action === "refreshFbSession") {
      await chrome.storage.session.remove("fbSession").catch(() => {});
      await extractFbTokens(true);
      sendResponse({ ok: true, status: await getFbStatus() });
      return;
    }
    if (action === "fetchManagedPages") {
      const pages = await fetchManagedPages();
      sendResponse({ ok: true, pages });
      return;
    }
    if (action === "switchFbActor") {
      const status = await switchFbActor(message.actorId);
      sendResponse({ ok: true, status });
      return;
    }
    if (action === "collectJoinedGroups") {
      sendResponse(await collectJoinedGroups());
      return;
    }
    if (action === "checkGroupsHealth") {
      sendResponse(await checkGroupsHealth(message.groups));
      return;
    }
    if (action === "clearToolbarBadge") {
      await setToolbarBadge("", "#0066CC");
      sendResponse({ ok: true });
      return;
    }
    if (action === "POST_PAYLOAD") {
      // Fire-and-forget campaign loop while returning immediate ack to popup
      runCampaign(message.payload).catch(() => {});
      sendResponse({ ok: true, started: true });
      return;
    }
    if (action === "pausePosting") {
      await lsSet({ isPostingInProgress: "paused" });
      await engineLog("Campaign paused.", "warn");
      sendResponse({ ok: true });
      return;
    }
    if (action === "resumePosting") {
      await lsSet({ isPostingInProgress: "started" });
      await engineLog("Campaign resumed.", "info");
      sendResponse({ ok: true });
      return;
    }
    if (action === "stopPosting") {
      activeAbort = true;
      await lsSet({ isPostingInProgress: "stopped", _stopRequested: true });
      sendResponse({ ok: true });
      return;
    }
    if (action === "forceReset") {
      activeAbort = true;
      activeLoopRunning = false;
      await lsSet({ isPostingInProgress: "idle", _stopRequested: false, postingStatus: "Idle" });
      sendResponse({ ok: true });
      return;
    }
    if (action === "getLicenseState") {
      sendResponse({ ok: true, license: await getLicenseState(false), deviceId: await getOrCreateDeviceId() });
      return;
    }
    if (action === "activateLicense") {
      sendResponse(await activateLicenseKey(message.licenseKey));
      return;
    }
    if (action === "revalidateLicense") {
      sendResponse({ ok: true, license: await getLicenseState(true) });
      return;
    }
    if (action === "deactivateLicense") {
      sendResponse(await deactivateLicense());
      return;
    }
    if (action === "schedulePost") {
      const lic = await getLicenseState(false);
      const limits = self.RelayLicense.getLimits(lic);
      const { scheduledPosts = [] } = await lsGet("scheduledPosts");
      const activeCount = (Array.isArray(scheduledPosts) ? scheduledPosts : []).filter((s) => s && s.state === "scheduled").length;
      if (!message.id && activeCount >= limits.maxActiveSchedules) {
        sendResponse({ ok: false, error: `Free plan allows up to ${limits.maxActiveSchedules} active schedule. Upgrade to Pro for unlimited schedules.` });
        return;
      }
      const id = message.id || `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const nextRunAt = computeNextScheduleRun(message.schedule, Date.now());
      if (!nextRunAt) {
        sendResponse({ ok: false, error: "Selected schedule time is in the past." });
        return;
      }
      const item = {
        id,
        post: message.post,
        groups: message.groups,
        delivery: message.delivery,
        schedule: message.schedule,
        state: "scheduled",
        nextRunAt,
        createdAt: Date.now()
      };
      const list = Array.isArray(scheduledPosts) ? scheduledPosts.slice() : [];
      const idx = list.findIndex((s) => s.id === id);
      if (idx >= 0) list[idx] = item;
      else list.unshift(item);
      await lsSet({ scheduledPosts: list });
      await armNextScheduleAlarm();
      sendResponse({ ok: true, item });
      return;
    }
    if (action === "deleteScheduledPost") {
      const { scheduledPosts = [] } = await lsGet("scheduledPosts");
      const filtered = (Array.isArray(scheduledPosts) ? scheduledPosts : []).filter((s) => s.id !== message.id);
      await lsSet({ scheduledPosts: filtered });
      await armNextScheduleAlarm();
      sendResponse({ ok: true });
      return;
    }
    if (action === "toggleSchedulerPaused") {
      const paused = Boolean(message.paused);
      await lsSet({ schedulerPaused: paused });
      await armNextScheduleAlarm();
      sendResponse({ ok: true, paused });
      return;
    }
    if (action === "runScheduledNow") {
      const { scheduledPosts = [] } = await lsGet("scheduledPosts");
      const item = (Array.isArray(scheduledPosts) ? scheduledPosts : []).find((s) => s.id === message.id);
      if (!item) {
        sendResponse({ ok: false, error: "Scheduled item not found." });
        return;
      }
      if (item.schedule?.frequency === "once") {
        const nextList = scheduledPosts.map((s) => (s.id === item.id ? { ...s, state: "done", lastRunAt: Date.now() } : s));
        await lsSet({ scheduledPosts: nextList });
      }
      runCampaign({ post: item.post, groups: item.groups, delivery: item.delivery }).catch(() => {});
      sendResponse({ ok: true });
      return;
    }
    if (action === "clearMissedBadge") {
      await lsSet({ _missedSchedules: { count: 0 } });
      await chrome.action.setBadgeText({ text: "" });
      sendResponse({ ok: true });
      return;
    }
    if (action === "openEngineTab") {
      const tabId = await getOrCreateEngineTab();
      await chrome.tabs.update(tabId, { active: true });
      sendResponse({ ok: true, tabId });
      return;
    }
    if (action === "mgpStageShare") {
      const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      await ssSet({ mgpShareStaged: { token, post: message.post, createdAt: Date.now() } });
      sendResponse({ ok: true, token });
      return;
    }
    if (action === "mgpTakeShare") {
      const { mgpShareStaged } = await ssGet("mgpShareStaged");
      if (!mgpShareStaged || mgpShareStaged.token !== message.token) {
        sendResponse({ ok: false, reason: "expired" });
        return;
      }
      sendResponse({ ok: true, post: mgpShareStaged.post });
      return;
    }
    if (action === "mgpShareButtonSetting") {
      await lsSet({ shareButtonEnabled: Boolean(message.enabled) });
      await applyShareButtonSetting();
      sendResponse({ ok: true });
      return;
    }
    if (action === "openPopupWorkspace") {
      const url = chrome.runtime.getURL("popup/index.html?workspace=1");
      await chrome.tabs.create({ url, active: true });
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, error: `Unknown action: ${action}` });
  })().catch((err) => {
    sendResponse({ ok: false, error: err?.message || "Service worker error" });
  });
  return true;
});
