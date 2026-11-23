/* No remote scripts, tiles, keys or analytics. */
(()=>{'use strict';
const data=window.RECRUIT_DATA,$=id=>document.getElementById(id),canvas=$('map'),ctx=canvas.getContext('2d'),R=3958.7613,rad=Math.PI/180;
const colors={'Maryland':'#E03A3E','NC State':'#CC0000','Penn State':'#041E42','North Carolina':'#4B9CD3','Duke':'#003087','Wake Forest':'#806528','Baylor':'#154734','Virginia':'#232D4B','Virginia Tech':'#630031','West Virginia':'#002855','Rutgers':'#CC0033','Pittsburgh':'#003594','Ohio State':'#BB0000','Michigan':'#00274C','Alabama':'#9E1B32','Georgia':'#BA0C2F','Texas':'#BF5700','USC':'#990000','UCLA':'#2774AE','Notre Dame':'#0C2340','Oregon':'#154733','Clemson':'#F56600','Florida':'#0021A5','Florida State':'#782F40','Miami':'#005030','Tennessee':'#FF8200','LSU':'#461D7C'};
const players=data.players.map(v=>({year:v[0],name:v[1],rank:v[2],rating:v[3],stars:v[4],position:v[5],hs:v[6],city:v[7],state:v[8],lat:v[9],lon:v[10],commit:v[11],url:v[12]}));const schools=data.schools;
function world(lon,lat){lat=Math.max(-84,Math.min(84,lat));return [(lon+180)/360,(1-Math.log(Math.tan(Math.PI/4+lat*rad/2))/Math.PI)/2];}
function inverse(x,y){return [x*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y)))/rad];}
function distance(a,b){const v=Math.sin((a.lat-b.lat)*rad/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((a.lon-b.lon)*rad/2)**2;return 2*R*Math.asin(Math.sqrt(Math.min(1,v)));}
function circle(s,miles){return Array.from({length:121},(_,i)=>{let b=i/120*2*Math.PI,p=s.lat*rad,l=s.lon*rad,d=miles/R;let lat=Math.asin(Math.sin(p)*Math.cos(d)+Math.cos(p)*Math.sin(d)*Math.cos(b));let lon=l+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(p),Math.cos(d)-Math.sin(p)*Math.sin(lat));return [lon/rad,lat/rad];});}
players.forEach(p=>{if(p.lat!==null)p.xy=world(p.lon,p.lat);});schools.forEach(s=>{s.xy=world(s.lon,s.lat);s.color=colors[s.name]||'#344E64';});
const defaultRegion='dmv',defaultBandwidth=15;
let W=1000,H=600,z=3.5,cx=world(-97,38)[0],cy=world(-97,38)[1],filtered=[],mapped=[],years=17,lockedPeak=null,currentPeak=1,hits=[],statCache=null,selected=null,lastTouches=new Map(),drag=null,renderQueued=false;
let sf={type:'blue',first:2010,last:2026,bandwidth:defaultBandwidth,radius:100,school:'',inside:false};
const statePolys=data.states.features.flatMap(f=>{const g=f.geometry;return (g.type==='Polygon'?[g.coordinates[0]]:g.coordinates.map(p=>p[0])).map(r=>({name:f.properties.name,ring:r.map(p=>world(p[0],p[1]))}));});
for(let y=2010;y<=2026;y++){for(const id of ['first','last']){const o=document.createElement('option');o.value=y;o.textContent=y;$(id).append(o);}}$('last').value=2026;
[...schools].sort((a,b)=>a.name.localeCompare(b.name)).forEach(s=>{const o=document.createElement('option');o.value=s.name;o.textContent=s.name;$('school').append(o);});
const presets={us:[-97,38,3.5],nc:[-79.5,35.5,6],texas:[-99,31.5,4.7],southeast:[-84,32.7,4.9],california:[-119.5,36.5,4.7],hawaii:[-157,20.8,6],alaska:[-153,64,3.5]};
function screen(xy){let dx=xy[0]-cx;if(dx>.5)dx--;if(dx<-.5)dx++;const scale=256*2**z;return [W/2+dx*scale,H/2+(xy[1]-cy)*scale];}
function unproject(x,y){const scale=256*2**z;return inverse(cx+(x-W/2)/scale,cy+(y-H/2)/scale);}
function yearsLabel(){return sf.first===sf.last?String(sf.first):sf.first+'–'+sf.last;}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmt(n){return n.toLocaleString(undefined,{maximumFractionDigits:1});}
function readFilters(){sf={type:$('threshold').value,first:+$('first').value,last:+$('last').value,bandwidth:+$('bandwidth').value,radius:+$('radius').value,school:$('school').value,inside:$('inside').checked};if(sf.first>sf.last){sf.last=sf.first;$('last').value=sf.last;}years=sf.last-sf.first+1;selected=schools.find(s=>s.name===sf.school);$('school-distance').hidden=!selected;$('inside').disabled=!selected||!sf.radius;if($('inside').disabled){sf.inside=false;$('inside').checked=false;}
filtered=players.filter(p=>p.year>=sf.first&&p.year<=sf.last&&(sf.type==='blue'?p.stars>=4:sf.type==='five'?p.stars===5:p.rank<=+sf.type)&&(!sf.inside||(p.xy&&distance(p,selected)<=sf.radius)));mapped=filtered.filter(p=>p.xy);statCache=null;lockedPeak=null;if($('scale').value==='lock')$('scale').value='auto';render();if(selected)showSchool(selected);}
function schoolStats(s){let local=mapped.filter(p=>distance(p,s)<=sf.radius);let captured=local.filter(p=>p.commit===s.name).length;return {school:s,n:local.length,captured,per:local.length/years,capture:local.length?captured/local.length:null};}
function renderSoon(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render();});}
function statePaths(){ctx.beginPath();for(const f of statePolys){let prev=null;for(let i=0;i<f.ring.length;i++){const p=screen(f.ring[i]);if(!i||prev&&Math.abs(p[0]-prev[0])>W*1.5)ctx.moveTo(...p);else ctx.lineTo(...p);prev=p;}ctx.closePath();}}
function density(){const step=8,nx=Math.ceil(W/step),ny=Math.ceil(H/step),grid=new Float32Array(nx*ny),scale=256*2**z,amplitude=10000/(2*Math.PI*sf.bandwidth**2*years);let viewCount=0;
for(const p of mapped){const [x,y]=screen(p.xy);if(x>=0&&x<W&&y>=0&&y<H)viewCount++;const sigma=sf.bandwidth/(2*Math.PI*R*Math.cos(p.lat*rad))*scale;const radius=3*sigma;if(x+radius<0||x-radius>W||y+radius<0||y-radius>H)continue;const a=Math.max(0,Math.floor((x-radius)/step)),b=Math.min(nx-1,Math.ceil((x+radius)/step)),c=Math.max(0,Math.floor((y-radius)/step)),d=Math.min(ny-1,Math.ceil((y+radius)/step));const inv=1/(2*sigma*sigma);
for(let gy=c;gy<=d;gy++){const dy=(gy+.5)*step-y;for(let gx=a;gx<=b;gx++){const dx=(gx+.5)*step-x;const q=(dx*dx+dy*dy)*inv;if(q<=4.5)grid[gy*nx+gx]+=amplitude*Math.exp(-q);}}}
let peak=0;for(const v of grid)if(v>peak)peak=v;currentPeak=Math.max(peak,.01);const max=lockedPeak??currentPeak;const off=document.createElement('canvas');off.width=nx;off.height=ny;const oc=off.getContext('2d');const im=oc.createImageData(nx,ny);const stops=[[255,255,204],[255,207,101],[255,128,53],[227,38,36],[128,0,38]];
for(let i=0;i<grid.length;i++){if(grid[i]<.001)continue;const t=Math.pow(Math.min(1,grid[i]/max),.6)*4,k=Math.min(3,Math.floor(t)),f=t-k;for(let c=0;c<3;c++)im.data[i*4+c]=stops[k][c]*(1-f)+stops[k+1][c]*f;im.data[i*4+3]=Math.min(235,grid[i]/max*150+75);}oc.putImageData(im,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(off,0,0,W,H);
$('pool').textContent=fmt(mapped.length)+' / '+fmt(filtered.length);$('annual').textContent=fmt(viewCount/years);$('coverage').textContent=filtered.length?(mapped.length/filtered.length*100).toFixed(1)+'%':'—';$('peak').textContent=fmt(max);$('scaleNote').textContent=lockedPeak===null?'Scale follows visible region':'Color scale locked';return viewCount;}
function campusVisible(s){const [x,y]=screen(s.xy);return x>=-50&&x<=W+50&&y>=-50&&y<=H+50;}
function drawCircle(s){if(!sf.radius)return;const r=circle(s,sf.radius);ctx.beginPath();r.forEach((p,i)=>{let v=screen(world(...p));if(i)ctx.lineTo(...v);else ctx.moveTo(...v);});ctx.strokeStyle=s.color;ctx.lineWidth=selected&&s===selected?3.5:2;ctx.globalAlpha=.8;ctx.stroke();ctx.globalAlpha=1;}
function drawSchools(){const mode=$('schoolMode').value,show=mode==='on'||mode==='auto'&&z>=5.5;const ss=show?schools.filter(s=>campusVisible(s)||s===selected):[];const circles=$('circles').checked&&sf.radius>0;if(circles)ss.forEach(drawCircle);for(const s of ss){const [x,y]=screen(s.xy);ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fillStyle=s.color;ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=2;ctx.stroke();ctx.font='600 12px system-ui';ctx.lineWidth=4;ctx.strokeStyle='white';ctx.strokeText(s.name,x+10,y-7);ctx.fillStyle=s.color;ctx.fillText(s.name,x+10,y-7);hits.push({kind:'school',s,x,y});}
$('zoomNote').textContent=show
  ? (circles?`Campus circles: ${sf.radius} miles`:'Campus markers')+' · '+yearsLabel()
  : 'Zoom in to see campuses';return ss;}
function drawRecruits(){if(z<6.5||!$('points').checked)return;const cities=new Map();for(const p of mapped){let [x,y]=screen(p.xy);if(x<0||x>W||y<0||y>H)continue;let key=p.lat+','+p.lon;if(!cities.has(key))cities.set(key,{x,y,ps:[]});cities.get(key).ps.push(p);}for(const c of cities.values()){ctx.beginPath();ctx.arc(c.x,c.y,Math.min(10,2.5+Math.sqrt(c.ps.length)),0,Math.PI*2);ctx.fillStyle='#5b1221';ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=.7;ctx.stroke();hits.push({kind:'recruits',...c});}}
function table(ss){if(!statCache)statCache=new Map();const tableSchools=ss.length?ss:selected?[selected]:[];const stats=tableSchools.map(s=>{if(!statCache.has(s.name))statCache.set(s.name,schoolStats(s));return statCache.get(s.name);}).sort((a,b)=>b.n-a.n);$('schoolRows').innerHTML=stats.map(v=>`<tr><td><button data-school="${esc(v.school.name)}">${TeamLogos.label(v.school.name)}</button></td><td>${fmt(v.per)}</td><td>${fmt(v.captured/years)}</td><td>${v.capture===null?'—':(v.capture*100).toFixed(1)+'%'}</td></tr>`).join('');$('detailTitle').textContent=`School access · ${sf.radius}-mile radius`;$('detailHint').textContent=stats.length?`All counts use ${yearsLabel()}. A recruit may fall inside multiple schools’ circles.`:'Campuses appear at regional zoom. You can also select a school or choose “Always show.”';}
function render(){if(!W||!H)return;ctx.clearRect(0,0,W,H);ctx.fillStyle='#e9eff4';ctx.fillRect(0,0,W,H);statePaths();ctx.fillStyle='#faf9ef';ctx.fill();density();statePaths();ctx.strokeStyle='#8f9ba6';ctx.lineWidth=.7;ctx.stroke();hits=[];drawRecruits();const ss=drawSchools();table(ss);drawScale();saveHash();}
function drawScale(){const a=unproject(W-140,H-55),b=unproject(W-40,H-55);const miles=distance({lon:a[0],lat:a[1]},{lon:b[0],lat:b[1]});ctx.fillStyle='#ffffffdf';ctx.fillRect(W-155,H-75,140,35);ctx.strokeStyle='#303d48';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(W-140,H-65);ctx.lineTo(W-140,H-55);ctx.lineTo(W-40,H-55);ctx.lineTo(W-40,H-65);ctx.stroke();ctx.fillStyle='#303d48';ctx.font='11px system-ui';ctx.fillText(Math.round(miles)+' miles',W-135,H-43);}
function resize(){const box=canvas.getBoundingClientRect();W=Math.round(box.width);H=Math.round(box.height);const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);renderSoon();}
function zoom(amount,x=W/2,y=H/2){const scale=256*2**z;const wx=cx+(x-W/2)/scale,wy=cy+(y-H/2)/scale;z=Math.max(2,Math.min(11,z+amount));const ns=256*2**z;cx=wx-(x-W/2)/ns;cy=wy-(y-H/2)/ns;renderSoon();}
function goPreset(key){
  if(key==='dmv'){
    // Fit the core DMV and its neighboring campuses without clipping the region on phones.
    const [west,north]=world(-81.1,41.12),[east,south]=world(-74.15,36.9);
    const rect=canvas.getBoundingClientRect();
    cx=(west+east)/2;cy=(north+south)/2;
    z=Math.log2(Math.min((rect.width-28)/(east-west),(rect.height-32)/(south-north))/256);
  }else{
    const p=presets[key]||presets.us;
    [cx,cy]=world(p[0],p[1]);z=p[2]+Math.log2(Math.max(.45,W/1100));
  }
  renderSoon();
}
function focusSchool(name){$('school').value=name;readFilters();if(selected){[cx,cy]=selected.xy;z=6.3+Math.log2(Math.max(.45,W/1100));$('region').value='';showSchool(selected);renderSoon();}}
function showSchool(s){
  const pool=players.filter(p=>p.xy&&p.year>=sf.first&&p.year<=sf.last&&
    (sf.type==='blue'?p.stars>=4:sf.type==='five'?p.stars===5:p.rank<=+sf.type));
  const access=schools.map(sc=>{
    const local=pool.filter(p=>distance(p,sc)<=sf.radius);
    const committed=local.filter(p=>p.commit===sc.name).length;
    return {school:sc,local:sc===s?local:null,committed,per:local.length/years,
      capture:local.length?100*committed/local.length:null};
  });
  const target=access.find(x=>x.school.name===s.name);
  const measures=[['per','Local recruits per year'],['capture','Local share committed to school']];
  const snapshot=(key,title)=>({
    value:target[key],label:title+' · '+yearsLabel()+' · '+sf.radius+' miles',
    format:n=>fmt(n)+(key==='capture'?'%':''),
    cohorts:[{label:'Mapped power-conference school sample',shortLabel:'mapped schools',values:access.map(x=>x[key])},
      {label:s.conference+' mapped schools (current)',shortLabel:s.conference,
       values:access.filter(x=>x.school.conference===s.conference).map(x=>x[key])}]
  });
  const summary=measures.map(([key,title])=>{
    const info=snapshot(key,title);
    return `<div class="peer-headline"><small>${title}</small><strong>${info.value===null?'—':info.format(info.value)}</strong>${PeerContext.badges(info)}</div>`;
  }).join('');
  const context=measures.map(([key,title])=>PeerContext.comparison(snapshot(key,title))).join('');
  $('details').innerHTML=`<h2>${esc(s.name)}</h2><p>${esc(s.conference)} · ${sf.radius} miles · ${yearsLabel()} · ${esc($('threshold').selectedOptions[0].textContent)}</p>
    <div class="recruit-headlines">${summary}</div>
    <details class="peer-disclosure" id="local-recruit-detail"><summary>Open counts and recruits</summary>
    <p>${fmt(target.committed)} of ${fmt(target.local.length)} local recruits list ${esc(s.name)} as their commitment across ${years} ${years===1?'class':'classes'}.</p>
    <div id="local-recruit-list"></div></details>
    <details class="peer-disclosure"><summary>Peer details</summary>${context}<p class="peer-note">Peers use the same class years, threshold and radius, independently of the map viewport and spatial filter. Circles can overlap. Conference labels use current membership.</p></details>`;
  $('local-recruit-detail').ontoggle=event=>{
    const list=$('local-recruit-list');
    if(!event.target.open||list.childElementCount)return;
    const records=[...target.local].sort((a,b)=>b.year-a.year||a.rank-b.rank);
    list.innerHTML=records.length?`<div class="tablewrap recruit-records"><table><thead><tr><th>Class</th><th>Recruit</th><th>Rank</th><th>Destination</th></tr></thead>
      <tbody>${records.map(p=>{
        const name=esc(p.name),link=p.url?.startsWith('https://')?`<a href="${esc(p.url)}" target="_blank" rel="noopener">${name}</a>`:name;
        return `<tr><td>${p.year}</td><td>${link}</td><td>${esc(p.rank??'—')}</td><td>${esc(p.commit||'Not displayed')}</td></tr>`;
      }).join('')}</tbody></table></div>`:'<p>No local recruits match these filters.</p>';
  };
}
function showPlayers(ps){$('details').innerHTML=`<h2>${esc(ps[0].city)}, ${esc(ps[0].state)}</h2><p>${ps.length} matching recruits at this coordinate</p><ul>${[...ps].sort((a,b)=>b.year-a.year||a.rank-b.rank).map(p=>`<li><a target="_blank" rel="noopener" href="${esc(p.url)}">${esc(p.name)}</a> · ${p.year}<br>${p.stars}★ · #${p.rank} nationally · ${esc(p.position)} · ${p.rating??'—'}<br>${esc(p.hs)}<br>Destination: ${esc(p.commit||'Not displayed')}${PeerContext.comparison({value:p.rating,label:'Recruit rating · '+p.year+' · loaded dataset (not all national recruits)',format:fmt,cohorts:[{label:'Same class in loaded dataset',values:players.filter(x=>x.year===p.year).map(x=>x.rating)},{label:p.position+' · same class in loaded dataset',values:players.filter(x=>x.year===p.year&&x.position===p.position).map(x=>x.rating)}]})}</li>`).join('')}</ul>`;}
function hit(x,y){return [...hits].reverse().find(v=>Math.hypot(v.x-x,v.y-y)<12);}
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY<0?.35:-.35,e.clientX-r.left,e.clientY-r.top);},{passive:false});
canvas.addEventListener('dblclick',e=>{const r=canvas.getBoundingClientRect();zoom(1,e.clientX-r.left,e.clientY-r.top);});
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);lastTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});drag={x:e.clientX,y:e.clientY,cx,cy,moved:false};});
canvas.addEventListener('pointermove',e=>{if(lastTouches.has(e.pointerId)){const old=lastTouches.get(e.pointerId);if(lastTouches.size===2){const other=[...lastTouches].find(([id])=>id!==e.pointerId)[1];const d0=Math.hypot(old.x-other.x,old.y-other.y),d1=Math.hypot(e.clientX-other.x,e.clientY-other.y);const r=canvas.getBoundingClientRect();if(d0>0&&d1>0)zoom(Math.log2(d1/d0),(e.clientX+other.x)/2-r.left,(e.clientY+other.y)/2-r.top);drag.moved=true;}else if(drag){let dx=e.clientX-old.x,dy=e.clientY-old.y;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4)drag.moved=true;cx-=dx/(256*2**z);cy=Math.max(.01,Math.min(.99,cy-dy/(256*2**z)));renderSoon();}lastTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});}else{const r=canvas.getBoundingClientRect(),h=hit(e.clientX-r.left,e.clientY-r.top);$('tooltip').hidden=!h;if(h)$('tooltip').textContent=h.kind==='school'?h.s.name:h.ps[0].city+', '+h.ps[0].state+' · '+h.ps.length+' recruits';}});
canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved){const r=canvas.getBoundingClientRect(),h=hit(e.clientX-r.left,e.clientY-r.top);if(h?.kind==='school')showSchool(h.s);else if(h)showPlayers(h.ps);}lastTouches.delete(e.pointerId);if(!lastTouches.size)drag=null;});canvas.addEventListener('pointercancel',e=>{lastTouches.delete(e.pointerId);drag=null;});canvas.addEventListener('pointerleave',()=>{$('tooltip').hidden=true;});
canvas.addEventListener('keydown',e=>{const moves={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,-.15],ArrowDown:[0,.15]};if(moves[e.key]){e.preventDefault();cx+=moves[e.key][0]*W/(256*2**z);cy+=moves[e.key][1]*H/(256*2**z);renderSoon();}else if(e.key==='+'||e.key==='=')zoom(.5);else if(e.key==='-')zoom(-.5);});
$('plus').onclick=()=>zoom(.6);$('minus').onclick=()=>zoom(-.6);$('reset').onclick=()=>{$('region').value='us';goPreset('us');};$('region').onchange=()=>goPreset($('region').value);$('school').onchange=()=>focusSchool($('school').value);$('schoolRows').onclick=e=>{if(e.target.dataset.school)focusSchool(e.target.dataset.school);};
for(const id of ['threshold','first','last','bandwidth','radius','inside'])$(id).onchange=readFilters;for(const id of ['schoolMode','points','circles'])$(id).onchange=renderSoon;$('scale').onchange=()=>{lockedPeak=$('scale').value==='lock'?currentPeak:null;renderSoon();};
$('download').onclick=()=>{const fields=['class_year','player_name','national_rank','composite_rating','composite_stars','position','high_school_name','listed_city','listed_state','latitude','longitude','commitment_school','player_url'];const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';const text=[fields,...filtered.map(p=>[p.year,p.name,p.rank,p.rating,p.stars,p.position,p.hs,p.city,p.state,p.lat,p.lon,p.commit,p.url])].map(r=>r.map(quote).join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download='recruits_'+sf.type+'_'+yearsLabel()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);$('message').textContent='Exported '+filtered.length+' filtered recruits (all regions).';};
function saveHash(){const p=new URLSearchParams({t:sf.type,a:sf.first,b:sf.last,z:z.toFixed(2),lon:inverse(cx,cy)[0].toFixed(4),lat:inverse(cx,cy)[1].toFixed(4),r:sf.radius,s:sf.school,i:sf.inside?'1':'0',bw:sf.bandwidth,c:$('schoolMode').value,circles:$('circles').checked?'1':'0',p:$('points').checked?'1':'0',sc:$('scale').value,pk:lockedPeak===null?'':lockedPeak.toFixed(4)});history.replaceState(null,'','#'+p);}
$('reset-filters').onclick=()=>{
  for(const [id,value] of Object.entries({threshold:'blue',first:'2010',last:'2026',bandwidth:String(defaultBandwidth),radius:'100',school:'',scale:'auto',schoolMode:'auto',region:defaultRegion})) $(id).value=value;
  $('inside').checked=false;$('points').checked=true;$('circles').checked=true;
  readFilters();goPreset(defaultRegion);
};
$('share').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('message').textContent='View link copied.';}catch{window.prompt('Copy view link',location.href);}};
function restore(){let p=new URLSearchParams(location.hash.slice(1));const opts={threshold:p.get('t'),first:p.get('a'),last:p.get('b'),radius:p.get('r'),school:p.get('s'),bandwidth:p.get('bw'),schoolMode:p.get('c')};for(const [id,value]of Object.entries(opts))if(value!==null&&[...$(id).options].some(o=>o.value===value))$(id).value=value;$('inside').checked=p.get('i')==='1';$('circles').checked=p.get('circles')!=='0';if(p.has('p'))$('points').checked=p.get('p')==='1';if(p.has('z')&&p.has('lon')&&p.has('lat')&&[p.get('z'),p.get('lon'),p.get('lat')].every(v=>Number.isFinite(+v))){z=Math.max(2,Math.min(11,+p.get('z')));[cx,cy]=world(+p.get('lon'),+p.get('lat'));}else{$('region').value=defaultRegion;goPreset(defaultRegion);}}
const savedScale=new URLSearchParams(location.hash.slice(1));restore();readFilters();if(savedScale.get('sc')==='lock'&&+savedScale.get('pk')>0){lockedPeak=+savedScale.get('pk');$('scale').value='lock';}new ResizeObserver(resize).observe(canvas);window.addEventListener('hashchange',()=>{restore();readFilters();});
})();
