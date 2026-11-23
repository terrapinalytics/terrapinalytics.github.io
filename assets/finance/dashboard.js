let view = "compare", exportRows = [];
async function loadData(){const b64=await fetch('data.packed.txt').then(r=>{if(!r.ok)throw new Error('Data request '+r.status);return r.text()});const raw=Uint8Array.from(atob(b64.trim()),c=>c.charCodeAt(0));const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));return JSON.parse(await new Response(stream).text())}
const METRICS={NCAA:[['rev','Athletics revenue'],['exp','Athletics expenditure'],['fbexp','Football expenditure'],['tickets','Ticket revenue (athletics-wide)'],['donors','Donor contributions (athletics-wide)'],['media','Conference / NCAA / media revenue'],['support','Total reported subsidies'],['fees','Student fees revenue'],['aid','Athlete aid / benefits expense'],['coaches','Coaches compensation expense'],['debt','Annual debt service']],EADA:[['rev','Athletics revenue'],['exp','Athletics expenditure'],['fbexp','Football allocated expenditure'],['fbrev','Football attributed revenue'],['recruit','Recruiting expense (athletics-wide)'],['aid','Athlete aid / benefits expense'],['mrev','Men’s basketball attributed revenue'],['wrev','Women’s basketball attributed revenue']]};

const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, char => (
  {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]
));
const CPI_BASE = 2025;
// BLS CPI-U, U.S. city average, all items, calendar-year annual averages.
const CPI = [
  177.1, 179.9, 184.0, 188.9, 195.3, 201.6, 207.342, 215.303, 214.537,
  218.056, 224.939, 229.594, 232.957, 236.736, 237.017, 240.007, 245.120,
  251.107, 255.657, 258.811, 270.970, 292.655, 304.702, 313.689, 321.943
];
const POWER_CONFERENCES = new Set(['ACC', 'Big Ten', 'Big 12', 'SEC']);
const COMPARISON_COLORS = ['#7c3da4', '#147e70', '#a86211', '#566b9c'];
const amountFormat = new Intl.NumberFormat(undefined, {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0
});
const axisAmountFormat = new Intl.NumberFormat(undefined, {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1
});
let DATA = [];
let comparisonSchools = [];

function money(value) {
  if (value == null) return '—';
  return amountFormat.format(value);
}

function fiscalPeriod(year, window) {
  return window === 1 ? `FY${year}` : `FY${year - window + 1}–FY${year}`;
}

function option(value, label = value) {
  return `<option value="${esc(value)}">${esc(label)}</option>`;
}

function setSchoolOptions() {
  const selected = $('school').value;
  const schools = [...new Set(DATA.map(row => row.s))].sort();
  $('school').innerHTML = option('', 'Maryland (default)') + schools.map(school => option(school)).join('');
  $('school').value = schools.includes(selected) ? selected : '';
}

function setYearOptions() {
  const selected = Number($('year').value);
  const window = Number($('window').value);
  const years = [...new Set(DATA.filter(row => row.a === $('source').value).map(row => row.y))].sort((a,b) => b-a);
  const endingYears = years.filter(year => year >= years.at(-1) + window - 1);
  $('year').innerHTML = endingYears.map(year => option(year, fiscalPeriod(year, window))).join('');
  $('year').value = endingYears.includes(selected) ? String(selected) : String(endingYears[0]);
}

function sourceChanged(shouldRender = true) {
  const metrics = METRICS[$('source').value];
  const selected = $('metric').value;
  $('metric').innerHTML = metrics.map(([key,label]) => option(key, label)).join('');
  $('metric').value = metrics.some(([key]) => selected === key) ? selected : 'rev';
  setYearOptions();
  if (shouldRender) render();
}

function isFlaggedFootballExpense(row, metric) {
  return metric === 'fbexp' && row?.fbexpFlagged === true;
}

function metricValue(row, metric, real) {
  if (!row || row[metric] == null) return null;
  if (isFlaggedFootballExpense(row, metric)) return null;
  if (!real) return row[metric];
  const index = CPI[row.y - 2001];
  return index ? row[metric] * CPI[CPI_BASE - 2001] / index : null;
}

function schoolSeries(records, years, metric, window, real) {
  const schools = new Map();
  for (const row of records) {
    if (!schools.has(row.s)) schools.set(row.s, {school:row.s, conference:row.c, rows:new Map()});
    schools.get(row.s).rows.set(row.y, row);
  }
  return [...schools.values()].sort((a,b) => a.school.localeCompare(b.school)).map(school => {
    const periods = years.map(year => {
      const rows = Array.from({length: window}, (_, index) => school.rows.get(year - window + 1 + index));
      const values = rows.map(row => metricValue(row, metric, real)).filter(value => value != null);
      return {
        value: values.length === window ? values.reduce((sum,value) => sum + value, 0) / window : null,
        count: values.length,
        rows
      };
    });
    return {...school, periods};
  });
}

