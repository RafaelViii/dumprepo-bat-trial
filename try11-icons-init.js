// Init/build icon cards (drop this into your project or paste into try11.js)
// - Waits for DOM ready
// - Ensures #iconsList exists (creates panel if missing)
// - Uses global ICONS array (from icons.js) to build cards with drag & click handlers
// - Logs helpful diagnostics

(function initIconCards() {
  function buildCards() {
    // Ensure ICONS is available
    if (typeof ICONS === 'undefined') {
      console.warn('icons.js: ICONS is not defined. No icons will be shown.');
      window.ICONS = [];
    }
    const ICONS_LOCAL = window.ICONS || [];

    // Ensure container and icons list exist
    const mapContainer = document.getElementById('mapContainer') || document.querySelector('.container');
    let iconsListEl = document.getElementById('iconsList');
    if (!iconsListEl) {
      // create a panel if missing
      const panel = document.createElement('aside');
      panel.className = 'icons-panel';
      panel.id = 'iconsPanel';
      panel.innerHTML = `
        <h2 class="icons-title">Hazard Icons</h2>
        <div class="icons-list" id="iconsList"></div>
        <div class="icons-actions">
          <button id="resetHazardsBtn" class="btn secondary">Reset Hazards</button>
        </div>
      `;
      document.body.appendChild(panel);
      iconsListEl = document.getElementById('iconsList');
      console.info('icons.js: #iconsList not found — created icons panel dynamically.');
    }

    // Clear previous cards
    iconsListEl.innerHTML = '';

    // Build cards
    ICONS_LOCAL.forEach(icon => {
      const card = document.createElement('div');
      card.className = 'icon-card';
      card.setAttribute('draggable', 'true');
      card.dataset.iconId = icon.id || '';
      card.dataset.iconSrc = icon.src || '';

      const img = document.createElement('img');
      img.className = 'icon-img';
      img.src = icon.src || '';
      img.alt = icon.label || icon.id || '';

      const lbl = document.createElement('div');
      lbl.className = 'icon-label';
      lbl.textContent = icon.label || icon.id || '';

      card.appendChild(img);
      card.appendChild(lbl);
      iconsListEl.appendChild(card);

      // dragstart: pass src and id
      card.addEventListener('dragstart', (ev) => {
        try {
          ev.dataTransfer.setData('text/plain', icon.src || '');
          ev.dataTransfer.setData('application/icon-id', icon.id || '');
          if (img.complete) ev.dataTransfer.setDragImage(img, img.width/2, img.height/2);
        } catch (e) { /* ignore */ }
      });

      // click select
      card.addEventListener('click', () => {
        document.querySelectorAll('.icon-card.selected').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });

    console.log(`icons.js: built ${ICONS_LOCAL.length} icon card(s)`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildCards, { once: true });
  } else {
    setTimeout(buildCards, 0);
  }
})();