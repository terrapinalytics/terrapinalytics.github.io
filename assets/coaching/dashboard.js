'use strict';
const app = document.getElementById('app');
const isOdds = document.body.dataset.view === 'odds';
const POWER_FOUR = new Set(['ACC', 'Big Ten', 'Big 12', 'SEC']);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function format(value, type = 'number') {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'text') return escapeHtml(value);
  const number = Number(value);
  if (!Number.isFinite(number)) return escapeHtml(value);
  if (type === 'rating') return number.toLocaleString('en-US', {minimumFractionDigits:3, maximumFractionDigits:5});
  if (type === 'percent') return number.toLocaleString('en-US', {style:'percent',maximumFractionDigits:1});
  if (type === 'money') return number.toLocaleString('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0});
  return number.toLocaleString('en-US', {maximumFractionDigits:type === 'integer' ? 0 : 1, minimumFractionDigits:type === 'number' ? 1 : 0});
}
function buyoutLabel(row) {
  return row.dismissal_buyout?.amount_is_lower_bound ? escapeHtml(row.dismissal_buyout.display) : format(row.dismissal_buyout?.amount_usd,'money');
}
function tier(value) { return `<span class="tier t${Number(value)}">Tier ${Number(value)}</span>`; }
function sourceLinks(value) {
  const urls = [...new Set(String(value || '').match(/https?:\/\/[^\s|;<>"\[\]]+/g) || [])];
  return urls.map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Source ${index + 1}</a>`).join(' · ');
}
function options(values) { return values.map(value => `<option>${escapeHtml(value)}</option>`).join(''); }
const frameworkMetrics = {
  'Football resources': [
    'eada_football_expenses_mean_FY2022_2024_2025usd',
    'eada_football_expenses_FY2025_usd',
    'ncaa_football_expenses_FY2025_usd',
    'ncaa_2025_donor_contributions_revenue_usd'
  ],
  'Recruiting geography': [
    'local_top1000_per_class',
    'recruiting_rank_mean_2021_2025',
    'recruiting_top100_mean_2021_2025',
    'roster_talent_rank_2026',
    'transfers_2026_incoming_transfers', 'transfer_rating'
  ],
  'Conference and realignment': ['conference'],
  'Fans and tradition': ['attendance_average_2025', 'attendance_average_mean_2022_2024_phase4', 'ncaa_2025_ticket_sales_revenue_usd'],
  'Competitive ceiling': [
    'sagarin_week12', 'sp_rank_mean_2016_2025', 'fpi_rank_mean_2016_2025']
};
const previousGroups = {
  Finance:'Football resources', 'Roster spending':'Football resources', Recruiting:'Recruiting geography',
  'Fan support':'Fans and tradition', Performance:'Competitive ceiling'
};
const coachingPayroll = 'ncaa_football_coaching_payroll_mean_FY2022_2024_usd';

const detailMetrics = {
  'Football resources': [
    'ncaa_football_expenses_mean_FY2022_2024_usd', coachingPayroll,
    'ncaa_football_coaching_compensation_FY2025_usd', 'ncaa_football_contributions_FY2025_usd',
    'head_coach_total_pay_2025_usd', 'assistant_pool_2024_usd',
    'head_coach_guaranteed_salary_2026_phase4_usd',
    'football_direct_revenue_share_FY2026_usd', 'football_roster_athletic_secondary_2026',
    'football_roster_cbs247_2026', 'football_roster_si_2026',
    'ncaa_athletics_contributions_mean_FY2022_2024_usd',
    'ncaa_2025_total_expenditure_usd', 'eada_athletics_expenses_FY2025_usd',
    'eada_athletics_revenue_FY2025_usd', 'eada_football_revenue_FY2025_usd',
    'ncaa_2025_coaches_compensation_usd'
  ],
  'Recruiting geography': ['recruiting_four_star_mean_2021_2025', 'eada_recruiting_expenses_FY2025_usd'],
  'Conference and realignment': ['ncaa_2025_conference_ncaa_media_postseason_usd'],
  'Fans and tradition': [
    'historical_crowd', 'current_venue_capacity_2026_metadata', 'all_time_win_pct',
    'ncaa_athletics_ticket_sales_mean_FY2022_2024_usd', 'ncaa_football_ticket_sales_FY2025_usd'
  ],
  'Competitive ceiling': ['rated_seasons', 'sp_rating_mean_2016_2025', 'sp_offense_rank_mean_2016_2025', 'sp_defense_rank_mean_2016_2025']
};
const compareGroup = 'Compare schools';
const defaultSchools = ['Maryland', 'Rutgers', 'Virginia Tech'];
const comparisonMetrics = {
  'Football resources': [
    'eada_football_expenses_mean_FY2022_2024_2025usd', 'ncaa_football_expenses_mean_FY2022_2024_usd',
    'head_coach_total_pay_2025_usd', 'assistant_pool_2024_usd', coachingPayroll,
    'football_roster_athletic_secondary_2026_estimate', 'football_roster_cbs247_2026_estimate',
    'football_roster_si_2026_estimate', 'football_direct_revenue_share_FY2026_usd',
    'eada_2025_total', 'ncaa_2025_total_expenditure_usd', 'ncaa_2025_donor_contributions_revenue_usd'
  ],
  'Recruiting geography': ['local_top1000_per_class', 'recruiting_rank_mean_2021_2025', 'roster_talent_rank_2026', 'transfer_rating'],
  'Conference and realignment': ['conference', 'ncaa_2025_conference_ncaa_media_postseason_usd'],
  'Fans and tradition': [
    'attendance_average_mean_2022_2024_phase4', 'attendance_average_2025', 'historical_crowd',
    'current_venue_capacity_2026_metadata', 'ncaa_2025_ticket_sales_revenue_usd', 'all_time_win_pct'
  ],
  'Competitive ceiling': ['sp_rating_mean_2016_2025', 'fpi_rank_mean_2016_2025', 'rated_seasons', 'sagarin_week12']
};
const additionalMetrics = [
  ['eada_2025_total', 'EADA athletics expenses', 'FY2025 · nominal dollars', 'money'],
  ['football_roster_athletic_secondary_2026_estimate', 'Roster spending estimate', '2026 · Athletic via secondary reporting · model input', 'money'],
  ['football_roster_cbs247_2026_estimate', 'Roster spending estimate', '2026 · CBS/247 · model input', 'money'],
  ['football_roster_si_2026_estimate', 'Roster spending estimate', '2026 · Sports Illustrated · model input', 'money'],
  ['head_coach_total_pay_2025_usd', 'Head coach reported pay', '2025 · source-reported total pay', 'money'],
  ['head_coach_guaranteed_salary_2026_phase4_usd', 'Head coach guaranteed salary', '2026 · Phase 4 contract snapshot · before bonuses', 'money'],
  ['transfer_rating', 'Incoming transfer quality', '2026 · transfer rating used in the November model', 'rating'],
  ['historical_crowd', 'Historical home attendance', '2010–19 · average per home game', 'integer'],
  ['current_venue_capacity_2026_metadata', 'Stadium capacity', 'Current venue metadata', 'integer'],
  ['all_time_win_pct', 'All-time winning percentage', 'Includes earlier subdivisions', 'percent'],
  ['rated_seasons', 'SP+ seasons observed', '2016–25 · up to ten FBS seasons', 'integer']
];

async function start() {
  const financePromise = isOdds ? null : fetch('ranking-finance.json')
    .then(response => response.ok ? response.json() : null)
    .catch(() => null);
  const response = await fetch(isOdds ? 'odds.json?v=20261127-boards' : 'rankings.json');
  if (!response.ok) throw new Error('Data request failed');
  const data = await response.json();
  const finance = await financePromise;
  const panel = new Map((data.panel || []).map(row => [row.school, row]));
  const rows = isOdds ? data.rows.filter(row => POWER_FOUR.has(row.conference)) : data.programs.map(program => {
    const evidence = finance?.schools?.[program.school] || {};
    const amounts = Object.fromEntries(Object.entries(evidence).map(([key, entry]) => [key, entry.value]));
    return {...panel.get(program.school), ...program, ...amounts};
  });
  const p4 = rows.filter(row => String(row.p4_2026).toLowerCase() === 'true');
  const g6 = rows.filter(row => String(row.p4_2026).toLowerCase() === 'false' && row.conference !== 'Independent');
  let group = 'Overview';
  let sortKey = isOdds ? 'dec7_probability_pct' : 'rank';
  let ascending = !isOdds;
  const metricIndex = new Map((data.metrics || []).map(metric => [metric.key, metric]));
  for (const [key, label, definition, format] of additionalMetrics) metricIndex.set(key, {key, label, definition, format});
  for (const metric of finance?.metrics || []) metricIndex.set(metric.key, metric);
  const compareFinanceMetrics = [
    ['ncaa_2025_total_expenditure_usd', 'NCAA athletics expenses'],
    ['ncaa_2025_donor_contributions_revenue_usd', 'NCAA athletics contributions'],
    ['ncaa_2025_ticket_sales_revenue_usd', 'NCAA athletics ticket revenue'],
    ['ncaa_2025_conference_ncaa_media_postseason_usd', 'NCAA conference / NCAA / media / postseason revenue']
  ];
  for (const [key, label] of compareFinanceMetrics) {
    if (!metricIndex.has(key)) metricIndex.set(key, {key, label, definition:'FY2025 · nominal dollars', format:'money'});
  }
  metricIndex.set('conference', {key:'conference', format:'text', label:'Conference affiliation', definition:'Current football membership'});
  for (const [key,label] of [['previous_rank','October rank'],['rank_without_conference','Rank without conference weight']]) metricIndex.set(key,{key,label,format:'integer'});
  const componentKeys = ['resources_score','recruiting_score','conference_score','fans_score','ceiling_score'];
  (data.weights || []).forEach(([label,weight],i)=>metricIndex.set(componentKeys[i],{key:componentKeys[i],label:'Category score',format:'number',definition:label+' · '+weight+'% of overall score'}));
  const framework = isOdds ? '' : '<fieldset class="framework"><legend>Ranking framework · compare programs by category</legend>'+
    '<button type="button" data-group="Overview">Overview</button>'+data.weights.map(([label,weight])=>
      '<button type="button" data-group="'+escapeHtml(label)+'">'+escapeHtml(label)+' <small>'+weight+'%</small></button>').join('')+
    '<button type="button" data-group="'+compareGroup+'">'+compareGroup+'</button>'+
    '</fieldset><p id="framework-note" class="count"></p>';
  const controls = isOdds
    ? `<label>Checkpoint<select id="checkpoint"><option value="dec7_probability_pct">December 7, 2026</option><option value="feb1_probability_pct">February 1, 2027</option></select></label>
       <label>Openings<select id="status"><option value="">All tracked situations</option><option value="Announced departure">Announced departures</option><option value="Forecast">Forecasts</option></select></label>
       <label>Minimum odds<select id="minimum-odds"><option value="5">5% or higher</option><option value="0">All odds</option></select></label>`
    : `<label>Find a program<input id="search" type="search" placeholder="School or coach" autocomplete="off"></label><label>Conference<select id="conference"><option value="">All conferences</option>${options([...new Set(rows.map(row=>row.conference))].sort())}</select></label><label>Job tier<select id="tier"><option value="">All tiers</option>${[...new Set(rows.map(r=>r.tier))].sort((a,b)=>a-b).map(n=>`<option value="${n}">Tier ${n}</option>`).join('')}</select></label>`;
  app.innerHTML = `${framework}<div class="tools" id="ranking-filters">${controls}</div><div class="tools"><button id="reset-view" type="button">Reset</button><button id="share-view" type="button">Copy view link</button><button id="export-view" type="button">Download filtered data</button></div><p id="snapshot" class="count" hidden></p><p id="count" class="count" aria-live="polite"></p><div class="table-wrap" id="ranking-table"><table><thead id="head"></thead><tbody id="body"></tbody></table></div><section id="detail" class="detail" hidden aria-live="polite"></section>${isOdds ? '' : '<section id="compare-panel" aria-label="School comparison" hidden></section>'}<div class="download">${isOdds ? '<a href="departure_odds.csv" download>Odds CSV</a>' : '<a href="program_rankings.csv" download>Rankings CSV</a><a href="program_inputs.csv" download>All program inputs</a><a href="supporting_data.zip" download>Supporting source tables</a><a href="source_registry.csv" download>Source registry</a>'}</div><div class="notes">${isOdds ? '<p>Announced departures are shown at 100%. The February checkpoint includes later potential departures. The change column uses the latest saved forecast available on the two-week reference date. A dash means no comparable baseline. This dashboard covers tracked situations in the ACC, Big Ten, Big 12 and SEC.</p><p>Buyout estimates represent the school’s gross head-coach dismissal obligation. Click a school for the assessment and contract notes. Reporting dates and confidence vary.</p>' : '<p>Rankings and tiers are subjective judgments informed by source observations and calculated comparisons. Reported estimates retain their uncertainty. Each rank uses the five published category scores and weights. See the <a href="../../projects/program-rankings.html" target="_top">ranking methodology</a> for the framework and limitations.</p><p class="count">'+(finance ? 'FY2025 financial evidence uses the expanded finance panels. The scores include verified FY2025 ticket sales and contributions.' : 'FY2025 financial evidence is temporarily unavailable.')+' <a href="../../projects/finance.html" target="_top">Athletics financials</a></p><p>EADA and NCAA MFRS retain their own definitions. Private-school nondisclosure appears as missing. Attendance mixes official totals and reconstructed observations, and roster-spending amounts are source-specific estimates.</p><details><summary>Data quality and source coverage</summary><p><a href="data_quality.md" target="_blank">Phase 4 validation and limitations</a></p><p>The supporting download contains normalized source tables, the data dictionary, field coverage, provenance, and conflicts. Each source retains its reporting year, unit, and definition.</p></details>'}</div>`;
  const filterIds = isOdds ? ['checkpoint','status','minimum-odds'] : ['search','conference','tier'];
  const params = new URLSearchParams(location.search);
  const schoolRows = new Map(rows.map(row=>[row.school,row]));
  const schoolOptions = options([...schoolRows.keys()].sort((a,b)=>a.localeCompare(b)));
  const comparePanel = document.getElementById('compare-panel');
  if (comparePanel) {
    comparePanel.innerHTML = `<div class="tools compare-pickers">${Array.from({length:4}, (_,i)=>`
      <label>School ${i+1}<select><option value="">Choose a school</option>${schoolOptions}</select></label>`).join('')}</div>
      <p id="compare-count" class="count" aria-live="polite"></p>
      <div class="table-wrap comparison-table" id="compare-table" role="region" aria-label="Side-by-side program metrics" tabindex="0"></div>`;
  }
  const schoolPickers = [...(comparePanel?.querySelectorAll('select') || [])];
  const savedSchools = params.has('school') ? params.getAll('school') : defaultSchools;
  const validSchools = [...new Set(savedSchools.filter(school=>schoolRows.has(school)))];
  schoolPickers.forEach((picker,i)=>{
    picker.value = validSchools[i] || '';
    picker.onchange = renderComparison;
  });
  const defaults = Object.fromEntries(filterIds.map(id=>[id,document.getElementById(id).value]));
  for(const id of filterIds)ViewTools.restore(document.getElementById(id),params.get(id));
  if(isOdds)sortKey=document.getElementById('checkpoint').value;
  else {
    const savedGroup = params.get('group');
    group = savedGroup === compareGroup || Object.hasOwn(frameworkMetrics, savedGroup) ? savedGroup : Object.hasOwn(previousGroups, savedGroup) ? previousGroups[savedGroup] : 'Overview';
  }
  let exportRows = [];
  document.getElementById('reset-view').onclick=()=>{
    for(const id of filterIds)document.getElementById(id).value=defaults[id];
    schoolPickers.forEach((picker,i)=>{picker.value=defaultSchools[i] || '';});
    if (group !== compareGroup) group='Overview';
    sortKey=isOdds?defaults.checkpoint:'rank';ascending=!isOdds;
    document.getElementById('detail').hidden=true;render();
  };
  document.getElementById('share-view').onclick=()=>{
    const url=new URL(location.href);
    const view = new URLSearchParams(filterIds.map(id=>[id,document.getElementById(id).value]));
    if (!isOdds && group !== 'Overview') view.set('group', group);
    if (group === compareGroup) {
      const selected = schoolPickers.map(picker=>picker.value).filter(Boolean);
      for (const school of selected.length ? selected : ['']) view.append('school', school);
    }
    url.search = view;
    ViewTools.copy(document.getElementById('share-view'),url);
  };
  document.getElementById('export-view').onclick=()=>ViewTools.csv(isOdds?'departure-odds-filtered.csv':group===compareGroup?'program-comparison.csv':'program-rankings-filtered.csv',exportRows);
  function selectedMetrics(category = group, expanded = false) {
    const index = (data.weights || []).findIndex(([label])=>label===category);
    const keys = index < 0 ? ['score','previous_rank','rank_without_conference'] : [componentKeys[index],...frameworkMetrics[category]];
    return [...keys, ...(expanded ? detailMetrics[category] || [] : [])]
      .map(key => metricIndex.get(key)).filter(Boolean);
  }
  function metricPeers(row,metric) {
    const groups=[{label:'Ranked-program sample',shortLabel:'Overall',members:rows},
      {label:'Power Four',shortLabel:'P4',members:p4},
      {label:'Group of Six',shortLabel:'G6',members:g6},
      {label:row.conference+' (current membership)',members:rows.filter(x=>x.conference===row.conference)}];
    const comparison={value:row[metric.key],lower:metric.key.includes('rank'),format:v=>format(v,metric.format),label:metric.label+' · '+metric.definition,
      cohorts:groups.map(g=>({label:g.label,shortLabel:g.shortLabel,values:g.members.map(x=>x[metric.key]),includesSelected:g.members.some(x=>x.school===row.school)}))};
    return PeerContext.badges(comparison)+'<details><summary>Peer details</summary>'+PeerContext.comparison(comparison)+'</details>';
  }
  function programMetric(row, metric) {
    if (metric.key === 'conference') {
      return `<div class="metric">${metric.label}<strong>${format(row.conference,'text')}</strong><small>Media revenue, playoff access, and league stability inform the editorial assessment.</small></div>`;
    }
    const sources = data.provenance.filter(p=>p.school === row.school && p.metric === metric.key);
    const provenance = sources.map(p=>`<div class="source">${escapeHtml(p.observation_year || p.period || '')} · ${escapeHtml(p.confidence || 'Confidence unclassified')}<br>${escapeHtml(p.definition || metric.definition)}${p.completeness ? '<br>Completeness '+escapeHtml(p.completeness) : ''}<br>${sourceLinks(p.source_urls || p.sources)}</div>`).join('');
    const financeEntry = finance?.schools?.[row.school]?.[metric.key];
    const financeSource = financeEntry
      ? financeEntry.url
        ? '<p>'+sourceLinks(financeEntry.url)+'</p>'
        : '<p>'+(financeEntry.status === 'available' ? 'The source report has a blank for this field.' : 'No comparable report for this field in the FY2025 source panel.')+'</p>'
      : '';
    const context = metric.key === coachingPayroll ? '<small>Football payroll and the reported assistant pool overlap.</small>' : '';
    const history = ['sp_rank_mean_2016_2025','fpi_rank_mean_2016_2025'].includes(metric.key) && Number(row.rated_seasons) === 0
      ? '<small>No FBS seasons in the 2016–25 window. See the 2026 Sagarin rating.</small>' : '';
    return `<div class="metric">${escapeHtml(metric.label)}<strong>${format(row[metric.key],metric.format)}</strong>${context}${history}${metricPeers(row,metric)}<details><summary>Definition and sources</summary><p>${escapeHtml(metric.definition)}</p>${financeSource || provenance || '<p>See the supporting tables for source coverage.</p>'}</details></div>`;
  }
  function showDetail(row) {
    const detail = document.getElementById('detail');
    detail.hidden = false;
    let content = `<div class="details-head"><h2>${TeamLogos.label(row.school)}</h2>${tier(row.tier)}<button id="close" aria-label="Close program details">Close</button></div><p>#${row.rank} · ${escapeHtml(row.conference)}</p>`;
    if (isOdds) {
      content += `<p><strong>${escapeHtml(row.coach)}</strong> · ${escapeHtml(row.status)}${row.incoming_hire_announced ? ` · Hired ${escapeHtml(row.incoming_hire_announced)}` : ''}</p><div class="metric-grid"><div class="metric">December 7<strong>${row.dec7_probability_pct}%</strong></div><div class="metric">February 1<strong>${row.feb1_probability_pct}%</strong></div><div class="metric">Dismissal buyout estimate<strong>${buyoutLabel(row)}</strong></div></div>${row.two_week_change_pp == null ? '' : `<p><strong>${Number(row.two_week_change_pp)>0?'+':''}${format(row.two_week_change_pp,'number')} percentage points</strong> in December 7 odds since the ${escapeHtml(row.two_week_baseline_source_date || data.comparison_source_date)} forecast.</p>`}<details><summary>What changed and sources</summary><p>${escapeHtml(row.research_note)}</p><p>${sourceLinks(row.research_source)}</p></details>${PeerContext.comparison({value:row.dismissal_buyout.amount_usd,label:'Dismissal buyout estimate · mixed reporting dates; estimates, not synchronized contract valuations',format:v=>format(v,'money'),cohorts:[{label:'Tracked situations ('+rows.length+')',values:rows.map(x=>x.dismissal_buyout.amount_usd)},{label:row.conference+' tracked situations',values:rows.filter(x=>x.conference===row.conference).map(x=>x.dismissal_buyout.amount_usd)}]})}<details><summary>Buyout notes</summary><p>${escapeHtml(row.dismissal_buyout.notes)}</p><p>${escapeHtml(row.dismissal_buyout.applicable_date_or_period)}</p><p>${sourceLinks(row.dismissal_buyout.source_url)}</p></details>`;
    } else {
      content += data.weights.map(([label, weight, definition],i) => `<details class="framework-detail"${label===group?' open':''}>
        <summary>${escapeHtml(label)} <span>${format(row[componentKeys[i]],'number')} / 100 · ${weight}% weight</span></summary>
        <p class="count">${escapeHtml(definition)}.</p>
        <div class="metric-grid">${selectedMetrics(label, true).map(metric=>programMetric(row,metric)).join('')}</div>
      </details>`).join('');
      content += '<p class="count"><a href="program_inputs.csv" download>Download alternate ratings, attendance periods, payroll sources, and other inputs</a></p>';
      const coverage = data.coverage.filter(c=>c.school===row.school);
      if (coverage.length) content += '<details><summary>October field-level source coverage</summary><div class="table-wrap"><table><thead><tr><th>Source family</th><th>Usable metric slots</th><th>Completeness</th></tr></thead><tbody>' + coverage.map(c=>`<tr><td>${escapeHtml(c.source_family)}</td><td>${c.observed_usable_metric_slots} / ${c.eligible_metric_slots}</td><td>${c.field_completeness_percent}%</td></tr>`).join('') + '</tbody></table></div></details>';
    }
    detail.innerHTML = content;
    document.getElementById('close').onclick = ()=>{detail.hidden = true;};
    detail.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function renderComparison() {
    const selected = schoolPickers.map(picker=>picker.value).filter(Boolean);
    for (const picker of schoolPickers) {
      for (const option of picker.options) {
        option.disabled = Boolean(option.value && option.value !== picker.value && selected.includes(option.value));
      }
    }
    const programs = selected.map(school=>schoolRows.get(school));
    const table = document.getElementById('compare-table');
    document.getElementById('compare-count').textContent = programs.length === 0
      ? 'Choose schools to see their category scores and supporting data.'
      : `${programs.length} of 4 schools selected · A dash indicates unavailable data.`;
    table.hidden = programs.length === 0;
    exportRows = [['Category', 'Metric', 'Definition', ...selected]];
    if (!programs.length) {
      table.innerHTML = '';
      return;
    }
    const metricRow = (category, metric) => {
      const {key, label, definition = '', format: type} = metric;
      exportRows.push([category, label, definition, ...programs.map(row=>row[key])]);
      return `<tr${componentKeys.includes(key) ? ' class="category-score"' : ''}><th scope="row">${escapeHtml(label)}${definition ? `<small>${escapeHtml(definition)}</small>` : ''}</th>${
        programs.map(row=>`<td class="${type==='text'?'':'number'}">${format(row[key],type)}</td>`).join('')}</tr>`;
    };
    const overview = [
      {key:'rank',label:'FBS rank',format:'integer'}, {key:'tier',label:'Job tier',format:'integer'},
      metricIndex.get('score'), metricIndex.get('rank_without_conference')
    ];
    const summary = overview.map(metric=>metricRow('Overview',metric)).join('');
    const categories = data.weights.map(([label, weight],i)=>{
      const metrics = [componentKeys[i], ...comparisonMetrics[label]].map(key=>metricIndex.get(key));
      metrics[0] = {...metrics[0], definition:'Out of 100'};
      return `<tbody><tr class="comparison-category"><th scope="rowgroup" colspan="${programs.length+1}">${escapeHtml(label)} <small>${weight}% weight</small></th></tr>${
        metrics.map(metric=>metricRow(label,metric)).join('')}</tbody>`;
    });
    const header = programs.map(row=>`<th scope="col">${TeamLogos.label(row.school)}</th>`).join('');
    table.innerHTML = `<table><thead><tr><th scope="col">Program metric</th>${header}</tr></thead><tbody>${summary}</tbody>${categories.join('')}</table>`;
  }
  function render() {
    if (!isOdds) {
      const comparing = group === compareGroup;
      comparePanel.hidden = !comparing;
      for (const id of ['ranking-filters','ranking-table','count']) document.getElementById(id).hidden = comparing;
      document.querySelectorAll('[data-group]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.group===group)));
      document.getElementById('export-view').textContent = comparing ? 'Download comparison' : 'Download filtered data';
      document.getElementById('framework-note').textContent = comparing
        ? 'Compare overall ranks, category scores, and the measures behind them.'
        : group === 'Overview'
          ? 'Choose a category to compare its key metrics, or select a program to expand its evidence.'
          : data.weights.find(([label])=>label===group)[2]+'.';
      if (comparing) {
        renderComparison();
        return;
      }
    }
    const checkpoint = isOdds ? document.getElementById('checkpoint').value : '';
    let filtered;
    if (isOdds) {
      const status = document.getElementById('status').value;
      const minimumOdds = Number(document.getElementById('minimum-odds').value);
      filtered = rows.filter(row => (!status || row.status === status) && row[checkpoint] >= minimumOdds);
    } else {
      const query = document.getElementById('search').value.toLowerCase().trim();
      const conference = document.getElementById('conference').value;
      const chosenTier = document.getElementById('tier').value;
      filtered = rows.filter(row => (row.school + ' ' + (row.coach || '')).toLowerCase().includes(query)
        && (!conference || row.conference === conference)
        && (!chosenTier || row.tier === Number(chosenTier)));
    }
    const metrics = isOdds ? [] : selectedMetrics();
    const snapshot=document.getElementById('snapshot');
    snapshot.hidden=!isOdds;
    if(isOdds)snapshot.textContent='Odds snapshot '+data.as_of+(checkpoint==='dec7_probability_pct'?' · Change compares with '+data.comparison_reference_date+' using the '+data.comparison_source_date+' saved forecast.':'');
    filtered.sort((a,b)=>{
      const left = a[sortKey], right = b[sortKey];
      if (left === '' || left == null) return right === '' || right == null ? 0 : 1;
      if (right === '' || right == null) return -1;
      const difference = Number.isFinite(Number(left)) && Number.isFinite(Number(right)) ? Number(left)-Number(right) : String(left).localeCompare(String(right));
      return (ascending ? difference : -difference) || a.rank-b.rank;
    });
    const exportMetrics = metrics.filter(metric=>metric.key!=='conference');
    exportRows = isOdds
      ? [['Program','Coach','Status','Checkpoint','Departure odds (%)','Buyout estimate','Snapshot','Change (pp)','Comparison source date'],
        ...filtered.map(row=>[row.school,row.coach,row.status,document.getElementById('checkpoint').selectedOptions[0].text,
          row[checkpoint],row.buyout_sort,data.as_of,checkpoint==='dec7_probability_pct'?row.two_week_change_pp:null,
          checkpoint==='dec7_probability_pct'?data.comparison_source_date:null])]
      : [['Rank','Program','Conference','Tier',...exportMetrics.map(metric=>metric.definition ? metric.label+' ('+metric.definition+')' : metric.label)],
        ...filtered.map(row=>[row.rank,row.school,row.conference,row.tier,...exportMetrics.map(metric=>row[metric.key])])];
    const header = (key,label,definition='')=>`<th scope="col"${sortKey===key?' aria-sort="'+(ascending?'ascending':'descending')+'"':''}><button type="button" data-sort="${key}" data-sort-column>${escapeHtml(label)}</button>${definition?'<small>'+escapeHtml(definition)+'</small>':''}</th>`;
    let columns = header('rank','Rank')+header('school','Program')+header('tier','Job tier');
    if (isOdds) columns = header('school','Program')+header(checkpoint,'Departure odds')+header('coach','Coach')+header('tier','Job tier')+header('buyout_sort','Buyout estimate')+(checkpoint==='dec7_probability_pct'?header('change_sort','Two-week change', 'Reference: '+data.comparison_reference_date+' · Saved forecast: '+data.comparison_source_date):'');
    else columns += metrics.map(m=>header(m.key,m.label,m.definition)).join('');
    document.getElementById('head').innerHTML = '<tr>'+columns+'</tr>';
    document.getElementById('body').innerHTML = filtered.map(row=>{
      const school = `<button class="school" data-school="${escapeHtml(row.school)}">${TeamLogos.label(row.school)}</button>`;
      if (isOdds) {
        const probability = row[checkpoint];
        const delta = row.two_week_change_pp;
        return `<tr><td>${school}<div class="status">${escapeHtml(row.status)}${row.incoming_hire_announced ? `<span class="incoming-hire">Hired ${escapeHtml(row.incoming_hire_announced)}</span>` : ''}</div></td><td class="bar-cell"><div class="bar-line"><div class="bar-track"><div class="bar-fill" style="width:${probability}%;background:${probability===100?'#c74445':probability>=30?'#d47136':probability>=10?'#c7a63e':'#4a8876'}"></div></div><strong>${format(probability)}%</strong></div></td><td>${escapeHtml(row.coach)}</td><td>${tier(row.tier)}</td><td class="number">${buyoutLabel(row)}</td>${checkpoint==='dec7_probability_pct'?'<td class="number delta">'+(delta == null ? '—' : (delta > 0 ? '+' : '') + format(delta) + ' pp')+'</td>':''}</tr>`;
      }
      return `<tr><td class="number">${row.rank}</td><td>${school}${group==='Conference and realignment'?'':'<div class="status">'+escapeHtml(row.conference)+'</div>'}</td><td>${tier(row.tier)}</td>${metrics.map(m=>`<td class="${m.format==='text'?'':'number'}">${format(row[m.key],m.format)}</td>`).join('')}</tr>`;
    }).join('') || '<tr><td colspan="10">No matching programs.</td></tr>';
    document.getElementById('count').textContent = filtered.length+' of '+rows.length+(isOdds?' tracked situations':' ranked programs')+' · Click a school for sources and detail';
    document.querySelectorAll('[data-sort]').forEach(button=>button.onclick=()=>{
      const next = button.dataset.sort;
      if(next===sortKey) ascending=!ascending;
      else {sortKey=next;ascending=next!==checkpoint;}
      render();
    });
    document.querySelectorAll('[data-school]').forEach(button=>button.onclick=()=>showDetail(rows.find(row=>row.school===button.dataset.school)));
  }
  rows.forEach(row=>{row.buyout_sort=row.dismissal_buyout?.amount_usd;row.change_sort=row.two_week_change_pp;});
  if (isOdds) {
    document.getElementById('minimum-odds').onchange = render;
    document.getElementById('status').onchange = render;
    document.getElementById('checkpoint').onchange = () => {
      sortKey = document.getElementById('checkpoint').value;
      ascending = false;
      render();
    };
  } else {
    document.getElementById('search').oninput = render;
    for (const id of ['conference', 'tier']) document.getElementById(id).onchange = render;
    document.querySelectorAll('[data-group]').forEach(button=>button.onclick = () => {
      group = button.dataset.group;
      sortKey = 'rank';
      ascending = true;
      document.getElementById('detail').hidden = true;
      render();
    });
  }
  render();
  app.setAttribute('aria-busy','false');
}
start().catch(()=>{app.innerHTML='<p class="error">The dashboard data could not load. Reload the page or use the CSV download.</p><p><a href="'+(isOdds?'departure_odds.csv':'program_inputs.csv')+'">Download data</a></p>';app.setAttribute('aria-busy','false');});
