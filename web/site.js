/* Shared UI behavior for RelayPost web pages:
 * 1. Light/Dark theme toggle with localStorage persistence
 * 2. Accessible mobile navigation drawer (Escape to close, focus return)
 * 3. Copy-to-clipboard buttons with live toast feedback
 */
(function () {
  "use strict";

  const THEME_KEY = "relaypost_web_theme";
  const root = document.documentElement;

  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    const btn = document.getElementById("themeToggle");
    if (btn) {
      const isDark = theme === "dark";
      btn.setAttribute("aria-pressed", String(isDark));
      btn.textContent = isDark ? "Mode Terang" : "Mode Gelap";
    }
  }

  applyTheme(getPreferredTheme());

  const themeBtn = document.getElementById("themeToggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }

  // Mobile Menu Drawer
  const menuBtn = document.getElementById("menuToggle");
  const drawer = document.getElementById("mobileDrawer");
  if (menuBtn && drawer) {
    function setOpen(open) {
      drawer.classList.toggle("is-open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.textContent = open ? "Tutup" : "Menu";
      if (!open) menuBtn.focus();
    }

    menuBtn.addEventListener("click", () => {
      const isOpen = drawer.classList.contains("is-open");
      setOpen(!isOpen);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drawer.classList.contains("is-open")) {
        setOpen(false);
      }
    });

    drawer.addEventListener("click", (e) => {
      if (e.target.closest("a")) {
        drawer.classList.remove("is-open");
        menuBtn.setAttribute("aria-expanded", "false");
        menuBtn.textContent = "Menu";
      }
    });
  }

  // Copy buttons (data-copy="text")
  let toastTimer = null;
  function showToast(msg) {
    let el = document.getElementById("siteToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "siteToast";
      el.className = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2200);
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const text = btn.getAttribute("data-copy") || "";
    const label = btn.getAttribute("data-copy-label") || "Disalin ke clipboard";
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast(label));
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast(label);
    }
  });
})();
