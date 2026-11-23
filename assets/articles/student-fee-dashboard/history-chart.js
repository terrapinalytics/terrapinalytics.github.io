'use strict';
(() => {
  const get = id => document.getElementById(id);
  const chart = get('fee-chart');
  const controls = get('school-series');
  const summary = get('chart-selection');
  const menuLabel = get('school-menu-label');
  const from = get('chart-from');
  const through = get('chart-through');
  const metric = get('chart-values');
  const data = new Map();
  const years = new Set();
  for (const row of document.querySelectorAll('#history tbody tr')) {
    const school = row.dataset.school;
    const year = Number(row.cells[1].textContent.trim().slice(0,4));
    years.add(year);
    if (!data.has(school)) data.set(school,new Map());
    // Annual charges are in whole dollars. Fiscal-year revenue is a separate measure.
    if (row.dataset.rate === 'true') data.get(school).set(year,Number(row.cells[2].textContent.replace(/[^\d.]/g,'')));
    for (const i of [2,4,5]) row.cells[i].dataset.sortValue = row.cells[i].firstChild?.textContent.trim() ?? '';
  }
  const allYears = [...years].sort((a,b)=>a-b);
  const yearLabel = year => `${year}–${String((year+1)%100).padStart(2,'0')}`;
  for (const year of allYears) {
    from.add(new Option(yearLabel(year),year));
    through.add(new Option(yearLabel(year),year));
  }
  from.value = 2019;
  through.value = 2026;
  from.addEventListener('change',()=>{
    if (+from.value>+through.value) through.value=from.value;
    render();
  });
  through.addEventListener('change',()=>{
    if (+through.value<+from.value) from.value=through.value;
    render();
  });
  metric.addEventListener('change',render);

  const defaultSchools = new Set(['Virginia Tech','Georgia Tech','Georgia','Oklahoma State','Florida','Maryland',
    'West Virginia','Louisville','Clemson','South Carolina','Minnesota']);
  const articleColors = {'Virginia Tech':'#a2212a','Georgia Tech':'#277372','Georgia':'#277372',
    'Oklahoma State':'#865617','Florida':'#865617','Maryland':'#343d47'};
  const choices = [...data.keys()].sort().map((name,i) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = defaultSchools.has(name);
    const color = articleColors[name] ?? `hsl(${Math.round((i*137.508)%360)} 68% 36%)`;
    const swatch = document.createElement('span');
    swatch.className = 'series-color';
    swatch.style.backgroundColor = color;
    swatch.setAttribute('aria-hidden','true');
    label.append(input,swatch,name);
    controls.append(label);
    input.addEventListener('change',render);
    return {name,input,color,swatch};
  });
  const chartPanel=chart.parentElement;
  const compactChart=matchMedia("(max-width:700px)");
  const dollars = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
  const indices = new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
  const newCharges = new Set(['West Virginia','Louisville','Clemson','South Carolina','Minnesota']);
  const firstFeeYear = 2025;

  function amount(name,year,mode) {
    const fee = data.get(name).get(year);
    if (mode !== 'standalone' || !newCharges.has(name)) return fee;
    if (year < firstFeeYear) return 0;
    // The article tracks the new Minnesota facilities fee apart from the stadium fee.
    return name === 'Minnesota' ? 200 : fee;
  }

  function svg(tag, attributes, content) {
    const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,value);
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function render() {
    const compact=compactChart.matches;
    const width=compact?Math.max(240,chartPanel.clientWidth):920;
    const left=compact?52:76,right=width-(compact?14:23),top=28,bottom=compact?225:289;
    chart.setAttribute("viewBox",`0 0 ${width} ${compact?265:340}`);
    const first=+from.value,last=+through.value,mode=metric.value;
    const format = mode==='index' ? indices : dollars;
    const x = year => first===last ? (left+right)/2 : left+(right-left)*(year-first)/(last-first);
    const selected=choices.filter(choice=>choice.input.checked);
    menuLabel.textContent=`Schools (${selected.length} selected)`;
    for (const choice of choices) choice.swatch.style.backgroundColor=
      mode==='standalone'&&newCharges.has(choice.name) ? '#3a597e' : choice.color;

    const excluded=[];
    const lines=selected.flatMap(choice=>{
      const base=amount(choice.name,first,mode);
      if (mode!=='annual' && (base===undefined || (mode==='index'&&base===0))) {
        excluded.push(choice.name); return [];
      }
      const points=[];
      for (let year=first;year<=last;year++) {
        const value=amount(choice.name,year,mode);
        if (value===undefined) continue;
        points.push([year,mode==='annual'?value:mode==='index'?100*value/base:value-base]);
      }
      if (!points.length) { excluded.push(choice.name); return []; }
      return [{...choice,points}];
    });
    const notes=[lines.length?'Showing '+lines.map(choice=>choice.name).join(', ')+'.':'No series to display.'];
    if (excluded.length) notes.push('No usable data for this view: '+excluded.join(', ')+'.');
    if(mode==='standalone') notes.push('New standalone charges start at $0 before launch. Minnesota’s separate stadium fee is excluded from its line.');
    summary.textContent=notes.join(' ');
    const title=metric.selectedOptions[0].textContent;
    chart.replaceChildren(svg('title',{id:'chart-title'},title),
      svg('desc',{id:'chart-summary'},summary.textContent+' Annual observations are available below.'));
    const values=lines.flatMap(line=>line.points.map(([,value])=>value));
    const lo=Math.min(0,...values),hi=Math.max(25,...values);
    const raw=(hi-lo)/5, power=10**Math.floor(Math.log10(raw));
    const step=power*[1,2,2.5,5,10].find(factor=>factor>=raw/power);
    const lower=Math.floor(lo/step)*step,upper=Math.ceil(hi/step)*step;
    const y=value=>bottom-(bottom-top)*(value-lower)/(upper-lower);
    if(first<firstFeeYear && last>=firstFeeYear){
      const shadeX=(x(firstFeeYear-1)+x(firstFeeYear))/2;
      chart.append(svg('rect',{x:shadeX,y:top,width:right-shadeX,height:bottom-top,fill:'#f6ede4'}),
        svg('text',{x:shadeX-5,y:top-8,'text-anchor':'end',fill:'#704f37','font-size':12},compact?'Revenue sharing':'Athlete revenue sharing begins'));
    }
    for(let v=lower;v<=upper;v+=step){
      chart.append(svg('line',{x1:left,x2:right,y1:y(v),y2:y(v),stroke:v===0?'#aab5b9':'#d9dedf'}),
        svg('text',{x:left-9,y:y(v)+4,'text-anchor':'end',fill:'#47525a','font-size':13},format.format(v)));
    }
    const tickInterval=Math.max(1,Math.ceil((last-first)/(compact?4:7)));
    for(let year=first;year<=last;year++){
      if(year!==last && (year-first)%tickInterval) continue;
      if(year!==first && year!==last && last-year<tickInterval/2) continue;
      chart.append(svg('text',{x:x(year),y:compact?249:320,'text-anchor':year===last&&year!==first?'end':'middle',fill:'#47525a','font-size':13},yearLabel(year)));
    }
    for(const choice of lines){
      const color=choice.swatch.style.backgroundColor;
      let path='',previous=null;
      for(const [year,value] of choice.points){
        path+=(previous===year-1?' L':' M')+x(year)+' '+y(value);
        previous=year;
      }
      const attrs={d:path,fill:'none',stroke:color,'stroke-width':2.4,'stroke-linejoin':'round'};
      if(mode==='standalone'&&newCharges.has(choice.name)) attrs['stroke-dasharray']='6 4';
      chart.append(svg('path',attrs));
      for(const [year,value] of choice.points){
        const point=svg('circle',{cx:x(year),cy:y(value),r:3.7,fill:color,stroke:'#fff','stroke-width':.75});
        point.append(svg('title',{},choice.name+' · '+yearLabel(year)+' · '+format.format(value)));
        chart.append(point);
      }
    }
  }
  render();
  let previousWidth=chartPanel.clientWidth;
  new ResizeObserver(()=>{
    const width=chartPanel.clientWidth;
    if (width!==previousWidth) { previousWidth=width; render(); }
  }).observe(chartPanel);
  compactChart.addEventListener("change",render);
})();
