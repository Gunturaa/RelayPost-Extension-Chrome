(function () {
  "use strict";

  const selected = [];
  const fileInput = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");
  const fileList = document.getElementById("fileList");
  const statusLine = document.getElementById("statusLine");
  const saveBtn = document.getElementById("saveBtn");
  const closeBtn = document.getElementById("closeBtn");

  if (window.RelayIcons) window.RelayIcons.applyIcons(document);

  let curLang = "id";
  function tr(key, vars) {
    return window.RelayI18n ? window.RelayI18n.t(curLang, key, vars) : key;
  }

  function applyPickerLocale() {
    document.documentElement.lang = curLang === "en" ? "en" : "id";
    document.getElementById("pickerHeading").textContent = tr("pickerTitle");
    document.getElementById("pickerSub").textContent = tr("pickerSub");
    document.getElementById("dzTitle").textContent = tr("pickerDropTitle");
    document.getElementById("dzHint").textContent = tr("pickerDropHint");
    saveBtn.textContent = tr("pickerSaveBtn");
    closeBtn.textContent = tr("pickerCloseBtn");
  }

  chrome.storage.local.get(["relayTheme", "relayLang"]).then(({ relayTheme = "light", relayLang }) => {
    document.documentElement.dataset.theme = relayTheme === "dark" ? "dark" : "light";
    curLang = window.RelayI18n ? window.RelayI18n.getLang(relayLang) : "id";
    applyPickerLocale();
  });

  function setStatus(msg, kind = "") {
    statusLine.textContent = msg;
    statusLine.className = "status-line" + (kind ? ` is-${kind}` : "");
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function renderList() {
    fileList.innerHTML = "";
    selected.forEach((file, idx) => {
      const row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML = `<span class="file-name"></span><span class="file-size">${formatSize(file.size)}</span>`;
      row.querySelector(".file-name").textContent = file.name;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn-outline";
      rm.style.padding = "2px 8px";
      rm.textContent = "Remove";
      rm.addEventListener("click", () => {
        selected.splice(idx, 1);
        renderList();
      });
      row.appendChild(rm);
      fileList.appendChild(row);
    });
  }

  function addFiles(files) {
    setStatus("");
    for (const f of files) {
      if (selected.length >= 10) {
        setStatus("Maximum of 10 media files reached.", "err");
        break;
      }
      if (f.size > 100 * 1024 * 1024) {
        setStatus(`"${f.name}" exceeds 100 MB limit.`, "err");
        continue;
      }
      if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
        setStatus(`"${f.name}" is not a supported image or video.`, "err");
        continue;
      }
      selected.push(f);
    }
    renderList();
  }

  fileInput.addEventListener("change", () => {
    addFiles(Array.from(fileInput.files || []));
    fileInput.value = "";
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("is-drag");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-drag"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-drag");
    if (e.dataTransfer?.files?.length) addFiles(Array.from(e.dataTransfer.files));
  });

  saveBtn.addEventListener("click", async () => {
    if (!selected.length) {
      setStatus("Select at least one image or video first.", "err");
      return;
    }
    saveBtn.disabled = true;
    setStatus("Saving media locally...");
    try {
      const ids = [];
      for (const file of selected) {
        const key = `${file.name}_${file.size}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await window.RelayMediaDB.saveMediaBlob(key, file, { name: file.name, type: file.type, size: file.size });
        ids.push(key);
      }
      const { relayDraft = {} } = await chrome.storage.local.get("relayDraft");
      const currentIds = Array.isArray(relayDraft.imageIds) ? relayDraft.imageIds : [];
      await chrome.storage.local.set({
        relayDraft: {
          ...relayDraft,
          imageIds: [...currentIds, ...ids].slice(0, 10)
        }
      });
      setStatus("Attached to post.", "ok");
      setTimeout(() => window.close(), 500);
    } catch (err) {
      setStatus(err?.message || "Failed to save media.", "err");
      saveBtn.disabled = false;
    }
  });

  closeBtn.addEventListener("click", () => window.close());
})();
