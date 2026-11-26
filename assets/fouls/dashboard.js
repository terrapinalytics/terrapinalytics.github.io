'use strict';
const $ = id => document.getElementById(id);
const kinds = ['shooting','other_personal','offensive','looseball','flagrant','technical','unknown'];
const technicalType = kinds.indexOf('technical');
const names = ['Shooting','Other non-shooting','Offensive','Loose-ball','Flagrant','Technical','Unresolved'];
const mixBuckets = ['Shooting', 'Non-shooting', 'Offensive', 'Other'];
const bucketCounts = counts => [counts[0], counts[1], counts[2], counts.slice(3).reduce((a,b)=>a+b,0)];
const sumCounts = counts => counts.reduce((total, count) => total + count, 0);
const defaults = {view:'teams', year:2027, conference:'', stage:'', location:'', type:'', search:'', minimum:3, sort:'margin', page:0, entity:'120', mixRole:'committed', mixPeer:''};
const state = {...defaults};
let playerPositions = {};
let games = [], players = [], rows = [], visible = [], request = 0;
const cache = new Map();
const safe = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (value,places=1) => Number.isFinite(value) ? value.toFixed(places) : '—';
const r100 = (count,poss) => poss>0 ? 100*count/poss : NaN;
async function fetchData(path) {
  if (!cache.has(path)) cache.set(path,fetch(path+'?v=20261123').then(r=>{if(!r.ok)throw Error('Could not load '+path);return path.endsWith('.gz')?new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json():r.json()}));
  return cache.get(path);
}
function reconcileGameTypes(game) {
  if (!game.clean) return game;
  const home = sumCounts(game.ht);
  const away = sumCounts(game.at);
  if (home === game.hf && away === game.af) return game;

  // The source audit accepts games whose box score excludes technical fouls.
  // Use the same convention for counts, eligibility and team/crew comparisons.
  if (home - game.ht[technicalType] !== game.hf ||
      away - game.at[technicalType] !== game.af) return {...game, clean:false};

  const withoutTechnicals = counts => counts.map((count, index) => index === technicalType ? 0 : count);
  return {...game, ht:withoutTechnicals(game.ht), at:withoutTechnicals(game.at)};
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
  if(!kinds.includes(state.type))state.type='';
  $('type').value=state.type;
  $('minimum').value=String(state.minimum);
  $('type').options[0].textContent=state.view==='players'?'All recorded fouls':'All box-score fouls';
  const options=ref?[['committed','Combined fouls / 100'],['home','Home foul advantage'],['n','Games worked']]:
    [['margin','Best foul margin'],['drawn','Most drawn / 100'],['committed','Most committed / 100'],['least','Fewest committed / 100'],['n','Games']];
  if(!options.some(([k])=>k===state.sort))state.sort=options[0][0];
  setOptions('sort',options,state.sort);
  $('search').placeholder=ref?'Search referees':state.view==='players'?'Search players':'Search teams';
  document.querySelector('.search').firstChild.textContent=ref?'Find a referee':state.view==='players'?'Find a player':'Find a team';
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
}
function unpackPlayers(data, games) {
  if (Array.isArray(data)) return data;
  const records = [];
  for (const game of games) {
    for (const [id, away, exposure, ct, dt] of data.games[game.id] ?? []) {
      records.push({id, g:game.id, t:away ? game.a : game.h, p:exposure/2,
        c:sumCounts(ct), d:sumCounts(dt), name:data.players[id], ct, dt});
    }
  }
  return records;
}
async function loadSeason() {
  const current=++request;
  document.body.classList.add('loading');$('error').hidden=true;
  try {
    const [g,p]=await Promise.all([fetchData('games-'+state.year+'.json.gz'),
      state.view==='players'?fetchData('players-'+state.year+'.json.gz'):Promise.resolve([])]);
    if(current!==request)return;
    games=g.map(reconcileGameTypes);players=unpackPlayers(p,games);
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
let columnSort = null;
function render() {
  const records=getRecords();rows=aggregate(records);
  const ref=state.view==='refs',player=state.view==='players';
  const typeIndex=kinds.indexOf(state.type);
  const countGames=new Set(records.map(r=>r.g.id)).size;
  const min=state.minimum;
  visible=rows.filter(x=>x.n>=min&&x.name.toLowerCase().includes(state.search.toLowerCase()));
  visible.sort((a,b)=>(state.sort==='least'?a.committed-b.committed:(b[state.sort]??-Infinity)-(a[state.sort]??-Infinity))||a.name.localeCompare(b.name));
  visible.forEach((entry,i)=>{entry.rank=i+1;});
  if(columnSort){
    const {key,direction}=columnSort;
    visible.sort((a,b)=>{
      const left=a[key],right=b[key];
      if(left==null||right==null)return Number(left==null)-Number(right==null);
      return direction*(typeof left==='string'?left.localeCompare(right):left-right)||a.rank-b.rank;
    });
  }
  if(!rows.some(x=>x.id===state.entity))state.entity=visible[0]?.id||rows[0]?.id||'';
  state.page=Math.min(state.page,Math.max(0,Math.ceil(visible.length/15)-1));
  $('ranktitle').textContent=ref?'Referee leaderboard':player?'Player leaderboard':'Team leaderboard';
  $('ranknote').textContent=ref?'Crew-level game rates. Select a referee to inspect assignments.':'Select a row to inspect the profile and game log.';
  let note=player?'Player rates use tracked on-court possessions. Ambiguous foul-drawn types remain unresolved.':
    ref?'Each official receives the statistics for games worked by the three-person crew.':'Foul margin is opponent fouls minus own fouls.';
  if(state.type&& !player)note+=' Specific-type rates use '+countGames.toLocaleString()+' games with type counts reconciled to both box-score team totals.';
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
  const player=state.view==='players';
  const displayName=x=>ref?safe(x.name):player
    ? '<span class="team-label">'+TeamLogos.icon(x.team)+'<span>'+safe(x.name)+'</span></span>'
    : TeamLogos.label(x.name,x.id);
  const headers=ref?['Rank','Referee','Games','Poss.','Combined / 100','Home edge / 100']:['Rank',state.view==='players'?'Player':'Team','Games','Poss.','Committed / 100','Drawn / 100','Margin / 100'];
  const list=visible.slice(state.page*15,(state.page+1)*15);
  const keys=ref?['rank','name','n','p','committed','home']:['rank','name','n','p','committed','drawn','margin'];
  $('ranktable').innerHTML='<thead><tr>'+headers.map((h,i)=>{
    const key=keys[i];
    const aria=columnSort?.key===key?' aria-sort="'+(columnSort.direction===1?'ascending':'descending')+'"':'';
    return '<th scope="col"'+aria+'><button type="button" data-sort-column="'+key+'">'+h+'</button></th>';
  }).join('')+'</tr></thead><tbody>'+
    list.map((x,i)=>'<tr data-id="'+safe(x.id)+'" class="'+(x.id===state.entity?'selected':'')+'"><td>'+x.rank+'</td><td><button class="namebutton">'+displayName(x)+'</button></td><td>'+x.n+'</td><td>'+fmt(x.p,1)+'</td>'+
      (ref?'<td>'+fmt(x.committed)+'</td><td>'+fmt(x.home)+'</td>':'<td>'+fmt(x.committed)+'</td><td>'+fmt(x.drawn)+'</td><td class="'+(x.margin>=0?'pos':'neg')+'">'+(x.margin>0?'+':'')+fmt(x.margin)+'</td>')+'</tr>').join('')+
    (!list.length?'<tr><td colspan="'+headers.length+'"><div class="empty">No matching records. Try a lower minimum or broader filters.</div></td></tr>':'')+'</tbody>';
  $('ranktable').querySelectorAll('[data-sort-column]').forEach(button=>button.onclick=()=>{
    const key=button.dataset.sortColumn;
    const direction=columnSort?.key===key?-columnSort.direction:(key==='rank'||key==='name'?1:-1);
    columnSort={key,direction};
    state.page=0;
    render();
    $('ranktable').querySelector('[data-sort-column="'+key+'"]')?.focus();
  });
  document.querySelectorAll('#ranktable tr[data-id]').forEach(tr=>tr.onclick=()=>{state.entity=tr.dataset.id;renderTable();renderProfile();updateUrl();resize();$('entitytitle').setAttribute('tabindex','-1');$('entitytitle').focus();});
  $('page').textContent=visible.length?((state.page*15+1)+'–'+Math.min((state.page+1)*15,visible.length)+' of '+visible.length):'0 results';
  $('prev').disabled=state.page===0;$('next').disabled=(state.page+1)*15>=visible.length;
}
function renderProfile() {
  const ref=state.view==='refs',player=state.view==='players';
  const entity=rows.find(x=>x.id===state.entity);
  setOptions('entity',rows.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(x=>[x.id,x.name]),state.entity);
  $('entitytitle').innerHTML=entity?(ref?safe(entity.name):TeamLogos.label(player?entity.team:entity.name,player?null:entity.id)+(player?' '+safe(entity.name):'')):'No profile available';
  $('entity').disabled=!entity;
  $('profile-mix').hidden=$('profile-games').hidden=!entity;
  if(!entity){
    for(const id of ['profilemetrics','foul-counts','mix','gamelog','method'])$(id).innerHTML='';
    $('profilenote').textContent='Try broader filters to view a profile.';
    return;
  }
  $('profilenote').textContent=ref?'All fouls in this official’s assignments; individual whistles are unattributed.':
    player?(entity.team+' · reconstructed on-court possession exposure'):entity.conference;
  const qualified=rows.filter(x=>x.n>=state.minimum&&x.p>0&&(!player||x.p>=100));
  const position=playerPositions[entity.id]?.position;
  const peerGroups=[
    {id:'all',label:(ref?'Officials':player?'Players':'Teams')+' in filtered season sample',shortLabel:ref?'officials':player?'players':'teams',members:qualified},
    ...(!ref?[{id:'conference',label:entity.conference+' filtered sample',shortLabel:entity.conference,members:qualified.filter(x=>x.conference===entity.conference)}]:[]),
    ...(player&&position?[{id:'position',label:position+' position · filtered season sample',shortLabel:position+' peers',members:qualified.filter(x=>playerPositions[x.id]?.position===position)}]:[])
  ];
  const headline=player&&position?peerGroups.at(-1):ref?peerGroups[0]:peerGroups[1];
  const metrics=ref?[
    ['committed','Combined / 100',false,'Most fouls'],
    ['home','Home edge / 100',false,'Largest home edge']
  ]:[
    ['committed','Committed / 100',true,'Fewest committed'],
    ['drawn','Drawn / 100',false,'Most drawn'],
    ['margin','Margin / 100',false,'Largest margin']
  ];
  const comparison=(key,label,lower,groups)=>({value:entity[key],label,lower,format:v=>fmt(v),
    cohorts:groups.map(g=>({label:g.label,shortLabel:g.shortLabel,values:g.members.map(x=>x[key]),
      includesSelected:g.members.some(x=>x.id===entity.id)}))});
  $('profilemetrics').innerHTML=metrics.map(([key,label,lower,direction])=>{
    const chip=PeerContext.badges(comparison(key,label,lower,[headline]));
    return '<div>'+label+'<strong>'+fmt(entity[key])+'</strong><small>'+direction+'</small>'+
      (chip||'<small>Peer rank unavailable</small>')+'</div>';
  }).join('');
  $('foul-counts').textContent=entity.n+' games · '+fmt(entity.p,1)+' possessions · '+
    (ref?entity.c+' combined fouls · '+fmt(entity.edgeP,1)+' non-neutral possessions for home edge':
      entity.c+' fouls committed · '+entity.d+' fouls drawn');
  renderMix(entity, peerGroups, headline, ref, player);
  renderGameLog(entity, ref);
  $('method').textContent=ref?'Rates divide the combined fouls from both teams by estimated possessions per team. Home edge measures visitor fouls minus home fouls, excluding neutral sites.':
    player?'Rates divide recorded player foul events by on-court team possessions, then multiply by 100. The denominator averages offensive and defensive possessions while that player is on the floor.':
    'Rates divide team fouls by estimated possessions per team, then multiply by 100. Drawn means fouls assessed to the opponent. Positive margin means the opponent was assessed more fouls.';
}
function mixSummary(records, player, useDrawn) {
  const result = {counts: [0, 0, 0, 0], possessions: 0, games: new Set()};
  for (const record of records) {
    const counts = useDrawn ? record.dt : record.ct;
    if (!counts?.length || (!player && !record.g.clean)) continue;
    bucketCounts(counts).forEach((count, i) => { result.counts[i] += count; });
    result.possessions += record.p;
    result.games.add(record.g.id);
  }
  return result;
}

function renderMix(entity, peerGroups, headline, ref, player) {
  const peer = peerGroups.find(group => group.id === state.mixPeer) || headline;
  setOptions('mix-peer', peerGroups.map(group => [group.id, group.shortLabel]), peer.id);
  $('mix-tabs').hidden = ref;
  const useDrawn = !ref && state.mixRole === 'drawn';
  $('mix-committed').setAttribute('aria-pressed', String(!useDrawn));
  $('mix-drawn').setAttribute('aria-pressed', String(useDrawn));
  const own = mixSummary(entity.records, player, useDrawn);
  const others = peer.members.filter(member => member.id !== entity.id);
  let peerRecords = others.flatMap(member => member.records);
  if (ref) {
    // Crews repeat across officials' records. Count each comparison game once,
    // and remove the selected official's assignments from the benchmark.
    const gamesWorked = new Set(entity.records.map(record => record.g.id));
    peerRecords = [...new Map(peerRecords.filter(record => !gamesWorked.has(record.g.id))
      .map(record => [record.g.id, record])).values()];
  }
  const benchmark = mixSummary(peerRecords, player, useDrawn);
  const ownRates = own.counts.map(count => r100(count, own.possessions));
  const benchmarkRates = benchmark.counts.map(count => r100(count, benchmark.possessions));
  const scale = 5 * Math.ceil(Math.max(1, ...[...ownRates, ...benchmarkRates].filter(Number.isFinite)) / 5);
  const eligible = peer.members.map(member => ({
    id: member.id,
    ...mixSummary(member.records, player, useDrawn)
  })).filter(member => member.games.size >= state.minimum && member.possessions >= (player ? 100 : 0) &&
    member.possessions > 0);
  const canRank = eligible.some(member => member.id === entity.id);
  $('mixlabel').textContent = (ref ? 'Crew fouls' : useDrawn ? 'Fouls drawn' : 'Fouls committed') +
    ' per 100 possessions · Bar scale 0–'+scale+
    ' · '+own.games.size+' games with type detail'+(benchmark.games.size ? ' · '+benchmark.games.size+' peer games with type detail' : '')+
    (state.type ? ' · Mix includes all types within those games.' : '');
  if (!own.games.size) {
    $('mix').innerHTML = '<p class="empty">Foul-type detail is unavailable for this profile under the current filters.</p>';
    return;
  }
  const rows = mixBuckets.map((label,i) => {
    const count = own.counts[i];
    const value = ownRates[i];
    const peerValue = benchmarkRates[i];
    const unit = ' / 100';
    const percentile = canRank
      ? PeerContext.stats(value, eligible.map(member => r100(member.counts[i], member.possessions))).percentile
      : null;
    const percentileLabel = percentile === null ? 'Percentile unavailable' : Math.round(percentile)+'%ile';
    const peerLabel = 'Peer benchmark '+fmt(peerValue,1)+unit;
    const tick = Number.isFinite(peerValue)
      ? '<span class="benchmark-marker" style="left:'+(100*peerValue/scale)+'%"></span>' : '';
    return '<tr><th scope="row">'+label+'</th><td><div class="mix-value"><strong>'+
      fmt(value,1)+(Number.isFinite(value)?unit:'')+'</strong><small>'+count.toLocaleString()+
      ' fouls</small><span class="peer-badge">'+percentileLabel+'</span></div>'+
      '<div class="bartrack" aria-hidden="true"'+(tick?' title="'+peerLabel+'"':'')+'><div class="barfill" style="width:'+
      (Number.isFinite(value)?100*value/scale:0)+'%"></div>'+tick+'</div>'+
      (tick?'<span class="mix-sr-only">'+peerLabel+'</span>':'')+'</td></tr>';
  }).join('');
  const legend = benchmark.possessions > 0 ?
    '<p class="muted mix-legend"><span class="benchmark-marker" aria-hidden="true"></span>'+
    safe(peer.shortLabel)+' benchmark</p>' : '';
  const benchmarkNote = benchmark.games.size ?
    (ref?'The benchmark pools unique games outside this official’s assignments.':'Peer mix pools eligible records from other '+peerGroups[0].shortLabel+'.') :
    'No comparable peer games under the current filters.';
  const percentileNote = ' Percentiles compare rates across '+eligible.length+' eligible '+peerGroups[0].shortLabel+
    ' in the selected peer group. Eligibility requires '+state.minimum+' games with type detail'+
    (player?' and 100 tracked possessions in those games':'')+
    '. Higher percentiles mean more fouls per 100. Percentiles require at least five eligible profiles and an eligible selected profile.';
  $('mix').innerHTML = legend+'<div class="tablewrap"><table class="mix-table"><thead><tr><th scope="col">Type</th>'+
    '<th scope="col">'+safe(ref?'Selected crew assignments':entity.name)+'</th></tr></thead><tbody>'+
    rows+'</tbody></table></div><p class="muted">'+benchmarkNote+percentileNote+'</p>';
}

function renderGameLog(entity, ref) {
  const gameRows = entity.records.slice().sort((a,b)=>b.g.date.localeCompare(a.g.date));
  const headers = ['Date','Matchup','Location','Possessions',ref?'Combined':'Committed',...(ref?[]:['Drawn']), 'Rate / 100'];
  const rateMax = Math.max(1, ...gameRows.filter(record=>record.p>0).map(record=>r100(record.committed,record.p)));
  const teamBreakdown = (game, side) => {
    const counts = game.clean ? bucketCounts(game[side+'t']) : mixBuckets.map(()=> '—');
    return '<tr><th scope="row">'+safe(game[side+'n'])+'</th>'+counts.map(count=>'<td>'+count+'</td>').join('')+
      '<td>'+game[side+'f']+'</td></tr>';
  };
  $('gamelog').innerHTML = '<thead><tr>'+headers.map(label=>'<th scope="col">'+label+'</th>').join('')+'</tr></thead><tbody>'+
    gameRows.map(record=>{
      const game = record.g;
      const rate = r100(record.committed, record.p);
      const matchup = safe(game.an+' at '+game.hn);
      const split = '<details class="game-split"><summary>'+matchup+'</summary>'+
        '<table><caption>Fouls assessed by team</caption><thead><tr><th scope="col">Team</th>'+
        [...mixBuckets,'Total'].map(label=>'<th scope="col">'+label+'</th>').join('')+'</tr></thead><tbody>'+
        teamBreakdown(game,'a')+teamBreakdown(game,'h')+'</tbody></table>'+
        (game.clean?'':'<p class="muted">Play-by-play types could not be reconciled. Box-score totals are shown.</p>')+'</details>';
      return '<tr><td>'+safe(game.date)+'</td><td>'+split+'</td><td>'+safe(record.site)+'</td><td>'+fmt(record.p,1)+
        '</td><td>'+record.committed+'</td>'+(!ref?'<td>'+record.drawn+'</td>':'')+
        '<td><div class="game-rate">'+fmt(rate)+'<div class="bartrack" aria-hidden="true"><div class="barfill" style="width:'+
        (Number.isFinite(rate)?100*rate/rateMax:0)+'%"></div></div></div></td></tr>';
    }).join('')+'</tbody>';
}

function updateUrl() {
  const params=new URLSearchParams({view:state.view,season:state.year});
  for(const id of ['conference','stage','location','type','search','minimum','sort','entity','mixRole','mixPeer']) {
    if(state[id]) params.set(id,state[id]);
  }
  history.replaceState(null,'','?'+params);
  if(window.parent!==window)window.parent.postMessage({foulView:state.view,season:state.year},location.origin);
}
function resize(){setTimeout(()=>{if(window.parent!==window)window.parent.postMessage({foulHeight:document.documentElement.scrollHeight},location.origin)},50)}
function exportCsv() {
  const ref=state.view==='refs';
  const head=ref?['Referee','Games','Possessions','Combined per100','Home edge per100']:['Name','Games','Possessions','Committed per100','Drawn per100','Margin per100'];
  const lines=[head.join(',')];
  visible.forEach(x=>lines.push([x.name,x.n,x.p,x.committed,ref?x.home:x.drawn,...(ref?[]:[x.margin])].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')));
  const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));
  const a=document.createElement('a');a.href=url;a.download='foul-analysis-'+state.view+'-'+state.year+'.csv';a.click();URL.revokeObjectURL(url);
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
  columnSort=null;state.view=b.dataset.view;state.page=0;state.search='';$('search').value='';state.entity=state.view==='teams'?'120':state.view==='refs'?'Paul Szelc':'';
  state.sort=state.view==='refs'?'committed':defaults.sort;
  state.type='';state.location='';state.mixPeer='';loadSeason();
});
for(const id of ['conference','stage','location','type','minimum','sort'])$(id).onchange=()=>{
  if(id==='sort')columnSort=null;
  state[id]=id==='minimum'?+$(id).value:$(id).value;state.page=0;render();
};
$('season').onchange=()=>{state.year=+$('season').value;state.page=0;loadSeason();};
$('search').oninput=()=>{state.search=$('search').value;state.page=0;renderTableFromSearch();};
function renderTableFromSearch(){render();}
$('entity').onchange=()=>{state.entity=$('entity').value;renderTable();renderProfile();updateUrl();resize();};
$('prev').onclick=()=>{state.page--;renderTable();resize();};$('next').onclick=()=>{state.page++;renderTable();resize();};
$('mix-committed').onclick=()=>{state.mixRole='committed';renderProfile();updateUrl();resize();};
$('mix-drawn').onclick=()=>{state.mixRole='drawn';renderProfile();updateUrl();resize();};
$('mix-peer').onchange=()=>{state.mixPeer=$('mix-peer').value;renderProfile();updateUrl();resize();};
$('share').onclick=()=>ViewTools.copy($('share'),location.href);
$('reset').onclick=()=>{columnSort=null;Object.assign(state,defaults,{view:state.view,year:state.year,
 entity:state.view==='teams'?'120':state.view==='refs'?'Paul Szelc':''});$('search').value='';loadSeason();};
$('export').onclick=exportCsv;$('filters').onsubmit=e=>e.preventDefault();
new ResizeObserver(()=>resize()).observe(document.querySelector('main'));
fetchData('meta.json').then(meta=>{
 const params=new URLSearchParams(location.search);if(['teams','players','refs'].includes(params.get('view')))state.view=params.get('view');
 if(meta.seasons.some(s=>String(s.year)===params.get('season')))state.year=+params.get('season');
 for(const id of ['conference','stage','location','type','search','sort','entity','mixRole','mixPeer']) {
   if(params.has(id))state[id]=params.get(id);
 }
 if([1,3,5,10,20].includes(+params.get('minimum')))state.minimum=+params.get('minimum');
 $('search').value=state.search;$('minimum').value=String(state.minimum);
 setOptions('season',meta.seasons.slice().reverse().map(s=>[s.year,s.label]),state.year);return loadSeason();
}).catch(e=>{$('error').hidden=false;$('error').textContent=e.message;});
