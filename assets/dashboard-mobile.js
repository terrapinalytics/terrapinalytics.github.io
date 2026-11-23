// Provide a scroll cue and keyboard access only when a table is wider than its panel.
const mobileDashboard = matchMedia('(max-width:700px)');
const tablePanels = '.table-wrap,.tablewrap,.tablebox,.scroll,.ranking';
const panels = new Map();
const tableSizes = new ResizeObserver(scheduleTableCheck);
let pendingTableCheck = 0;

function scheduleTableCheck() {
  if (!pendingTableCheck) pendingTableCheck = requestAnimationFrame(checkMobileTables);
}

function checkMobileTables() {
  pendingTableCheck = 0;
  const current = new Set();
  if (mobileDashboard.matches) {
    for (const table of document.querySelectorAll('table')) {
      const panel = table.closest(tablePanels);
      if (!panel || current.has(panel)) continue;
      current.add(panel);
      let note = panels.get(panel);
      if (!note) {
        note = document.createElement('p');
        note.className = 'mobile-scroll-note';
        note.textContent = 'Swipe across the table for more columns.';
        note.hidden = true;
        panel.before(note);
        panels.set(panel, note);
        tableSizes.observe(panel);
      }
      const wide = panel.clientWidth > 0 && panel.scrollWidth > panel.clientWidth + 2;
      note.hidden = !wide;
      if (wide && !panel.hasAttribute('data-mobile-scroll')) {
        panel.setAttribute('data-mobile-scroll', 'wide');
        if (!panel.hasAttribute('tabindex')) {
          panel.tabIndex = 0;
          panel.dataset.mobileTabstop = '';
        }
      } else if (!wide) clearMobileScroll(panel);
    }
  }
  for (const [panel, note] of panels) {
    if (current.has(panel)) continue;
    note.remove();
    clearMobileScroll(panel);
    tableSizes.unobserve(panel);
    panels.delete(panel);
  }
}

function clearMobileScroll(panel) {
  panel.removeAttribute('data-mobile-scroll');
  if (panel.hasAttribute('data-mobile-tabstop')) {
    panel.removeAttribute('data-mobile-tabstop');
    panel.removeAttribute('tabindex');
  }
}

mobileDashboard.addEventListener('change', scheduleTableCheck);
new MutationObserver(records => {
  if (records.some(record => record.target.nodeType === 1 &&
      (record.target.closest(tablePanels) || [...record.addedNodes].some(node =>
        node.nodeType === 1 && (node.matches(tablePanels) || node.querySelector(tablePanels)))))) {
    scheduleTableCheck();
  }
}).observe(document.body, {childList:true, subtree:true});
scheduleTableCheck();

const mapFilters = document.querySelector('.mobile-map-filters');
if (mapFilters) {
  const mapMedia = matchMedia('(max-width:640px)');
  const panel = document.getElementById(mapFilters.getAttribute('aria-controls'));
  function setMapFilters(open) {
    panel.hidden = !open;
    mapFilters.setAttribute('aria-expanded', String(open));
    mapFilters.textContent = open ? 'Hide map filters' : 'Show map filters';
  }
  function syncMapFilters() {
    mapFilters.hidden = !mapMedia.matches;
    setMapFilters(!mapMedia.matches);
  }
  mapFilters.addEventListener('click', () => setMapFilters(panel.hidden));
  mapMedia.addEventListener('change', syncMapFilters);
  syncMapFilters();
}
