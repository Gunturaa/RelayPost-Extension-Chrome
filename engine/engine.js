(function () {
  "use strict";

  const DOC_IDS = {
    ComposerStoryCreateMutation: "9469644099759635",
    ComposerStoryCreateMutationMedia: "9286110778162996",
    useCometUFICreateCommentMutation: "26917309061273360"
  };

  const RELAY_PROVIDERS = {
    __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
    __relay_internal__pv__IsWorkUserrelayprovider: false,
    __relay_internal__pv__CometFeedStoryDynamicResolutionPhotoAttachmentRenderer_experimentWidthrelayprovider: 500
  };

  const startTime = Date.now();
  let reqCounter = 1;
  let busy = false;
  let curLang = "id";

  function tr(key, vars) {
    return window.RelayI18n ? window.RelayI18n.t(curLang, key, vars) : key;
  }

  function applyEngineLocale() {
    document.documentElement.lang = curLang === "en" ? "en" : "id";
    const keepEl = document.getElementById("keepOpenText");
    if (keepEl) {
      keepEl.innerHTML = curLang === "en"
        ? "<strong>Keep this tab open while campaigns run.</strong> Closing it pauses background posting."
        : "<strong>Biarkan tab ini tetap terbuka saat pengiriman berjalan.</strong> Jika ditutup, proses di latar belakang akan berhenti.";
    }
    const logTitle = document.getElementById("logTitle");
    if (logTitle) logTitle.textContent = tr("engineLogTitle");
    const logEmptyText = document.getElementById("logEmptyText");
    if (logEmptyText) logEmptyText.textContent = tr("engineLogEmpty");
    const dl = document.getElementById("downloadLogsLabel");
    if (dl) dl.textContent = curLang === "en" ? "Download .txt" : "Unduh .txt";
    const cl = document.getElementById("clearLogsLabel");
    if (cl) cl.textContent = curLang === "en" ? "Clear" : "Bersihkan";
  }

  if (window.RelayIcons) {
    window.RelayIcons.applyIcons(document);
  }

  // Theme & language initialization and persistence
  async function initTheme() {
    const { relayTheme = "light", relayLang } = await chrome.storage.local.get(["relayTheme", "relayLang"]);
    curLang = window.RelayI18n ? window.RelayI18n.getLang(relayLang) : "id";
    applyTheme(relayTheme);
    applyEngineLocale();
    document.getElementById("themeToggleBtn").addEventListener("click", async () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(next);
      await chrome.storage.local.set({ relayTheme: next });
    });
  }

  function applyTheme(theme) {
    const isDark = theme === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    const iconEl = document.getElementById("themeIcon");
    const labelEl = document.getElementById("themeLabel");
    if (iconEl && window.RelayIcons) {
      iconEl.innerHTML = window.RelayIcons.iconSvg(isDark ? "sun" : "moon", { size: 16 });
    }
    if (labelEl) labelEl.textContent = isDark ? "Light" : "Dark";
  }

  function formatDuration(sec) {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  function updateUptime() {
    const el = document.getElementById("uptimeEl");
    if (el) el.textContent = formatDuration(Math.floor((Date.now() - startTime) / 1000));
  }

  async function refreshStatus() {
    const res = await chrome.runtime.sendMessage({ action: "getFbStatus" }).catch(() => null);
    const status = res && res.status;
    const badge = document.getElementById("connBadge");
    const connText = document.getElementById("connText");
    const heroHeadline = document.getElementById("heroHeadline");
    const heroSub = document.getElementById("heroSub");
    const heroDot = document.getElementById("heroDot");
    const userNameEl = document.getElementById("userNameEl");
    const userSubEl = document.getElementById("userSubEl");
    const avatarEl = document.getElementById("avatarEl");

    if (status && status.signedIn) {
      badge.className = "status-pill";
      connText.textContent = "Facebook connected";
      userNameEl.textContent = status.name || "Facebook Account";
      userSubEl.textContent = status.isPage ? `Posting as Page (${status.actorId})` : `Personal profile (${status.uid})`;
      if (status.avatar) {
        avatarEl.innerHTML = "";
        const img = document.createElement("img");
        img.src = status.avatar;
        img.alt = "";
        avatarEl.appendChild(img);
      } else {
        avatarEl.textContent = (status.name || "F")[0].toUpperCase();
      }
    } else {
      badge.className = "status-pill is-warn";
      connText.textContent = "Facebook signed out";
      userNameEl.textContent = "Not signed in to Facebook";
      userSubEl.textContent = "Sign in at facebook.com in Chrome";
      avatarEl.textContent = "?";
    }

    const { isPostingInProgress, _postHistory = [], _lastPostSuccessAt, relayEngineLogs = [], relayLang } =
      await chrome.storage.local.get(["isPostingInProgress", "_postHistory", "_lastPostSuccessAt", "relayEngineLogs", "relayLang"]);
    curLang = window.RelayI18n ? window.RelayI18n.getLang(relayLang) : curLang;
    applyEngineLocale();

    const isPosting = isPostingInProgress === "started";
    const isPaused = isPostingInProgress === "paused";
    heroDot.className = "hero-dot" + (isPosting ? " is-posting" : isPaused || !(status && status.signedIn) ? " is-warn" : "");
    heroHeadline.textContent = isPosting
      ? tr("enginePosting")
      : isPaused
        ? tr("enginePaused")
        : !(status && status.signedIn)
          ? tr("engineLoginNeeded")
          : tr("engineReady");
    heroSub.textContent = isPosting
      ? tr("engineSubPosting")
      : isPaused
        ? tr("engineSubPaused")
        : tr("engineSubIdle");

    document.getElementById("campaignStateEl").textContent = isPosting ? "Running" : isPaused ? "Paused" : "Idle";
    document.getElementById("campaignSubEl").textContent = isPosting ? "Active campaign" : "Waiting for next run";

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const todayCount = (Array.isArray(_postHistory) ? _postHistory : []).filter((p) => p && p.ts >= dayStart.getTime()).length;
    document.getElementById("postsTodayEl").textContent = `${todayCount} / 200`;
    const mult = todayCount >= 100 ? "4.0x" : todayCount >= 60 ? "2.5x" : todayCount >= 30 ? "1.5x" : "1.0x";
    document.getElementById("delayTierEl").textContent = mult;
    document.getElementById("lastPostEl").textContent = _lastPostSuccessAt
      ? new Date(_lastPostSuccessAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "None yet";

    renderLogs(Array.isArray(relayEngineLogs) ? relayEngineLogs : []);
  }

  function renderLogs(logs) {
    const body = document.getElementById("logBody");
    const empty = document.getElementById("logEmpty");
    document.getElementById("logCountEl").textContent = String(logs.length);

    const existingRows = body.querySelectorAll(".log-row");
    existingRows.forEach((r) => r.remove());

    if (!logs.length) {
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    const frag = document.createDocumentFragment();
    for (const item of logs.slice(-250)) {
      const row = document.createElement("div");
      row.className = "log-row";
      const ts = document.createElement("span");
      ts.className = "log-ts";
      ts.textContent = new Date(item.t).toLocaleTimeString([], { hour12: false });
      const lvl = document.createElement("span");
      lvl.className = `log-lvl ${item.level || "info"}`;
      lvl.textContent = item.level || "info";
      const msg = document.createElement("span");
      msg.textContent = item.msg;
      row.append(ts, lvl, msg);
      frag.appendChild(row);
    }
    body.appendChild(frag);
    body.scrollTop = body.scrollHeight;
  }

  function buildBaseParams(tokens) {
    const params = new URLSearchParams({
      av: tokens.actorId,
      __user: tokens.uid,
      __a: "1",
      __req: (reqCounter++).toString(36),
      __hs: tokens.hs || "19800.HYP:comet_pkg.2.1..2.1",
      dpr: "1",
      __ccg: "EXCELLENT",
      __rev: tokens.rev || "1017506513",
      __comet_req: "15",
      fb_dtsg: tokens.dtsg,
      jazoest: tokens.jazoest,
      lsd: tokens.lsd || "",
      fb_api_caller_class: "RelayModern",
      server_timestamps: "true"
    });
    if (tokens.spin_r) params.append("__spin_r", String(tokens.spin_r));
    if (tokens.spin_b) params.append("__spin_b", String(tokens.spin_b));
    if (tokens.spin_t) params.append("__spin_t", String(tokens.spin_t));
    return params.toString();
  }

  function extractGroupId(url) {
    const numeric = String(url || "").match(/facebook\.com\/groups\/(\d+)/)?.[1];
    if (numeric) return numeric;
    return null;
  }

  async function resolveGroupNumericId(url) {
    const direct = extractGroupId(url);
    if (direct) return direct;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const html = await res.text();
    return (
      html.match(/"groupID":"(\d{6,17})"/)?.[1] ||
      html.match(/"groupId":"(\d{6,17})"/)?.[1] ||
      html.match(/fb:\/\/group\/\??(?:id=)?(\d{6,17})/)?.[1] ||
      null
    );
  }

  async function uploadPhoto(blob, tokens) {
    const mime = String(blob?.type || "image/jpeg").toLowerCase();
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
    const form = new FormData();
    form.append("source", "8");
    form.append("profile_id", tokens.actorId);
    form.append("waterfallxapp", "comet");
    form.append("upload_id", `upload_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    if (tokens.dtsg) form.append("fb_dtsg", tokens.dtsg);
    form.append("farr", blob, `photo.${ext}`);

    const res = await fetch(`https://upload.facebook.com/ajax/react_composer/attachments/photo/upload?${buildBaseParams(tokens)}`, {
      method: "POST",
      credentials: "include",
      body: form
    });
    if (!res.ok) throw new Error(`Photo upload HTTP ${res.status}`);
    const text = await res.text();
    const fbid =
      text.match(/"fbid"\s*:\s*"?(\d+)"?/)?.[1] ||
      text.match(/"photoID"\s*:\s*"?(\d+)"?/)?.[1] ||
      text.match(/"photo_id"\s*:\s*"?(\d+)"?/)?.[1] ||
      text.match(/"media_id"\s*:\s*"?(\d+)"?/)?.[1];
    if (!fbid) {
      const fbErr =
        text.match(/"errorDescription"\s*:\s*"([^"]+)"/)?.[1] ||
        text.match(/"errorSummary"\s*:\s*"([^"]+)"/)?.[1];
      throw new Error(fbErr ? `Photo upload rejected: ${fbErr}` : "Facebook did not return a photo ID.");
    }
    return { photo: { id: String(fbid) } };
  }

  function buildComposedText(text) {
    const lines = String(text || "").split("\n");
    return {
      blocks: lines,
      block_types: lines.map(() => 0),
      block_depths: lines.map(() => 0),
      block_data: lines.map(() => "{}"),
      entities: lines.map(() => "[]"),
      entity_map: "{}",
      inline_styles: lines.map(() => "[]")
    };
  }

  async function postGraphQL(docId, friendlyName, variables, tokens) {
    const body = [
      buildBaseParams(tokens),
      `fb_api_req_friendly_name=${encodeURIComponent(friendlyName)}`,
      `variables=${encodeURIComponent(JSON.stringify(variables))}`,
      "server_timestamps=true",
      `doc_id=${docId}`
    ].join("&");

    const res = await fetch("https://www.facebook.com/api/graphql/", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-FB-Friendly-Name": friendlyName,
        "X-FB-LSD": tokens.lsd || ""
      },
      body
    });
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    return res.text();
  }

  async function executeFastPost(job) {
    const tokens = job.tokens;
    const groupId = await resolveGroupNumericId(job.groupUrl);
    if (!groupId) {
      return { success: false, error: "Could not resolve numeric Facebook group ID." };
    }

    const attachments = [];
    for (const imgId of job.imageIds || []) {
      const blob = await window.RelayMediaDB.getMediaBlob(imgId);
      if (blob) {
        attachments.push(await uploadPhoto(blob, tokens));
      }
    }

    const hasMedia = attachments.length > 0;
    const docId = hasMedia ? DOC_IDS.ComposerStoryCreateMutationMedia : DOC_IDS.ComposerStoryCreateMutation;
    const plainText = String(job.text || "").replace(/<[^>]+>/g, "");
    const variables = {
      input: {
        actor_id: tokens.actorId,
        audience: { to_id: groupId },
        message: { text: plainText, ranges: [] },
        composed_text: buildComposedText(plainText),
        text_format_preset_id: job.background?.presetId || "0",
        publishing_flow: { supported_flows: ["ASYNC_NOTIF", "FALLBACK"] },
        source: "WWW",
        composer_type: "group",
        composer_source_surface: "group",
        composer_entry_point: hasMedia ? "publisher_bar_media" : "inline_composer",
        client_mutation_id: String(Math.floor(Math.random() * 99999)),
        idempotence_token: `client:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        attachments,
        with_tags_ids: null,
        navigation_data: { attribution_id_v2: "CometGroupDiscussionRoot.react,comet.group,tap_bookmark,,,,," },
        tracking: [null],
        inline_activities: []
      },
      feedLocation: "GROUP",
      feedbackSource: 0,
      groupID: groupId,
      scale: 1,
      renderLocation: "group",
      isGroup: true,
      ...RELAY_PROVIDERS
    };

    const raw = await postGraphQL(docId, "ComposerStoryCreateMutation", variables, tokens);
    const storyId =
      raw.match(/"legacy_story_hideable_id"\s*:\s*"(\d+)"/)?.[1] ||
      raw.match(/"story_id"\s*:\s*"(\d+)"/)?.[1] ||
      null;
    const isPending = /"if_viewer_can_learn_more_about_pending_post"\s*:\s*\{|pending_approval/i.test(raw);

    if (isPending) {
      return { success: true, pending: true, postId: storyId, postUrl: `https://www.facebook.com/groups/${groupId}/` };
    }
    if (storyId) {
      if (job.commentText) {
        await new Promise((r) => setTimeout(r, 12000 + Math.floor(Math.random() * 10000)));
        await executeFastComment({ postId: storyId, text: job.commentText, tokens }).catch(() => {});
      }
      return {
        success: true,
        pending: false,
        postId: storyId,
        postUrl: `https://www.facebook.com/groups/${groupId}/permalink/${storyId}/`
      };
    }

    const errSummary = raw.match(/"summary"\s*:\s*"([^"]+)"/)?.[1] || raw.match(/"message"\s*:\s*"([^"]+)"/)?.[1];
    return { success: false, error: errSummary || "Facebook did not confirm post creation." };
  }

  async function executeFastComment(job) {
    const feedbackId = btoa(`feedback:${job.postId}`);
    const variables = {
      input: {
        feedback_id: feedbackId,
        message: { ranges: [], text: String(job.text || "").trim() },
        actor_id: job.tokens.actorId,
        client_mutation_id: `cmt_${Date.now()}`
      },
      useDefaultActor: false,
      scale: 1
    };
    const raw = await postGraphQL(
      DOC_IDS.useCometUFICreateCommentMutation,
      "useCometUFICreateCommentMutation",
      variables,
      job.tokens
    );
    const ok = /"comment_create"\s*:\s*(?!null)/.test(raw);
    return { success: ok, error: ok ? null : "Comment refused by Facebook." };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg.action === "heartbeat") {
        sendResponse({ status: "alive" });
        return;
      }
      if (msg.action === "executeFastPost") {
        if (busy) {
          sendResponse({ success: false, error: "Engine busy" });
          return;
        }
        busy = true;
        try {
          sendResponse(await executeFastPost(msg.job));
        } finally {
          busy = false;
        }
        return;
      }
      if (msg.action === "executeFastComment") {
        sendResponse(await executeFastComment(msg.job));
        return;
      }
      if (msg.type === "__ENGINE_LOG") {
        await refreshStatus();
        sendResponse({ ok: true });
      }
    })().catch((err) => {
      sendResponse({ success: false, error: err?.message || "Engine error" });
    });
    return true;
  });

  document.getElementById("refreshBtn").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ action: "refreshFbSession" }).catch(() => {});
    await refreshStatus();
  });

  document.getElementById("clearLogsBtn").addEventListener("click", async () => {
    await chrome.storage.local.set({ relayEngineLogs: [] });
    await refreshStatus();
  });

  document.getElementById("downloadLogsBtn").addEventListener("click", async () => {
    const { relayEngineLogs = [] } = await chrome.storage.local.get("relayEngineLogs");
    const text = (Array.isArray(relayEngineLogs) ? relayEngineLogs : [])
      .map((l) => `[${new Date(l.t).toISOString()}] [${(l.level || "INFO").toUpperCase()}] ${l.msg}`)
      .join("\n");
    const blob = new Blob([text || "No logs recorded."], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relaypost-logs-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.relayEngineLogs || changes.isPostingInProgress || changes._postHistory || changes.relayLang)) {
      refreshStatus();
    }
  });

  initTheme();
  refreshStatus();
  setInterval(updateUptime, 1000);
  setInterval(refreshStatus, 5000);
})();
