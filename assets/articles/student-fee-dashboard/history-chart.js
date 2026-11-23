'use strict';
(() => {
  const chart = document.getElementById('fee-chart');
  const controls = document.getElementById('school-series');
  const summary = document.getElementById('chart-selection');
  const data = new Map();
  for (const row of document.querySelectorAll('#history tbody tr')) {
    const school = row.dataset.school;
    const year = Number(row.cells[1].textContent.trim().slice(0,4));
    if (!data.has(school)) data.set(school,new Map());
    // Annual charges are in whole dollars. Fiscal-year revenue is a separate measure.
    if (row.dataset.rate === 'true') data.get(school).set(year,Number(row.cells[2].textContent.replace(/[^\d.]/g,'')));
    for (const i of [2,4,5]) row.cells[i].dataset.sortValue = row.cells[i].firstChild?.textContent.trim() ?? '';
  }
  const names = [...data.keys()].sort();
  const defaultColors = {'Maryland':'#972039','Virginia Tech':'#5E254E','Georgia Tech':'#835B11','UCF':'#236460'};
  const choices = names.map((name,i) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Object.hasOwn(defaultColors,name);
    const color = defaultColors[name] ?? `hsl(${Math.round((i*137.508)%360)} 68% 36%)`;
    const swatch = document.createElement('span');
    swatch.className = 'series-color';
    swatch.style.backgroundColor = color;
    swatch.setAttribute('aria-hidden','true');
    label.append(input, swatch, name);
    controls.append(label);
    input.addEventListener('change',render);
    return {name,input,color};
  });
  const start=2009,end=2026,left=68,right=897,top=25,bottom=289;
  const format = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
  const yearLabel = year => `${year}–${String((year+1)%100).padStart(2,'0')}`;
  const x = year => left+(right-left)*(year-start)/(end-start);

  function svg(tag, attributes, content) {
    const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,value);
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function render() {
    const selected=choices.filter(choice=>choice.input.checked);
    summary.textContent=selected.length ? 'Showing '+selected.map(choice=>choice.name).join(', ')+'.' : 'Select at least one school.';
    chart.replaceChildren(svg('title',{id:'chart-title'},'Published annual student athletics fees'),
      svg('desc',{id:'chart-summary'},summary.textContent+' Annual observations are also available in the table below.'));
    const max=Math.max(100,...selected.flatMap(choice=>[...data.get(choice.name).values()]));
    const step=[25,50,100,200,250,500,1000].find(size=>size>=max/5)??Math.ceil(max/500)*100;
    const upper=Math.ceil(max/step)*step;
    const y=value=>bottom-(bottom-top)*value/upper;
    for(let v=0;v<=upper;v+=step){
      chart.append(svg('line',{x1:left,x2:right,y1:y(v),y2:y(v),stroke:'#d9dedf'}),
        svg('text',{x:left-9,y:y(v)+4,'text-anchor':'end',fill:'#47525a','font-size':13},format.format(v)));
    }
    for(let year=start;year<=end;year++){
      if((year-start)%3 && year!==end) continue;
      chart.append(svg('text',{x:x(year),y:320,'text-anchor':year===end?'end':'middle',fill:'#47525a','font-size':13},yearLabel(year)));
    }
    for(const choice of selected){
      const rates=data.get(choice.name);
      let path='',previous=null;
      for(const [year,value] of rates){
        path+=(previous===year-1?' L':' M')+x(year)+' '+y(value);
        previous=year;
      }
      chart.append(svg('path',{d:path,fill:'none',stroke:choice.color,'stroke-width':2.4,'stroke-linejoin':'round'}));
      for(const [year,value] of rates){
        const point=svg('circle',{cx:x(year),cy:y(value),r:3.7,fill:choice.color,stroke:'#fff','stroke-width':.75});
        point.append(svg('title',{},choice.name+' · '+yearLabel(year)+' · '+format.format(value)));
        chart.append(point);
      }
    }
  }
  render();
})();
