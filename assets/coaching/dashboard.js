'use strict';
const app = document.getElementById('app');
const isOdds = document.body.dataset.view === 'odds';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function format(value, type = 'number') {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'text') return escapeHtml(value);
  const number = Number(value);
  if (!Number.isFinite(number)) return escapeHtml(value);
  if (type === 'money') return number.toLocaleString('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0});
  return number.toLocaleString('en-US', {maximumFractionDigits:type === 'integer' ? 0 : 1, minimumFractionDigits:type === 'number' ? 1 : 0});
}
function tier(value) { return `<span class="tier t${Number(value)}">Tier ${Number(value)}</span>`; }
function sourceLinks(value) {
  const urls = [...new Set(String(value || '').match(/https?:\/\/[^\s|;<>"\[\]]+/g) || [])];
  return urls.slice(0, 3).map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Source ${index + 1}</a>`).join(' · ');
}
function options(values) { return values.map(value => `<option>${escapeHtml(value)}</option>`).join(''); }
const frameworkMetrics = {
  'Football resources': [
    'eada_football_expenses_mean_FY2022_2024_2025usd',
    'ncaa_football_coaching_payroll_mean_FY2022_2024_usd',
    'football_direct_revenue_share_FY2026_usd',
    'ncaa_athletics_contributions_mean_FY2022_2024_usd'
  ],
  'Recruiting geography': [
    'recruiting_rank_mean_2021_2025',
    'recruiting_top100_mean_2021_2025',
    'roster_talent_rank_2026',
    'transfers_2026_incoming_transfers'
  ],
  'Conference and realignment': ['conference'],
  'Fans and tradition': ['attendance_average_mean_2022_2024_phase4', 'ncaa_athletics_ticket_sales_mean_FY2022_2024_usd'],
  'Competitive ceiling': ['sp_rank_mean_2016_2025', 'sp_offense_rank_mean_2016_2025', 'sp_defense_rank_mean_2016_2025']
};
const previousGroups = {
  Finance:'Football resources', 'Roster spending':'Football resources', Recruiting:'Recruiting geography',
  'Fan support':'Fans and tradition', Performance:'Competitive ceiling'
};
const coachingPayroll = 'ncaa_football_coaching_payroll_mean_FY2022_2024_usd';

async function start() {
  const response = await fetch(isOdds ? 'odds.json' : 'rankings.json');
  if (!response.ok) throw new Error('Data request failed');
  const data = await response.json();
  const rows = isOdds ? data.rows : data.programs.map(program => ({...data.panel.find(row => row.school === program.school), ...program}));
  let group = 'Overview';
  let sortKey = isOdds ? 'dec7_probability_pct' : 'rank';
  let ascending = !isOdds;
  const metricIndex = new Map((data.metrics || []).map(metric => [metric.key, metric]));
  metricIndex.set('conference', {key:'conference', format:'text', label:'Conference affiliation', definition:'Current football membership'});
  const framework = isOdds ? '' : '<fieldset class="framework"><legend>Ranking framework · compare programs by category</legend>'+
    '<button type="button" data-group="Overview">Overview</button>'+data.weights.map(([label,weight])=>
      '<button type="button" data-group="'+escapeHtml(label)+'">'+escapeHtml(label)+' <small>'+weight+'%</small></button>').join('')+
    '</fieldset><p id="framework-note" class="count"></p>';
  const controls = isOdds
    ? `<label>Checkpoint<select id="checkpoint"><option value="dec7_probability_pct">December 7, 2026</option><option value="feb1_probability_pct">February 1, 2027</option></select></label>
       <label>Openings<select id="status"><option value="">All tracked situations</option><option value="Announced departure">Announced departures</option><option value="Forecast">Forecasts</option></select></label>
       <label>Minimum odds<select id="minimum-odds"><option value="5">5% or higher</option><option value="0">All odds</option></select></label>`
    : `<label>Find a program<input id="search" type="search" placeholder="School or coach" autocomplete="off"></label><label>Conference<select id="conference"><option value="">All conferences</option>${options([...new Set(rows.map(row=>row.conference))].sort())}</select></label><label>Job tier<select id="tier"><option value="">All tiers</option>${[1,2,3,4,5,6].map(n=>`<option value="${n}">Tier ${n}</option>`).join('')}</select></label>`;
  app.innerHTML = `<div class="tools">${controls}</div>${framework}<div class="tools"><button id="reset-view" type="button">Reset</button><button id="share-view" type="button">Copy view link</button><button id="export-view" type="button">Download filtered data</button></div><p id="snapshot" class="count" hidden></p><p id="count" class="count" aria-live="polite"></p><div class="table-wrap"><table><thead id="head"></thead><tbody id="body"></tbody></table></div><section id="detail" class="detail" hidden aria-live="polite"></section><div class="download">${isOdds ? '<a href="departure_odds.csv" download>Odds CSV</a><a href="departure_support.zip" download>Research notes and data</a>' : '<a href="program_rankings.csv" download>Rankings CSV</a><a href="program_inputs.csv" download>All 79-program inputs</a><a href="supporting_data.zip" download>Supporting source tables</a><a href="source_registry.csv" download>Source registry</a>'}</div><div class="notes">${isOdds ? '<p>Announced departures are shown at 100%. The February checkpoint includes later potential departures. Change is measured against a November 6 reference using the latest saved forecast available then (November 1). No November 6 revision is available; values are carried forward without interpolation. A dash means no comparable baseline. Tracked situations are drawn from the 79-program ranking universe.</p><p>Buyout estimates represent the school’s gross head-coach dismissal obligation. Click a school for the assessment and contract notes. Reporting dates and confidence vary.</p>' : '<p>Rankings and tiers are subjective judgments informed by source observations and calculated comparisons. Reported estimates retain their uncertainty. Category weights describe editorial emphasis, not a published school-level score calculation. See the <a href="../../projects/program-rankings.html" target="_top">ranking methodology</a> for the framework and limitations.</p><p>EADA and NCAA MFRS retain their own definitions. Private-school nondisclosure appears as missing. Attendance mixes official totals and reconstructed observations, and roster-spending amounts are source-specific estimates.</p><details><summary>Data quality and source coverage</summary><p><a href="data_quality.md" target="_blank">Phase 4 validation and limitations</a></p><p>The supporting download contains normalized source tables, the data dictionary, field coverage, provenance, and conflicts. Each source retains its reporting year, unit, and definition.</p></details>'}</div>`;
  const filterIds = isOdds ? ['checkpoint','status','minimum-odds'] : ['search','conference','tier'];
  const params = new URLSearchParams(location.search);
  const defaults = Object.fromEntries(filterIds.map(id=>[id,document.getElementById(id).value]));
  for(const id of filterIds)ViewTools.restore(document.getElementById(id),params.get(id));
  if(isOdds)sortKey=document.getElementById('checkpoint').value;
  else {
    const savedGroup = params.get('group');
    group = Object.hasOwn(frameworkMetrics, savedGroup) ? savedGroup : Object.hasOwn(previousGroups, savedGroup) ? previousGroups[savedGroup] : 'Overview';
  }
  let exportRows = [];
  document.getElementById('reset-view').onclick=()=>{
    for(const id of filterIds)document.getElementById(id).value=defaults[id];
    group='Overview';sortKey=isOdds?defaults.checkpoint:'rank';ascending=!isOdds;
    document.getElementById('detail').hidden=true;render();
  };
  document.getElementById('share-view').onclick=()=>{
    const url=new URL(location.href);
    const view = new URLSearchParams(filterIds.map(id=>[id,document.getElementById(id).value]));
    if (!isOdds && group !== 'Overview') view.set('group', group);
    url.search = view;
    ViewTools.copy(document.getElementById('share-view'),url);
  };
  document.getElementById('export-view').onclick=()=>ViewTools.csv(isOdds?'departure-odds-filtered.csv':'program-rankings-filtered.csv',exportRows);
  function selectedMetrics(category = group) {
    return (frameworkMetrics[category] || []).map(key => metricIndex.get(key));
  }
  function metricPeers(row,metric) {
    const cohort = rows;
    const groups=[{label:'Ranked-program sample (79)',members:cohort},
      {label:'Current P4 sample',members:cohort.filter(x=>String(x.p4_2026)==='True')},
      {label:row.conference+' (current membership)',members:cohort.filter(x=>x.conference===row.conference)}];
    const comparison={value:row[metric.key],lower:metric.key.includes('rank'),format:v=>format(v,metric.format),label:metric.label+' · '+metric.definition,
      cohorts:groups.map(g=>({label:g.label,values:g.members.map(x=>x[metric.key]),includesSelected:g.members.some(x=>x.school===row.school)}))};
    return PeerContext.badges(comparison)+'<details><summary>Peer details</summary>'+PeerContext.comparison(comparison)+'</details>';
  }
  function programMetric(row, metric) {
    if (metric.key === 'conference') {
      return `<div class="metric">${metric.label}<strong>${format(row.conference,'text')}</strong><small>Media revenue, playoff access, and league stability inform the editorial assessment.</small></div>`;
    }
    const sources = data.provenance.filter(p=>p.school === row.school && p.metric === metric.key);
    const provenance = sources.map(p=>`<div class="source">${escapeHtml(p.observation_year || p.period || '')} · ${escapeHtml(p.confidence || 'Confidence unclassified')}<br>${escapeHtml(p.definition || metric.definition)}${p.completeness ? '<br>Completeness '+escapeHtml(p.completeness) : ''}<br>${sourceLinks(p.source_urls || p.sources)}</div>`).join('');
    const detail = metric.key === coachingPayroll ?
      '<p class="metric-breakdown">2024 reported assistant pool <b>'+format(row.assistant_pool_2024_usd,'money')+'</b><small>Overlaps with coaching payroll. Coverage and time periods differ.</small></p>' : '';
    return `<div class="metric">${escapeHtml(metric.label)}<strong>${format(row[metric.key],metric.format)}</strong>${detail}${metricPeers(row,metric)}<details><summary>Definition and sources</summary><p>${escapeHtml(metric.definition)}</p>${provenance || '<p>See the supporting tables for source coverage.</p>'}</details></div>`;
  }
  function showDetail(row) {
    const detail = document.getElementById('detail');
    detail.hidden = false;
    let content = `<div class="details-head"><h2>${TeamLogos.label(row.school)}</h2>${tier(row.tier)}<button id="close" aria-label="Close program details">Close</button></div><p>#${row.rank} · ${escapeHtml(row.conference)}</p>`;
    if (isOdds) {
      content += `<p><strong>${escapeHtml(row.coach)}</strong> · ${escapeHtml(row.status)}</p><div class="metric-grid"><div class="metric">December 7<strong>${row.dec7_probability_pct}%</strong></div><div class="metric">February 1<strong>${row.feb1_probability_pct}%</strong></div><div class="metric">Dismissal buyout estimate<strong>${format(row.dismissal_buyout.amount_usd,'money')}</strong></div></div>${row.two_week_change_pp == null ? '' : `<p><strong>${Number(row.two_week_change_pp)>0?'+':''}${format(row.two_week_change_pp,'number')} percentage points</strong> in December 7 odds since the ${escapeHtml(row.two_week_baseline_source_date || data.comparison_source_date)} forecast.</p>`}<details><summary>What changed and sources</summary><p>${escapeHtml(row.research_note)}</p><p>${sourceLinks(row.research_source)}</p></details>${PeerContext.comparison({value:row.dismissal_buyout.amount_usd,label:'Dismissal buyout estimate · mixed reporting dates; estimates, not synchronized contract valuations',format:v=>format(v,'money'),cohorts:[{label:'Tracked situations ('+rows.length+')',values:rows.map(x=>x.dismissal_buyout.amount_usd)},{label:row.conference+' tracked situations',values:rows.filter(x=>x.conference===row.conference).map(x=>x.dismissal_buyout.amount_usd)}]})}<details><summary>Buyout notes</summary><p>${escapeHtml(row.dismissal_buyout.notes)}</p><p>${escapeHtml(row.dismissal_buyout.applicable_date_or_period)}</p><p>${sourceLinks(row.dismissal_buyout.source_url)}</p></details>`;
    } else {
      content += data.weights.map(([label, weight, definition]) => `<details class="framework-detail"${label===group?' open':''}>
        <summary>${escapeHtml(label)} <span>${weight}% editorial emphasis</span></summary>
        <p class="count">${escapeHtml(definition)}.</p>
        <div class="metric-grid">${selectedMetrics(label).map(metric=>programMetric(row,metric)).join('')}</div>
      </details>`).join('');
      content += '<p class="count"><a href="program_inputs.csv" download>Download alternate ratings, attendance periods, payroll sources, and other inputs</a></p>';
      const coverage = data.coverage.filter(c=>c.school===row.school);
      content += '<details><summary>Field-level source coverage</summary><div class="table-wrap"><table><thead><tr><th>Source family</th><th>Usable metric slots</th><th>Completeness</th></tr></thead><tbody>' + coverage.map(c=>`<tr><td>${escapeHtml(c.source_family)}</td><td>${c.observed_usable_metric_slots} / ${c.eligible_metric_slots}</td><td>${c.field_completeness_percent}%</td></tr>`).join('') + '</tbody></table></div></details>';
    }
    detail.innerHTML = content;
    document.getElementById('close').onclick = ()=>{detail.hidden = true;};
    detail.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function render() {
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
    if (!isOdds) {
      document.querySelectorAll('[data-group]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.group===group)));
      document.getElementById('framework-note').textContent = group === 'Overview'
        ? 'Choose a category to compare its key metrics, or select a program to expand its evidence.'
        : data.weights.find(([label])=>label===group)[2]+'.';
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
      : [['Rank','Program','Conference','Tier',...exportMetrics.map(metric=>metric.label)],
        ...filtered.map(row=>[row.rank,row.school,row.conference,row.tier,...exportMetrics.map(metric=>row[metric.key])])];
    const header = (key,label,definition='')=>`<th scope="col"${sortKey===key?' aria-sort="'+(ascending?'ascending':'descending')+'"':''}><button type="button" data-sort="${key}" data-sort-column>${escapeHtml(label)}</button>${definition?'<small>'+escapeHtml(definition)+'</small>':''}</th>`;
    let columns = header('rank','Rank')+header('school','Program')+header('tier','Job tier');
    if (isOdds) columns = header('school','Program')+header('coach','Coach')+header(checkpoint,'Departure odds')+header('tier','Job tier')+header('buyout_sort','Buyout estimate')+(checkpoint==='dec7_probability_pct'?header('change_sort','Change vs. Nov. 6', 'Reference: last saved Nov. 1 forecast'):'');
    else columns += metrics.map(m=>header(m.key,m.label,m.definition)).join('');
    document.getElementById('head').innerHTML = '<tr>'+columns+'</tr>';
    document.getElementById('body').innerHTML = filtered.map(row=>{
      const school = `<button class="school" data-school="${escapeHtml(row.school)}">${TeamLogos.label(row.school)}</button>`;
      if (isOdds) {
        const probability = row[checkpoint];
        const delta = row.two_week_change_pp;
        return `<tr><td>${school}<div class="status">${escapeHtml(row.status)}</div></td><td>${escapeHtml(row.coach)}</td><td class="bar-cell"><div class="bar-line"><div class="bar-track"><div class="bar-fill" style="width:${probability}%;background:${probability===100?'#c74445':probability>=30?'#d47136':probability>=10?'#c7a63e':'#4a8876'}"></div></div><strong>${format(probability)}%</strong></div></td><td>${tier(row.tier)}</td><td class="number">${format(row.dismissal_buyout.amount_usd,'money')}</td>${checkpoint==='dec7_probability_pct'?'<td class="number delta">'+(delta == null ? '—' : (delta > 0 ? '+' : '') + format(delta) + ' pp')+'</td>':''}</tr>`;
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
