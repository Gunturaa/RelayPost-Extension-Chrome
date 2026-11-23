/* Safe Mode DOM automation for posting directly inside a Facebook group composer. */
(function () {
  "use strict";
  if (window.__relayPosterBound) return;
  window.__relayPosterBound = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitUntil(fn, timeoutMs, intervalMs = 500) {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const val = fn();
      if (val) return val;
      if (Date.now() >= deadline) return null;
      await sleep(intervalMs);
    }
  }

  function findComposerTrigger() {
    const prompts = [
      "write something",
      "tulis sesuatu",
      "buat postingan",
      "create a public post",
      "create post",
      "what's on your mind",
      "apa yang anda pikirkan",
      "mulai diskusi",
      "start a discussion",
      "escribe algo",
      "écrivez quelque chose"
    ];

    const pickFrom = (selector) => {
      const nodes = Array.from(document.querySelectorAll(selector));
      const matches = [];
      for (const el of nodes) {
        if (el.closest('[role="dialog"]') || el.closest('[role="article"]') || el.closest('[role="navigation"]')) continue;
        const txt = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (!txt || txt.length > 140) continue;
        if (!prompts.some((p) => txt.includes(p))) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 40 || rect.height < 18) continue;
        matches.push(el);
      }
      // Prefer innermost matching element so outer wrapper cards are skipped
      return matches.find((el) => !matches.some((other) => other !== el && el.contains(other))) || null;
    };

    return pickFrom('[role="button"]') || pickFrom('[tabindex="0"]');
  }

  function clickElementClean(el) {
    try {
      el.scrollIntoView({ block: "center", inline: "nearest" });
    } catch {
      // Ignore scroll failure.
    }
    try {
      el.focus({ preventScroll: true });
    } catch {
      // Ignore focus failure.
    }
    const opts = { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 };
    if (typeof PointerEvent === "function") {
      el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1, pointerType: "mouse" }));
    }
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    if (typeof PointerEvent === "function") {
      el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerId: 1, pointerType: "mouse", buttons: 0 }));
    }
    el.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
    el.click();
  }

  function findComposerDialog() {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    return dialogs.find((d) =>
      d.querySelector('[role="textbox"][contenteditable="true"], [data-lexical-editor="true"], [contenteditable="true"][aria-placeholder]')
    ) || null;
  }

  function findPostButton(dialog) {
    const labels = new Set([
      "post",
      "posting",
      "kirim",
      "publikasikan",
      "terbitkan",
      "publish",
      "publicar",
      "publier",
      "submit"
    ]);
    const isEnabled = (b) => {
      if (b.getAttribute("aria-disabled") === "true" || b.disabled || b.getAttribute("tabindex") === "-1") {
        return false;
      }
      const rect = b.getBoundingClientRect();
      return rect.width >= 30 && rect.height >= 20;
    };

    const candidates = Array.from(dialog.querySelectorAll('[role="button"], button'));
    const exactMatches = [];
    for (const b of candidates) {
      if (!isEnabled(b)) continue;
      const aria = (b.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().toLowerCase();
      const txt = (b.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (labels.has(aria) || labels.has(txt)) {
        exactMatches.push({ el: b, hasAria: labels.has(aria) });
      }
    }
    if (!exactMatches.length) return null;
    // Prefer explicit aria-label match and bottom-most footer submit button
    const ariaOnly = exactMatches.filter((m) => m.hasAria);
    const pool = ariaOnly.length ? ariaOnly : exactMatches;
    return pool[pool.length - 1].el;
  }

  function placeCaretInside(editor) {
    const target = editor.querySelector("p") || editor;
    editor.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      // Ignore selection fallback error.
    }
  }

  async function insertTextIntoLexical(editor, bodyText) {
    placeCaretInside(editor);
    await sleep(200);

    // 1. ClipboardEvent paste works cleanly in Lexical even when window lacks OS focus.
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", bodyText);
      const pasteEvt = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      });
      editor.dispatchEvent(pasteEvt);
    } catch {
      // Fallback below.
    }
    await sleep(200);

    if ((editor.innerText || "").trim().length > 0) {
      return true;
    }

    // 2. Fallback: execCommand + input event with proper inputType
    placeCaretInside(editor);
    try {
      document.execCommand("insertText", false, bodyText);
    } catch {
      // Ignore execCommand failure.
    }
    await sleep(150);

    if ((editor.innerText || "").trim().length > 0) {
      return true;
    }

    // 3. Last resort: beforeinput + input synthetic pair
    placeCaretInside(editor);
    editor.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: bodyText
    }));
    editor.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: false,
      inputType: "insertText",
      data: bodyText
    }));
    await sleep(150);
    return (editor.innerText || "").trim().length > 0;
  }

  function base64ToFile(mf) {
    const bin = atob(mf.base64 || "");
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new File([bytes], mf.name || "photo.jpg", { type: mf.type || "image/jpeg" });
  }

  function findMediaFileInput(dialog) {
    const inputs = Array.from(dialog.querySelectorAll('input[type="file"]'));
    return (
      inputs.find((inp) => /image|video/i.test(inp.getAttribute("accept") || "")) ||
      inputs[0] ||
      null
    );
  }

  function hasMediaPreview(dialog) {
    return Boolean(dialog.querySelector('img[src^="blob:"], video[src^="blob:"]'));
  }

  async function attachMediaToDialog(dialog, editor, mediaFiles) {
    const files = mediaFiles.map(base64ToFile);
    if (!files.length) return true;

    let fileInput = findMediaFileInput(dialog);
    if (!fileInput) {
      const photoBtn = Array.from(dialog.querySelectorAll('[role="button"], button')).find((b) => {
        const lbl = (b.getAttribute("aria-label") || b.textContent || "").trim().toLowerCase();
        return lbl.includes("foto/video") || lbl.includes("photo/video") || lbl === "foto" || lbl === "photo" || lbl.includes("tambah foto") || lbl.includes("add photo");
      });
      if (photoBtn) {
        clickElementClean(photoBtn);
        fileInput = await waitUntil(() => findMediaFileInput(dialog), 3000, 300);
      }
    }

    if (fileInput) {
      try {
        const dt = new DataTransfer();
        for (const f of files) dt.items.add(f);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event("input", { bubbles: true }));
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(1200);
      } catch {
        // Fallback to editor paste below if input assignment fails.
      }
    }

    if (!hasMediaPreview(dialog)) {
      placeCaretInside(editor);
      for (const f of files) {
        try {
          const dt = new DataTransfer();
          dt.items.add(f);
          editor.dispatchEvent(new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: dt
          }));
          await sleep(450);
        } catch {
          // Ignore individual paste error.
        }
      }
    }

    // Wait for Facebook preview & upload indicator to settle before submitting
    await waitUntil(() => hasMediaPreview(dialog) && !dialog.querySelector('[role="progressbar"]'), 18000, 600);
    return hasMediaPreview(dialog) || Boolean(fileInput && fileInput.files && fileInput.files.length > 0);
  }

  async function runSafePost(job) {
    const bodyText = String(job.text || "").replace(/<[^>]+>/g, "");
    const mediaFiles = Array.isArray(job.mediaFiles) ? job.mediaFiles : [];
    const hasMedia = mediaFiles.length > 0;
    if (!bodyText.trim() && !hasMedia) {
      return { success: false, error: "Empty post text and no media in Safe Mode." };
    }

    const trigger = await waitUntil(findComposerTrigger, 8000, 450);
    if (!trigger) {
      return { success: false, error: "Could not find group post box (check membership or permissions)." };
    }

    let dialog = null;
    for (let attempt = 0; attempt < 2 && !dialog; attempt++) {
      const currentTrigger = findComposerTrigger() || trigger;
      clickElementClean(currentTrigger);
      dialog = await waitUntil(findComposerDialog, attempt === 0 ? 4500 : 6000, 400);
      if (!dialog) await sleep(350);
    }
    if (!dialog) {
      return { success: false, error: "Composer dialog did not open." };
    }

    const editor = dialog.querySelector('[role="textbox"][contenteditable="true"], [data-lexical-editor="true"], [contenteditable="true"][aria-placeholder]');
    if (!editor) {
      return { success: false, error: "Composer text editor not found." };
    }

    if (bodyText.trim()) {
      const typed = await insertTextIntoLexical(editor, bodyText);
      if (!typed) {
        return { success: false, error: "Could not type text into Facebook composer." };
      }
    }

    if (hasMedia) {
      const attached = await attachMediaToDialog(dialog, editor, mediaFiles);
      if (!attached) {
        return { success: false, error: "Could not attach media files to Facebook composer." };
      }
    }

    const humanPause = Math.min(2400, Math.max(700, (Number(job.humanLevel) || 1) * 700));
    await sleep(humanPause);

    const postBtn = await waitUntil(() => findPostButton(dialog), hasMedia ? 16000 : 6000, 450);
    if (!postBtn) {
      return { success: false, error: "Post submit button stayed disabled (check required group fields or switch to Fast Mode)." };
    }

    clickElementClean(postBtn);
    await sleep(600);

    // If composer dialog is still mounted and the same submit button is still enabled, click once more
    let curDialog = findComposerDialog();
    if (curDialog && document.body.contains(editor)) {
      const stillBtn = findPostButton(curDialog);
      if (stillBtn) {
        clickElementClean(stillBtn);
      }
    }

    const confirmDeadline = Date.now() + 25000;
    while (Date.now() < confirmDeadline) {
      await sleep(700);
      curDialog = findComposerDialog();
      if (!document.body.contains(editor) || !curDialog) {
        const pendingBanner = /pending|approval|menunggu persetujuan|tinjauan admin/i.test(document.body.innerText || "");
        return {
          success: true,
          pending: pendingBanner,
          postUrl: job.groupUrl
        };
      }
      const nextSubmit = findPostButton(curDialog);
      if (!nextSubmit) {
        const skipOrPost = Array.from(curDialog.querySelectorAll('[role="button"], button')).find((b) => {
          const t = (b.getAttribute("aria-label") || b.textContent || "").trim().toLowerCase();
          return (t === "skip" || t === "lewati" || t === "lain kali" || t === "not now") && b.getAttribute("aria-disabled") !== "true";
        });
        if (skipOrPost) clickElementClean(skipOrPost);
      }
    }
    return { success: false, error: "Post submission did not confirm before timeout." };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.action === "safePostToGroup") {
      runSafePost(msg.job).then(sendResponse).catch((err) => {
        sendResponse({ success: false, error: err?.message || "Safe Mode script error." });
      });
      return true;
    }
  });
})();
