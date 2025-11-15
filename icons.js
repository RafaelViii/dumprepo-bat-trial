// icons.js - ICONS[] used by try11.js
// Use local image files placed alongside your HTML (fire.png, electric-hazard.png, sea.png, stone.png).
// This file preloads images and logs helpful messages if any fail to load.
// It also falls back to a CDN icon if a local file is missing.

const ICONS = [
  { id: 'fire',  label: 'Fire',            src: 'fire.png' },
  { id: 'electric', label: 'Electric',     src: 'electricity-hazard.png' },
  { id: 'sea',   label: 'Wet',             src: 'sea.png' },
  { id: 'stone', label: 'Debris',           src: 'stone.png' }
];

// Fallback icon (CDN) used when a local image fails to load
const FALLBACK_ICON = 'https://cdn-icons-png.flaticon.com/512/616/616490.png';

// Preload images and replace src with fallback on error; collect status for debugging
(function preloadIcons() {
  if (!Array.isArray(ICONS)) {
    console.error('icons.js: ICONS is not an array. Did the file load correctly?');
    window.ICONS = [];
    return;
  }

  console.log('icons.js loaded. Preloading ICONS:', ICONS.map(i => i.id));

  ICONS.forEach((icon, idx) => {
    // ensure src is a string
    if (!icon || typeof icon.src !== 'string') {
      console.warn(`icons.js: ICONS[${idx}] invalid, using fallback.`, icon);
      ICONS[idx] = { id: icon && icon.id ? icon.id : `icon${idx}`, label: icon && icon.label ? icon.label : `Icon ${idx}`, src: FALLBACK_ICON };
      return;
    }

    // Preload the image
    const img = new Image();
    img.src = icon.src;
    img.onload = () => {
      // image loaded successfully
      console.log(`icons.js: icon "${icon.id}" loaded from "${icon.src}"`);
    };
    img.onerror = () => {
      // failed to load local file — log and swap to fallback
      console.warn(`icons.js: icon "${icon.id}" failed to load from "${icon.src}". Using fallback icon.`);
      ICONS[idx].src = FALLBACK_ICON;
      // Optionally, try to load fallback once to confirm
      const fb = new Image();
      fb.src = FALLBACK_ICON;
      fb.onload = () => console.log(`icons.js: fallback loaded for "${icon.id}"`);
      fb.onerror = () => console.error(`icons.js: fallback also failed to load for "${icon.id}"`);
    };
  });

  // expose ICONS for quick debugging in console
  window.ICONS = ICONS;
  // quick sanity log
  console.log('icons.js: final ICONS array:', ICONS);
})();