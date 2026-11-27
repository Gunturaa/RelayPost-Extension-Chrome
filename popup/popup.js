(function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  const IS_WORKSPACE = params.get("workspace") === "1";
  const SHARE_TOKEN = params.get("sheet") === "share" ? params.get("t") : null;

  if (IS_WORKSPACE || SHARE_TOKEN) {
    document.body.classList.add("is-workspace");
  }

  const BG_PRESETS = [
    { id: "none", presetId: "0", label: "None", color: "transparent", border: "var(--border)" },
    { id: "forest", presetId: "2651839311564427", label: "Forest", color: "#0F5C4D" },
    { id: "terracotta", presetId: "2492638657633318", label: "Terracotta", color: "#B44314" },
    { id: "charcoal", presetId: "640969593016414", label: "Charcoal", color: "#18181B" },
    { id: "cobalt", presetId: "438411866945498", label: "Cobalt", color: "#1D4ED8" },
    { id: "plum", presetId: "548519905677705", label: "Plum", color: "#6D28D9" }
  ];

  const DEFAULT_DELIVERY = {
    postingMethod: "fast",
    waitMinutes: 3.5,
    postsPerRound: 1,
    randomizeWait: true,
    humanLevel: 2,
    randomizeOrder: false,
    extraSafePacing: true
  };

  const SPEED_PRESETS = {
    safe: { waitMinutes: 3.5, humanLevel: 2, randomizeWait: true, extraSafePacing: true },
    normal: { waitMinutes: 1.5, humanLevel: 2, randomizeWait: true, extraSafePacing: false },
    fast: { waitMinutes: 0.75, humanLevel: 1, randomizeWait: true, extraSafePacing: false }
  };

  const state = {
    lang: "id",
    activeTab: "create",
    inHistory: false,
    historyMode: "runs",
    historyFilter: "all",
    previewOpen: IS_WORKSPACE,
    extraOptionsOpen: false,
    fbStatus: null,
    selectedGroups: [],
    groupLists: [],
    joinedGroups: [],
    versions: [""],
    activeVersionIdx: 0,
    background: BG_PRESETS[0],
    imageIds: [],
    imageThumbs: {},
    imageSetsEnabled: false,
    imageSets: [],
    comments: [],
    delivery: { ...DEFAULT_DELIVERY },
    templates: [],
    wordSets: [],
    scheduledPosts: [],
    schedulerPaused: false,
    postHistory: [],
    editingScheduleId: null,
    shareStagedPost: null,
    shareMode: "share",
    license: { plan: "free", status: "free", licenseKey: "", expiresAt: null },
    deviceId: ""
  };

  let lastFocusedEl = null;

  function isPro() {
    return Boolean(window.RelayLicense && window.RelayLicense.isProActive(state.license));
  }

  function getPlanLimits() {
    return window.RelayLicense
      ? window.RelayLicense.getLimits(state.license)
      : { maxGroupsPerCampaign: 5, maxMediaPerPost: 1, maxActiveSchedules: 1 };
  }

  function renderLicenseBadge() {
    const btn = document.getElementById("licenseBtn");
    if (!btn) return;
    const pro = isPro();
    btn.textContent = pro ? "PRO" : "Free";
    btn.classList.toggle("is-pro", pro);
    btn.title = pro
      ? txt("RelayPost PRO Aktif (Klik untuk kelola lisensi)", "RelayPost PRO Active (Click to manage license)")
      : txt("Paket Gratis (Klik untuk aktivasi Lisensi Pro)", "Free Plan (Click to activate Pro License)");
  }

  async function refreshLicenseState() {
    const res = await chrome.runtime.sendMessage({ action: "getLicenseState" }).catch(() => null);
    if (res && res.ok && res.license) {
      state.license = res.license;
      state.deviceId = res.deviceId || "";
    }
    renderLicenseBadge();
  }

  function requirePro(featureLabel) {
    if (isPro()) return true;
    openLicenseModal(featureLabel);
    return false;
  }

  function openLicenseModal(lockedFeature = "") {
    openModal(txt("Paket & Lisensi RelayPost", "RelayPost Plan & License"), (body) => {
      const pro = isPro();
      const cfg = window.RelayLicense ? window.RelayLicense.LICENSE_CONFIG : {};

      if (lockedFeature && !pro) {
        const lockNote = document.createElement("div");
        lockNote.className = "inline-alert";
        lockNote.style.background = "var(--brand-soft)";
        lockNote.style.color = "var(--brand)";
        lockNote.textContent = txt(
          `Fitur "${lockedFeature}" tersedia di RelayPost PRO. Masukkan kode lisensi untuk membuka seluruh fitur.`,
          `"${lockedFeature}" is a RelayPost PRO feature. Enter a license key to unlock all features.`
        );
        body.appendChild(lockNote);
      }

      const statusBox = document.createElement("div");
      statusBox.className = "plan-status-box" + (pro ? " is-pro" : "");
      const expText = state.license.expiresAt
        ? txt(`Berlaku hingga ${new Date(state.license.expiresAt).toLocaleDateString()}`, `Valid until ${new Date(state.license.expiresAt).toLocaleDateString()}`)
        : pro
          ? txt("Aktif (Selamanya / Tanpa batas waktu)", "Active (Lifetime / No expiry)")
          : txt("Maks. 5 grup / kampanye · 1 foto · 1 jadwal aktif", "Up to 5 groups / run · 1 photo · 1 active schedule");
      statusBox.innerHTML = `
        <div>
          <strong>${escapeHtml(pro ? txt("RelayPost PRO Aktif", "RelayPost PRO Active") : txt("Paket Gratis (Free)", "Free Plan"))}</strong>
          <div class="muted-text">${escapeHtml(expText)}</div>
        </div>
        <span class="chip">${pro ? "PRO" : "FREE"}</span>
      `;
      body.appendChild(statusBox);

      if (!pro) {
        const perks = document.createElement("ul");
        perks.className = "plan-perks";
        perks.innerHTML = `
          <li>${escapeHtml(txt("Kirim tanpa batas jumlah grup & multi-foto/video", "Unlimited target groups & multi-photo/video"))}</li>
          <li>${escapeHtml(txt("Variasi Kata (Spintax), Multi-Versi Teks & Komentar Pertama", "Spintax variations, multi-version text & first comments"))}</li>
          <li>${escapeHtml(txt("Jadwal tanpa batas, Impor Massal CSV & Cek Kesehatan Grup", "Unlimited schedules, Bulk CSV import & Group Health Check"))}</li>
          <li>${escapeHtml(txt("Ekspor Riwayat pengiriman ke CSV", "Export campaign history to CSV"))}</li>
        `;
        body.appendChild(perks);

        const field = document.createElement("div");
        field.className = "field";
        field.innerHTML = `<label for="licenseKeyInput">${escapeHtml(txt("Kode Lisensi Pro", "Pro License Key"))}</label>
          <input id="licenseKeyInput" class="input" type="text" placeholder="RLY-PRO-XXXX-XXXX" autocomplete="off" />`;
        body.appendChild(field);

        const btnRow = document.createElement("div");
        btnRow.className = "inline-actions";

        const activateBtn = document.createElement("button");
        activateBtn.type = "button";
        activateBtn.id = "activateLicenseBtn";
        activateBtn.className = "btn-primary btn-sm";
        activateBtn.style.flex = "1";
        activateBtn.textContent = txt("Aktifkan Lisensi", "Activate License");
        activateBtn.addEventListener("click", async () => {
          const keyVal = field.querySelector("#licenseKeyInput").value.trim();
          if (!keyVal) {
            toast(txt("Masukkan kode lisensi terlebih dahulu.", "Enter your license key first."));
            return;
          }
          activateBtn.disabled = true;
          activateBtn.textContent = txt("Memverifikasi...", "Verifying...");
          const res = await chrome.runtime.sendMessage({ action: "activateLicense", licenseKey: keyVal }).catch(() => null);
          activateBtn.disabled = false;
          activateBtn.textContent = txt("Aktifkan Lisensi", "Activate License");
          if (!res || !res.ok) {
            toast(res?.error || txt("Kode lisensi tidak valid.", "Invalid license key."));
            return;
          }
          state.license = res.license;
          renderLicenseBadge();
          toast(txt("RelayPost PRO berhasil diaktifkan!", "RelayPost PRO activated!"));
          closeModal();
        });

        const buyLink = document.createElement("a");
        buyLink.href = cfg.checkoutUrl || "https://relaypost-web.vercel.app/upgrade";
        buyLink.target = "_blank";
        buyLink.rel = "noopener";
        buyLink.className = "btn-outline btn-sm";
        buyLink.textContent = txt("Beli Lisensi", "Buy License");

        btnRow.append(activateBtn, buyLink);
        body.appendChild(btnRow);

        if (!cfg.verifyEndpoint) {
          const devNote = document.createElement("p");
          devNote.className = "helper-note";
          devNote.textContent = txt(
            "Mode uji lokal aktif (endpoint server belum diisi di shared/license.js). Anda dapat mencoba aktivasi dengan kode contoh: RLY-PRO-2026-DEMO",
            "Local test mode active (no verifyEndpoint set in shared/license.js). Try demo key: RLY-PRO-2026-DEMO"
          );
          body.appendChild(devNote);
        }
      } else {
        const keyInfo = document.createElement("div");
        keyInfo.className = "helper-note";
        const masked = state.license.licenseKey
          ? `${state.license.licenseKey.slice(0, 8)}****${state.license.licenseKey.slice(-4)}`
          : "PRO";
        keyInfo.textContent = txt(`Lisensi aktif: ${masked}`, `Active key: ${masked}`);
        body.appendChild(keyInfo);

        const actions = document.createElement("div");
        actions.className = "inline-actions";

        const recheckBtn = document.createElement("button");
        recheckBtn.type = "button";
        recheckBtn.className = "btn-outline btn-sm";
        recheckBtn.style.flex = "1";
        recheckBtn.textContent = txt("Cek Ulang Status", "Re-verify Status");
        recheckBtn.addEventListener("click", async () => {
          const res = await chrome.runtime.sendMessage({ action: "revalidateLicense" }).catch(() => null);
          if (res && res.ok && res.license) {
            state.license = res.license;
            renderLicenseBadge();
            toast(txt("Status lisensi diperbarui.", "License status refreshed."));
            openLicenseModal();
          }
        });

        const deactBtn = document.createElement("button");
        deactBtn.type = "button";
        deactBtn.id = "deactivateLicenseBtn";
        deactBtn.className = "btn-danger btn-sm";
        deactBtn.textContent = txt("Nonaktifkan", "Deactivate");
        deactBtn.addEventListener("click", async () => {
          const res = await chrome.runtime.sendMessage({ action: "deactivateLicense" }).catch(() => null);
          if (res && res.ok) {
            state.license = res.license;
            renderLicenseBadge();
            toast(txt("Lisensi dinonaktifkan di perangkat ini.", "License deactivated on this device."));
            openLicenseModal();
          }
        });

        actions.append(recheckBtn, deactBtn);
        body.appendChild(actions);
      }
    });
  }

  function tr(key, vars) {
    if (window.RelayI18n) return window.RelayI18n.t(state.lang, key, vars);
    return key;
  }

  function isId() {
    return state.lang !== "en";
  }

  function txt(idStr, enStr) {
    return isId() ? idStr : enStr;
  }

  function detectSpeedPreset() {
    const w = Number(state.delivery.waitMinutes) || 3.5;
    if (w >= 3) return "safe";
    if (w >= 1.2) return "normal";
    return "fast";
  }

  function setTextIfPresent(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setAttrIfPresent(id, attr, value) {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, value);
  }

  function applyLocale() {
    document.documentElement.lang = state.lang === "en" ? "en" : "id";
    setTextIfPresent("appSubtitleLabel", tr("appSubtitle"));
    setTextIfPresent("introTitle", tr("introTitle"));
    setTextIfPresent("introSteps", tr("introSteps"));
    setTextIfPresent("dismissIntroBtn", tr("introDismiss"));
    setTextIfPresent("switchAccountLabel", tr("switchAccountLabel"));
    setTextIfPresent("langToggleBtn", state.lang === "en" ? "EN" : "ID");
    setTextIfPresent("lblPostingAs", tr("postingIdentity"));
    setTextIfPresent("lblRefresh", tr("refresh"));
    setTextIfPresent("loadPagesBtn", tr("scanPages"));
    setAttrIfPresent("workspaceBtn", "title", tr("btnWorkspace"));
    setAttrIfPresent("settingsBtn", "title", tr("btnSettings"));
    setAttrIfPresent("helpBtn", "title", tr("btnHelp"));
    setAttrIfPresent("refreshActorBtn", "title", tr("refresh"));

    setTextIfPresent("fbNeedTitle", tr("fbNeedLoginTitle"));
    setTextIfPresent("fbNeedBody", tr("fbNeedLoginBody"));
    setTextIfPresent("fbNeedCta", tr("openFacebook"));
    setTextIfPresent("missedOpenQueueBtn", tr("openQueue"));
    setTextIfPresent("missedDismissBtn", tr("dismiss"));

    setTextIfPresent("tabComposeLabel", tr("tabCompose"));
    setTextIfPresent("tabQueueLabel", tr("tabQueue"));
    setTextIfPresent("tabHistoryLabel", tr("tabHistory"));

    setTextIfPresent("step1Title", tr("step1Title"));
    setTextIfPresent("step1Hint", tr("step1Hint"));
    setTextIfPresent("openListsModalBtn", tr("listsBtn"));
    setTextIfPresent("noGroupsHelper", tr("noGroupsHelper"));

    setTextIfPresent("step2Title", tr("step2Title"));
    setTextIfPresent("step2Hint", tr("step2Hint"));
    setTextIfPresent("btnSpintaxLabel", tr("btnSpintax"));
    setTextIfPresent("btnTemplatesLabel", tr("btnTemplates"));
    const ta = document.getElementById("postBodyInput");
    if (ta) ta.placeholder = tr("postPlaceholder");
    setTextIfPresent("cardColorLabel", tr("cardColorLabel"));
    setTextIfPresent("addMediaLabel", tr("addMediaBtn"));
    setTextIfPresent(
      "extraOptionsLabel",
      state.extraOptionsOpen ? tr("moreOptionsHide") : tr("moreOptionsShow")
    );
    setTextIfPresent("versionsLabel", tr("versionsLabel"));
    setTextIfPresent("addVersionLabel", tr("addVersionBtn"));

    setTextIfPresent("step3Title", tr("step3Title"));
    setTextIfPresent("step3Hint", tr("step3Hint"));
    setTextIfPresent("openProtectionBtn", tr("advancedSpeedBtn"));
    setTextIfPresent("presetSafeTitle", tr("presetSafeTitle"));
    setTextIfPresent("presetSafeSub", tr("presetSafeSub"));
    setTextIfPresent("presetNormalTitle", tr("presetNormalTitle"));
    setTextIfPresent("presetNormalSub", tr("presetNormalSub"));
    setTextIfPresent("presetFastTitle", tr("presetFastTitle"));
    setTextIfPresent("presetFastSub", tr("presetFastSub"));

    setAttrIfPresent("togglePreviewBtn", "title", tr("previewBtn"));
    setTextIfPresent("scheduleBtnLabel", tr("scheduleBtn"));
    setTextIfPresent("previewTitleLabel", tr("previewTitle"));
    setTextIfPresent("previewTimeLabel", tr("justNow"));
    setAttrIfPresent("shufflePreviewBtn", "title", tr("shufflePreview"));

    setTextIfPresent("queueTitleLabel", tr("queueTitle"));
    setTextIfPresent("importScheduleCsvBtn", txt("Impor CSV", "Import CSV"));
    setTextIfPresent("queueEmptyTitle", tr("queueEmptyTitle"));
    setTextIfPresent("queueEmptyBody", tr("queueEmptyBody"));
    setTextIfPresent("emptyScheduleCta", tr("queueEmptyCta"));

    setTextIfPresent("historyBackBtn", tr("backBtn"));
    setTextIfPresent("historyTitleLabel", tr("historyTitle"));
    setTextIfPresent("exportCsvLabel", tr("exportCsvBtn"));
    setTextIfPresent("histModeRuns", tr("byRunBtn"));
    setTextIfPresent("histModeGroups", tr("byGroupBtn"));
    setTextIfPresent("histFilterAll", tr("filterAll"));
    setTextIfPresent("histFilterSent", tr("filterSent"));
    setTextIfPresent("histFilterFailed", tr("filterFailed"));
    setTextIfPresent("historyEmptyTitle", tr("historyEmptyTitle"));
    setTextIfPresent("historyEmptyBody", tr("historyEmptyBody"));
  }

  function updateReadinessBar() {
    const bar = document.getElementById("readinessBar");
    const gCount = state.selectedGroups.length;
    const hasText = state.versions.some((v) => String(v || "").trim().length > 0);
    const hasMedia = state.imageIds.length > 0 || (state.imageSetsEnabled && state.imageSets.length > 0);
    const step2Done = hasText || hasMedia || Boolean(state.shareStagedPost);

    const d1 = document.getElementById("step1Dot");
    if (d1) {
      d1.classList.toggle("is-done", gCount > 0);
      d1.textContent = gCount > 0 ? "\u2713" : "1";
    }
    const d2 = document.getElementById("step2Dot");
    if (d2) {
      d2.classList.toggle("is-done", step2Done);
      d2.textContent = step2Done ? "\u2713" : "2";
    }

    if (!bar) return;
    bar.classList.remove("is-ready");
    if (!gCount) {
      bar.textContent = tr("readyNeedGroup");
      return;
    }
    if (!step2Done) {
      bar.textContent = tr("readyNeedText");
      return;
    }
    const gap = Number(state.delivery.waitMinutes) || 3.5;
    const etaMin = gCount <= 1 ? 1 : Math.max(1, Math.round((gCount - 1) * gap));
    const estText = isId() ? `${etaMin} menit` : `${etaMin} min`;
    const modeName = state.delivery.postingMethod === "safe"
      ? txt("Mode Jendela", "Window Mode")
      : txt("Otomatis", "Auto");
    bar.textContent = tr("readySummary", { n: gCount, mode: modeName, est: estText });
    bar.classList.add("is-ready");
  }

  function toast(msg) {
    const region = document.getElementById("toastRegion");
    const el = document.createElement("div");
    el.className = "toast-msg";
    el.textContent = msg;
    region.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function showComposeAlert(msg) {
    const el = document.getElementById("composeAlert");
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.hidden = false;
  }

  function applyTheme(theme) {
    const isDark = theme === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    const icon = document.getElementById("themeBtnIcon");
    if (icon && window.RelayIcons) {
      icon.innerHTML = window.RelayIcons.iconSvg(isDark ? "sun" : "moon", { size: 17 });
    }
  }

  // Modal helpers with Escape & focus return (antislop R-32)
  function openModal(title, renderFn) {
    lastFocusedEl = document.activeElement;
    const backdrop = document.getElementById("modalBackdrop");
    const titleEl = document.getElementById("modalTitle");
    const bodyEl = document.getElementById("modalBody");
    titleEl.textContent = title;
    bodyEl.innerHTML = "";
    renderFn(bodyEl);
    if (window.RelayIcons) window.RelayIcons.applyIcons(bodyEl);
    backdrop.hidden = false;
    const focusable = bodyEl.querySelector("input, textarea, select, button");
    if (focusable) focusable.focus();
  }

  function closeModal() {
    const backdrop = document.getElementById("modalBackdrop");
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    document.getElementById("modalBody").innerHTML = "";
    if (lastFocusedEl && typeof lastFocusedEl.focus === "function") {
      lastFocusedEl.focus();
    }
  }

  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const actorMenu = document.getElementById("actorMenu");
      if (!actorMenu.hidden) {
        actorMenu.hidden = true;
        document.getElementById("actorDropdownBtn").setAttribute("aria-expanded", "false");
        return;
      }
      closeModal();
    }
  });

  // Unicode text styling helpers for Facebook plain-text formatting
  function toUnicodeStyled(str, mode) {
    const maps = {
      bold: { A: 0x1d400, a: 0x1d41a, zero: 0x1d7ce },
      italic: { A: 0x1d434, a: 0x1d44e, zero: null }
    };
    const m = maps[mode];
    if (!m) return str;
    return Array.from(str).map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(m.A + (code - 65));
      if (code >= 97 && code <= 122) {
        if (mode === "italic" && ch === "h") return "\u210e";
        return String.fromCodePoint(m.a + (code - 97));
      }
      if (m.zero && code >= 48 && code <= 57) return String.fromCodePoint(m.zero + (code - 48));
      return ch;
    }).join("");
  }

  function applyTextFormat(kind) {
    const ta = document.getElementById("postBodyInput");
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;
    const selected = val.slice(start, end);

    let replacement = selected;
    if (kind === "bold") {
      replacement = selected ? toUnicodeStyled(selected, "bold") : toUnicodeStyled("Bold text", "bold");
    } else if (kind === "italic") {
      replacement = selected ? toUnicodeStyled(selected, "italic") : toUnicodeStyled("Italic text", "italic");
    } else if (kind === "h1") {
      replacement = toUnicodeStyled((selected || "HEADING").toUpperCase(), "bold");
    } else if (kind === "ul") {
      const lines = (selected || "First point\nSecond point").split("\n");
      replacement = lines.map((l) => (l.startsWith("• ") ? l : `• ${l}`)).join("\n");
    }

    ta.value = val.slice(0, start) + replacement + val.slice(end);
    state.versions[state.activeVersionIdx] = ta.value;
    ta.focus();
    saveDraft();
    renderComposerMeta();
  }

  // Persistence
  async function loadAllState() {
    const data = await chrome.storage.local.get([
      "relayLang",
      "relayTheme",
      "relayIntroDismissed",
      "relayDraft",
      "relayDelivery",
      "relayGroupLists",
      "joinedFacebookGroups",
      "relayTemplates",
      "relayWordSets",
      "scheduledPosts",
      "schedulerPaused",
      "postHistory",
      "_missedSchedules",
      "isPostingInProgress",
      "campaignProgress"
    ]);

    state.lang = window.RelayI18n ? window.RelayI18n.getLang(data.relayLang) : "id";
    applyTheme(data.relayTheme || "light");
    applyLocale();
    const introCard = document.getElementById("introCard");
    if (introCard) introCard.hidden = Boolean(data.relayIntroDismissed);

    if (data.relayDraft) {
      state.versions = Array.isArray(data.relayDraft.versions) && data.relayDraft.versions.length
        ? data.relayDraft.versions
        : [""];
      state.activeVersionIdx = Math.min(data.relayDraft.activeVersionIdx || 0, state.versions.length - 1);
      state.selectedGroups = Array.isArray(data.relayDraft.selectedGroups) ? data.relayDraft.selectedGroups : [];
      state.background = BG_PRESETS.find((b) => b.id === data.relayDraft.backgroundId) || BG_PRESETS[0];
      state.imageIds = Array.isArray(data.relayDraft.imageIds) ? data.relayDraft.imageIds : [];
      state.imageSetsEnabled = Boolean(data.relayDraft.imageSetsEnabled);
      state.imageSets = Array.isArray(data.relayDraft.imageSets) ? data.relayDraft.imageSets : [];
      state.comments = Array.isArray(data.relayDraft.comments) ? data.relayDraft.comments : [];
    }

    if (data.relayDelivery) {
      state.delivery = { ...DEFAULT_DELIVERY, ...data.relayDelivery };
    }
    state.groupLists = Array.isArray(data.relayGroupLists) ? data.relayGroupLists : [];
    state.joinedGroups = Array.isArray(data.joinedFacebookGroups) ? data.joinedFacebookGroups : [];
    state.templates = Array.isArray(data.relayTemplates) ? data.relayTemplates : [];
    state.wordSets = Array.isArray(data.relayWordSets) ? data.relayWordSets : [];
    state.scheduledPosts = Array.isArray(data.scheduledPosts) ? data.scheduledPosts : [];
    state.schedulerPaused = Boolean(data.schedulerPaused);
    state.postHistory = Array.isArray(data.postHistory) ? data.postHistory : [];

    // Load media thumbnails from IndexedDB
    await refreshMediaThumbs();

    if (data._missedSchedules && data._missedSchedules.count > 0) {
      const mb = document.getElementById("missedBanner");
      document.getElementById("missedBannerText").textContent = txt(
        `${data._missedSchedules.count} postingan terjadwal terlewat saat Chrome ditutup.`,
        `${data._missedSchedules.count} scheduled post(s) missed while Chrome was closed or sleeping.`
      );
      mb.hidden = false;
    }

    if (data.campaignProgress && (data.isPostingInProgress === "started" || data.isPostingInProgress === "paused")) {
      renderProgressCard(data.campaignProgress);
    }
  }

  async function saveDraft() {
    await chrome.storage.local.set({
      relayDraft: {
        versions: state.versions,
        activeVersionIdx: state.activeVersionIdx,
        selectedGroups: state.selectedGroups,
        backgroundId: state.background.id,
        imageIds: state.imageIds,
        imageSetsEnabled: state.imageSetsEnabled,
        imageSets: state.imageSets,
        comments: state.comments
      }
    });
  }

  async function refreshMediaThumbs() {
    for (const id of state.imageIds) {
      if (state.imageThumbs[id]) continue;
      const rec = await window.RelayMediaDB.getMediaRecord(id).catch(() => null);
      if (rec && rec.blob) {
        const url = URL.createObjectURL(rec.blob);
        state.imageThumbs[id] = { url, name: rec.name || "Media", type: rec.type || rec.blob.type || "" };
      }
    }
  }

  async function refreshFbStatus() {
    const res = await chrome.runtime.sendMessage({ action: "getFbStatus" }).catch(() => null);
    const st = res && res.status;
    state.fbStatus = st || null;

    const nameEl = document.getElementById("actorName");
    const subEl = document.getElementById("actorSub");
    const avEl = document.getElementById("actorAvatar");
    const banner = document.getElementById("fbSignedOutBanner");
    const previewAuthor = document.getElementById("previewAuthorName");

    if (st && st.signedIn) {
      nameEl.textContent = st.name || "Facebook";
      subEl.textContent = st.isPage ? tr("businessPage") : tr("personalProfile");
      previewAuthor.textContent = st.name || tr("personalProfile");
      banner.hidden = true;
      if (st.avatar) {
        avEl.innerHTML = `<img src="${st.avatar}" alt="" />`;
      } else {
        avEl.textContent = (st.name || "F")[0].toUpperCase();
      }
    } else {
      nameEl.textContent = tr("notSignedIn");
      subEl.textContent = tr("signInHint");
      avEl.textContent = "?";
      banner.hidden = false;
    }

    renderActorMenu();
  }

  function renderActorMenu() {
    const list = document.getElementById("actorList");
    list.innerHTML = "";
    const st = state.fbStatus;
    if (!st || !st.uid) {
      list.innerHTML = `<p class="muted-text">${escapeHtml(txt(
        "Belum ada sesi Facebook aktif di Chrome ini. Buka facebook.com lalu login terlebih dahulu.",
        "No active Facebook session detected in Chrome. Open facebook.com and sign in first."
      ))}</p>`;
      return;
    }

    const items = [{ id: st.uid, name: st.name && !st.isPage ? st.name : `${tr("personalProfile")} (${st.uid})`, kind: "personal" }];
    for (const p of st.profiles || []) {
      items.push({ id: p.id, name: p.name, kind: "page" });
    }

    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "actor-option" + (String(item.id) === String(st.actorId) ? " is-active" : "");
      btn.innerHTML = `<span>${escapeHtml(item.name)}</span><span class="muted-text">${item.kind === "page" ? "Page" : txt("Pribadi", "Personal")}</span>`;
      btn.addEventListener("click", async () => {
        await chrome.runtime.sendMessage({ action: "switchFbActor", actorId: item.id });
        document.getElementById("actorMenu").hidden = true;
        await refreshFbStatus();
        toast(txt(`Akun pengirim aktif: ${item.name}`, `Active identity: ${item.name}`));
      });
      list.appendChild(btn);
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Tab navigation with keyboard ArrowLeft / ArrowRight (antislop R-32)
  function switchTab(tabId) {
    state.inHistory = tabId === "history";
    state.activeTab = tabId;

    const tabs = [
      { id: "create", btn: document.getElementById("tabCreateBtn"), panel: document.getElementById("panelCreate") },
      { id: "scheduled", btn: document.getElementById("tabQueueBtn"), panel: document.getElementById("panelQueue") },
      { id: "history", btn: document.getElementById("historyBtn"), panel: document.getElementById("panelHistory") }
    ];

    for (const t of tabs) {
      const active = t.id === tabId;
      if (t.btn) {
        t.btn.classList.toggle("is-active", active);
        t.btn.setAttribute("aria-selected", String(active));
        t.btn.tabIndex = active ? 0 : -1;
      }
      if (t.panel) t.panel.hidden = !active;
    }

    const dock = document.getElementById("composeDock");
    if (dock) dock.hidden = tabId !== "create";

    if (tabId === "scheduled") renderQueueTab();
    if (tabId === "history") renderHistoryView();
  }

  document.getElementById("tabCreateBtn").addEventListener("click", () => switchTab("create"));
  document.getElementById("tabQueueBtn").addEventListener("click", () => switchTab("scheduled"));
  document.getElementById("mainTabBar").addEventListener("keydown", (e) => {
    const order = ["create", "scheduled", "history"];
    const idx = order.indexOf(state.activeTab);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const nextIdx = e.key === "ArrowRight" ? (idx + 1) % order.length : (idx - 1 + order.length) % order.length;
      const next = order[nextIdx];
      switchTab(next);
      const nextBtn = next === "create" ? "tabCreateBtn" : next === "scheduled" ? "tabQueueBtn" : "historyBtn";
      document.getElementById(nextBtn).focus();
    }
  });

  // Renderers
  function renderComposer() {
    const ta = document.getElementById("postBodyInput");
    ta.value = state.versions[state.activeVersionIdx] || "";
    renderVersionsBar();
    renderBgSwatches();
    renderGroupSummary();
    renderMediaList();
    renderProtectionStrip();
    renderComposerMeta();
    renderQueueBadge();
    updateReadinessBar();
  }

  function renderVersionsBar() {
    const pills = document.getElementById("versionsPills");
    pills.innerHTML = "";
    const letters = ["A", "B", "C", "D", "E"];
    state.versions.forEach((_, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ver-pill" + (idx === state.activeVersionIdx ? " is-active" : "");
      btn.textContent = txt(`Versi ${letters[idx]}`, `Version ${letters[idx]}`);
      btn.addEventListener("click", () => {
        state.activeVersionIdx = idx;
        renderComposer();
      });
      if (state.versions.length > 1) {
        const rm = document.createElement("span");
        rm.textContent = " ×";
        rm.setAttribute("aria-label", txt(`Hapus versi ${letters[idx]}`, `Remove version ${letters[idx]}`));
        rm.addEventListener("click", (e) => {
          e.stopPropagation();
          state.versions.splice(idx, 1);
          state.activeVersionIdx = Math.max(0, Math.min(state.activeVersionIdx, state.versions.length - 1));
          saveDraft();
          renderComposer();
        });
        btn.appendChild(rm);
      }
      pills.appendChild(btn);
    });
    document.getElementById("addVersionBtn").disabled = state.versions.length >= 5;
  }

  function renderBgSwatches() {
    const wrap = document.getElementById("bgSwatches");
    wrap.innerHTML = "";
    for (const preset of BG_PRESETS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch-btn" + (state.background.id === preset.id ? " is-active" : "");
      btn.title = preset.label;
      btn.setAttribute("aria-label", `Background ${preset.label}`);
      btn.style.background = preset.color;
      if (preset.border) btn.style.borderColor = preset.border;
      btn.addEventListener("click", () => {
        const txtVal = state.versions[state.activeVersionIdx] || "";
        const lines = txtVal.split("\n").length;
        if (preset.id !== "none" && (txtVal.length > 130 || lines > 4)) {
          showComposeAlert(txt(
            "Kartu berwarna Facebook hanya mendukung maksimal 130 karakter dan 4 baris.",
            "Facebook card backgrounds support up to 130 characters and 4 lines."
          ));
          return;
        }
        if (preset.id !== "none" && state.imageIds.length > 0) {
          showComposeAlert(txt(
            "Hapus foto lampiran jika ingin memakai latar berwarna.",
            "Remove attached photos to apply a background color card."
          ));
          return;
        }
        showComposeAlert("");
        state.background = preset;
        saveDraft();
        renderBgSwatches();
        renderPreview();
      });
      wrap.appendChild(btn);
    }
  }

  function renderGroupSummary() {
    const count = state.selectedGroups.length;
    setTextIfPresent("selectedGroupsBadge", String(count));
    setTextIfPresent(
      "selectedGroupsSummary",
      count === 0 ? tr("chooseGroupsBtn") : tr("nGroupsSelected", { n: count })
    );
    setTextIfPresent(
      "publishNowLabel",
      count > 0 ? tr("publishToNBtn", { n: count }) : tr("publishBtn")
    );
    const noHelper = document.getElementById("noGroupsHelper");
    if (noHelper) noHelper.hidden = count > 0;

    // Quick-select bar for saved group collections directly in Step 1
    const quickWrap = document.getElementById("savedListsQuickWrap");
    if (quickWrap) {
      quickWrap.innerHTML = "";
      if (state.groupLists.length) {
        quickWrap.hidden = false;
        state.groupLists.slice(0, 6).forEach((list) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn-mini";
          btn.textContent = `${list.name} (${list.groups.length})`;
          btn.title = txt(`Pilih kelompok "${list.name}"`, `Load collection "${list.name}"`);
          btn.addEventListener("click", () => {
            state.selectedGroups = list.groups.slice();
            saveDraft();
            renderGroupSummary();
            toast(txt(`Kelompok "${list.name}" dipilih (${list.groups.length} grup).`, `Loaded "${list.name}" (${list.groups.length} groups).`));
          });
          quickWrap.appendChild(btn);
        });
      } else {
        quickWrap.hidden = true;
      }
    }

    const chips = document.getElementById("selectedChipsWrap");
    chips.innerHTML = "";
    if (!count) {
      chips.hidden = true;
      updateReadinessBar();
      return;
    }
    chips.hidden = false;
    state.selectedGroups.slice(0, 6).forEach((g) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.innerHTML = `<span>${escapeHtml(g.name || g.url)}</span>`;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "chip-remove";
      rm.setAttribute("aria-label", txt(`Hapus ${g.name}`, `Remove ${g.name}`));
      rm.textContent = "×";
      rm.addEventListener("click", () => {
        state.selectedGroups = state.selectedGroups.filter((x) => x.url !== g.url);
        saveDraft();
        renderGroupSummary();
      });
      chip.appendChild(rm);
      chips.appendChild(chip);
    });
    if (count > 6) {
      const more = document.createElement("span");
      more.className = "chip";
      more.textContent = tr("moreGroups", { n: count - 6 });
      chips.appendChild(more);
    }
    updateReadinessBar();
  }

  function renderMediaList() {
    const list = document.getElementById("mediaPreviewList");
    list.innerHTML = "";
    if (!state.imageIds.length) {
      list.hidden = true;
    } else {
      list.hidden = false;
      state.imageIds.forEach((id, idx) => {
        const meta = state.imageThumbs[id] || { name: `Media ${idx + 1}`, url: "" };
        const row = document.createElement("div");
        row.className = "media-row";
        row.innerHTML = `
          ${meta.url ? `<img src="${meta.url}" alt="" class="media-thumb" />` : `<div class="media-thumb"></div>`}
          <span class="media-name">${escapeHtml(meta.name)}</span>
        `;
        const upBtn = document.createElement("button");
        upBtn.type = "button";
        upBtn.className = "btn-mini";
        upBtn.disabled = idx === 0;
        upBtn.setAttribute("aria-label", txt(`Naikkan ${meta.name}`, `Move ${meta.name} up`));
        upBtn.innerHTML = window.RelayIcons.iconSvg("arrowUp", { size: 12 });
        upBtn.addEventListener("click", () => {
          [state.imageIds[idx - 1], state.imageIds[idx]] = [state.imageIds[idx], state.imageIds[idx - 1]];
          saveDraft();
          renderMediaList();
          renderPreview();
        });

        const downBtn = document.createElement("button");
        downBtn.type = "button";
        downBtn.className = "btn-mini";
        downBtn.disabled = idx === state.imageIds.length - 1;
        downBtn.setAttribute("aria-label", txt(`Turunkan ${meta.name}`, `Move ${meta.name} down`));
        downBtn.innerHTML = window.RelayIcons.iconSvg("arrowDown", { size: 12 });
        downBtn.addEventListener("click", () => {
          [state.imageIds[idx + 1], state.imageIds[idx]] = [state.imageIds[idx], state.imageIds[idx + 1]];
          saveDraft();
          renderMediaList();
          renderPreview();
        });

        const rmBtn = document.createElement("button");
        rmBtn.type = "button";
        rmBtn.className = "btn-mini";
        rmBtn.setAttribute("aria-label", txt(`Hapus ${meta.name}`, `Remove ${meta.name}`));
        rmBtn.innerHTML = window.RelayIcons.iconSvg("trash", { size: 12 });
        rmBtn.addEventListener("click", async () => {
          state.imageIds.splice(idx, 1);
          await window.RelayMediaDB.deleteMediaBlob(id).catch(() => {});
          saveDraft();
          renderMediaList();
          renderPreview();
          updateReadinessBar();
        });

        row.append(upBtn, downBtn, rmBtn);
        list.appendChild(row);
      });
    }

    setTextIfPresent(
      "imageSetsBtnLabel",
      state.imageSetsEnabled && state.imageSets.length
        ? tr("imageSetsActive", { n: state.imageSets.length })
        : tr("imageSetsBtn")
    );
    setTextIfPresent(
      "commentsBtnLabel",
      state.comments.length
        ? tr("firstCommentActive", { n: state.comments.length })
        : tr("firstCommentBtn")
    );
    updateReadinessBar();
  }

  function renderProtectionStrip() {
    const d = state.delivery;
    const activePreset = detectSpeedPreset();
    document.querySelectorAll(".preset-btn[data-speed-preset]").forEach((btn) => {
      const match = btn.dataset.speedPreset === activePreset;
      btn.classList.toggle("is-active", match);
      btn.setAttribute("aria-checked", String(match));
    });

    const modeLabel = d.postingMethod === "safe"
      ? txt("Buka jendela Facebook", "Facebook window")
      : txt("Otomatis di latar", "Background auto");
    const jitterLabel = d.randomizeWait
      ? txt("Jeda acak aktif", "Random gap on")
      : txt("Jeda tetap", "Fixed gap");
    setTextIfPresent(
      "protectionSub",
      txt(
        `Jeda ${d.waitMinutes} mnt · ${jitterLabel} · ${modeLabel}`,
        `${d.waitMinutes} min gap · ${jitterLabel} · ${modeLabel}`
      )
    );
    updateReadinessBar();
  }

  function renderComposerMeta() {
    const txtVal = state.versions[state.activeVersionIdx] || "";
    setTextIfPresent("charCountLabel", tr("charsCount", { n: txtVal.length }));
    renderPreview();
    updateReadinessBar();
  }

  function renderPreview() {
    const col = document.getElementById("previewColumn");
    col.hidden = !state.previewOpen;
    if (!state.previewOpen) return;

    const bodyEl = document.getElementById("previewBodyText");
    const raw = state.versions[state.activeVersionIdx] || "";
    const expanded = raw ? window.RelaySpintax.expand(raw) : "";
    bodyEl.textContent = expanded || tr("previewEmpty");
    if (state.background && state.background.id !== "none" && expanded) {
      bodyEl.classList.add("has-bg");
      bodyEl.style.background = state.background.color;
    } else {
      bodyEl.classList.remove("has-bg");
      bodyEl.style.background = "";
    }

    const mediaGrid = document.getElementById("previewMediaGrid");
    mediaGrid.innerHTML = "";
    if (state.imageIds.length) {
      mediaGrid.hidden = false;
      state.imageIds.slice(0, 4).forEach((id) => {
        const meta = state.imageThumbs[id];
        if (meta && meta.url) {
          const img = document.createElement("img");
          img.src = meta.url;
          img.alt = meta.name || "";
          mediaGrid.appendChild(img);
        }
      });
    } else {
      mediaGrid.hidden = true;
    }

    const cBox = document.getElementById("previewCommentBox");
    if (state.comments.length) {
      cBox.hidden = false;
      const delayTxt = state.comments[0].delayMinutes === 0
        ? txt("langsung", "immediately")
        : `+${state.comments[0].delayMinutes}m`;
      cBox.textContent = tr("previewCommentPrefix", {
        when: delayTxt,
        text: window.RelaySpintax.expand(state.comments[0].text)
      });
    } else {
      cBox.hidden = true;
    }
  }

  function renderQueueBadge() {
    const active = state.scheduledPosts.filter((s) => s && (s.state === "scheduled" || s.state === "missed"));
    const badge = document.getElementById("queueCountBadge");
    if (active.length) {
      badge.textContent = String(active.length);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function renderQueueTab() {
    const listEl = document.getElementById("queueList");
    const emptyEl = document.getElementById("queueEmpty");
    const toggleBtn = document.getElementById("toggleSchedulerBtn");
    const subEl = document.getElementById("schedulerStatusSub");

    toggleBtn.textContent = state.schedulerPaused ? tr("resumeAllBtn") : tr("pauseAllBtn");
    subEl.textContent = state.schedulerPaused ? tr("schedulerPaused") : tr("schedulerActive");

    listEl.innerHTML = "";
    if (!state.scheduledPosts.length) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    for (const item of state.scheduledPosts) {
      const card = document.createElement("div");
      card.className = "card";
      const textSnippet = ((item.post?.versions && item.post.versions[0]) || item.post?.text || txt("(Postingan media)", "(Media post)")).slice(0, 90);
      const nextStr = item.nextRunAt ? new Date(item.nextRunAt).toLocaleString() : txt("Selesai", "Completed");
      const statusLabel = item.state === "missed"
        ? txt("Terlewat", "Missed")
        : item.state === "done"
          ? txt("Selesai", "Done")
          : txt("Terjadwal", "Scheduled");
      card.innerHTML = `
        <div class="card-row">
          <strong>${escapeHtml(item.schedule?.frequency || "once")} · ${item.groups?.length || 0} ${txt("grup", "group(s)")}</strong>
          <span class="chip">${statusLabel}</span>
        </div>
        <p class="muted-text">${escapeHtml(textSnippet)}</p>
        <p class="muted-text">${txt("Jadwal", "Next")}: ${escapeHtml(nextStr)}</p>
      `;
      const actions = document.createElement("div");
      actions.className = "inline-actions";
      actions.style.marginTop = "8px";

      const runBtn = document.createElement("button");
      runBtn.type = "button";
      runBtn.className = "btn-mini";
      runBtn.textContent = tr("runNowBtn");
      runBtn.addEventListener("click", async () => {
        await chrome.runtime.sendMessage({ action: "runScheduledNow", id: item.id });
        switchTab("create");
        toast(txt("Postingan terjadwal dimulai.", "Scheduled post started."));
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-mini";
      delBtn.textContent = tr("deleteBtn");
      delBtn.addEventListener("click", async () => {
        await chrome.runtime.sendMessage({ action: "deleteScheduledPost", id: item.id });
        state.scheduledPosts = state.scheduledPosts.filter((s) => s.id !== item.id);
        renderQueueTab();
        renderQueueBadge();
      });

      actions.append(runBtn, delBtn);
      card.appendChild(actions);
      listEl.appendChild(card);
    }
  }

  function renderHistoryView() {
    const listEl = document.getElementById("historyList");
    const emptyEl = document.getElementById("historyEmpty");
    listEl.innerHTML = "";

    if (!state.postHistory.length) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    if (state.historyMode === "runs") {
      for (const run of state.postHistory) {
        const groups = (run.groups || []).filter((g) => {
          if (state.historyFilter === "success") return g.status === "success" || g.status === "pending";
          if (state.historyFilter === "failed") return g.status === "failed";
          return true;
        });
        if (!groups.length && state.historyFilter !== "all") continue;

        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          <div class="card-row">
            <strong>${new Date(run.startedAt).toLocaleString()}</strong>
            <span class="chip">${run.counts?.success || 0}/${run.counts?.total || 0} ${txt("terkirim", "sent")}</span>
          </div>
          <p class="muted-text">${escapeHtml(run.textPreview || txt("(Tanpa teks)", "(No text)"))}</p>
        `;
        const rows = document.createElement("div");
        rows.className = "progress-results";
        for (const g of groups) {
          const r = document.createElement("div");
          r.className = "res-row";
          r.innerHTML = `
            <span>${escapeHtml(g.name || g.url)}</span>
            <span class="res-status-${g.status}">${g.status}${g.postUrl ? ` · <a href="${escapeHtml(g.postUrl)}" target="_blank" rel="noopener">${txt("Buka", "Open")}</a>` : ""}</span>
          `;
          rows.appendChild(r);
        }
        card.appendChild(rows);
        listEl.appendChild(card);
      }
    } else {
      const stats = new Map();
      for (const run of state.postHistory) {
        for (const g of run.groups || []) {
          const cur = stats.get(g.url) || { name: g.name || g.url, url: g.url, ok: 0, fail: 0 };
          if (g.status === "success" || g.status === "pending") cur.ok++;
          else cur.fail++;
          stats.set(g.url, cur);
        }
      }
      for (const item of stats.values()) {
        if (state.historyFilter === "failed" && item.fail === 0) continue;
        if (state.historyFilter === "success" && item.ok === 0) continue;
        const card = document.createElement("div");
        card.className = "list-item";
        card.innerHTML = `
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <div class="muted-text">${item.ok} ${txt("terkirim", "sent")}, ${item.fail} ${txt("gagal", "failed")}</div>
          </div>
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="btn-mini">${txt("Buka", "Open")}</a>
        `;
        listEl.appendChild(card);
      }
    }
  }

  function renderProgressCard(progress) {
    const card = document.getElementById("liveProgressCard");
    if (!progress || progress.state === "completed" || progress.state === "idle") {
      if (!progress || !progress.results?.length) {
        card.hidden = true;
        return;
      }
    }
    card.hidden = false;
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    document.getElementById("progressFill").style.width = `${pct}%`;
    document.getElementById("progressCounts").textContent = `${progress.done} / ${progress.total}`;
    document.getElementById("progressHeadline").textContent =
      progress.state === "paused"
        ? tr("postingPaused")
        : progress.state === "completed"
          ? tr("postingDone")
          : progress.state === "stopped"
            ? tr("postingStopped")
            : tr("postingRunning");

    const nextText = progress.nextPostAt
      ? txt(
          `Post berikut pukul ${new Date(progress.nextPostAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
          `Next post at ${new Date(progress.nextPostAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
        )
      : progress.currentGroup
        ? txt(
            `Mengirim ke ${progress.currentGroup.name || progress.currentGroup.url}`,
            `Posting to ${progress.currentGroup.name || progress.currentGroup.url}`
          )
        : txt(
            `${progress.successCount} terkirim, ${progress.pendingCount} tertunda, ${progress.failedCount} gagal`,
            `${progress.successCount} sent, ${progress.pendingCount} pending, ${progress.failedCount} failed`
          );
    document.getElementById("progressMeta").textContent = nextStrClean(nextText);

    const pauseBtn = document.getElementById("pauseResumeBtn");
    pauseBtn.querySelector("span:last-child").textContent = progress.state === "paused" ? tr("resumeBtn") : tr("pauseBtn");
    const stopBtn = document.getElementById("stopCampaignBtn");
    if (stopBtn) stopBtn.querySelector("span:last-child").textContent = tr("stopBtn");

    const resList = document.getElementById("progressGroupResults");
    resList.innerHTML = "";
    for (const r of (progress.results || []).slice(-12).reverse()) {
      const row = document.createElement("div");
      row.className = "res-row";
      row.innerHTML = `
        <span>${escapeHtml(r.name || r.url)}</span>
        <span class="res-status-${r.status}">${r.status}${r.error ? `: ${escapeHtml(r.error.slice(0, 40))}` : ""}</span>
      `;
      resList.appendChild(row);
    }
  }

  function nextStrClean(s) {
    return String(s || "");
  }

  // Modals
  function openGroupsModal() {
    openModal(txt("Pilih Grup Tujuan", "Choose Target Groups"), (body) => {
      const selectedUrls = new Set(state.selectedGroups.map((g) => g.url));
      const allPool = new Map();
      for (const g of state.joinedGroups) allPool.set(g.url, g);
      for (const l of state.groupLists) {
        for (const g of l.groups || []) allPool.set(g.url, g);
      }
      for (const g of state.selectedGroups) allPool.set(g.url, g);
      const poolArr = Array.from(allPool.values());

      const guide = document.createElement("p");
      guide.className = "helper-note";
      guide.textContent = txt(
        "Cara termudah: klik 'Ambil Otomatis dari Facebook' (pastikan sudah login Facebook), atau tempel link grup secara manual.",
        "Easiest way: click 'Auto-Scan Facebook' (stay signed in), or paste group links manually."
      );
      body.appendChild(guide);

      const controls = document.createElement("div");
      controls.className = "inline-actions";
      const scanBtn = document.createElement("button");
      scanBtn.type = "button";
      scanBtn.className = "btn-outline btn-sm";
      scanBtn.textContent = txt("Ambil Otomatis dari Facebook", "Auto-Scan Facebook");
      scanBtn.addEventListener("click", async () => {
        scanBtn.disabled = true;
        scanBtn.textContent = txt("Sedang mengambil grup...", "Scanning Facebook...");
        const res = await chrome.runtime.sendMessage({ action: "collectJoinedGroups" });
        scanBtn.disabled = false;
        scanBtn.textContent = txt("Ambil Otomatis dari Facebook", "Auto-Scan Facebook");
        if (res && res.ok) {
          state.joinedGroups = res.groups || [];
          toast(txt(`Ditemukan ${state.joinedGroups.length} grup.`, `Found ${state.joinedGroups.length} groups.`));
          openGroupsModal();
        } else {
          toast(res?.error || txt("Gagal mengambil daftar grup. Pastikan sudah login Facebook.", "Scan failed. Make sure Facebook is signed in."));
        }
      });

      const addManualBtn = document.createElement("button");
      addManualBtn.type = "button";
      addManualBtn.className = "btn-outline btn-sm";
      addManualBtn.textContent = txt("Tempel Link / CSV", "Paste URL / CSV");
      addManualBtn.addEventListener("click", openManualImportModal);

      const healthBtn = document.createElement("button");
      healthBtn.type = "button";
      healthBtn.className = "btn-outline btn-sm";
      healthBtn.id = "checkGroupsHealthBtn";
      healthBtn.textContent = txt("Cek Kesehatan", "Health Check");

      controls.style.flexWrap = "wrap";
      controls.append(scanBtn, addManualBtn, healthBtn);
      body.appendChild(controls);

      const healthBar = document.createElement("div");
      healthBar.className = "inline-actions";
      healthBar.hidden = true;
      healthBar.style.justifyContent = "space-between";
      const healthSummary = document.createElement("span");
      healthSummary.className = "muted-text";
      const cleanDeadBtn = document.createElement("button");
      cleanDeadBtn.type = "button";
      cleanDeadBtn.className = "btn-danger btn-sm";
      cleanDeadBtn.textContent = txt("Bersihkan Bermasalah", "Remove Inactive");
      healthBar.append(healthSummary, cleanDeadBtn);
      body.appendChild(healthBar);

      const healthMap = new Map();

      const searchWrap = document.createElement("div");
      searchWrap.className = "field";
      searchWrap.innerHTML = `<label for="grpSearch">${escapeHtml(txt("Cari grup", "Filter groups"))}</label><input id="grpSearch" class="input" type="search" placeholder="${escapeHtml(txt("Ketik nama atau link grup...", "Search by group name or URL..."))}" />`;
      body.appendChild(searchWrap);

      const listContainer = document.createElement("div");
      listContainer.className = "stack-list";
      listContainer.style.maxHeight = "240px";
      listContainer.style.overflowY = "auto";
      body.appendChild(listContainer);

      const renderPool = (query = "") => {
        listContainer.innerHTML = "";
        const q = query.trim().toLowerCase();
        const filtered = poolArr.filter(
          (g) => !q || (g.name || "").toLowerCase().includes(q) || (g.url || "").toLowerCase().includes(q)
        );
        if (!filtered.length) {
          listContainer.innerHTML = `<p class="muted-text">${escapeHtml(txt(
            "Belum ada grup tersimpan. Pilih 'Ambil Otomatis dari Facebook' atau 'Tempel Link / CSV' di atas.",
            "No groups saved yet. Click 'Auto-Scan Facebook' or 'Paste URL / CSV' above."
          ))}</p>`;
          return;
        }
        for (const g of filtered) {
          const lbl = document.createElement("label");
          lbl.className = "list-item";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = selectedUrls.has(g.url);
          cb.addEventListener("change", () => {
            if (cb.checked) selectedUrls.add(g.url);
            else selectedUrls.delete(g.url);
          });
          const title = document.createElement("span");
          title.style.flex = "1";
          title.textContent = g.name || g.url;
          lbl.append(cb, title);
          const h = healthMap.get(g.url);
          if (h) {
            const badge = document.createElement("span");
            badge.className = "chip";
            if (h.status === "ok") {
              badge.style.background = "var(--ok-soft)";
              badge.style.color = "var(--ok)";
              badge.textContent = txt("Sehat", "Active");
            } else if (h.status === "archived") {
              badge.style.background = "var(--warn-soft)";
              badge.style.color = "var(--warn)";
              badge.textContent = txt("Diarsipkan", "Archived");
            } else {
              badge.style.background = "var(--err-soft)";
              badge.style.color = "var(--err)";
              badge.textContent = txt("Bermasalah", "Unavailable");
            }
            lbl.appendChild(badge);
          } else if (g.isBuySell) {
            const tag = document.createElement("span");
            tag.className = "chip";
            tag.textContent = txt("Jual Beli", "Buy & Sell");
            lbl.appendChild(tag);
          }
          listContainer.appendChild(lbl);
        }
      };

      healthBtn.addEventListener("click", async () => {
        if (!requirePro(txt("Cek Kesehatan Grup", "Group Health Check"))) return;
        if (!poolArr.length) {
          toast(txt("Belum ada grup untuk dicek.", "No groups to check yet."));
          return;
        }
        healthBtn.disabled = true;
        healthBtn.textContent = txt("Memeriksa...", "Checking...");
        const res = await chrome.runtime.sendMessage({ action: "checkGroupsHealth", groups: poolArr }).catch(() => null);
        healthBtn.disabled = false;
        healthBtn.textContent = txt("Cek Kesehatan", "Health Check");
        if (!res || !res.ok || !Array.isArray(res.results)) {
          toast(txt("Gagal memeriksa kesehatan grup.", "Group health check failed."));
          return;
        }
        healthMap.clear();
        let badCount = 0;
        for (const r of res.results) {
          healthMap.set(r.url, r);
          if (r.status !== "ok") badCount++;
        }
        const okCount = res.results.length - badCount;
        healthSummary.textContent = txt(
          `${okCount} sehat, ${badCount} bermasalah/diarsipkan`,
          `${okCount} active, ${badCount} inactive/archived`
        );
        cleanDeadBtn.hidden = badCount === 0;
        healthBar.hidden = false;
        renderPool(searchWrap.querySelector("input").value);
      });

      cleanDeadBtn.addEventListener("click", async () => {
        const badUrls = new Set(
          Array.from(healthMap.entries()).filter(([, v]) => v.status !== "ok").map(([k]) => k)
        );
        if (!badUrls.size) return;
        state.joinedGroups = state.joinedGroups.filter((g) => !badUrls.has(g.url));
        state.selectedGroups = state.selectedGroups.filter((g) => !badUrls.has(g.url));
        for (const u of badUrls) selectedUrls.delete(u);
        await chrome.storage.local.set({ joinedFacebookGroups: state.joinedGroups });
        saveDraft();
        renderGroupSummary();
        toast(txt(`${badUrls.size} grup bermasalah dihapus.`, `Removed ${badUrls.size} inactive group(s).`));
        openGroupsModal();
      });

      renderPool();
      searchWrap.querySelector("input").addEventListener("input", (e) => renderPool(e.target.value));

      const foot = document.createElement("div");
      foot.className = "inline-actions";
      const saveAsListBtn = document.createElement("button");
      saveAsListBtn.type = "button";
      saveAsListBtn.className = "btn-outline btn-sm";
      saveAsListBtn.textContent = txt("Simpan jadi Daftar", "Save as List");
      saveAsListBtn.addEventListener("click", async () => {
        const chosen = poolArr.filter((g) => selectedUrls.has(g.url));
        if (!chosen.length) {
          toast(txt("Centang minimal 1 grup dulu.", "Select at least one group first."));
          return;
        }
        const defaultName = txt(`Kelompok ${state.groupLists.length + 1}`, `Collection ${state.groupLists.length + 1}`);
        const inputName = window.prompt(txt("Beri nama kelompok grup ini:", "Name this group collection:"), defaultName);
        if (inputName === null) return;
        const name = inputName.trim() || defaultName;
        state.groupLists.unshift({ id: `list_${Date.now()}`, name, groups: chosen });
        await chrome.storage.local.set({ relayGroupLists: state.groupLists });
        renderGroupSummary();
        toast(txt(`Tersimpan "${name}" (${chosen.length} grup)`, `Saved "${name}" (${chosen.length} groups)`));
      });

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "btn-primary btn-sm";
      confirmBtn.style.flex = "1";
      confirmBtn.textContent = txt("Pakai Grup Terpilih", "Use Selected Groups");
      confirmBtn.addEventListener("click", () => {
        state.selectedGroups = poolArr.filter((g) => selectedUrls.has(g.url));
        saveDraft();
        renderGroupSummary();
        closeModal();
      });

      foot.append(saveAsListBtn, confirmBtn);
      body.appendChild(foot);
    });
  }

  function openManualImportModal() {
    openModal(txt("Tempel Link Grup atau CSV", "Add Group URLs or CSV"), (body) => {
      const nameF = document.createElement("div");
      nameF.className = "field";
      nameF.innerHTML = `<label for="manualListName">${escapeHtml(txt("Nama Kelompok Grup (otomatis terisi dari nama file CSV)", "Group Collection Name (auto-filled from CSV filename)"))}</label>
        <input id="manualListName" class="input" type="text" placeholder="${escapeHtml(txt("Contoh: Grup Jual Beli Jakarta", "e.g. Jakarta Marketplace Groups"))}" />`;
      body.appendChild(nameF);

      const f = document.createElement("div");
      f.className = "field";
      f.innerHTML = `<label for="manualUrls">${escapeHtml(txt("Tempel link grup Facebook (satu baris satu link)", "Paste Facebook group URLs (one per line)"))}</label>
        <textarea id="manualUrls" class="input" rows="5" placeholder="https://www.facebook.com/groups/123456789/"></textarea>`;
      body.appendChild(f);

      const fileF = document.createElement("div");
      fileF.className = "field";
      fileF.innerHTML = `<label for="csvImport">${escapeHtml(txt("Atau unggah file .csv / .txt (dari Excel / Sheets)", "Or import .csv / .txt file (from Excel / Sheets)"))}</label>
        <div class="inline-actions">
          <input id="csvImport" type="file" accept=".csv,.txt" style="flex:1;" />
          <button type="button" class="btn-outline btn-sm" id="downloadSampleCsvBtn">${escapeHtml(txt("Unduh Contoh CSV", "Download Sample CSV"))}</button>
        </div>
        <p class="helper-note">${escapeHtml(txt("Format CSV: 1 kolom berisi Group URL (satu link per baris).", "CSV format: 1 column with Group URL (one link per row)."))}</p>`;
      body.appendChild(fileF);

      const optF = document.createElement("div");
      optF.className = "field";
      optF.innerHTML = `<label style="display:flex;align-items:center;gap:8px;font-weight:500;cursor:pointer;">
          <input id="manualAutoSelect" type="checkbox" checked />
          <span>${escapeHtml(txt("Langsung pilih semua grup ini & simpan jadi Kelompok Grup", "Auto-select all imported groups & save as a Collection"))}</span>
        </label>`;
      body.appendChild(optF);

      fileF.querySelector("#downloadSampleCsvBtn").addEventListener("click", () => {
        const csvSample = [
          "Group URL",
          "https://www.facebook.com/groups/123456789012345/",
          "https://www.facebook.com/groups/contohgrupjualbeli/"
        ].join("\r\n");
        const blob = new Blob(["\uFEFF" + csvSample], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = isId() ? "relaypost-contoh-grup.csv" : "relaypost-sample-groups.csv";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          a.remove();
        }, 1000);
        toast(txt("File contoh CSV diunduh.", "Sample CSV downloaded."));
      });

      fileF.querySelector("#csvImport").addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const nameInput = nameF.querySelector("#manualListName");
        if (nameInput && !nameInput.value.trim()) {
          nameInput.value = file.name.replace(/\.(csv|txt)$/i, "").replace(/[_-]+/g, " ").trim();
        }
        const text = await file.text();
        const ta = f.querySelector("textarea");
        ta.value = (ta.value ? ta.value + "\n" : "") + text.replace(/^\uFEFF/, "");
      });

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn-primary btn-sm";
      addBtn.textContent = txt("Tambahkan & Pilih Grup", "Import & Select Groups");
      addBtn.addEventListener("click", async () => {
        const rawLines = f.querySelector("textarea").value.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
        const importedMap = new Map();
        let newlyAdded = 0;

        for (const rawLine of rawLines) {
          const cells = rawLine.split(/[,;\t]+/).map((c) => c.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
          for (let ci = 0; ci < cells.length; ci++) {
            const m = cells[ci].match(/facebook\.com\/groups\/([^/?#\s"']+)/i);
            if (!m) continue;
            const url = `https://www.facebook.com/groups/${m[1]}/`;
            let existing = state.joinedGroups.find((g) => g.url === url);
            if (!existing) {
              const maybeName = cells.find((c, idx) => idx !== ci && !/facebook\.com\/groups\//i.test(c) && !/^(nama|name|nama_grup|group_name)$/i.test(c));
              existing = { id: m[1], name: maybeName || `Group ${m[1]}`, url };
              state.joinedGroups.push(existing);
              newlyAdded += 1;
            }
            importedMap.set(url, existing);
          }
        }

        const importedGroups = Array.from(importedMap.values());
        if (!importedGroups.length) {
          toast(txt("Tidak ada link grup Facebook yang valid.", "No valid Facebook group URLs found."));
          return;
        }

        await chrome.storage.local.set({ joinedFacebookGroups: state.joinedGroups });

        const autoSelect = optF.querySelector("#manualAutoSelect")?.checked !== false;
        if (autoSelect) {
          const customName = nameF.querySelector("#manualListName")?.value.trim();
          const listName = customName || txt(`Import ${state.groupLists.length + 1}`, `Import ${state.groupLists.length + 1}`);
          state.groupLists.unshift({
            id: `list_${Date.now()}`,
            name: listName,
            groups: importedGroups.slice()
          });
          await chrome.storage.local.set({ relayGroupLists: state.groupLists });

          state.selectedGroups = importedGroups.slice();
          saveDraft();
          renderGroupSummary();
          closeModal();
          toast(txt(
            `${importedGroups.length} grup dipilih & disimpan sebagai kelompok "${listName}".`,
            `${importedGroups.length} group(s) selected & saved as "${listName}".`
          ));
          return;
        }

        toast(txt(`${newlyAdded} grup baru ditambahkan.`, `Added ${newlyAdded} new group(s).`));
        openGroupsModal();
      });
      body.appendChild(addBtn);
    });
  }

  function openListsModal() {
    openModal(txt("Kelompok Grup Tersimpan", "Saved Group Collections"), (body) => {
      if (!state.groupLists.length) {
        body.innerHTML = `<p class="muted-text">${escapeHtml(txt(
          "Belum ada kelompok tersimpan. Unggah CSV atau centang grup di 'Pilih Grup Tujuan' lalu simpan jadi kelompok.",
          "No saved collections yet. Import a CSV or select groups in 'Choose Target Groups' and save as a list."
        ))}</p>`;
        return;
      }
      for (const list of state.groupLists) {
        const row = document.createElement("div");
        row.className = "list-item";
        row.innerHTML = `<div><strong>${escapeHtml(list.name)}</strong><div class="muted-text">${list.groups.length} ${txt("grup", "group(s)")}</div></div>`;
        const btns = document.createElement("div");
        btns.className = "inline-actions";

        const useBtn = document.createElement("button");
        useBtn.type = "button";
        useBtn.className = "btn-primary btn-sm";
        useBtn.textContent = txt("Pakai", "Load");
        useBtn.addEventListener("click", () => {
          state.selectedGroups = list.groups.slice();
          saveDraft();
          renderGroupSummary();
          closeModal();
        });

        const mergeBtn = document.createElement("button");
        mergeBtn.type = "button";
        mergeBtn.className = "btn-mini";
        mergeBtn.textContent = txt("+ Gabung", "+ Merge");
        mergeBtn.addEventListener("click", () => {
          const map = new Map(state.selectedGroups.map((g) => [g.url, g]));
          for (const g of list.groups) map.set(g.url, g);
          state.selectedGroups = Array.from(map.values());
          saveDraft();
          renderGroupSummary();
          closeModal();
          toast(txt(`Kelompok "${list.name}" digabungkan (total ${state.selectedGroups.length} grup).`, `Merged "${list.name}" (${state.selectedGroups.length} groups total).`));
        });

        const renameBtn = document.createElement("button");
        renameBtn.type = "button";
        renameBtn.className = "btn-mini";
        renameBtn.textContent = txt("Nama", "Rename");
        renameBtn.addEventListener("click", async () => {
          const next = window.prompt(txt("Ubah nama kelompok:", "Rename collection:"), list.name);
          if (!next || !next.trim()) return;
          list.name = next.trim();
          await chrome.storage.local.set({ relayGroupLists: state.groupLists });
          renderGroupSummary();
          openListsModal();
        });

        const splitBtn = document.createElement("button");
        splitBtn.type = "button";
        splitBtn.className = "btn-mini";
        splitBtn.textContent = txt("Pecah", "Split");
        splitBtn.addEventListener("click", () => openSplitListModal(list));

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn-mini";
        delBtn.textContent = tr("deleteBtn");
        delBtn.addEventListener("click", async () => {
          state.groupLists = state.groupLists.filter((l) => l.id !== list.id);
          await chrome.storage.local.set({ relayGroupLists: state.groupLists });
          renderGroupSummary();
          openListsModal();
        });

        btns.append(useBtn, mergeBtn, renameBtn, splitBtn, delBtn);
        row.appendChild(btns);
        body.appendChild(row);
      }
    });
  }

  function openSplitListModal(list) {
    openModal(txt(`Pecah "${list.name}"`, `Split "${list.name}"`), (body) => {
      const f = document.createElement("div");
      f.className = "field";
      f.innerHTML = `<label for="splitSize">${escapeHtml(txt("Jumlah grup per daftar kecil", "Groups per smaller list"))}</label>
        <input id="splitSize" class="input" type="number" min="2" max="100" value="10" />`;
      body.appendChild(f);

      const goBtn = document.createElement("button");
      goBtn.type = "button";
      goBtn.className = "btn-primary btn-sm";
      goBtn.textContent = txt("Buat Pecahan Daftar", "Create Split Lists");
      goBtn.addEventListener("click", async () => {
        const size = Math.max(2, Number(f.querySelector("input").value) || 10);
        const created = [];
        for (let i = 0; i < list.groups.length; i += size) {
          const part = Math.floor(i / size) + 1;
          created.push({
            id: `list_${Date.now()}_${part}`,
            name: `${list.name} #${part}`,
            groups: list.groups.slice(i, i + size)
          });
        }
        state.groupLists = [...created, ...state.groupLists];
        await chrome.storage.local.set({ relayGroupLists: state.groupLists });
        toast(txt(`${created.length} daftar kecil dibuat.`, `Created ${created.length} split lists.`));
        openListsModal();
      });
      body.appendChild(goBtn);
    });
  }

  function openSpintaxModal() {
    if (!requirePro(txt("Variasi Kata (Spintax)", "Word Variations (Spintax)"))) return;
    openModal(txt("Buat Variasi Kalimat Otomatis", "Auto Text Variations (Spintax)"), (body) => {
      const tip = document.createElement("p");
      tip.className = "helper-note";
      tip.textContent = txt(
        "Masukkan beberapa pilihan kata. Setiap grup akan mendapat salah satu pilihan secara acak agar tulisan tidak sama persis.",
        "Add word choices below. Each group gets a random variation so posts look natural."
      );
      body.appendChild(tip);

      const optionsWrap = document.createElement("div");
      optionsWrap.className = "stack-list";
      const opts = isId()
        ? ["Halo semuanya!", "Permisi admin & teman-teman!", "Selamat pagi kakak!"]
        : ["Hello everyone!", "Hi group members!", "Hey friends!"];

      const renderOpts = () => {
        optionsWrap.innerHTML = "";
        opts.forEach((val, idx) => {
          const row = document.createElement("div");
          row.className = "inline-actions";
          const inp = document.createElement("input");
          inp.type = "text";
          inp.className = "input";
          inp.value = val;
          inp.setAttribute("aria-label", txt(`Pilihan ${idx + 1}`, `Variation option ${idx + 1}`));
          inp.addEventListener("input", () => {
            opts[idx] = inp.value;
          });
          row.appendChild(inp);
          if (opts.length > 2) {
            const rm = document.createElement("button");
            rm.type = "button";
            rm.className = "btn-mini";
            rm.textContent = txt("Hapus", "Remove");
            rm.addEventListener("click", () => {
              opts.splice(idx, 1);
              renderOpts();
            });
            row.appendChild(rm);
          }
          optionsWrap.appendChild(row);
        });
      };
      renderOpts();
      body.appendChild(optionsWrap);

      const addOptBtn = document.createElement("button");
      addOptBtn.type = "button";
      addOptBtn.className = "btn-outline btn-sm";
      addOptBtn.textContent = txt("+ Tambah Pilihan", "+ Add Option");
      addOptBtn.addEventListener("click", () => {
        if (opts.length >= 8) return;
        opts.push("");
        renderOpts();
      });

      const insertBtn = document.createElement("button");
      insertBtn.type = "button";
      insertBtn.className = "btn-primary btn-sm";
      insertBtn.textContent = txt("Sisipkan ke Postingan", "Insert into Post");
      insertBtn.addEventListener("click", () => {
        const clean = opts.map((s) => s.trim()).filter(Boolean);
        if (clean.length < 2) {
          toast(txt("Isi minimal 2 pilihan kata.", "Enter at least 2 options."));
          return;
        }
        const token = `{${clean.join("|")}}`;
        const ta = document.getElementById("postBodyInput");
        const pos = ta.selectionStart || ta.value.length;
        ta.value = ta.value.slice(0, pos) + token + ta.value.slice(pos);
        state.versions[state.activeVersionIdx] = ta.value;
        saveDraft();
        renderComposerMeta();
        closeModal();
      });

      const curText = state.versions[state.activeVersionIdx] || "";
      const permCount = window.RelaySpintax.countPermutations(curText);
      const permInfo = document.createElement("div");
      permInfo.className = "card";
      permInfo.innerHTML = `<strong>${escapeHtml(txt(`Kemungkinan kombinasi saat ini: ${permCount}`, `Current post combinations: ${permCount}`))}</strong>
        <p class="muted-text">${escapeHtml(txt("Contoh hasil", "Sample"))}: ${escapeHtml(window.RelaySpintax.expand(curText) || txt("(Kosong)", "(Empty post)"))}</p>`;

      body.append(addOptBtn, insertBtn, permInfo);
    });
  }

  function openTemplatesModal() {
    openModal(txt("Template Postingan", "Post Templates"), (body) => {
      const saveRow = document.createElement("div");
      saveRow.className = "inline-actions";
      const nameInp = document.createElement("input");
      nameInp.type = "text";
      nameInp.className = "input";
      nameInp.placeholder = txt("Nama template...", "Template name...");
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn-primary btn-sm";
      saveBtn.textContent = txt("Simpan Draft Ini", "Save Current");
      saveBtn.addEventListener("click", async () => {
        const text = state.versions[state.activeVersionIdx] || "";
        if (!text.trim()) {
          toast(txt("Tulis teks postingan dulu.", "Write post text first."));
          return;
        }
        state.templates.unshift({
          id: `tpl_${Date.now()}`,
          name: nameInp.value.trim() || text.slice(0, 32),
          versions: state.versions.slice(),
          comments: state.comments.slice(),
          savedAt: Date.now()
        });
        await chrome.storage.local.set({ relayTemplates: state.templates });
        toast(txt("Template tersimpan.", "Template saved."));
        openTemplatesModal();
      });
      saveRow.append(nameInp, saveBtn);
      body.appendChild(saveRow);

      if (!state.templates.length) {
        const p = document.createElement("p");
        p.className = "muted-text";
        p.textContent = txt("Belum ada template tersimpan.", "No templates saved yet.");
        body.appendChild(p);
        return;
      }

      for (const tpl of state.templates) {
        const item = document.createElement("div");
        item.className = "list-item";
        item.innerHTML = `<div><strong>${escapeHtml(tpl.name)}</strong><div class="muted-text">${escapeHtml((tpl.versions?.[0] || "").slice(0, 60))}</div></div>`;
        const btns = document.createElement("div");
        btns.className = "inline-actions";

        const loadBtn = document.createElement("button");
        loadBtn.type = "button";
        loadBtn.className = "btn-primary btn-sm";
        loadBtn.textContent = txt("Pakai", "Load");
        loadBtn.addEventListener("click", () => {
          state.versions = tpl.versions?.length ? tpl.versions.slice() : [""];
          state.activeVersionIdx = 0;
          state.comments = tpl.comments ? tpl.comments.slice() : [];
          saveDraft();
          renderComposer();
          closeModal();
        });

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn-mini";
        delBtn.textContent = tr("deleteBtn");
        delBtn.addEventListener("click", async () => {
          state.templates = state.templates.filter((t) => t.id !== tpl.id);
          await chrome.storage.local.set({ relayTemplates: state.templates });
          openTemplatesModal();
        });

        btns.append(loadBtn, delBtn);
        item.appendChild(btns);
        body.appendChild(item);
      }
    });
  }

  function openImageSetsModal() {
    if (!requirePro(txt("Set Foto Acak", "Random Photo Sets"))) return;
    openModal(txt("Paket Foto Acak per Grup", "Image Sets (Randomize Photos per Group)"), (body) => {
      const toggleRow = document.createElement("label");
      toggleRow.className = "list-item";
      toggleRow.innerHTML = `<span>${escapeHtml(txt("Aktifkan acak paket foto", "Enable Image Sets mode"))}</span>`;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.imageSetsEnabled;
      cb.addEventListener("change", () => {
        state.imageSetsEnabled = cb.checked;
        saveDraft();
        renderMediaList();
      });
      toggleRow.appendChild(cb);
      body.appendChild(toggleRow);

      const newSetBtn = document.createElement("button");
      newSetBtn.type = "button";
      newSetBtn.className = "btn-outline btn-sm";
      newSetBtn.textContent = txt("Simpan Foto Sekarang Jadi Paket", "Create Set from Current Media");
      newSetBtn.addEventListener("click", () => {
        if (!state.imageIds.length) {
          toast(txt("Tambahkan foto ke postingan dulu.", "Add photos to the post first."));
          return;
        }
        state.imageSets.push({
          id: `set_${Date.now()}`,
          name: txt(`Paket ${state.imageSets.length + 1}`, `Set ${state.imageSets.length + 1}`),
          imageIds: state.imageIds.slice()
        });
        state.imageSetsEnabled = true;
        saveDraft();
        renderMediaList();
        openImageSetsModal();
      });
      body.appendChild(newSetBtn);

      for (const s of state.imageSets) {
        const row = document.createElement("div");
        row.className = "list-item";
        row.innerHTML = `<span><strong>${escapeHtml(s.name)}</strong> (${s.imageIds.length} ${txt("foto", "photo(s)")})</span>`;
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn-mini";
        del.textContent = txt("Hapus", "Remove");
        del.addEventListener("click", () => {
          state.imageSets = state.imageSets.filter((x) => x.id !== s.id);
          saveDraft();
          renderMediaList();
          openImageSetsModal();
        });
        row.appendChild(del);
        body.appendChild(row);
      }
    });
  }

  function openCommentsModal() {
    if (!requirePro(txt("Komentar Pertama Otomatis", "Auto First Comment"))) return;
    openModal(txt("Komentar Pertama Otomatis", "First Comment & Comment Series"), (body) => {
      const renderList = () => {
        body.innerHTML = "";
        const info = document.createElement("p");
        info.className = "muted-text";
        info.textContent = txt(
          "Bisa isi hingga 3 komentar lanjutan. Isi 0 menit agar langsung berkomentar setelah posting.",
          "Up to 3 comments per post. Set 0 minutes to post right after publishing, or delay by minutes."
        );
        body.appendChild(info);

        state.comments.forEach((c, idx) => {
          const box = document.createElement("div");
          box.className = "card";
          box.innerHTML = `
            <div class="field">
              <label for="cmtTxt${idx}">${escapeHtml(txt(`Komentar ${idx + 1} (mendukung {variasi|kata})`, `Comment ${idx + 1} (supports {Spintax|variations})`))}</label>
              <textarea id="cmtTxt${idx}" class="input" rows="2">${escapeHtml(c.text)}</textarea>
            </div>
            <div class="field" style="margin-top:6px;">
              <label for="cmtDelay${idx}">${escapeHtml(txt("Jeda setelah posting (menit)", "Delay after post (minutes)"))}</label>
              <input id="cmtDelay${idx}" class="input" type="number" min="0" max="1440" value="${c.delayMinutes}" />
            </div>
          `;
          box.querySelector(`#cmtTxt${idx}`).addEventListener("input", (e) => {
            state.comments[idx].text = e.target.value;
            saveDraft();
            renderMediaList();
          });
          box.querySelector(`#cmtDelay${idx}`).addEventListener("input", (e) => {
            state.comments[idx].delayMinutes = Math.max(0, Number(e.target.value) || 0);
            saveDraft();
          });
          const rm = document.createElement("button");
          rm.type = "button";
          rm.className = "btn-mini";
          rm.style.marginTop = "6px";
          rm.textContent = txt("Hapus komentar", "Remove comment");
          rm.addEventListener("click", () => {
            state.comments.splice(idx, 1);
            saveDraft();
            renderMediaList();
            renderList();
          });
          box.appendChild(rm);
          body.appendChild(box);
        });

        if (state.comments.length < 3) {
          const addBtn = document.createElement("button");
          addBtn.type = "button";
          addBtn.className = "btn-primary btn-sm";
          addBtn.textContent = txt("+ Tambah Komentar", "Add Comment");
          addBtn.addEventListener("click", () => {
            state.comments.push({
              text: "",
              delayMinutes: state.comments.length === 0 ? 0 : state.comments.length * 15
            });
            saveDraft();
            renderMediaList();
            renderList();
          });
          body.appendChild(addBtn);
        }
      };
      renderList();
    });
  }

  function openProtectionModal() {
    openModal(txt("Pengaturan Kecepatan & Keamanan", "Speed & Safety Settings"), (body) => {
      const d = { ...state.delivery };
      body.innerHTML = `
        <div class="field">
          <label for="protMethod">${escapeHtml(txt("Cara Pengiriman", "Posting Method"))}</label>
          <select id="protMethod" class="select">
            <option value="fast" ${d.postingMethod === "fast" ? "selected" : ""}>${escapeHtml(txt("Latar Belakang (Lebih cepat & tanpa jendela terbuka)", "Fast Mode (Background Engine API)"))}</option>
            <option value="safe" ${d.postingMethod === "safe" ? "selected" : ""}>${escapeHtml(txt("Simulasi Manusia (Membuka jendela grup & mengetik langsung)", "Safe Mode (Human-paced Facebook window)"))}</option>
          </select>
        </div>
        <div class="field">
          <label for="protWait">${escapeHtml(txt("Jeda antar grup (menit)", "Wait between posts (minutes)"))}</label>
          <input id="protWait" class="input" type="number" min="0.5" max="60" step="0.5" value="${d.waitMinutes}" />
        </div>
        <div class="field">
          <label for="protRound">${escapeHtml(txt("Jumlah grup sebelum jeda", "Posts per round before wait"))}</label>
          <input id="protRound" class="input" type="number" min="1" max="10" value="${d.postsPerRound}" />
        </div>
        <div class="field">
          <label for="protPresence">${escapeHtml(txt("Simulasi Aktivitas Alami", "Natural Presence Level"))}</label>
          <select id="protPresence" class="select">
            <option value="0" ${d.humanLevel === 0 ? "selected" : ""}>0 - ${escapeHtml(txt("Mati", "Off"))}</option>
            <option value="1" ${d.humanLevel === 1 ? "selected" : ""}>1 - ${escapeHtml(txt("Cepat", "Fast"))}</option>
            <option value="2" ${d.humanLevel === 2 ? "selected" : ""}>2 - ${escapeHtml(txt("Seimbang (Disarankan)", "Balanced (Recommended)"))}</option>
            <option value="3" ${d.humanLevel === 3 ? "selected" : ""}>3 - ${escapeHtml(txt("Maksimal", "Maximum"))}</option>
          </select>
        </div>
        <label class="list-item"><span>${escapeHtml(txt("Acak durasi jeda agar tidak kaku", "Randomize wait length (anti-pattern jitter)"))}</span><input type="checkbox" id="protJitter" ${d.randomizeWait ? "checked" : ""} /></label>
        <label class="list-item"><span>${escapeHtml(txt("Acak urutan grup setiap kali kirim", "Randomize group order each run"))}</span><input type="checkbox" id="protOrder" ${d.randomizeOrder ? "checked" : ""} /></label>
        <label class="list-item"><span>${escapeHtml(txt("Perlindungan ekstra untuk kirim banyak grup", "Extra-safe daily volume scaling"))}</span><input type="checkbox" id="protExtra" ${d.extraSafePacing ? "checked" : ""} /></label>
      `;

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn-primary btn-sm";
      saveBtn.textContent = txt("Simpan Pengaturan", "Apply Protection Settings");
      saveBtn.addEventListener("click", async () => {
        state.delivery = {
          postingMethod: body.querySelector("#protMethod").value,
          waitMinutes: Math.max(0.5, Number(body.querySelector("#protWait").value) || 3.5),
          postsPerRound: Math.max(1, Number(body.querySelector("#protRound").value) || 1),
          humanLevel: Number(body.querySelector("#protPresence").value),
          randomizeWait: body.querySelector("#protJitter").checked,
          randomizeOrder: body.querySelector("#protOrder").checked,
          extraSafePacing: body.querySelector("#protExtra").checked
        };
        await chrome.storage.local.set({ relayDelivery: state.delivery });
        renderProtectionStrip();
        closeModal();
        toast(txt("Pengaturan kecepatan disimpan.", "Protection settings saved."));
      });
      body.appendChild(saveBtn);
    });
  }

  function openScheduleModal() {
    if (!validateBeforePublish()) return;
    openModal(txt("Jadwalkan Postingan", "Schedule Post"), (body) => {
      const tomorrow = new Date(Date.now() + 3600 * 1000);
      const defDate = tomorrow.toISOString().slice(0, 10);
      const defTime = tomorrow.toTimeString().slice(0, 5);

      body.innerHTML = `
        <div class="field">
          <label for="schedFreq">${escapeHtml(txt("Frekuensi Pengulangan", "Repeat Frequency"))}</label>
          <select id="schedFreq" class="select">
            <option value="once">${escapeHtml(txt("Sekali saja", "Once"))}</option>
            <option value="daily">${escapeHtml(txt("Setiap hari", "Daily"))}</option>
            <option value="weekly">${escapeHtml(txt("Mingguan", "Weekly"))}</option>
            <option value="monthly">${escapeHtml(txt("Bulanan", "Monthly"))}</option>
          </select>
        </div>
        <div class="field" id="schedDateWrap">
          <label for="schedDate">${escapeHtml(txt("Tanggal", "Date"))}</label>
          <input id="schedDate" class="input" type="date" value="${defDate}" />
        </div>
        <div class="field" id="schedWeekWrap" hidden>
          <label>${escapeHtml(txt("Pilih hari", "Days of week"))}</label>
          <div class="inline-actions" id="weekDaysRow"></div>
        </div>
        <div class="field" id="schedMonthWrap" hidden>
          <label for="schedMonthDays">${escapeHtml(txt("Tanggal tiap bulan (1-28)", "Day of month (1-28)"))}</label>
          <input id="schedMonthDays" class="input" type="number" min="1" max="28" value="${tomorrow.getDate()}" />
        </div>
        <div class="field">
          <label for="schedTime">${escapeHtml(txt("Jam Mulai (waktu lokal)", "Start Time (local)"))}</label>
          <input id="schedTime" class="input" type="time" value="${defTime}" />
          <div class="inline-actions" id="quickTimeRow" style="margin-top:6px;flex-wrap:wrap;"></div>
        </div>
        <p class="muted-text">${escapeHtml(txt(
          "Pastikan Chrome tetap terbuka agar postingan terjadwal berjalan tepat waktu.",
          "Keep Chrome open and awake so scheduled campaigns fire on time."
        ))}</p>
      `;

      const quickTimeRow = body.querySelector("#quickTimeRow");
      const timeSlots = [
        { label: txt("Pagi 08:00", "Morning 08:00"), val: "08:00" },
        { label: txt("Siang 12:15", "Noon 12:15"), val: "12:15" },
        { label: txt("Malam 19:30", "Evening 19:30"), val: "19:30" }
      ];
      const timeInput = body.querySelector("#schedTime");
      for (const slot of timeSlots) {
        const sb = document.createElement("button");
        sb.type = "button";
        sb.className = "ver-pill";
        sb.dataset.quickTime = slot.val;
        sb.textContent = slot.label;
        sb.addEventListener("click", () => {
          timeInput.value = slot.val;
          quickTimeRow.querySelectorAll(".ver-pill").forEach((x) => x.classList.remove("is-active"));
          sb.classList.add("is-active");
        });
        quickTimeRow.appendChild(sb);
      }

      const weekRow = body.querySelector("#weekDaysRow");
      const dayLabels = isId() ? ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      dayLabels.forEach((lbl, idx) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ver-pill" + (idx === tomorrow.getDay() ? " is-active" : "");
        b.dataset.day = String(idx);
        b.textContent = lbl;
        b.addEventListener("click", () => b.classList.toggle("is-active"));
        weekRow.appendChild(b);
      });

      const freqSel = body.querySelector("#schedFreq");
      freqSel.addEventListener("change", () => {
        const f = freqSel.value;
        body.querySelector("#schedDateWrap").hidden = f !== "once";
        body.querySelector("#schedWeekWrap").hidden = f !== "weekly";
        body.querySelector("#schedMonthWrap").hidden = f !== "monthly";
      });

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn-primary btn-sm";
      saveBtn.textContent = txt("Simpan Jadwal", "Save Schedule");
      saveBtn.addEventListener("click", async () => {
        const freq = freqSel.value;
        const schedule = {
          frequency: freq,
          date: body.querySelector("#schedDate").value,
          time: body.querySelector("#schedTime").value,
          daysOfWeek: Array.from(weekRow.querySelectorAll(".is-active")).map((b) => Number(b.dataset.day)),
          daysOfMonth: [Math.max(1, Math.min(28, Number(body.querySelector("#schedMonthDays").value) || 1))]
        };
        const res = await chrome.runtime.sendMessage({
          action: "schedulePost",
          post: buildPostPayload(),
          groups: state.selectedGroups,
          delivery: state.delivery,
          schedule
        });
        if (!res || !res.ok) {
          toast(res?.error || txt("Gagal menjadwalkan postingan.", "Could not schedule post."));
          return;
        }
        const { scheduledPosts = [] } = await chrome.storage.local.get("scheduledPosts");
        state.scheduledPosts = scheduledPosts;
        renderQueueBadge();
        closeModal();
        switchTab("scheduled");
        toast(txt("Postingan dijadwalkan.", "Post scheduled."));
      });
      body.appendChild(saveBtn);
    });
  }

  function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((ch === "," || ch === ";") && !inQuotes) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function openBulkScheduleCsvModal() {
    if (!requirePro(txt("Impor Massal Jadwal CSV", "Bulk Schedule CSV Import"))) return;
    openModal(txt("Impor Massal Jadwal dari CSV", "Bulk Import Schedules from CSV"), (body) => {
      const nextDay = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
      const intro = document.createElement("p");
      intro.className = "helper-note";
      intro.textContent = txt(
        "Kolom CSV: tanggal (YYYY-MM-DD), jam (HH:MM), frekuensi (once/daily), teks_postingan, link_grup (pisahkan beberapa grup dengan |, atau kosongkan untuk memakai grup terpilih saat ini).",
        "CSV columns: date (YYYY-MM-DD), time (HH:MM), frequency (once/daily), post_text, group_urls (separate multiple URLs with |, or leave blank to use currently selected groups)."
      );
      body.appendChild(intro);

      const fileRow = document.createElement("div");
      fileRow.className = "inline-actions";
      fileRow.innerHTML = `<input id="schedCsvFile" type="file" accept=".csv,.txt" style="flex:1;" />
        <button type="button" class="btn-outline btn-sm" id="downloadSchedCsvBtn">${escapeHtml(txt("Unduh Contoh CSV", "Download Sample CSV"))}</button>`;
      body.appendChild(fileRow);

      const taWrap = document.createElement("div");
      taWrap.className = "field";
      taWrap.innerHTML = `<label for="schedCsvText">${escapeHtml(txt("Isi CSV jadwal", "Schedule CSV content"))}</label>
        <textarea id="schedCsvText" class="input" rows="6" placeholder="tanggal,jam,frekuensi,teks_postingan,link_grup"></textarea>`;
      body.appendChild(taWrap);

      fileRow.querySelector("#downloadSchedCsvBtn").addEventListener("click", () => {
        const sample = [
          "tanggal,jam,frekuensi,teks_postingan,link_grup",
          `${nextDay},08:00,once,"Promo pagi spesial, stok terbatas!",https://www.facebook.com/groups/123456789012345/`,
          `${nextDay},12:15,daily,"Info siang hari, siap kirim hari ini.",https://www.facebook.com/groups/123456789012345/|https://www.facebook.com/groups/contohgrupjualbeli/`
        ].join("\r\n");
        const blob = new Blob(["\uFEFF" + sample], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = isId() ? "relaypost-contoh-jadwal.csv" : "relaypost-sample-schedules.csv";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          a.remove();
        }, 1000);
        toast(txt("Contoh CSV jadwal diunduh.", "Sample schedule CSV downloaded."));
      });

      fileRow.querySelector("#schedCsvFile").addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const raw = (await file.text()).replace(/^\uFEFF/, "");
        taWrap.querySelector("textarea").value = raw;
      });

      const importBtn = document.createElement("button");
      importBtn.type = "button";
      importBtn.className = "btn-primary btn-sm";
      importBtn.textContent = txt("Impor ke Antrean Jadwal", "Import to Queue");
      importBtn.addEventListener("click", async () => {
        const raw = taWrap.querySelector("textarea").value.replace(/^\uFEFF/, "");
        const lines = raw.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
        if (!lines.length) {
          toast(txt("Tempel atau pilih file CSV terlebih dahulu.", "Paste or choose a CSV file first."));
          return;
        }
        let imported = 0;
        let skipped = 0;
        for (const line of lines) {
          const cols = parseCsvLine(line);
          if (cols.length < 4) {
            skipped++;
            continue;
          }
          const [dateVal, timeVal, freqRaw, textVal, groupsRaw = ""] = cols;
          if (/^(tanggal|date)$/i.test(dateVal)) continue;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal) || !/^\d{1,2}:\d{2}$/.test(timeVal) || !textVal) {
            skipped++;
            continue;
          }
          const freq = ["once", "daily", "weekly", "monthly"].includes((freqRaw || "").toLowerCase())
            ? freqRaw.toLowerCase()
            : "once";
          const rowGroups = [];
          for (const part of String(groupsRaw).split("|").map((s) => s.trim()).filter(Boolean)) {
            const m = part.match(/facebook\.com\/groups\/([^/?#\s"']+)/i);
            if (m) rowGroups.push({ id: m[1], name: `Group ${m[1]}`, url: `https://www.facebook.com/groups/${m[1]}/` });
          }
          const targetGroups = rowGroups.length ? rowGroups : state.selectedGroups;
          if (!targetGroups.length) {
            skipped++;
            continue;
          }
          const res = await chrome.runtime.sendMessage({
            action: "schedulePost",
            post: {
              text: textVal,
              versions: [textVal],
              background: BG_PRESETS[0],
              imageIds: [],
              imageSetsEnabled: false,
              imageSets: [],
              comments: [],
              shareUrl: null
            },
            groups: targetGroups,
            delivery: state.delivery,
            schedule: {
              frequency: freq,
              date: dateVal,
              time: timeVal.padStart(5, "0"),
              daysOfWeek: [new Date(`${dateVal}T00:00:00`).getDay()],
              daysOfMonth: [Math.min(28, Number(dateVal.slice(8, 10)) || 1)]
            }
          }).catch(() => null);
          if (res && res.ok) imported++;
          else skipped++;
        }

        const { scheduledPosts = [] } = await chrome.storage.local.get("scheduledPosts");
        state.scheduledPosts = scheduledPosts;
        renderQueueBadge();
        renderQueueTab();
        closeModal();
        toast(txt(
          `${imported} jadwal berhasil diimpor${skipped ? ` (${skipped} dilewati)` : ""}.`,
          `Imported ${imported} schedule(s)${skipped ? ` (${skipped} skipped)` : ""}.`
        ));
      });
      body.appendChild(importBtn);
    });
  }

  function openSettingsModal() {
    openModal(tr("btnSettings"), async (body) => {
      const { shareButtonEnabled = true, keepComputerAwake = true } = await chrome.storage.local.get([
        "shareButtonEnabled",
        "keepComputerAwake"
      ]);
      body.innerHTML = `
        <label class="list-item">
          <span>${escapeHtml(txt("Tampilkan tombol 'Share to groups' di Facebook", "Show 'Share to groups' button on Facebook posts"))}</span>
          <input type="checkbox" id="setShareBtn" ${shareButtonEnabled ? "checked" : ""} />
        </label>
        <label class="list-item">
          <span>${escapeHtml(txt("Cegah komputer sleep sebelum jadwal jalan", "Keep computer awake before scheduled posts"))}</span>
          <input type="checkbox" id="setAwake" ${keepComputerAwake ? "checked" : ""} />
        </label>
      `;

      body.querySelector("#setShareBtn").addEventListener("change", async (e) => {
        await chrome.runtime.sendMessage({ action: "mgpShareButtonSetting", enabled: e.target.checked });
        toast(txt("Preferensi tombol Share diperbarui.", "Share button preference updated."));
      });
      body.querySelector("#setAwake").addEventListener("change", async (e) => {
        await chrome.storage.local.set({ keepComputerAwake: e.target.checked });
      });

      const engBtn = document.createElement("button");
      engBtn.type = "button";
      engBtn.className = "btn-outline btn-sm";
      engBtn.textContent = txt("Buka Tab Engine Command Center", "Open Engine Command Center Tab");
      engBtn.addEventListener("click", async () => {
        await chrome.runtime.sendMessage({ action: "openEngineTab" });
      });
      body.appendChild(engBtn);
    });
  }

  function openHelpModal() {
    openModal(txt("Panduan Singkat RelayPost", "RelayPost Quick Guide"), (body) => {
      body.innerHTML = `
        <div class="card">
          <strong>${escapeHtml(txt("Langkah 1: Pilih Grup", "Step 1: Choose Groups"))}</strong>
          <p class="muted-text">${escapeHtml(txt(
            "Klik tombol Pilih Grup, lalu pilih 'Ambil Otomatis dari Facebook' atau tempel link grup Anda.",
            "Click Choose Groups, then run 'Auto-Scan Facebook' or paste your group links."
          ))}</p>
        </div>
        <div class="card">
          <strong>${escapeHtml(txt("Langkah 2: Tulis & Buat Variasi", "Step 2: Write & Vary"))}</strong>
          <p class="muted-text">${escapeHtml(txt(
            "Gunakan tanda {Halo|Hai|Permisi} atau tombol Variasi Kata agar setiap grup mendapat kalimat berbeda.",
            "Wrap synonyms like {Hi|Hello|Hey} or click Word Variations so each group gets unique wording."
          ))}</p>
        </div>
        <div class="card">
          <strong>${escapeHtml(txt("Langkah 3: Atur Jeda & Kirim", "Step 3: Pick Speed & Publish"))}</strong>
          <p class="muted-text">${escapeHtml(txt(
            "Untuk akun baru, gunakan preset Aman (3.5 menit per grup). Tekan Alt+Shift+R kapan saja untuk membuka jendela penuh.",
            "For newer accounts, stick to Safe (3.5 min gap). Press Alt+Shift+R anytime to open full workspace."
          ))}</p>
        </div>
      `;
    });
  }

  function buildPostPayload() {
    return {
      text: state.versions[state.activeVersionIdx] || "",
      versions: state.versions.slice(),
      background: state.background,
      imageIds: state.imageIds.slice(),
      imageSetsEnabled: state.imageSetsEnabled,
      imageSets: state.imageSets.slice(),
      comments: state.comments.slice(),
      shareUrl: state.shareStagedPost && state.shareMode === "share" ? state.shareStagedPost.permalink : null
    };
  }

  function validateBeforePublish() {
    showComposeAlert("");
    const limits = getPlanLimits();
    const hasText = state.versions.some((v) => String(v || "").trim().length > 0);
    const hasMedia = state.imageIds.length > 0 || (state.imageSetsEnabled && state.imageSets.length > 0);
    if (!state.selectedGroups.length) {
      showComposeAlert(txt("Pilih minimal 1 grup tujuan terlebih dahulu.", "Select at least one target group first."));
      return false;
    }
    if (state.selectedGroups.length > limits.maxGroupsPerCampaign) {
      showComposeAlert(txt(
        `Paket Gratis maksimal ${limits.maxGroupsPerCampaign} grup per kampanye. Upgrade ke PRO untuk tanpa batas grup.`,
        `Free plan supports up to ${limits.maxGroupsPerCampaign} groups per run. Upgrade to PRO for unlimited groups.`
      ));
      openLicenseModal(txt("Kirim Lebih dari 5 Grup", "More than 5 Groups"));
      return false;
    }
    if (!hasText && !hasMedia && !state.shareStagedPost) {
      showComposeAlert(txt("Tulis teks postingan atau tambahkan foto terlebih dahulu.", "Write post text or attach media before publishing."));
      return false;
    }
    return true;
  }

  async function publishCampaign() {
    if (!validateBeforePublish()) return;
    await chrome.runtime.sendMessage({
      action: "POST_PAYLOAD",
      payload: {
        post: buildPostPayload(),
        groups: state.selectedGroups,
        delivery: state.delivery
      }
    });
    toast(txt("Pengiriman dimulai!", "Campaign started."));
  }

  // Share Sheet initialization when embedded inside Facebook
  async function initShareSheetMode() {
    const res = await chrome.runtime.sendMessage({ action: "mgpTakeShare", token: SHARE_TOKEN }).catch(() => null);
    if (!res || !res.ok || !res.post) {
      showComposeAlert(txt(
        "Gagal memuat postingan Facebook ini. Tutup lalu klik 'Share to groups' lagi.",
        "Could not load this Facebook post. Close and click Share to groups again."
      ));
      return;
    }
    state.shareStagedPost = res.post;
    state.versions = [res.post.text ? `${res.post.text}\n\n${res.post.permalink || ""}`.trim() : (res.post.permalink || "")];
    state.activeVersionIdx = 0;
    renderComposer();
    toast(txt("Postingan dimuat ke Share Sheet.", "Post loaded into Share Sheet."));
  }

  // Event bindings
  const langToggleBtn = document.getElementById("langToggleBtn");
  if (langToggleBtn) {
    langToggleBtn.addEventListener("click", async () => {
      state.lang = state.lang === "id" ? "en" : "id";
      await chrome.storage.local.set({ relayLang: state.lang });
      applyLocale();
      renderComposer();
      await refreshFbStatus();
      if (state.activeTab === "scheduled") renderQueueTab();
      if (state.inHistory) renderHistoryView();
      toast(state.lang === "id" ? "Bahasa diubah ke Indonesia" : "Language switched to English");
    });
  }

  const toggleExtraBtn = document.getElementById("toggleExtraOptionsBtn");
  if (toggleExtraBtn) {
    toggleExtraBtn.addEventListener("click", () => {
      state.extraOptionsOpen = !state.extraOptionsOpen;
      const drawer = document.getElementById("extraOptionsDrawer");
      if (drawer) drawer.hidden = !state.extraOptionsOpen;
      toggleExtraBtn.setAttribute("aria-expanded", String(state.extraOptionsOpen));
      setTextIfPresent(
        "extraOptionsLabel",
        state.extraOptionsOpen ? tr("moreOptionsHide") : tr("moreOptionsShow")
      );
    });
  }

  document.querySelectorAll(".preset-btn[data-speed-preset]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const preset = SPEED_PRESETS[btn.dataset.speedPreset];
      if (!preset) return;
      state.delivery = { ...state.delivery, ...preset };
      await chrome.storage.local.set({ relayDelivery: state.delivery });
      renderProtectionStrip();
    });
  });

  document.getElementById("actorDropdownBtn").addEventListener("click", () => {
    const menu = document.getElementById("actorMenu");
    const next = menu.hidden;
    menu.hidden = !next;
    document.getElementById("actorDropdownBtn").setAttribute("aria-expanded", String(next));
  });

  document.getElementById("refreshActorBtn").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ action: "refreshFbSession" });
    await refreshFbStatus();
  });

  document.getElementById("loadPagesBtn").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ action: "fetchManagedPages" });
    await refreshFbStatus();
    toast(txt("Daftar Halaman diperbarui.", "Pages refreshed."));
  });

  document.getElementById("themeBtn").addEventListener("click", async () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    await chrome.storage.local.set({ relayTheme: next });
  });

  document.getElementById("workspaceBtn").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ action: "openPopupWorkspace" });
    window.close();
  });

  const dismissIntroBtn = document.getElementById("dismissIntroBtn");
  if (dismissIntroBtn) {
    dismissIntroBtn.addEventListener("click", async () => {
      const introCard = document.getElementById("introCard");
      if (introCard) introCard.hidden = true;
      await chrome.storage.local.set({ relayIntroDismissed: true });
    });
  }

  document.getElementById("historyBtn").addEventListener("click", async () => {
    const { postHistory = [] } = await chrome.storage.local.get("postHistory");
    state.postHistory = Array.isArray(postHistory) ? postHistory : [];
    switchTab("history");
  });

  document.getElementById("historyBackBtn").addEventListener("click", () => switchTab("create"));
  document.getElementById("settingsBtn").addEventListener("click", openSettingsModal);
  document.getElementById("helpBtn").addEventListener("click", openHelpModal);

  document.getElementById("openGroupsModalBtn").addEventListener("click", openGroupsModal);
  document.getElementById("openListsModalBtn").addEventListener("click", openListsModal);
  document.getElementById("openSpintaxBtn").addEventListener("click", openSpintaxModal);
  document.getElementById("openTemplatesBtn").addEventListener("click", openTemplatesModal);
  document.getElementById("openImageSetsBtn").addEventListener("click", openImageSetsModal);
  document.getElementById("openCommentsBtn").addEventListener("click", openCommentsModal);
  document.getElementById("openProtectionBtn").addEventListener("click", openProtectionModal);
  document.getElementById("openScheduleBtn").addEventListener("click", openScheduleModal);
  document.getElementById("publishNowBtn").addEventListener("click", publishCampaign);

  document.getElementById("addMediaBtn").addEventListener("click", () => {
    const pickerUrl = chrome.runtime.getURL("picker/media-picker.html");
    chrome.windows.create({ url: pickerUrl, type: "popup", width: 430, height: 420 });
  });

  document.getElementById("addVersionBtn").addEventListener("click", () => {
    if (!requirePro(txt("Multi-Versi Teks (A-E)", "Multi-Version Text (A-E)"))) return;
    if (state.versions.length >= 5) return;
    state.versions.push(state.versions[0] || "");
    state.activeVersionIdx = state.versions.length - 1;
    saveDraft();
    renderComposer();
  });

  document.getElementById("postBodyInput").addEventListener("input", (e) => {
    state.versions[state.activeVersionIdx] = e.target.value;
    saveDraft();
    renderComposerMeta();
  });

  document.querySelectorAll(".tool-btn[data-fmt]").forEach((btn) => {
    btn.addEventListener("click", () => applyTextFormat(btn.dataset.fmt));
  });

  document.getElementById("togglePreviewBtn").addEventListener("click", () => {
    state.previewOpen = !state.previewOpen;
    renderPreview();
  });
  document.getElementById("shufflePreviewBtn").addEventListener("click", renderPreview);

  document.getElementById("pauseResumeBtn").addEventListener("click", async () => {
    const { isPostingInProgress } = await chrome.storage.local.get("isPostingInProgress");
    if (isPostingInProgress === "paused") {
      await chrome.runtime.sendMessage({ action: "resumePosting" });
    } else {
      await chrome.runtime.sendMessage({ action: "pausePosting" });
    }
  });

  document.getElementById("stopCampaignBtn").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ action: "stopPosting" });
  });

  document.getElementById("toggleSchedulerBtn").addEventListener("click", async () => {
    state.schedulerPaused = !state.schedulerPaused;
    await chrome.runtime.sendMessage({ action: "toggleSchedulerPaused", paused: state.schedulerPaused });
    renderQueueTab();
  });

  document.getElementById("emptyScheduleCta").addEventListener("click", () => switchTab("create"));

  document.getElementById("missedOpenQueueBtn").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ action: "clearMissedBadge" });
    document.getElementById("missedBanner").hidden = true;
    switchTab("scheduled");
  });

  document.getElementById("missedDismissBtn").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ action: "clearMissedBadge" });
    document.getElementById("missedBanner").hidden = true;
  });

  document.querySelectorAll("[data-hist-mode]").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("[data-hist-mode]").forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      state.historyMode = b.dataset.histMode;
      renderHistoryView();
    });
  });

  document.querySelectorAll("[data-hist-filter]").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("[data-hist-filter]").forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      state.historyFilter = b.dataset.histFilter;
      renderHistoryView();
    });
  });

  document.getElementById("exportCsvBtn").addEventListener("click", () => {
    if (!requirePro(txt("Ekspor Riwayat CSV", "Export History CSV"))) return;
    const rows = ["RunStarted,Group,Status,PostURL,Error"];
    for (const run of state.postHistory) {
      for (const g of run.groups || []) {
        rows.push([
          new Date(run.startedAt).toISOString(),
          `"${String(g.name || g.url).replace(/"/g, '""')}"`,
          g.status,
          `"${String(g.postUrl || "").replace(/"/g, '""')}"`,
          `"${String(g.error || "").replace(/"/g, '""')}"`
        ].join(","));
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relaypost-history-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local") return;
    if (changes.campaignProgress) {
      renderProgressCard(changes.campaignProgress.newValue);
    }
    if (changes.relayDraft && changes.relayDraft.newValue) {
      state.imageIds = changes.relayDraft.newValue.imageIds || [];
      await refreshMediaThumbs();
      renderMediaList();
      renderPreview();
    }
    if (changes.scheduledPosts) {
      state.scheduledPosts = changes.scheduledPosts.newValue || [];
      renderQueueBadge();
      if (state.activeTab === "scheduled") renderQueueTab();
    }
  });

  const licenseBtn = document.getElementById("licenseBtn");
  if (licenseBtn) {
    licenseBtn.addEventListener("click", () => openLicenseModal());
  }

  const importSchedBtn = document.getElementById("importScheduleCsvBtn");
  if (importSchedBtn) {
    importSchedBtn.addEventListener("click", openBulkScheduleCsvModal);
  }

  (async function boot() {
    if (window.RelayIcons) window.RelayIcons.applyIcons(document);
    await loadAllState();
    await refreshLicenseState();
    renderComposer();
    await refreshFbStatus();
    const { isPostingInProgress } = await chrome.storage.local.get("isPostingInProgress");
    if (isPostingInProgress !== "started" && isPostingInProgress !== "paused") {
      chrome.runtime.sendMessage({ action: "clearToolbarBadge" }).catch(() => {});
    }
    if (SHARE_TOKEN) {
      await initShareSheetMode();
    }
  })();
})();
