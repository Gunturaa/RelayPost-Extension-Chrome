/* Keeps Safe Mode popup windows rendering smoothly even when unfocused. */
(function () {
  "use strict";
  if (window.__relayAlwaysActive) return;
  window.__relayAlwaysActive = true;

  try {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  } catch {
    // Some pages seal document properties.
  }

  const suppress = (e) => {
    e.stopImmediatePropagation();
  };
  document.addEventListener("visibilitychange", suppress, true);
  window.addEventListener("blur", suppress, true);
  window.onbeforeunload = null;
})();
