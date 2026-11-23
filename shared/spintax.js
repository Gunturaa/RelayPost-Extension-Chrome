/* Spintax expansion, permutation counting, and deterministic per-group variant selection. */
(function (root) {
  "use strict";

  const SPIN_RE = /\{([^{}]+)\}/g;
  const HTML_MASK_RE = /@@RPH(\d+)@@/g;
  const MAX_PASSES = 50;
  const MAX_PICK_TRIES = 60;
  const MAX_PERMUTATIONS = 100000;

  function parseOptions(inner) {
    if (inner.indexOf("|") === -1) return null;
    const parts = inner.split("|").map((s) => s.trim());
    const nonEmpty = parts.filter((s) => s.length > 0);
    return nonEmpty.length ? nonEmpty : [""];
  }

  // Mask HTML tags before expanding braces so style attributes or tags are never altered.
  function maskHtml(input) {
    const map = [];
    const masked = String(input).replace(/<[^>]+>/g, (tag) => {
      map.push(tag);
      return "@@RPH" + (map.length - 1) + "@@";
    });
    return { masked, map };
  }

  function unmaskHtml(input, map) {
    return String(input).replace(HTML_MASK_RE, (_, idx) => {
      const val = map[Number(idx)];
      return val === undefined ? "" : val;
    });
  }

  function expand(text, rng) {
    if (!text || typeof text !== "string") return text;
    const rand = rng || Math.random;
    const { masked, map } = maskHtml(text);
    let current = masked;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const next = current.replace(SPIN_RE, (full, inner) => {
        const opts = parseOptions(inner);
        if (!opts) return full;
        const idx = Math.floor(rand() * opts.length);
        return opts[Math.max(0, Math.min(opts.length - 1, idx))];
      });
      if (next === current) break;
      current = next;
    }
    return unmaskHtml(current, map);
  }

  function countPermutations(text) {
    if (!text || typeof text !== "string") return 1;
    let current = maskHtml(text).masked;
    let total = 1;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let changed = false;
      const next = current.replace(SPIN_RE, (full, inner) => {
        const opts = parseOptions(inner);
        if (!opts) return full;
        changed = true;
        total *= opts.length;
        return opts[0];
      });
      if (!changed || next === current) break;
      current = next;
      if (total >= MAX_PERMUTATIONS) return MAX_PERMUTATIONS;
    }
    return Math.min(total, MAX_PERMUTATIONS);
  }

  function expandByIndex(text, index) {
    if (!text || typeof text !== "string") return text;
    const { masked, map } = maskHtml(text);
    let current = masked;
    let n = Math.abs(Math.floor(index) || 0);
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const next = current.replace(SPIN_RE, (full, inner) => {
        const opts = parseOptions(inner);
        if (!opts) return full;
        const pick = n % opts.length;
        n = Math.floor(n / opts.length);
        return opts[pick];
      });
      if (next === current) break;
      current = next;
    }
    return unmaskHtml(current, map);
  }

  function gcd(a, b) {
    while (b) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  function variantFor(text, groupIndex, seed) {
    const total = countPermutations(text);
    if (total <= 1) return expandByIndex(text, 0);
    const offset = Math.abs(Math.floor(seed) || 0) % total;
    let stride = (Math.abs(Math.floor((seed || 0) / 7)) % total) + 1;
    for (let i = 0; i < total && gcd(stride, total) !== 1; i++) {
      stride = (stride % total) + 1;
    }
    if (gcd(stride, total) !== 1) stride = 1;
    const idx = (offset + (Math.abs(Math.floor(groupIndex) || 0) % total) * stride) % total;
    return expandByIndex(text, idx);
  }

  function createPicker(text, rng) {
    const rand = rng || Math.random;
    const total = countPermutations(text);
    let seen = Object.create(null);
    let used = 0;
    return {
      total,
      usedCount: () => used,
      next: () => {
        if (total <= 1) return expand(text, rand);
        if (used >= total) {
          seen = Object.create(null);
          used = 0;
        }
        let candidate = null;
        for (let i = 0; i < MAX_PICK_TRIES; i++) {
          candidate = expand(text, rand);
          if (!seen[candidate]) {
            seen[candidate] = 1;
            used++;
            return candidate;
          }
        }
        seen = Object.create(null);
        used = 1;
        if (candidate !== null) seen[candidate] = 1;
        return candidate;
      }
    };
  }

  function validate(text) {
    const issues = [];
    const src = String(text || "");
    const openCount = (src.match(/\{/g) || []).length;
    const closeCount = (src.match(/\}/g) || []).length;
    if (openCount !== closeCount) issues.push("unbalanced-braces");
    const masked = maskHtml(src).masked;
    if (/\{[^{}]*\{/.test(masked)) issues.push("nested");
    const re = new RegExp(SPIN_RE.source, "g");
    let match;
    while ((match = re.exec(masked)) !== null) {
      const inner = match[1];
      if (inner.indexOf("|") !== -1) {
        const opts = inner.split("|").map((s) => s.trim());
        if (opts.some((s) => s.length === 0)) issues.push("empty-option");
        else if (opts.length < 2) issues.push("single-option");
      }
    }
    return { valid: issues.length === 0, issues };
  }

  const api = {
    expand,
    expandByIndex,
    variantFor,
    countPermutations,
    createPicker,
    validate
  };

  root.RelaySpintax = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
