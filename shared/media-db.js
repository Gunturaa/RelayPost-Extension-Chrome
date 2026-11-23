/* IndexedDB helper for storing large image and video blobs locally across extension contexts. */
(function (root) {
  "use strict";

  const DB_NAME = "RelayPostMediaDB";
  const STORE_NAME = "media";
  const DB_VERSION = 1;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Failed to open MediaDB"));
    });
  }

  async function saveMediaBlob(key, blob, meta = {}) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put({
          key,
          value: {
            blob,
            name: meta.name || "media",
            type: meta.type || blob.type || "application/octet-stream",
            size: blob.size || meta.size || 0,
            createdAt: meta.createdAt || Date.now()
          }
        });
        tx.oncomplete = () => resolve(key);
        tx.onerror = () => reject(tx.error || new Error("Failed to write media blob"));
      });
    } finally {
      db.close();
    }
  }

  async function getMediaRecord(key) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result?.value || null);
        req.onerror = () => reject(req.error || new Error("Failed to read media blob"));
      });
    } finally {
      db.close();
    }
  }

  async function getMediaBlob(key) {
    const rec = await getMediaRecord(key);
    return rec ? rec.blob : null;
  }

  async function deleteMediaBlob(key) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error("Failed to delete media blob"));
      });
    } finally {
      db.close();
    }
  }

  async function listMediaItems() {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
          const rows = Array.isArray(req.result) ? req.result : [];
          resolve(
            rows.map((r) => ({
              id: r.key,
              name: r.value?.name || "media",
              type: r.value?.type || "",
              size: r.value?.size || r.value?.blob?.size || 0,
              createdAt: r.value?.createdAt || 0
            }))
          );
        };
        req.onerror = () => reject(req.error || new Error("Failed to list media"));
      });
    } finally {
      db.close();
    }
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Failed to read blob"));
      reader.readAsDataURL(blob);
    });
  }

  root.RelayMediaDB = {
    saveMediaBlob,
    getMediaRecord,
    getMediaBlob,
    deleteMediaBlob,
    listMediaItems,
    blobToDataUrl
  };
})(typeof self !== "undefined" ? self : globalThis);
