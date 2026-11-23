const search = document.querySelector('#search');
const conference = document.querySelector('#conference');
const category = document.querySelector('#category');
const sort = document.querySelector('#sort');
const results = document.querySelector('#results');
const count = document.querySelector('#count');

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const integer = new Intl.NumberFormat('en-US');
const dollars = value => value === '' ? 'Unverified' : currency.format(Number(value));
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const roundMoneyInText = value => value.replace(/\$(\d[\d,]*\.\d+)\b/g, (_, amount) => currency.format(Number(amount.replaceAll(',', ''))));
const pairs = entries => entries.map(([name, value]) =>
  `<dt>${escape(name)}</dt><dd>${escape(value)}</dd>`).join('');
const numeric = value => value === '' ? -Infinity : Number(value);

function fillOptions(select, key) {
  for (const label of [...new Set(schools.map(row => row[key]))].sort()) {
    select.add(new Option(label, label));
  }
}

function sourceLinks(row, fields) {
  const seen = new Set();
  const links = [];
  for (const [key, label] of fields) {
    const urls = row[key].split(' | ').filter(url => /^https?:\/\//.test(url));
    for (const [index, url] of urls.entries()) {
      if (seen.has(url)) continue;
      seen.add(url);
      const title = urls.length > 1 ? `${label} ${index + 1}` : label;
      links.push(`<li><a href="${escape(url)}" target="_blank" rel="noopener">${escape(title)}</a></li>`);
    }
  }
  return links.length ? `<details class="sources"><summary>Sources</summary><ul>${links.join('')}</ul></details>` : '';
}

function pricingAssumption(row) {
  const note = row.fee_notes;
  if (row.school === 'Oklahoma State') return '15-credit block basis in each of two terms';
  if (note.includes('30 credits')) return '15 credits per term × 2';
  if (row.school === 'Texas Tech') return 'Two full-time terms at the per-term fee cap';
  if (row.school === 'Colorado') return '2026 entering cohort, two regular terms';
  return 'Full-time undergraduate, two regular terms';
}

function feeDetails(row) {
  const feeFields = [
    ['Illustration', pricingAssumption(row)],
    ['Mandatory athletics charge used', dollars(row.annual_athletics_fee_used_usd)],
    ['Published annual fee or component', dollars(row.published_fee_or_component_usd)],
    ['Fee basis', row.fee_basis],
    ['Schedule period', row.fee_schedule_period === 'current_undated' ? 'Current source, undated' : row.fee_schedule_period || 'Unverified'],
    ['FY2025 NCAA student-fee revenue', row.fy2025_reported_student_fee_revenue_usd === '' ? 'Unavailable' : dollars(row.fy2025_reported_student_fee_revenue_usd)],
  ];
  const proxy = Number(row.fy2025_enrollment_proxy_fee_usd);
  const revenue = Number(row.fy2025_reported_student_fee_revenue_usd);
  if (proxy > 0 && revenue > 0) {
    const enrollment = Math.round(revenue / proxy);
    if (Math.abs(revenue / enrollment - proxy) < .001) {
      feeFields.push(['FY2025 enrollment proxy', `About ${integer.format(enrollment)} students`]);
    }
    feeFields.push(['FY2025 estimated amount per student', dollars(proxy)]);
  }
  if (row.school === 'Houston') {
    feeFields.push(['FY2027 advisory enrollment base', '45,375 students']);
    feeFields.push(['FY2027 advisory operating allocation', '$4,187,322']);
  }
  return `<section class="panel"><h2>Tuition and mandatory fees</h2><dl>${pairs(feeFields)}</dl>
    <p>${escape(roundMoneyInText(row.fee_notes))}</p>
    ${sourceLinks(row, [['fee_schedule_source', 'Tuition and fee schedule'], ['fee_detail_source', 'Fee detail'], ['finance_source', 'Athletics finance'], ['enrollment_proxy_source', 'IPEDS enrollment']])}</section>`;
}

function ticketDetails(row) {
  const low = dollars(row.annual_ticket_cost_or_priced_subset_usd);
  const price = row.ticket_range_upper_usd ? `${low}–${dollars(row.ticket_range_upper_usd)}` : low;
  const fields = [['Category', row.category], ['Ticket cost used', price], ['Price coverage', row.ticket_status]];
  return `<section class="panel"><h2>Student ticket options</h2><dl>${pairs(fields)}</dl>
    <p class="package">${escape(roundMoneyInText(row.student_ticket_package))}</p><p>${escape(roundMoneyInText(row.ticket_scope))}</p>
    ${sourceLinks(row, [['ticket_sources', 'Ticket policy']])}</section>`;
}

function schoolRow(row) {
  const total = row.annual_total_or_subtotal_usd;
  const range = row.priced_range_upper_usd;
  const cost = range ? `${dollars(total)}–${dollars(range)}` : dollars(total);
  const partial = row.total_status.startsWith('Incomplete');
  const estimated = row.price_is_approximate === 'True';
  const status = partial && estimated ? 'Est. subtotal' : partial ? 'Subtotal' : estimated ? 'Estimated' : '';
  return `<details class="school" data-school="${escape(row.school)}">
    <summary class="grid">
      <span class="school-name">${escape(row.school)}</span>
      <span class="conference">${escape(row.conference)}</span>
      <span class="amount">${escape(cost)}${status ? `<span class="status">${status}</span>` : ''}</span>
    </summary>
    <div class="breakout">${feeDetails(row)}${ticketDetails(row)}</div>
  </details>`;
}

const sortFields = {
  total: 'annual_total_or_subtotal_usd',
  fee: 'annual_athletics_fee_used_usd',
  ticket: 'annual_ticket_cost_or_priced_subset_usd',
};

function render() {
  const expanded = new Set([...results.querySelectorAll('.school[open]')].map(el => el.dataset.school));
  const query = search.value.trim().toLowerCase();
  const visible = schools.filter(row =>
    row.school.toLowerCase().includes(query) &&
    (!conference.value || row.conference === conference.value) &&
    (!category.value || row.category === category.value));
  const field = sortFields[sort.value];
  visible.sort((a, b) => (field && (numeric(b[field]) - numeric(a[field]))) || a.school.localeCompare(b.school));
  count.textContent = `${visible.length} of ${schools.length} schools`;
  results.innerHTML = visible.length ? visible.map(schoolRow).join('') : '<p class="empty">No schools match these filters.</p>';
  for (const element of results.querySelectorAll('.school')) {
    element.open = expanded.has(element.dataset.school);
  }
}

fillOptions(conference, 'conference');
fillOptions(category, 'category');
search.addEventListener('input', render);
for (const select of [conference, category, sort]) select.addEventListener('change', render);
render();
