/* Injects a "Share to groups" action button beside Facebook post Share controls using RelayPost's icon. */
(function () {
  "use strict";
  if (window.__relayShareBooted) return;
  window.__relayShareBooted = true;

  const HOST_ATTR = "data-relay-share";
  const DONE_KEY = "relayShareDone";

  const RELAY_MARK_SVG =
    '<svg viewBox="0 0 128 128" width="15" height="15" aria-hidden="true">' +
    '<rect x="4" y="4" width="120" height="120" rx="28" fill="#0F5C4D"/>' +
    '<rect x="26" y="31" width="48" height="18" rx="4.5" fill="#FAF9F5"/>' +
    '<circle cx="92" cy="40" r="11" fill="#D95D24"/>' +
    '<rect x="26" y="55" width="64" height="18" rx="4.5" fill="#FAF9F5"/>' +
    '<rect x="24" y="79" width="48" height="18" rx="4.5" fill="#FAF9F5"/>' +
    "</svg>";

  function isDarkButton(el) {
    try {
      const rgb = getComputedStyle(el).color.match(/(\d+),\s*(\d+),\s*(\d+)/);
      if (!rgb) return false;
      return 0.2126 * Number(rgb[1]) + 0.7152 * Number(rgb[2]) + 0.0722 * Number(rgb[3]) > 140;
    } catch {
      return false;
    }
  }

  function findShareButtons() {
    const shareLabels = ["share", "bagikan", "compartir", "partager", "teilen"];
    const candidates = document.querySelectorAll('[data-ad-rendering-role="share_button"], div[role="button"][aria-label]');
    const out = [];
    for (const el of candidates) {
      const btn = el.closest('div[role="button"]') || el;
      const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
      const isShare = el.getAttribute("data-ad-rendering-role") === "share_button" || shareLabels.some((w) => aria.includes(w));
      if (!isShare || btn.dataset[DONE_KEY] === "1") continue;
      if (btn.closest('div[role="dialog"]')) continue;
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) out.push(btn);
    }
    return out;
  }

  function extractPostFromButton(btn) {
    const article = btn.closest('[role="article"]') || btn.closest("div")?.parentElement?.parentElement;
    if (!article) return { text: "", permalink: location.href, images: [] };
    const msgEl = article.querySelector('[data-ad-comet-preview="message"], [data-ad-preview="message"]');
    const linkEl = Array.from(article.querySelectorAll("a[href]")).find((a) => /\/(posts|permalink)\//.test(a.href));
    const imgs = Array.from(article.querySelectorAll("img"))
      .filter((img) => {
        const r = img.getBoundingClientRect();
        return r.width >= 90 && r.height >= 90 && /^https:\/\//i.test(img.src || "");
      })
      .slice(0, 6)
      .map((img) => img.src);

    return {
      text: (msgEl ? msgEl.innerText : "").trim(),
      permalink: linkEl ? linkEl.href : location.href,
      images: imgs
    };
  }

  function openShareModal(token) {
    if (document.getElementById("relay-share-frame")) return;
    const backdrop = document.createElement("div");
    backdrop.id = "relay-share-backdrop";
    backdrop.style.cssText =
      "position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:2147483645;";

    const frame = document.createElement("iframe");
    frame.id = "relay-share-frame";
    frame.title = "RelayPost Share to Groups";
    frame.src = `${chrome.runtime.getURL("popup/index.html")}?sheet=share&t=${encodeURIComponent(token)}`;
    frame.style.cssText =
      "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 24px));height:min(640px,calc(100vh - 32px));border:1px solid #DFDCD3;border-radius:12px;background:#F6F5F1;z-index:2147483646;box-shadow:0 20px 50px rgba(0,0,0,0.28);";

    const closeAll = () => {
      backdrop.remove();
      frame.remove();
      window.removeEventListener("message", onMsg);
      document.removeEventListener("keydown", onEsc, true);
    };
    const onMsg = (e) => {
      if (e.source === frame.contentWindow && e.data && e.data.relayShareClose) closeAll();
    };
    const onEsc = (e) => {
      if (e.key === "Escape") closeAll();
    };

    backdrop.addEventListener("click", closeAll);
    window.addEventListener("message", onMsg);
    document.addEventListener("keydown", onEsc, true);
    document.body.append(backdrop, frame);
  }

  function injectButtons() {
    for (const shareBtn of findShareButtons()) {
      const parent = shareBtn.parentElement;
      if (!parent || parent.querySelector(`[${HOST_ATTR}]`)) continue;

      const host = document.createElement("span");
      host.setAttribute(HOST_ATTR, "1");
      host.style.cssText = "display:inline-flex;align-items:center;margin-inline-start:6px;";

      const dark = isDarkButton(shareBtn);
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML =
        `<style>
          button{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;
          border:1px solid ${dark ? "rgba(45,212,191,0.35)" : "rgba(15,92,77,0.3)"};
          background:transparent;color:${dark ? "#2DD4BF" : "#0F5C4D"};
          font:600 12.5px system-ui,-apple-system,sans-serif;cursor:pointer;}
          button:hover{background:${dark ? "rgba(45,212,191,0.12)" : "rgba(15,92,77,0.08)"};}
        </style>
        <button type="button" aria-label="Share this post to your Facebook groups with RelayPost">
          ${RELAY_MARK_SVG}<span>Share to groups</span>
        </button>`;

      shadow.querySelector("button").addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const post = extractPostFromButton(shareBtn);
        const res = await chrome.runtime.sendMessage({ action: "mgpStageShare", post }).catch(() => null);
        if (res && res.ok && res.token) {
          openShareModal(res.token);
        }
      });

      shareBtn.dataset[DONE_KEY] = "1";
      parent.appendChild(host);
    }
  }

  function removeButtons() {
    document.querySelectorAll(`[${HOST_ATTR}]`).forEach((el) => el.remove());
    document.querySelectorAll("[data-relay-share-done]").forEach((el) => el.removeAttribute("data-relay-share-done"));
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === "removeShareButtons") removeButtons();
  });

  let timer = null;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      injectButtons();
    }, 500);
  };

  new MutationObserver(schedule).observe(document.body || document.documentElement, { childList: true, subtree: true });
  injectButtons();
})();