function peerLine(label, color, dash, schools, years) {
  const counts = [];
  const values = years.map((_, index) => {
    const reported = schools.map(school => school.periods[index].value).filter(value => value != null);
    counts.push(reported.length);
    return reported.length ? reported.reduce((sum,value) => sum + value, 0) / reported.length : null;
  });
  return {label, color, dash, counts, values};
}

function pointLabel(line, index) {
  const value = money(line.values[index]);
  return line.counts ? `${value} (n=${line.counts[index]})` : value;
}

function renderChart(series, years, window) {
  const amounts = series.flatMap(line => line.values).filter(value => value != null);
  if (!amounts.length) {
    $('trend').innerHTML = '<p class="disabled">No reported values for these selections</p>';
    $('trend-values').innerHTML = '';
    return;
  }
  const compact = window.matchMedia?.("(max-width:700px)").matches;
  const width = compact ? Math.max(240, $('trend').clientWidth) : 700;
  const height = compact ? 240 : 300, left = compact ? 62 : 78, right = 24, top = 18, bottom = 38;
  const min = Math.min(0, ...amounts) * 1.05;
  const max = Math.max(1, ...amounts) * 1.05;
  const x = index => left + index * (width - left - right) / Math.max(1, years.length - 1);
  const y = value => top + (max - value) * (height - top - bottom) / (max - min);
  const baseline = `<line x1="${left}" y1="${y(0)}" x2="${width-right}" y2="${y(0)}" stroke="#bfc5cb"/>`;
  const grid = Array.from({length:5}, (_,i) => min + (max-min)*i/4).map(value => `
    <line x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}" stroke="#e9edf2"/>
    <text x="${left-7}" y="${y(value)+4}" text-anchor="end">${axisAmountFormat.format(value)}</text>`).join('');
  const yearStep = Math.ceil(years.length / (compact ? 4 : 6));
  const ticks = years.map((year,i) => i % yearStep === 0 || i === years.length - 1
    ? `<text x="${x(i)}" y="${height-12}" text-anchor="middle">${year}</text>` : '').join('');
  const lines = series.map(line => {
    let path = '';
    let connected = false;
    const points = line.values.map((value, i) => {
      if (value == null) {
        connected = false;
        return '';
      }
      path += `${connected ? 'L' : 'M'}${x(i)},${y(value)} `;
      connected = true;
      return `<circle cx="${x(i)}" cy="${y(value)}" r="3.8" fill="${line.color}"><title>${esc(line.label)} · ${fiscalPeriod(years[i],window)} · ${pointLabel(line,i)}</title></circle>`;
    }).join('');
    return `<path d="${path}" fill="none" stroke="${line.color}" stroke-width="2.6" stroke-dasharray="${line.dash || 'none'}"/>${points}`;
  }).join('');
  $('trend').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="trend-chart-title">
    <title id="trend-chart-title">School and peer financial trends by ending fiscal year</title>${grid}${baseline}${ticks}${lines}</svg>`;
  $('trend-values').innerHTML = `<thead><tr><th scope="col">Fiscal period</th>${series.map(line => `<th scope="col">${esc(line.label)}</th>`).join('')}</tr></thead>
    <tbody>${years.map((year,i) => `<tr><th scope="row">${fiscalPeriod(year,window)}</th>${series.map(line => `<td data-sort-value="${line.values[i] ?? ''}">${pointLabel(line,i)}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function renderSchoolComparison(schools, index, period, dollars) {
  const shown = schools.filter(school => school.periods[index].value != null)
    .sort((a,b) => b.periods[index].value - a.periods[index].value);
  const values = shown.map(school => school.periods[index].value);
  const max = Math.max(1, ...values.map(Math.abs));
  $('comparison-period').textContent = `${period} · ${dollars}`;
  $('stats').innerHTML = [
    ['Reporting schools', shown.length],
    ['Median', values.length ? money(PeerContext.stats(0,values).median) : '—'],
    ['Highest', money(values[0])],
    ['Missing / incomplete', schools.length - shown.length]
  ].map(([label,value]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`).join('');
  $('bars').innerHTML = shown.map(school => {
    const value = school.periods[index].value;
    return `<div class="barrow"><button type="button" class="name school-link" data-school="${esc(school.school)}">${TeamLogos.label(school.school)}</button>
      <div class="track"><div class="fill" style="width:${100 * Math.abs(value) / max}%"></div></div>
      <b>${money(value)}</b></div>`;
  }).join('') || '<p class="disabled">No reported amounts</p>';
}

function renderDetail(schools, index, metric, period, window) {
  $('rows').innerHTML = schools.map(school => {
    const {value,count,rows} = school.periods[index];
    const row = rows.at(-1);
    const flagged = rows.some(item => isFlaggedFootballExpense(item, metric));
    const coverage = window === 1
      ? flagged ? 'Flagged reported zero · excluded from comparisons' : row?.status || 'No report'
      : `${count}/${window} usable years${flagged ? ' · includes a flagged FY2012 report' : ''}`;
    const links = rows.filter(Boolean).map(item => {
      const url = item.metricSources?.[metric] || item.source;
      return url?.startsWith('https://') ? `<a href="${esc(url)}" target="_blank" rel="noopener">${window === 1 ? 'Source' : 'FY'+item.y}</a>` : '';
    }).filter(Boolean).join(' · ');
    return `<tr><td>${TeamLogos.label(school.school)}</td><td>${period}</td><td>${row?.a || '—'}</td>
      <td>${esc(coverage)}</td><td class="num" data-sort-value="${value ?? ''}">${money(value)}</td><td>${links || '—'}</td></tr>`;
  }).join('');
}

function render() {
  const source = $('source').value;
  const metric = $('metric').value;
  const window = Number($('window').value);
  const endYear = Number($('year').value);
  const conference = view === 'compare' ? $('conference').value : '';
  const real = $('dollars').value === 'real';
  const dollars = real ? '2025 USD (CPI-U)' : 'Nominal USD';
  const records = DATA.filter(row => row.a === source);
  const allYears = [...new Set(records.map(row => row.y))].sort((a,b) => a-b);
  const years = allYears.slice(window-1);
  const index = years.indexOf(endYear);
  const period = fiscalPeriod(endYear, window);
  const schools = schoolSeries(records, years, metric, window, real);
  const filtered = schools.filter(school => !conference || school.conference === conference);
  const selected = view === 'trend' ? $('school').value : '';
  const primary = schools.find(school => school.school === selected) ||
    schools.find(school => school.school === 'Maryland') || schools[0];
  const peers = schools.filter(school => POWER_CONFERENCES.has(school.conference));
  const conferencePeers = schools.filter(school => school.conference === primary.conference);
  comparisonSchools = comparisonSchools.filter(name => name !== primary.school && schools.some(school=>school.school===name));
  const groups = [
    {label:'Power Four reporting sample', schools:peers},
    {label:primary.conference+' reporting sample', schools:conferencePeers}
  ];
  if (!POWER_CONFERENCES.has(primary.conference)) {
    groups.splice(1,0,{label:'Ranked G6 reporting sample', schools:schools.filter(school => !POWER_CONFERENCES.has(school.conference))});
  }

  const trending = view === 'trend';
  $('compare-view').setAttribute('aria-pressed', !trending);
  $('trend-view').setAttribute('aria-pressed', trending);
  for (const id of ['stats','comparison-panel','conference-field']) $(id).hidden = trending;
  for (const id of ['trend-panel','school-field']) $(id).hidden = !trending;
  $('year-label').textContent = trending ? 'Reporting detail ends in' : 'Ending fiscal year';
  const detailSchools = trending ? [primary] : filtered;
  renderDetail(detailSchools, index, metric, period, window);
  $('share').textContent = 'Copy view link';
  if (!trending) {
    renderSchoolComparison(filtered, index, period, dollars);
    exportRows = [['School','Fiscal period','Source','Metric','Dollar basis','Value'],
      ...filtered.map(school => [school.school, period, source, metric, dollars, school.periods[index].value])];
    return;
  }
  const series = [
    {label:primary.school, color:'#b51633', values:primary.periods.map(point => point.value)},
    peerLine('Power Four average', '#1c4f88', '7 4', peers, years),
    peerLine(primary.conference+' average', '#596474', '2 4', conferencePeers, years),
    ...comparisonSchools.map((name,i) => ({
      label:name, color:COMPARISON_COLORS[i], removable:true,
      values:schools.find(school => school.school === name).periods.map(point => point.value)
    }))
  ];
  const metricLabel = METRICS[source].find(([key]) => key === metric)[1];
  const trendBasis = window === 1 ? 'Annual values' : `Trailing ${window}-year averages`;
  $('trendlabel').textContent = `${metricLabel} · ${dollars} · ${trendBasis}`;
  renderChart(series, years, window);
  exportRows = [['Fiscal period','Source','Metric','Dollar basis',...series.map(line => line.label)],
    ...years.map((year,i) => [fiscalPeriod(year,window),source,metric,dollars,...series.map(line => line.values[i])])];
  $('comparison-school').disabled = comparisonSchools.length >= COMPARISON_COLORS.length;
  $('comparison-school').innerHTML = option('', $('comparison-school').disabled ? 'Four comparisons added' : 'Choose a school') +
    schools.filter(school => school.school !== primary.school && !comparisonSchools.includes(school.school))
      .map(school => option(school.school)).join('');
  $('legend').innerHTML = series.map(line => `<span><i style="border-color:${line.color};border-top-style:${line.dash ? 'dashed' : 'solid'}"></i>${esc(line.label)}${line.removable ? ` <button type="button" class="remove-school" data-school="${esc(line.label)}" aria-label="Remove ${esc(line.label)}">×</button>` : ''}</span>`).join('');
  const snapshot = {
    value:primary.periods[index].value, format:money, label:`${primary.school} · ${period} · ${source} · ${dollars}`,
    cohorts:groups.map(group => ({
      label:group.label, shortLabel:group.label.replace(' reporting sample',''),
      values:group.schools.map(school => school.periods[index].value),
      includesSelected:group.schools.includes(primary)
    }))
  };
  const ranks = PeerContext.badges(snapshot);
  $('trend-headline').innerHTML = `<small>${esc(primary.school)} · ${period}</small><strong>${money(snapshot.value)}</strong>`+
    (ranks || '<small>Peer rank unavailable for this source and period.</small>')+
    '<button class="btn" type="button" id="reporting-link">Open reporting years and sources</button>';
  $('peer-context').innerHTML = PeerContext.comparison(snapshot);

}

loadData().then(data => {
  DATA = data.records;
  const params = new URLSearchParams(location.search);
  view = params.get('view') === 'trend' ? 'trend' : 'compare';
  for (const id of ['source','conference','window','dollars']) ViewTools.restore($(id), params.get(id));
  sourceChanged(false);
  ViewTools.restore($('metric'), params.get('metric'));
  ViewTools.restore($('year'), params.get('year'));
  $('school').value = 'Maryland';
  ViewTools.restore($('school'), params.get('school'));
  const eligible = new Set(DATA.map(row => row.s));
  comparisonSchools = [...new Set(params.getAll('compare'))].filter(name => eligible.has(name)).slice(0,4);
  for (const key of ['compare','trend']) $(key + '-view').onclick = () => {
    view = key;
    setSchoolOptions();
    render();
  };
  $('bars').onclick = event => {
    const name = event.target.closest('[data-school]')?.dataset.school;
    if (!name) return;
    view = 'trend';
    $('school').value = name;
    render();
    $('trend-view').focus();
  };
  $('trend-headline').addEventListener('click', event => {
    if (event.target.id !== 'reporting-link') return;
    const detail = $('reporting-detail');
    detail.open = true;
    detail.querySelector('summary').focus();
    detail.scrollIntoView({block:'nearest'});
  });
  $('share').onclick = () => {
    const url = new URL(location.href);
    url.search = new URLSearchParams({view, ...Object.fromEntries(['source','metric','conference','window','year','school','dollars'].map(id => [id,$(id).value]))});
    for (const school of comparisonSchools) url.searchParams.append('compare', school);
    ViewTools.copy($('share'), url);
  };
  $('export').onclick = () => ViewTools.csv('athletics-financials.csv', exportRows);
  $('source').addEventListener('change', sourceChanged);
  for (const id of ['metric','year','school','dollars']) $(id).addEventListener('change', render);
  $('window').addEventListener('change', () => {
    setYearOptions();
    render();
  });
  $('conference').addEventListener('change', () => {
    setSchoolOptions();
    render();
  });
  $('comparison-school').addEventListener('change', event => {
    if (!event.target.value) return;
    comparisonSchools.push(event.target.value);
    render();
  });
  $('legend').addEventListener('click', event => {
    const name = event.target.dataset.school;
    if (!name) return;
    comparisonSchools = comparisonSchools.filter(school => school !== name);
    render();
    $('comparison-school').focus();
  });
  $('reset').addEventListener('click', () => {
    view = 'compare';
    $('source').value = 'NCAA';
    $('metric').value = 'rev';
    $('conference').value = '';
    $('dollars').value = 'nominal';
    $('window').value = '1';
    $('year').value = '';
    comparisonSchools = [];
    setSchoolOptions();
    $('school').value = 'Maryland';
    sourceChanged();
  });
  render();
}).catch(error => {
  $('stats').textContent = 'Unable to load financial data: ' + error.message;
});

const chartLayout = matchMedia('(max-width:700px)');
let chartWidth = $('trend').clientWidth;
new ResizeObserver(() => {
  const width = $('trend').clientWidth;
  if (width === chartWidth) return;
  chartWidth = width;
  if (chartLayout.matches && $('trend').querySelector('svg')) render();
}).observe($('trend'));
chartLayout.addEventListener('change', () => {
  if ($('trend').querySelector('svg')) render();
});
