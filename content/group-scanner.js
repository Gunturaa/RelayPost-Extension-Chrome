/* Scrolls Facebook's joined groups page to collect group URLs, names, and buy/sell badges. */
(function () {
  "use strict";
  if (window.__relayGroupScannerBound) return;
  window.__relayGroupScannerBound = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const IGNORED_SLUGS = new Set([
    "feed", "discover", "joins", "create", "notifications", "search", "browse", "invites", "your_groups", "categories"
  ]);

  function extractGroupsFromDom() {
    const map = new Map();
    const links = document.querySelectorAll('a[href*="/groups/"]');
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      const match = href.match(/\/groups\/([^/?#]+)/);
      if (!match) continue;
      const slug = match[1];
      if (IGNORED_SLUGS.has(slug.toLowerCase())) continue;

      const card = a.closest('[role="listitem"], [role="article"], div') || a.parentElement;
      const rawName = (a.textContent || "").trim();
      if (!rawName || rawName.length < 2 || /^(visit|view|join|open|lihat|buka)$/i.test(rawName)) continue;

      const fullUrl = `https://www.facebook.com/groups/${slug}/`;
      const cardText = (card ? card.textContent : "") || "";
      const isBuySell = /buy\s*&?\s*sell|jual\s*beli|marketplace/i.test(cardText);

      if (!map.has(slug)) {
        map.set(slug, {
          id: /^\d+$/.test(slug) ? slug : slug,
          name: rawName.slice(0, 120),
          url: fullUrl,
          isBuySell
        });
      }
    }
    return Array.from(map.values());
  }

  async function scanAllGroups() {
    let lastCount = 0;
    let stagnantRounds = 0;
    for (let step = 0; step < 30; step++) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      await sleep(1100);
      const current = extractGroupsFromDom();
      await chrome.storage.local.set({
        _groupScanProgress: {
          scanning: true,
          found: current.length,
          status: `Found ${current.length} groups...`
        }
      }).catch(() => {});

      if (current.length === lastCount) {
        stagnantRounds++;
        if (stagnantRounds >= 3) break;
      } else {
        lastCount = current.length;
        stagnantRounds = 0;
      }
    }
    return extractGroupsFromDom();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.action === "scanJoinedGroups") {
      scanAllGroups()
        .then((groups) => sendResponse({ ok: true, groups }))
        .catch((err) => sendResponse({ ok: false, error: err?.message || "Scan failed" }));
      return true;
    }
  });
})();
