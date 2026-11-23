'use strict';
(() => {
  const settings = new WeakMap();
  const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});

  function number(text) {
    const match = text.replaceAll(',', '').replaceAll('−', '-')
      .match(/^(?:FY\s*|\$\s*)?([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?=$|[%\s–/])/i);
    return match ? Number(match[1]) : null;
  }

  function keyOf(cell) {
    const text = (cell.dataset.sortValue ?? cell.textContent).trim();
    return {text, value: number(text), missing: /^(?:—|–|-|n\/a|unverified)?$/i.test(text)};
  }

  function sortableRows(body, count) {
    return [...body.rows].filter(row => row.cells.length === count &&
      [...row.cells].every(cell => cell.colSpan === 1) && !row.classList.contains('total-row'));
  }

  function apply(table, state) {
    if (state.column === undefined) return;
    const {column, direction} = state;
    const header = table.tHead.rows[0];
    [...header.cells].forEach((cell, i) => {
      if (i === column) cell.setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending');
      else cell.removeAttribute('aria-sort');
    });
    for (const body of table.tBodies) {
      const rows = sortableRows(body, header.cells.length);
      const keys = rows.map(row => ({row,...keyOf(row.cells[column])}));
      const numeric = keys.every(key => key.missing || key.value !== null);
      keys.sort((a,b) => Number(a.missing)-Number(b.missing) ||
        direction*(numeric ? a.value-b.value : collator.compare(a.text,b.text)));
      const sorted = keys.map(key => key.row);
      if (sorted.some((row,i) => row !== rows[i])) sorted.forEach(row => body.append(row));
    }
  }

  function enhance(table) {
    if (table.matches('[data-own-sort]') || !table.tHead || table.tHead.rows.length !== 1) return;
    const header = table.tHead.rows[0];
    if ([...header.cells].some(cell => cell.colSpan !== 1 || cell.querySelector('button:not([data-table-sort])'))) return;
    let state = settings.get(table);
    if (!state) settings.set(table, state = {});
    [...header.cells].forEach((cell, i) => {
      if (cell.querySelector('[data-table-sort]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.tableSort = '';
      button.append(...cell.childNodes);
      button.addEventListener('click', () => {
        const values = [...table.tBodies].flatMap(body => sortableRows(body,header.cells.length))
          .map(row => keyOf(row.cells[i])).filter(key => !key.missing);
        state.direction = state.column === i ? -state.direction
          : values.length && values.every(key => key.value !== null) ? -1 : 1;
        state.column = i;
        apply(table,state);
      });
      cell.append(button);
    });
    apply(table,state);
  }

  function refresh() { document.querySelectorAll('table').forEach(enhance); }
  refresh();
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 &&
      (node.matches('table,thead,tbody,tr') || node.querySelector('table,thead,tbody,tr'))))) refresh();
  });
  observer.observe(document.body,{childList:true,subtree:true});
})();
