/* Shared controls for the Explore dashboards. */
window.ViewTools = {
  restore(control, value) {
    if (value === null || !control) return;
    if (control.type === 'checkbox') control.checked = value === '1';
    else if (control.tagName !== 'SELECT' || Array.from(control.options).some(option => option.value === value)) control.value = value;
  },
  async copy(button, url) {
    try {
      await navigator.clipboard.writeText(String(url));
      button.textContent = 'View link copied';
    } catch {
      window.prompt('Copy view link', String(url));
    }
  },
  csv(filename, rows) {
    const escape = value => {
      let text = String(value ?? '');
      if (typeof value === 'string' && /^[=+@\-\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const url = URL.createObjectURL(new Blob([rows.map(row => row.map(escape).join(',')).join('\r\n')], {type: 'text/csv;charset=utf-8'}));
    const link = Object.assign(document.createElement('a'), {href: url, download: filename});
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};
