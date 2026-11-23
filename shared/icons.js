/* iOS / SF Symbols inspired rounded icon set for RelayPost. */
(function (root) {
  "use strict";

  const ICON_DEFS = {
    // SF square.and.pencil
    compose: `
      <path d="M10.5 3.5H5.8A2.3 2.3 0 0 0 3.5 5.8v8.4a2.3 2.3 0 0 0 2.3 2.3h8.4a2.3 2.3 0 0 0 2.3-2.3V9.5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M15.6 3.1a1.45 1.45 0 0 1 2.05 2.05L11.2 11.6 8.4 12.3l.7-2.8 6.5-6.4z" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    // SF calendar
    queue: `
      <rect x="3" y="4.5" width="14" height="12.5" rx="3" stroke="currentColor" stroke-width="1.65"/>
      <path d="M3 8.5h14M6.8 2.8v2.7M13.2 2.8v2.7" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
      <circle cx="7" cy="11.8" r="1" fill="currentColor"/>
      <circle cx="10" cy="11.8" r="1" fill="currentColor"/>
      <circle cx="13" cy="11.8" r="1" fill="currentColor"/>
      <circle cx="7" cy="14.4" r="1" fill="currentColor"/>
      <circle cx="10" cy="14.4" r="1" fill="currentColor"/>
    `,
    // SF clock.arrow.circlepath
    history: `
      <path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6L3.5 7.2" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M3.5 4v3.2h3.2" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 6.7V10l2.4 1.6" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    // SF person.2
    groups: `
      <circle cx="7.8" cy="7.2" r="2.7" stroke="currentColor" stroke-width="1.65"/>
      <path d="M2.8 15.8c.4-2.5 2.4-4.1 5-4.1s4.6 1.6 5 4.1" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
      <circle cx="13.5" cy="7.8" r="2.1" stroke="currentColor" stroke-width="1.55"/>
      <path d="M13.6 11.9c1.9.2 3.3 1.4 3.6 3.5" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
    `,
    // SF arrow.up.left.and.arrow.down.right
    workspace: `
      <path d="M11.5 3.8h4.7v4.7M16 4l-4.5 4.5M8.5 16.2H3.8v-4.7M4 16l4.5-4.5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    // SF slider.horizontal.3
    settings: `
      <path d="M3.5 5.5h3.2M11.3 5.5h5.2M3.5 10h7.2M15.3 10h1.2M3.5 14.5h2.2M10.3 14.5h6.2" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
      <circle cx="9" cy="5.5" r="2" stroke="currentColor" stroke-width="1.65"/>
      <circle cx="13" cy="10" r="2" stroke="currentColor" stroke-width="1.65"/>
      <circle cx="8" cy="14.5" r="2" stroke="currentColor" stroke-width="1.65"/>
    `,
    // SF checkmark.shield
    shield: `
      <path d="M10 2.6l6 2.3v4.8c0 3.7-2.5 6.4-6 7.7-3.5-1.3-6-4-6-7.7V4.9l6-2.3z" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>
      <path d="M7.3 10.1l1.9 1.9 3.7-4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    // SF sparkles
    spintax: `
      <path d="M10 3l1.4 4.1L15.5 8.5l-4.1 1.4L10 14l-1.4-4.1L4.5 8.5l4.1-1.4L10 3z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/>
      <path d="M15.4 12.6l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7z" fill="currentColor"/>
    `,
    // SF doc.on.doc
    templates: `
      <rect x="6.5" y="5.5" width="9.5" height="11.5" rx="2.2" stroke="currentColor" stroke-width="1.65"/>
      <path d="M13.2 5.5V4.8A1.8 1.8 0 0 0 11.4 3H5.8A1.8 1.8 0 0 0 4 4.8v8.4A1.8 1.8 0 0 0 5.8 15h.7" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
      <path d="M9.2 9.5h4.2M9.2 12.5h2.8" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
    `,
    // SF questionmark.circle
    help: `
      <circle cx="10" cy="10" r="7.2" stroke="currentColor" stroke-width="1.65"/>
      <path d="M8.1 7.9a2 2 0 1 1 3.3 1.5c-.6.5-1.4.9-1.4 1.9" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
      <circle cx="10" cy="14" r="0.95" fill="currentColor"/>
    `,
    // SF sun.max
    sun: `
      <circle cx="10" cy="10" r="3.4" stroke="currentColor" stroke-width="1.65"/>
      <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M15.3 4.7L14 6M6 14l-1.3 1.3" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
    `,
    // SF moon
    moon: `
      <path d="M15.6 12.3A5.8 5.8 0 0 1 7.7 4.4a6.4 6.4 0 1 0 7.9 7.9z" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    // SF photo
    media: `
      <rect x="2.8" y="4" width="14.4" height="12" rx="2.8" stroke="currentColor" stroke-width="1.65"/>
      <circle cx="7.2" cy="7.8" r="1.3" fill="currentColor"/>
      <path d="M3.4 14l3.8-3.6a1.1 1.1 0 0 1 1.5 0l2.1 2 1.8-1.7a1.1 1.1 0 0 1 1.5 0l2.6 2.8" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    // SF text.bubble
    comment: `
      <path d="M4.8 4h10.4A2.3 2.3 0 0 1 17.5 6.3v6.2a2.3 2.3 0 0 1-2.3 2.3H9l-3.6 2.5v-2.5H4.8a2.3 2.3 0 0 1-2.3-2.3V6.3A2.3 2.3 0 0 1 4.8 4z" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>
      <path d="M6.5 8.2h7M6.5 11h4.5" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
    `,
    // SF arrow.clockwise
    sync: `
      <path d="M15.8 10A5.8 5.8 0 1 1 14 5.8l2 1.8" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M16 4.2v3.4h-3.4" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    // SF square.and.arrow.up (iOS Share/Export)
    export: `
      <path d="M10 12.2V3.2M6.8 6.2L10 3l3.2 3.2" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6.5 8.5H5.3A2.3 2.3 0 0 0 3 10.8v3.9A2.3 2.3 0 0 0 5.3 17h9.4a2.3 2.3 0 0 0 2.3-2.3v-3.9a2.3 2.3 0 0 0-2.3-2.3h-1.2" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
    `,
    // SF play.fill (rounded)
    play: `
      <path d="M6.2 4.9c0-.8.88-1.28 1.56-.86l8.1 5.1c.64.4.64 1.32 0 1.72l-8.1 5.1c-.68.42-1.56-.06-1.56-.86V4.9z" fill="currentColor"/>
    `,
    // SF pause.fill (rounded pills)
    pause: `
      <rect x="5.2" y="4" width="3.4" height="12" rx="1.4" fill="currentColor"/>
      <rect x="11.4" y="4" width="3.4" height="12" rx="1.4" fill="currentColor"/>
    `,
    // SF stop.fill (rounded)
    stop: `
      <rect x="4.5" y="4.5" width="11" height="11" rx="2.6" fill="currentColor"/>
    `,
    // SF trash
    trash: `
      <path d="M3.8 5.8h12.4M7.8 5.8V4.4a1.2 1.2 0 0 1 1.2-1.2h2a1.2 1.2 0 0 1 1.2 1.2v1.4" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
      <path d="M5.4 5.8l.7 9.4a1.8 1.8 0 0 0 1.8 1.6h4.2a1.8 1.8 0 0 0 1.8-1.6l.7-9.4" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8.5 9v4.5M11.5 9v4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    `,
    // SF pencil
    edit: `
      <path d="M13.8 3.6a1.6 1.6 0 0 1 2.26 2.26L7.4 14.5 4 15.5l1-3.4 8.8-8.5z" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    // SF magnifyingglass
    search: `
      <circle cx="8.8" cy="8.8" r="5.3" stroke="currentColor" stroke-width="1.65"/>
      <path d="M12.9 12.9l3.6 3.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    `,
    // SF plus
    plus: `
      <path d="M10 4.2v11.6M4.2 10h11.6" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/>
    `,
    // SF checkmark
    check: `
      <path d="M4.5 10.5l3.6 3.6 7.4-7.8" stroke="currentColor" stroke-width="1.95" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    // SF xmark
    close: `
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/>
    `,
    // SF chevron.down
    chevronDown: `
      <path d="M5.2 7.6L10 12.4l4.8-4.8" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    // SF chevron.up
    arrowUp: `
      <path d="M5.5 12.2L10 7.7l4.5 4.5" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    // SF chevron.down
    arrowDown: `
      <path d="M5.5 7.8L10 12.3l4.5-4.5" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    // SF arrow.up.right.square
    external: `
      <path d="M11 3.8h5.2V9M16 4l-6.5 6.5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14.2 11.5v2.7a2.3 2.3 0 0 1-2.3 2.3H5.8a2.3 2.3 0 0 1-2.3-2.3V8.1a2.3 2.3 0 0 1 2.3-2.3h2.7" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
    `,
    // SF photo.stack
    sets: `
      <rect x="3" y="6.2" width="11.2" height="10.2" rx="2.4" stroke="currentColor" stroke-width="1.65"/>
      <path d="M6.2 6.2V5.3A2 2 0 0 1 8.2 3.3h6.8a2 2 0 0 1 2 2v6.6a2 2 0 0 1-2 2h-.8" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
      <circle cx="6.5" cy="9.4" r="1" fill="currentColor"/>
      <path d="M4 14.4l3-2.7 2.2 2 1.6-1.4 2.4 2.1" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
    `
  };

  function iconSvg(name, opts = {}) {
    const size = opts.size || 18;
    const cls = opts.className ? ` class="${opts.className}"` : "";
    const body = ICON_DEFS[name] || ICON_DEFS.compose;
    return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" aria-hidden="true">${body}</svg>`;
  }

  function applyIcons(rootEl = document) {
    const els = rootEl.querySelectorAll("[data-icon]");
    for (const el of els) {
      const name = el.getAttribute("data-icon");
      const size = Number(el.getAttribute("data-icon-size")) || 18;
      el.innerHTML = iconSvg(name, { size });
    }
  }

  root.RelayIcons = { iconSvg, applyIcons, ICON_DEFS };
})(typeof self !== "undefined" ? self : globalThis);
