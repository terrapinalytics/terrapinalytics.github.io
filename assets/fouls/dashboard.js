'use strict';
const $ = id => document.getElementById(id);
const kinds = ['shooting','other_personal','offensive','looseball','flagrant','technical','unknown'];
const names = ['Shooting','Other non-shooting','Offensive','Loose-ball','Flagrant','Technical','Unresolved'];
const colors = ['#118c91','#557cc2','#d17a49','#9370bc','#bf5d85','#b39439','#97a4ae'];
const state = {view:'teams', year:2027, conference:'', stage:'', location:'', type:'', search:'', minimum:3, sort:'margin', page:0, entity:'120', mixRole:'committed'};
let playerPositions = {};
let games = [], players = [], rows = [], visible = [], request = 0;
const cache = new Map();
const safe = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (value,places=2) => Number.isFinite(value) ? value.toFixed(places) : '—';
const r100 = (count,poss) => poss>0 ? 100*count/poss : NaN;
async function fetchData(path) {
  if (!cache.has(path)) cache.set(path,fetch(path).then(r=>{if(!r.ok)throw Error('Could not load '+path);return path.endsWith('.gz')?new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json():r.json()}));
  return cache.get(path);
}
function teamRecord(g,side) {
  const home = side==='h';
  return {id:g[side], name:g[side+'n'], conference:g[side+'c'], site:g.n?'neutral':home?'home':'away',
    opponent:home?g.an:g.hn, g, p:g.p, committed:g[side+'f'], drawn:g[(home?'a':'h')+'f'],
    ct:g[side+'t'], dt:g[(home?'a':'h')+'t']};
}
function filteredGames() {
  return games.filter(g=>(!state.stage||g.stage===state.stage));
}
function matches(r) {
  return (!state.conference||r.conference===state.conference)&&(!state.location||r.site===state.location);
}
function getRecords() {
  const typeIndex=kinds.indexOf(state.type);
  const base=filteredGames();
  let records=[];
  if(state.view==='teams') {
    records=base.flatMap(g=>[teamRecord(g,'h'),teamRecord(g,'a')]).filter(matches);
  } else if(state.view==='refs') {
    records=base.filter(g=>(!state.conference||[g.hc,g.ac].includes(state.conference))&&(!state.location||(state.location==='neutral'?g.n:!g.n)))
      .filter(g=>g.refs.length===3).flatMap(g=>g.refs.map(name=>({id:name,name,conference:'',site:g.n?'neutral':'home',g,p:g.p,
        committed:g.hf+g.af,drawn:0,ct:g.ht.map((v,i)=>v+g.at[i]),dt:[],homeEdge:g.n?null:g.af-g.hf})));
  } else {
    const byId=new Map(base.map(g=>[g.id,g]));
    records=players.filter(p=>byId.has(p.g)).map(p=>{
      const g=byId.get(p.g);const home=p.t===g.h;
      return {id:p.id,name:p.name,conference:home?g.hc:g.ac,site:g.n?'neutral':home?'home':'away',g,p:p.p,
        opponent:home?g.an:g.hn, committed:p.c,drawn:p.d,ct:p.ct,dt:p.dt,player:true,team:home?g.hn:g.an};
    }).filter(matches);
  }
  if(typeIndex>=0) {
    records=records.filter(r=>state.view==='players'?Boolean(r.ct&&r.dt):r.g.clean)
      .map(r=>({...r,committed:r.ct[typeIndex],drawn:r.dt[typeIndex]||0,
        homeEdge:state.view==='refs'&&!r.g.n?r.g.at[typeIndex]-r.g.ht[typeIndex]:r.homeEdge}));
  }
  return records;
}
function aggregate(records) {
  const groups=new Map();
  for(const r of records) {
    if(!groups.has(r.id))groups.set(r.id,{id:r.id,name:r.name,conference:r.conference,team:r.team,n:0,p:0,c:0,d:0,edge:0,edgeP:0,records:[]});
    const x=groups.get(r.id);x.n++;x.p+=r.p;x.c+=r.committed;x.d+=r.drawn;x.records.push(r);
    if(Number.isFinite(r.homeEdge)){x.edge+=r.homeEdge;x.edgeP+=r.p;}
  }
  for(const x of groups.values()) {
    x.committed=r100(x.c,x.p);x.drawn=r100(x.d,x.p);x.margin=r100(x.d-x.c,x.p);x.total=r100(x.c+x.d,x.p);x.home=r100(x.edge,x.edgeP);
  }
  return [...groups.values()];
}
function setOptions(id,items,selected) {
  $(id).innerHTML=items.map(([v,t])=>'<option value="'+safe(v)+'">'+safe(t)+'</option>').join('');
  $(id).value=selected;
}
function syncFilters() {
  setOptions('conference',[['','All conferences'],...[...new Set(games.flatMap(g=>[g.hc,g.ac]))].sort().map(c=>[c,c])],state.conference);
  setOptions('stage',[['','All game types'],...[...new Set(games.map(g=>g.stage))].sort().map(s=>[s,s])],state.stage);
  const ref=state.view==='refs';
  setOptions('location',ref?[['','All sites'],['home','Non-neutral sites'],['neutral','Neutral sites']]:
    [['','All locations'],['home','Home'],['away','Away'],['neutral','Neutral']],state.location);
  const historical=state.view==='players'&&state.year!==2027;
  $('type').disabled=false;
  if($('type').disabled)state.type='';
  $('type').value=state.type;
  $('type').options[0].textContent=state.view==='players'?'All recorded fouls':'All box-score fouls';
  const options=ref?[['committed','Combined fouls / 100'],['home','Home foul advantage'],['n','Games worked']]:
    [['margin','Best foul margin'],['drawn','Most drawn / 100'],['committed','Most committed / 100'],['least','Fewest committed / 100'],['n','Games']];
  if(!options.some(([k])=>k===state.sort))state.sort=options[0][0];
  setOptions('sort',options,state.sort);
  $('search').placeholder=ref?'Search referees':state.view==='players'?'Search players':'Search teams';
  document.querySelector('.search').firstChild.textContent=ref?'Find a referee':state.view==='players'?'Find a player':'Find a team';
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
}
async function loadSeason() {
  const current=++request;
  document.body.classList.add('loading');$('error').hidden=true;
  try {
    const [g,p]=await Promise.all([fetchData('games-'+state.year+'.json.gz'),
      state.view==='players'?fetchData(state.year===2027?'players-2027.json.gz':'players-edey.json'):Promise.resolve([])]);
    if(current!==request)return;
    games=g;players=p;
    if(state.view==='players'&&state.year===2027) {
      try {playerPositions=(await fetchData('player-positions-2027.json')).positions;}catch(e){playerPositions={};}
      if(current!==request)return;
    } else playerPositions={};
    if(state.conference&&!games.some(g=>g.hc===state.conference||g.ac===state.conference))state.conference='';
    if(state.stage&&!games.some(g=>g.stage===state.stage))state.stage='';
    syncFilters();render();
  } catch(e) {$('error').hidden=false;$('error').textContent=e.message;}
  finally {if(current===request)document.body.classList.remove('loading');resize();}
}
function render() {
  const records=getRecords();rows=aggregate(records);
  const ref=state.view==='refs',player=state.view==='players';
  const typeIndex=kinds.indexOf(state.type);
  const countGames=new Set(records.map(r=>r.g.id)).size;
  const min=state.minimum;
  visible=rows.filter(x=>x.n>=min&&x.name.toLowerCase().includes(state.search.toLowerCase()));
  visible.sort((a,b)=>(state.sort==='least'?a.committed-b.committed:(b[state.sort]??-Infinity)-(a[state.sort]??-Infinity))||a.name.localeCompare(b.name));
  if(!rows.some(x=>x.id===state.entity))state.entity=visible[0]?.id||rows[0]?.id||'';
  state.page=Math.min(state.page,Math.max(0,Math.ceil(visible.length/15)-1));
  $('ranktitle').textContent=ref?'Referee leaderboard':player?'Player leaderboard':'Team leaderboard';
  $('ranknote').textContent=ref?'Crew-level game rates. Select a referee to inspect assignments.':'Select a row to inspect the profile and game log.';
  let note=player?(state.year===2027?'Current-season player rates use tracked on-court possessions. Ambiguous foul-drawn types remain unresolved.':'Historical player coverage currently contains Zach Edey only, with all 138 Purdue appearances across four seasons.'):
    ref?'Each official receives the statistics for games worked by the three-person crew.':'Foul margin is opponent fouls minus own fouls.';
  if(state.type&& !player)note+=' Specific-type rates use '+countGames.toLocaleString()+' games with reconciled foul totals.';
  $('notice').textContent=note;
  let p=0,c=0,d=0;
  // Ref assignments repeat each game three times; rates remain identical.
  records.forEach(r=>{p+=r.p;c+=r.committed;d+=r.drawn;});
  const cards=ref?[['Games in sample',countGames.toLocaleString(),'With a complete three-person crew'],['Officials',rows.length.toLocaleString(),'Across current filters'],['Combined fouls / 100',fmt(r100(c,p)),'Both teams in each assignment'],['Foul type',state.type?names[typeIndex]:'All fouls','Raw game rates']]:
    [['Games in sample',countGames.toLocaleString(),player?'Player records available':'Across current filters'],
    [player?'Players':'Teams',rows.length.toLocaleString(),'Before minimum-game filter'],
    ['Committed / 100',fmt(r100(c,p)),player?'Per on-court team possessions':'Per estimated team possessions'],
    ['Drawn / 100',fmt(r100(d,p)),player?'Recorded player draws':'Opponent fouls committed']];
  $('cards').innerHTML=cards.map(([title,value,note])=>'<div class="card"><span>'+title+'</span><b>'+safe(value)+'</b><small>'+note+'</small></div>').join('');
  renderTable();renderProfile();updateUrl();resize();
}
function renderTable() {
  const ref=state.view==='refs';
  const headers=ref?['Rank','Referee','Games','Combined / 100','Home edge / 100']:['Rank',state.view==='players'?'Player':'Team','Games','Committed / 100','Drawn / 100','Margin / 100'];
  const list=visible.slice(state.page*15,(state.page+1)*15);
  $('ranktable').innerHTML='<thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+
    list.map((x,i)=>'<tr data-id="'+safe(x.id)+'" class="'+(x.id===state.entity?'selected':'')+'"><td>'+(state.page*15+i+1)+'</td><td><button class="namebutton">'+safe(x.name)+'</button></td><td>'+x.n+'</td>'+
      (ref?'<td>'+fmt(x.committed)+'</td><td>'+fmt(x.home)+'</td>':'<td>'+fmt(x.committed)+'</td><td>'+fmt(x.drawn)+'</td><td class="'+(x.margin>=0?'pos':'neg')+'">'+(x.margin>0?'+':'')+fmt(x.margin)+'</td>')+'</tr>').join('')+
    (!list.length?'<tr><td colspan="'+headers.length+'"><div class="empty">No matching records. Try a lower minimum or broader filters.</div></td></tr>':'')+'</tbody>';
  document.querySelectorAll('#ranktable tr[data-id]').forEach(tr=>tr.onclick=()=>{state.entity=tr.dataset.id;renderTable();renderProfile();resize();});
  $('page').textContent=visible.length?((state.page*15+1)+'–'+Math.min((state.page+1)*15,visible.length)+' of '+visible.length):'0 results';
  $('prev').disabled=state.page===0;$('next').disabled=(state.page+1)*15>=visible.length;
}
function renderProfile() {
  const ref=state.view==='refs',player=state.view==='players';
  const entity=rows.find(x=>x.id===state.entity);
  setOptions('entity',rows.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(x=>[x.id,x.name]),state.entity);
  $('entitytitle').innerHTML=entity?(ref?safe(entity.name):TeamLogos.label(player?entity.team:entity.name,player?null:entity.id)+(player?' '+safe(entity.name):'')):'No profile available';
  $('entity').disabled=!entity;
  if(!entity){$('peer-context').innerHTML='';$('profilemetrics').innerHTML='';$('mix').innerHTML='';$('gamechart').innerHTML='';$('gamelog').innerHTML='';$('profilenote').textContent='Try broader filters to view a profile.';return;}
  $('profilenote').textContent=ref?'All fouls in this official’s assignments; individual whistles are unattributed.':
    player?(entity.team+' · reconstructed on-court possession exposure'):(entity.conference+' · '+entity.n+' games');
  const metrics=ref?[['Games worked',entity.n],['Combined / 100',fmt(entity.committed)],['Home edge / 100',fmt(entity.home)]]:
    [['Committed / 100',fmt(entity.committed)],['Drawn / 100',fmt(entity.drawn)],['Margin / 100',(entity.margin>0?'+':'')+fmt(entity.margin)]];
  $('profilemetrics').innerHTML=metrics.map(([k,v])=>'<div>'+k+'<strong>'+v+'</strong></div>').join('');
  const qualified=rows.filter(x=>x.n>=state.minimum&&x.p>0&&(!player||x.p>=100)),position=playerPositions[entity.id]?.position;
  const peerGroups=[{label:(ref?'Officials':player?'Players':'Teams')+' in filtered season sample',members:qualified},
    ...(!ref?[{label:entity.conference+' filtered sample',members:qualified.filter(x=>x.conference===entity.conference)}]:[]),
    ...(player&&position?[{label:position+' position · filtered season sample',members:qualified.filter(x=>playerPositions[x.id]?.position===position)}]:[])];
  const keys=ref?['committed','home']:['committed','drawn','margin'];
  $('peer-context').innerHTML=keys.map(key=>PeerContext.comparison({value:entity[key],label:(key==='committed'?(ref?'Combined':'Committed'):key==='home'?'Home edge':key==='drawn'?'Drawn':'Margin')+' per 100 · season ending '+state.year+' · minimum '+state.minimum+' games'+(player?' and 100 on-court possessions':''),format:v=>fmt(v),cohorts:peerGroups.map(g=>({label:g.label,values:g.members.map(x=>x[key]),includesSelected:g.members.some(x=>x.id===entity.id)}))})).join('')+
    '<p class="peer-note">Same season and active conference, game-type, location and foul-type filters; name search does not change peers. Historical player coverage is Edey only, so no historical player ranks are shown. '+(player?(position?'Position from ESPN 2026–27 roster: '+safe(position)+'. Joined by unique normalized name and team because source IDs differ. Unknown positions excluded from position peers.':'Position unavailable; no position-specific comparison.'):'')+' Referee comparisons describe crews, not individual whistles.</p>';
  const eligible=entity.records.filter(r=>player?Boolean(r.ct&&r.dt):r.g.clean);
  let denom=0,mix=kinds.map(()=>0);
  eligible.forEach(r=>{denom+=r.p;(ref||state.mixRole==='committed'?r.ct:r.dt).forEach((n,i)=>{mix[i]+=n;});});
  const max=Math.max(...mix.map(n=>r100(n,denom)),1);
  $('mixlabel').textContent=(ref?'Crew foul mix':state.mixRole==='drawn'?'Fouls drawn by type':'Fouls committed by type')+' / 100';
  $('mix-tabs').hidden=ref;
  $('mix-committed').setAttribute('aria-pressed',String(state.mixRole==='committed'));
  $('mix-drawn').setAttribute('aria-pressed',String(state.mixRole==='drawn'));
  $('mix').innerHTML=eligible.length?kinds.map((k,i)=>'<div class="mixrow"><span><i class="dot" style="background:'+colors[i]+'"></i>'+names[i]+'</span><div class="bartrack"><div class="barfill" style="background:'+colors[i]+';width:'+100*r100(mix[i],denom)/max+'%"></div></div><span class="value">'+fmt(r100(mix[i],denom))+'</span></div>').join('')+'<p class="muted">'+eligible.length+' games with type detail.'+(state.type?' Mix shows all foul types in eligible games.':'')+'</p>':
    '<p class="empty">Foul-type detail is currently available for Edey’s historical profile. Player totals are available above.</p>';
  const recent=entity.records.slice().sort((a,b)=>a.g.date.localeCompare(b.g.date)).slice(-10);
  const values=recent.map(r=>r100(ref?r.committed:r.committed+r.drawn,r.p));
  const chartmax=Math.max(...values,1);
  $('gamecharttitle').textContent=ref?'Recent combined fouls / 100':'Recent drawn + committed / 100';
  $('gamechart').innerHTML=recent.map((r,i)=>{const label=ref?r.g.hn+' / '+r.g.an:r.opponent;return '<div class="barrow"><span title="'+safe(label)+'">'+safe(r.g.date.slice(5)+' '+label).slice(0,32)+'</span><div class="bartrack"><div class="barfill" style="width:'+100*values[i]/chartmax+'%"></div></div><span class="value">'+fmt(values[i],1)+'</span></div>';}).join('');
  $('gamelog').innerHTML='<thead><tr><th>Date</th><th>Matchup</th><th>Location</th><th>Possessions</th><th>'+(ref?'Combined':'Committed')+'</th>'+(!ref?'<th>Drawn</th>':'')+'<th>Rate / 100</th></tr></thead><tbody>'+
    entity.records.slice().sort((a,b)=>b.g.date.localeCompare(a.g.date)).map(r=>'<tr><td>'+r.g.date+'</td><td>'+safe(r.g.an+' at '+r.g.hn)+'</td><td>'+r.site+'</td><td>'+fmt(r.p,1)+'</td><td>'+r.committed+'</td>'+(!ref?'<td>'+r.drawn+'</td>':'')+'<td>'+fmt(r100(r.committed,r.p))+'</td></tr>').join('')+'</tbody>';
  $('method').textContent=ref?'Rates divide the combined fouls from both teams by estimated possessions per team. Home edge measures visitor fouls minus home fouls, excluding neutral sites.':
    player?'Rates divide recorded player foul events by on-court team possessions, then multiply by 100. The denominator averages offensive and defensive possessions while that player is on the floor.':
    'Rates divide team fouls by estimated possessions per team, then multiply by 100. Drawn means fouls assessed to the opponent. Positive margin means the opponent was assessed more fouls.';
}
function updateUrl() {
  const params=new URLSearchParams({view:state.view,season:state.year});
  history.replaceState(null,'','?'+params);
  if(window.parent!==window)window.parent.postMessage({foulView:state.view,season:state.year},location.origin);
}
function resize(){setTimeout(()=>{if(window.parent!==window)window.parent.postMessage({foulHeight:document.documentElement.scrollHeight},location.origin)},50)}
function exportCsv() {
  const ref=state.view==='refs';
  const head=ref?['Referee','Games','Combined per100','Home edge per100']:['Name','Games','Committed per100','Drawn per100','Margin per100'];
  const lines=[head.join(',')];
  visible.forEach(x=>lines.push([x.name,x.n,x.committed,ref?x.home:x.drawn,...(ref?[]:[x.margin])].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')));
  const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));
  const a=document.createElement('a');a.href=url;a.download='foul-analysis-'+state.view+'-'+state.year+'.csv';a.click();URL.revokeObjectURL(url);
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
  state.view=b.dataset.view;state.page=0;state.search='';$('search').value='';state.entity=state.view==='teams'?'120':state.view==='refs'?'Paul Szelc':'';
  state.type='';state.location='';loadSeason();
});
for(const id of ['conference','stage','location','type','minimum','sort'])$(id).onchange=()=>{
  state[id]=id==='minimum'?+$(id).value:$(id).value;state.page=0;render();
};
$('season').onchange=()=>{state.year=+$('season').value;state.page=0;loadSeason();};
$('search').oninput=()=>{state.search=$('search').value;state.page=0;renderTableFromSearch();};
function renderTableFromSearch(){render();}
$('entity').onchange=()=>{state.entity=$('entity').value;renderTable();renderProfile();resize();};
$('prev').onclick=()=>{state.page--;renderTable();resize();};$('next').onclick=()=>{state.page++;renderTable();resize();};
$('mix-committed').onclick=()=>{state.mixRole='committed';renderProfile();resize();};
$('mix-drawn').onclick=()=>{state.mixRole='drawn';renderProfile();resize();};
$('export').onclick=exportCsv;$('filters').onsubmit=e=>e.preventDefault();
new ResizeObserver(()=>resize()).observe(document.querySelector('main'));
fetchData('meta.json').then(meta=>{
 const params=new URLSearchParams(location.search);if(['teams','players','refs'].includes(params.get('view')))state.view=params.get('view');
 if(meta.seasons.some(s=>String(s.year)===params.get('season')))state.year=+params.get('season');
 setOptions('season',meta.seasons.slice().reverse().map(s=>[s.year,s.label]),state.year);return loadSeason();
}).catch(e=>{$('error').hidden=false;$('error').textContent=e.message;});
