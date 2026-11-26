(() => {
  const mobile = matchMedia('(max-width: 991.98px)');
  for (const id of ['nav-menu-explore', 'nav-menu-articles']) {
    const toggle = document.getElementById(id);
    const menu = toggle?.nextElementSibling;
    if (!menu?.matches('.dropdown-menu')) continue;
    const headings = [...menu.children].filter(item => item.matches('.dropdown-header'));
    const sections = [];
    for (const heading of headings) {
      const items = [];
      for (let item = heading.nextElementSibling; item && !item.matches('.dropdown-header'); item = item.nextElementSibling) {
        items.push(item);
      }
      const section = document.createElement('li');
      section.className = 'mobile-menu-category';
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = heading.textContent.trim();
      // Opening a category should leave the enclosing Bootstrap menu open.
      summary.addEventListener('click', event => event.stopPropagation());
      const list = document.createElement('ul');
      details.append(summary, list);
      section.append(details);
      sections.push({heading,items,section,list});
    }
    function update() {
      for (const {heading,items,section,list} of sections) {
        heading.hidden = mobile.matches;
        if (mobile.matches) {
          heading.after(section);
          list.append(...items);
        } else {
          heading.after(...items);
          section.remove();
        }
      }
    }
    mobile.addEventListener('change',update);
    update();
  }
})();
