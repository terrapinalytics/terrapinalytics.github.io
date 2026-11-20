'use strict';
const app = document.getElementById('app');
const isOdds = document.body.dataset.view === 'odds';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function format(value, type = 'number') {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'text') return escapeHtml(value);
  const number = Number(value);
  if (!Number.isFinite(number)) return escapeHtml(value);
  if (type === 'money') return '$' + (number / 1e6).toFixed(1) + 'M';
  return number.toLocaleString('en-US', {maximumFractionDigits:type === 'integer' ? 0 : 1, minimumFractionDigits:type === 'number' ? 1 : 0});
}
function tier(value) { return `<span class="tier t${Number(value)}">Tier ${Number(value)}</span>`; }
function sourceLinks(value) {
  const urls = [...new Set(String(value || '').match(/https?:\/\/[^\s|;<>"\[\]]+/g) || [])];
  return urls.slice(0, 3).map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Source ${index + 1}</a>`).join(' · ');
}
function options(values) { return values.map(value => `<option>${escapeHtml(value)}</option>`).join(''); }
async function start() {
  const response = await fetch(isOdds ? 'odds.json' : 'rankings.json');
  if (!response.ok) throw new Error('Data request failed');
  const data = await response.json();
  const rows = isOdds ? data.rows : data.programs.map(program => ({...data.panel.find(row => row.school === program.school), ...program}));
  let group = 'Overview';
  let sortKey = isOdds ? 'dec7_probability_pct' : 'rank';
  let ascending = !isOdds;
  let showAllOdds = false;
  const groups = ['Overview', ...new Set((data.metrics || []).map(metric => metric.group))];
  app.innerHTML = `<div class="tools"><label>Find a program<input id="search" type="search" placeholder="School or coach" autocomplete="off"></label><label>Conference<select id="conference"><option value="">All conferences</option>${options([...new Set(rows.map(row=>row.conference))].sort())}</select></label><label>Job tier<select id="tier"><option value="">All tiers</option>${[1,2,3,4,5,6].map(n=>`<option value="${n}">Tier ${n}</option>`).join('')}</select></label>${isOdds ? '<label>Checkpoint<select id="checkpoint"><option value="dec7_probability_pct">December 7, 2026</option><option value="feb1_probability_pct">February 1, 2027</option></select></label><label>Openings<select id="status"><option value="">All tracked situations</option><option value="Forecast">Forecasts</option><option value="Announced departure">Announced departures</option></select></label>' : `<label>Metrics<select id="group">${options(groups)}</select></label>`}</div><p id="count" class="count" aria-live="polite"></p>${isOdds ? '<button id="show-all-odds" type="button" aria-pressed="false">Show all (including under 5%)</button>' : ''}<div class="table-wrap"><table><thead id="head"></thead><tbody id="body"></tbody></table></div><section id="detail" class="detail" hidden aria-live="polite"></section><div class="download">${isOdds ? '<a href="departure_odds.csv" download>Odds CSV</a><a href="departure_support.zip" download>Research notes and data</a>' : '<a href="program_rankings.csv" download>Rankings CSV</a><a href="program_inputs.csv" download>All 79-program inputs</a><a href="supporting_data.zip" download>Supporting source tables</a><a href="source_registry.csv" download>Source registry</a>'}</div><div class="notes">${isOdds ? '<p>Announced departures are shown at 100%. The February checkpoint includes later potential departures. Change is measured against a November 6 reference using the latest saved forecast available then (November 1). No November 6 revision is available; values are carried forward without interpolation. A dash means no comparable baseline. These 25 tracked situations are drawn from the 79-program ranking universe.</p><p>Buyout estimates represent the school’s gross head-coach dismissal obligation. Click a school for the assessment and contract notes. Reporting dates and confidence vary.</p>' : '<p>Rankings and tiers are subjective judgments informed by source observations and calculated comparisons. Reported estimates retain their uncertainty. Category weights describe editorial emphasis, not a published school-level score calculation. See the ranking research above for the framework and limitations.</p><p>EADA and NCAA MFRS retain their own definitions. Private-school nondisclosure appears as missing. Attendance mixes official totals and reconstructed observations, and roster-spending amounts are source-specific estimates.</p><details><summary>Ranking framework and data quality</summary><div id="weights"></div><p><a href="data_quality.md" target="_blank">Phase 4 validation and limitations</a></p><p>The supporting download contains normalized source tables, the data dictionary, field coverage, provenance, and conflicts. Each source retains its reporting year, unit, and definition.</p></details>'}</div>`;
  if (!isOdds) document.getElementById('weights').innerHTML = data.weights.map(([label, weight, definition]) => `<div class="weight"><b>${weight}%</b><span><strong>${escapeHtml(label)}</strong><br>${escapeHtml(definition)}</span></div>`).join('');
  function selectedMetrics() {
    const keys = ['eada_football_expenses_mean_FY2022_2024_2025usd','sp_rank_mean_2016_2025','recruiting_rank_mean_2021_2025','attendance_average_mean_2022_2024_phase4'];
    return data.metrics.filter(metric => group === 'Overview' ? keys.includes(metric.key) : metric.group === group);
  }
  function metricPeers(row,metric) {
    const cohort=data.programs.map(p=>({...data.panel.find(x=>x.school===p.school),...p}));
    const groups=[{label:'Ranked-program sample (79)',members:cohort},
      {label:'Current P4 sample',members:cohort.filter(x=>String(x.p4_2026)==='True')},
      {label:row.conference+' (current membership)',members:cohort.filter(x=>x.conference===row.conference)}];
    return PeerContext.comparison({value:row[metric.key],lower:metric.key.includes('rank'),format:v=>format(v,metric.format),label:metric.label+' · '+metric.definition,
      cohorts:groups.map(g=>({label:g.label,values:g.members.map(x=>x[metric.key]),includesSelected:g.members.some(x=>x.school===row.school)}))});
  }
  function showDetail(row) {
    const detail = document.getElementById('detail');
    detail.hidden = false;
    let content = `<div class="details-head"><h2>${TeamLogos.label(row.school)}</h2>${tier(row.tier)}<button id="close" aria-label="Close program details">Close</button></div><p>#${row.rank} · ${escapeHtml(row.conference)}</p>`;
    if (isOdds) {
      content += `<p><strong>${escapeHtml(row.coach)}</strong> · ${escapeHtml(row.status)}</p><div class="metric-grid"><div class="metric">December 7<strong>${row.dec7_probability_pct}%</strong></div><div class="metric">February 1<strong>${row.feb1_probability_pct}%</strong></div><div class="metric">Dismissal buyout estimate<strong>${format(row.dismissal_buyout.amount_usd,'money')}</strong></div></div><p>${escapeHtml(row.research_note)}</p><p>${sourceLinks(row.research_source)}</p>${PeerContext.comparison({value:row.dismissal_buyout.amount_usd,label:'Dismissal buyout estimate · mixed reporting dates; estimates, not synchronized contract valuations',format:v=>format(v,'money'),cohorts:[{label:'Tracked situations (25)',values:rows.map(x=>x.dismissal_buyout.amount_usd)},{label:row.conference+' tracked situations',values:rows.filter(x=>x.conference===row.conference).map(x=>x.dismissal_buyout.amount_usd)}]})}<details><summary>Buyout notes</summary><p>${escapeHtml(row.dismissal_buyout.notes)}</p><p>${escapeHtml(row.dismissal_buyout.applicable_date_or_period)}</p><p>${sourceLinks(row.dismissal_buyout.source_url)}</p></details>`;
    } else {
      const metrics = group === 'Overview' ? data.metrics : selectedMetrics();
      content += '<div class="metric-grid">' + metrics.map(metric => {
        const sources = data.provenance.filter(p=>p.school === row.school && p.metric === metric.key);
        const provenance = sources.map(p=>`<div class="source">${escapeHtml(p.observation_year || p.period || '')} · ${escapeHtml(p.confidence || 'Confidence unclassified')}<br>${escapeHtml(p.definition || metric.definition)}${p.completeness ? '<br>Completeness '+escapeHtml(p.completeness) : ''}<br>${sourceLinks(p.source_urls || p.sources)}</div>`).join('');
        return `<div class="metric">${escapeHtml(metric.label)}<strong>${format(row[metric.key],metric.format)}</strong><small>${escapeHtml(metric.definition)}</small>${provenance || '<div class="source">See the supporting tables for source-level coverage.</div>'}${metricPeers(row,metric)}</div>`;
      }).join('') + '</div>';
      const coverage = data.coverage.filter(c=>c.school===row.school);
      content += '<details><summary>Field-level source coverage</summary><div class="table-wrap"><table><thead><tr><th>Source family</th><th>Usable metric slots</th><th>Completeness</th></tr></thead><tbody>' + coverage.map(c=>`<tr><td>${escapeHtml(c.source_family)}</td><td>${c.observed_usable_metric_slots} / ${c.eligible_metric_slots}</td><td>${c.field_completeness_percent}%</td></tr>`).join('') + '</tbody></table></div></details>';
    }
    detail.innerHTML = content;
    document.getElementById('close').onclick = ()=>{detail.hidden = true;};
    detail.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function render() {
    const query = document.getElementById('search').value.toLowerCase().trim();
    const conference = document.getElementById('conference').value;
    const chosenTier = document.getElementById('tier').value;
    const checkpoint = isOdds ? document.getElementById('checkpoint').value : '';
    const status = isOdds ? document.getElementById('status').value : '';
    const filtered = rows.filter(row=>(row.school+' '+(row.coach||'')).toLowerCase().includes(query) && (!conference||row.conference===conference) && (!chosenTier||row.tier===Number(chosenTier)) && (!status||row.status===status) && (!isOdds||showAllOdds||row[checkpoint]>=5));
    filtered.sort((a,b)=>{
      const left = a[sortKey], right = b[sortKey];
      if (left === '' || left == null) return right === '' || right == null ? 0 : 1;
      if (right === '' || right == null) return -1;
      const difference = Number.isFinite(Number(left)) && Number.isFinite(Number(right)) ? Number(left)-Number(right) : String(left).localeCompare(String(right));
      return (ascending ? difference : -difference) || a.rank-b.rank;
    });
    const header = (key,label,definition='')=>`<th scope="col"${sortKey===key?' aria-sort="'+(ascending?'ascending':'descending')+'"':''}><button data-sort="${key}">${escapeHtml(label)}</button>${definition?'<small>'+escapeHtml(definition)+'</small>':''}</th>`;
    let columns = header('rank','Rank')+header('school','Program')+header('tier','Job tier');
    if (isOdds) columns = header('school','Program')+header('coach','Coach')+header(checkpoint,'Departure odds')+header('tier','Job tier')+header('buyout_sort','Buyout estimate')+(checkpoint==='dec7_probability_pct'?header('change_sort','Change vs. Nov. 6', 'Reference: last saved Nov. 1 forecast'):'');
    else columns += selectedMetrics().map(m=>header(m.key,m.label,m.definition)).join('');
    document.getElementById('head').innerHTML = '<tr>'+columns+'</tr>';
    document.getElementById('body').innerHTML = filtered.map(row=>{
      const school = `<button class="school" data-school="${escapeHtml(row.school)}">${TeamLogos.label(row.school)}</button>`;
      if (isOdds) {
        const probability = row[checkpoint];
        const delta = row.two_week_change_pp;
        return `<tr><td>${school}<div class="status">${escapeHtml(row.status)}</div></td><td>${escapeHtml(row.coach)}</td><td class="bar-cell"><div class="bar-line"><div class="bar-track"><div class="bar-fill" style="width:${probability}%;background:${probability===100?'#c74445':probability>=30?'#d47136':probability>=10?'#c7a63e':'#4a8876'}"></div></div><strong>${probability}%</strong></div></td><td>${tier(row.tier)}</td><td class="number">${format(row.dismissal_buyout.amount_usd,'money')}</td>${checkpoint==='dec7_probability_pct'?'<td class="number delta">'+(delta>0?'+':'')+delta+' pp</td>':''}</tr>`;
      }
      return `<tr><td class="number">${row.rank}</td><td>${school}<div class="status">${escapeHtml(row.conference)}</div></td><td>${tier(row.tier)}</td>${selectedMetrics().map(m=>`<td class="number">${format(row[m.key],m.format)}</td>`).join('')}</tr>`;
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
  if(isOdds) document.getElementById('show-all-odds').onclick=()=>{showAllOdds=!showAllOdds;const b=document.getElementById('show-all-odds');b.textContent=showAllOdds?'Hide under 5%':'Show all (including under 5%)';b.setAttribute('aria-pressed',String(showAllOdds));render();};
  document.getElementById('search').oninput=render;
  for(const id of ['conference','tier','status']) {const element=document.getElementById(id);if(element) element.onchange=render;}
  if (isOdds) document.getElementById('checkpoint').onchange=()=>{sortKey=document.getElementById('checkpoint').value;ascending=false;render();};
  else document.getElementById('group').onchange=()=>{group=document.getElementById('group').value;sortKey='rank';ascending=true;document.getElementById('detail').hidden=true;render();};
  render();
  app.setAttribute('aria-busy','false');
}
start().catch(()=>{app.innerHTML='<p class="error">The dashboard data could not load. Reload the page or use the CSV download.</p><p><a href="'+(isOdds?'departure_odds.csv':'program_inputs.csv')+'">Download data</a></p>';app.setAttribute('aria-busy','false');});
