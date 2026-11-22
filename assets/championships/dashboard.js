const $ = id => document.getElementById(id);
const fmt = number => Number.isInteger(number) ? String(number) : number.toFixed(2);
const esc = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const filters = {sport: 'p', tier: 'k', season: 'y', type: 't'};
let data = [];
let seasons = [];

async function loadData() {
  const response = await fetch('data.packed.txt');
  if (!response.ok) throw new Error('Data request ' + response.status);
  const packed = await response.text();
  const bytes = Uint8Array.from(atob(packed.trim()), char => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).json();
}

function addCoChampionCounts(records) {
  const titleKey = record => JSON.stringify([record.y, record.p, record.g, record.t]);
  const winners = new Map();

  for (const record of records) {
    const key = titleKey(record);
    if (!winners.has(key)) winners.set(key, new Set());
    winners.get(key).add(record.s);
  }

  return records.map(record => ({...record, champions: winners.get(titleKey(record)).size}));
}

function options(id, values, all) {
  $(id).innerHTML = '<option value="">' + all + '</option>' + values.map(value =>
    `<option value="${esc(value)}">${esc(value)}</option>`
  ).join('');
}

function plotBars(id, items) {
  const max = Math.max(1, ...items.map(([, value]) => value));
  $(id).innerHTML = items.length ? items.map(([name, value]) => {
    const label = id === 'bars' ? TeamLogos.label(name) : esc(name);
    return `<div class="barrow"><span class="name" title="${esc(name)}">${label}</span><div class="track"><div class="fill" style="width:${Math.max(0, value / max * 100)}%"></div></div><b>${fmt(value)}</b></div>`;
  }).join('') : '<p class="disabled">No observations for these filters</p>';
}

function group(rows, field) {
  const totals = new Map();
  for (const record of rows) {
    const key = record[field];
    totals.set(key, (totals.get(key) || 0) + record.score);
  }
  // Remove floating-point noise so equal fractional credits share the same rank.
  return [...totals].map(([key, value]) => [key, Number(value.toFixed(10))])
    .sort((a, b) => b[1] - a[1]);
}

function renderTrend(rows, label) {
  const sums = new Map(group(rows, 'y'));
  const values = seasons.map(season => sums.get(season) || 0);
  const max = Math.max(1, ...values);
  const width = 1040;
  const height = 260;
  const pad = 38;
  const coords = values.map((value, i) => [
    pad + i * (width - 2 * pad) / (seasons.length - 1),
    height - pad - value / max * (height - 2 * pad)
  ]);
  const path = coords.map((point, i) => (i ? 'L' : 'M') + point.join(',')).join(' ');
  $('trend').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${label} by season">
    <line x1="${pad}" x2="${width - pad}" y1="${height - pad}" y2="${height - pad}" stroke="#cdd2d8"/>
    <path d="${path}" stroke="#c8102e" stroke-width="3" fill="none"/>
    ${coords.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4" fill="#c8102e"><title>${seasons[i]}: ${fmt(values[i])}</title></circle><text x="${x}" y="${height - 12}" text-anchor="middle" font-size="12" fill="#5c6772">${seasons[i].slice(2)}</text>`).join('')}</svg>`;
}

function render() {
  const school = $('school').value;
  const weighted = $('metric').value === 'weighted';
  const split = !weighted && $('split-shared').checked;
  const measure = weighted ? 'Tier-weighted points' : 'Title credits';
  $('split-shared').disabled = weighted;
  $('share-help').textContent = weighted
    ? 'Tier-weighted points already split shared titles.'
    : 'Each co-champion gets an equal share.';
  $('sport-panel').hidden = !school;
  $('school-panel').classList.toggle('wide', !school);
  $('trend-heading').textContent = 'Season-by-season ' + measure.toLowerCase();
  $('record-measure').textContent = weighted ? 'Points' : 'Credit';

  const selected = Object.entries(filters).filter(([id]) => $(id).value);
  const peerRows = data.filter(record => selected.every(([id, field]) => String(record[field]) === $(id).value))
    .map(record => ({...record, score: weighted ? record.w : split ? 1 / record.champions : 1}));
  const rows = school ? peerRows.filter(record => record.s === school) : peerRows;
  const total = rows.reduce((sum, record) => sum + record.score, 0);
  const count = field => new Set(rows.map(record => record[field])).size;
  const stats = [[measure, total], ['Schools', count('s')], ['Sports', count('p')], ['Seasons', count('y')]];
  $('stats').innerHTML = stats.map(([label, value]) =>
    `<div class="stat"><b>${fmt(value)}</b><span>${label}</span></div>`
  ).join('');

  const peerScores = group(peerRows, 's');
  const schoolScore = peerScores.find(([name]) => name === school)?.[1];
  $('peer-context').innerHTML = school ? PeerContext.comparison({
    value: schoolScore,
    label: school + ' · ' + measure + ' · selected seasons/sports/types',
    format: fmt,
    cohorts: [{label: 'Title-winning schools under these filters', values: peerScores.map(([, value]) => value)}]
  }) + '<p class="peer-note">The peer group includes schools that won titles under these filters. Membership tenure and sports sponsored differ across schools.</p>' : '';

  plotBars('bars', group(rows, 's'));
  if (school) plotBars('sportbars', group(rows, 'p'));
  renderTrend(rows, measure);

  $('rows').innerHTML = rows.slice().sort((a, b) => b.y.localeCompare(a.y) || a.s.localeCompare(b.s)).map(record => {
    const credit = split && record.champions > 1 ? `1/${record.champions}` : fmt(record.score);
    const source = record.u.startsWith('https://') ? `<a href="${esc(record.u)}" target="_blank" rel="noopener">Source</a>` : '—';
    return `<tr><td>${esc(record.y)}</td><td>${TeamLogos.label(record.s)}</td><td>${esc(record.p)}</td><td>${esc(record.t)}${record.champions > 1 ? ' · shared' : ''}</td><td>${record.k || '—'}</td><td class="num">${credit}</td><td>${source}</td></tr>`;
  }).join('');
}

loadData().then(inventory => {
  data = addCoChampionCounts(inventory.records);
  const values = field => [...new Set(data.map(record => record[field]))].sort();
  seasons = values('y');
  options('school', values('s'), 'All schools');
  options('sport', values('p'), 'All sports');
  options('season', seasons, 'All seasons');
  options('type', values('t'), 'All types');
  const selects = document.querySelectorAll('.controls select');
  selects.forEach(select => select.addEventListener('change', render));
  $('split-shared').addEventListener('change', render);
  $('reset').addEventListener('click', () => {
    selects.forEach(select => select.selectedIndex = 0);
    $('split-shared').checked = false;
    render();
  });
  render();
}).catch(error => {
  $('stats').textContent = 'Unable to load championship data: ' + error.message;
});
