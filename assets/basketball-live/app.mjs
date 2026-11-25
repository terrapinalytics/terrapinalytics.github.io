import {rate,fmt,line,unpack} from './metrics.mjs?v=3';
import {halfBoxes} from './half-box.mjs';
import {scoreTrend,periodLabel,trendSnapshot,recordedPossessionArrow} from './score-trend.mjs?v=4';

const api = 'https://terrapinalytics-basketball-feed.terrapinalytics.workers.dev';
const md = '120';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percent = n => n == null ? '—' : fmt(n)+'%';
const time = (d, options) => new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',...options}).format(new Date(d));
const gameDate = d => time(d,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const type = e => e.competitions?.[0]?.status?.type;
const finalGames = new Map(), seasons = new Map();
let selectedTeam = md, selectedHalf = 0, active, box, loading = false;

async function get(path) {
  const response = await fetch(api+path,{signal:AbortSignal.timeout(25000)});
  if (!response.ok) throw Error('Shared feed returned '+response.status);
  return response.json();
}

const shot = (makes,attempts,separator='–') => ({
  text:line(makes,attempts).replace('–',separator),pair:[makes,attempts]
});
const countAndRate = pair => ({
  text:[fmt(pair[0],0),percent(rate(pair))],pair
});
const descriptors = [
  ['eFG%', ['2P','3P','3P Rate'], ({stats:s}) =>
    [shot(s.twoM,s.twoA),shot(s.threeM,s.threeA),{
      text:percent(rate([s.threeA,s.fga])),pair:[s.threeA,s.fga]
    }]],
  ['Turnover %', ['Steal','Non-steal'], ({stats:s,opponent:o,pairs}) => {
    const steals = s.to != null && o.stl != null && o.stl <= s.to ? o.stl : null;
    const other = steals == null ? null : s.to-steals;
    return [steals,other].map(count=>countAndRate([count,pairs[1][1]]));
  }],
  ['OReb%', ['ORB','DRB'], ({stats:s,opponent:o,pairs}) => [
    countAndRate(pairs[2]),
    countAndRate([s.drb,s.drb == null || o.orb == null ? null : s.drb+o.orb])
  ]],
  ['Free throw rate', ['FTA/FGA','FT'], ({stats:s}) =>
    [shot(s.fta,s.fga,'/'),shot(s.ftm,s.fta)]]
];

const shootingStats = s => [shot(s.fgm,s.fga),shot(s.twoM,s.twoA),shot(s.threeM,s.threeA),shot(s.ftm,s.fta)];
const totalGroups = [
  [['MIN','min'],['PTS','pts']],
  [['ORB','orb'],['DRB','drb']],
  [['AST','ast'],['TO','to']],
  [['STL','stl'],['BLK','blk'],['PF','pf']]
];

function pool(total,pairs) {
  pairs.forEach(([n,d],i) => {
    if (n == null || !(d > 0)) return;
    total[i] ??= [0,0];
    total[i][0] += n;
    total[i][1] += d;
  });
}

function finalGame(id, teamId) {
  if (!finalGames.has(id)) {
    finalGames.set(id,get('/summary?event='+id+'&team='+teamId).catch(error => {
      finalGames.delete(id);
      throw error;
    }));
  }
  return finalGames.get(id);
}

async function seasonRates(teamId,event,schedule) {
  const calendar = teamId === md ? schedule : await get('/teams/'+teamId+'/schedule?season='+schedule.season.year);
  const ids = [...new Set(calendar.events.filter(e => type(e)?.completed && e.id !== event.id &&
    Date.parse(e.date) < Date.parse(event.date)).map(e => e.id))];
  const factors = [], details = descriptors.map(()=>[]), players = new Map();
  let count = 0;
  for (let i=0;i<ids.length;i+=5) {
    const results = await Promise.allSettled(ids.slice(i,i+5).map(id=>finalGame(id,teamId)));
    results.forEach((result,j) => {
      if (result.status !== 'fulfilled') return;
      const data = unpack(result.value,teamId);
      if (!data || !data.pairs.some(pair=>rate(pair)!=null)) {
        finalGames.delete(ids[i+j]);
        return;
      }
      count++;
      pool(factors,data.pairs);
      descriptors.forEach(([, ,rows],k)=>pool(details[k],rows(data).map(row=>row.pair)));
      for (const player of data.players) {
        if (player.id == null) continue;
        if (!players.has(player.id)) players.set(player.id,{rates:[],shooting:[]});
        const playerSeason = players.get(player.id);
        pool(playerSeason.rates,player.pairs);
        pool(playerSeason.shooting,shootingStats(player.stats).map(shot=>shot.pair));
      }
    });
  }
  return {count,total:ids.length,factors,details,players};
}

function loadSeason(teamId,event,schedule) {
  const key = event.id+':'+teamId;
  if (!seasons.has(key)) {
    const request = seasonRates(teamId,event,schedule).then(sample => {
      if (sample.count !== sample.total) seasons.delete(key);
      return sample;
    }).catch(error => {
      seasons.delete(key);
      throw error;
    });
    seasons.set(key,request);
  }
  return seasons.get(key);
}

function rateComparison(pair,reference,lower=false) {
  const value = rate(pair), average = rate(reference ?? []);
  if (value == null || average == null) return {style:'',note:'Season comparison unavailable'};
  const edge = (value-average)*(lower?-1:1);
  const strength = average > 0 ? Math.min(1,Math.abs(edge)/average*2) : Number(edge!==0);
  const shade = edge >= 0 ? 'var(--bench-green)' : 'var(--bench-red)';
  return {
    style:'--rate-bg:color-mix(in srgb,'+shade+' '+Math.round(strength*100)+'%,var(--bench-neutral))',
    note:'Game '+percent(value)+' · Season '+percent(average)
  };
}

function teamColor(team) {
  const hex = String(team.color ?? '').replace(/^#/,'');
  return /^[0-9a-f]{6}$/i.test(hex) ? '#'+hex : team.id === md ? '#b01b34' : '#686068';
}

let inspectedTime = null;
function dismissSnapshot() {
  inspectedTime = null;
  const overlay = document.querySelector('.trend-inspection');
  if (overlay) overlay.hidden = true;
  if (document.activeElement?.matches('.trend-plot')) document.activeElement.blur();
}
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.trend-plot')) dismissSnapshot();
}, true);
window.addEventListener('blur', dismissSnapshot);
if (parent !== window) {
  try { parent.document.addEventListener('pointerdown', dismissSnapshot, true); }
  catch { /* Cross-origin embeds use the window blur listener. */ }
}

function inspectTrend(plot,points,end,maximum,sides) {
  const overlay = plot.querySelector('.trend-inspection');
  const clock = overlay.querySelector('.trend-inspect-clock');
  const score = overlay.querySelector('.trend-inspect-score');
  const dots = overlay.querySelectorAll('.trend-dot');
  const latest = points.at(-1).time;
  const abbreviations = sides.map(side=>side.team.abbreviation);
  const update = time => {
    const snapshot = trendSnapshot(points,time);
    inspectedTime = snapshot.elapsed;
    const label = periodLabel(snapshot.period)+' · '+snapshot.clock;
    const result = snapshot.scores.map((points,i)=>abbreviations[i]+' '+points).join(' · ');
    overlay.style.setProperty('--inspect-x',100*inspectedTime/end+'%');
    clock.textContent = label;
    score.textContent = result;
    snapshot.scores.forEach((points,i)=>dots[i].style.top = 100*(1-points/maximum)+'%');
    overlay.hidden = false;
    plot.setAttribute('aria-valuenow',String(Math.round(inspectedTime)));
    plot.setAttribute('aria-valuetext',label+' · '+result);
  };
  const clear = () => {
    inspectedTime = null;
    overlay.hidden = true;
  };
  const pointAt = event => {
    const {left,width} = plot.getBoundingClientRect();
    if (width > 0) update(Math.round((event.clientX-left)/width*end));
  };
  plot.onpointermove = event => {if (event.pointerType==='mouse' || event.pointerType==='pen') pointAt(event);};
  plot.onpointerleave = event => {if (event.pointerType!=='touch' && document.activeElement!==plot) clear();};
  plot.onclick = pointAt;
  plot.onfocus = () => update(inspectedTime ?? latest);
  plot.onblur = clear;
  plot.onkeydown = event => {
    const from = inspectedTime ?? latest;
    const seeks = {ArrowLeft:from-15,ArrowDown:from-15,ArrowRight:from+15,ArrowUp:from+15,
      PageDown:from-60,PageUp:from+60,Home:0,End:latest};
    if (event.key==='Escape') clear();
    else if (Object.hasOwn(seeks,event.key)) {
      event.preventDefault();
      update(seeks[event.key]);
    }
  };
  plot.setAttribute('aria-valuemax',String(Math.round(latest)));
  if (inspectedTime !== null) update(inspectedTime);
  else plot.setAttribute('aria-valuenow',String(Math.round(latest)));
}

function renderTrend(trend,sides) {
  const target = $('score-trend');
  target.hidden = !trend;
  if (!trend) {
    inspectedTime = null;
    return;
  }
  const {points,runs,end} = trend;
  const maximum = Math.max(20,Math.ceil(Math.max(...points.flatMap(p=>p.scores))/20)*20);
  const x = time => 100*time/end;
  const y = score => 100*(1-score/maximum);
  const lines = sides.map((side,i) => {
    const path = points.map(({time,scores},j)=> j===0 ? 'M 0 '+y(scores[i]) : 'H '+x(time)+' V '+y(scores[i])).join(' ');
    return '<path class="trend-line" style="--series:'+teamColor(side.team)+'" d="'+path+'"/>';
  }).join('');
  const runMarkers = runs.map((run,i)=>
    '<span class="trend-marker" aria-hidden="true" style="--x:'+x(run.end)+'%;--y:'+y(run.score)+
    '%">'+(i+1)+'</span>').join('');
  const runLabels = runs.map((run,i)=>'<li><b>'+(i+1)+'</b> '+escape(sides[run.team].team.abbreviation)+
    ' <strong>'+run.points+'–0</strong> <span>'+escape(periodLabel(run.period)+' '+run.clock)+'</span></li>').join('');
  const breaks = [1200,2400].filter(t=>t<end);
  for (let time=2700;time<end;time+=300) breaks.push(time);
  const grid = '<path class="trend-grid" d="M 0 0 H 100 M 0 50 H 100 M 0 100 H 100 '+
    breaks.map(time=>'M '+x(time)+' 0 V 100').join(' ')+'"/>';
  const ticks = [0,...breaks,end].map((time,i)=>
    '<span style="left:'+x(time)+'%">'+(i===0?'Tip':time===1200?'Half':time===2400?'40 min':time/60+' min')+'</span>').join('');
  const dots = sides.map(side=>'<i class="trend-dot" style="--series:'+teamColor(side.team)+'"></i>').join('');
  const inspection = '<div class="trend-inspection" hidden aria-hidden="true"><i class="trend-crosshair"></i>'+
    dots+'<div class="trend-tooltip"><span class="trend-inspect-clock"></span><strong class="trend-inspect-score"></strong></div></div>';
  const markup = '<div class="trend-plot" tabindex="0" role="slider" aria-valuemin="0" aria-label="Game score timeline">'+
    '<div class="trend-y" aria-hidden="true"><span>'+maximum+'</span><span>'+(maximum/2)+'</span><span>0</span></div>'+
    '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">'+grid+lines+'</svg>'+
    runMarkers+inspection+'<div class="trend-x" aria-hidden="true">'+ticks+'</div></div>'+
    (runs.length?'<ul class="trend-runs" aria-label="Unanswered runs of at least eight points">'+runLabels+'</ul>':'');
  if (target.chartMarkup !== markup) {
    const oldPlot = target.querySelector('.trend-plot');
    const restoreFocus = oldPlot && document.activeElement === oldPlot;
    const selection = inspectedTime;
    target.innerHTML = markup;
    inspectedTime = selection;
    target.chartMarkup = markup;
    const plot = target.querySelector('.trend-plot');
    inspectTrend(plot,points,end,maximum,sides);
    if (restoreFocus) plot.focus({preventScroll:true});
  }
}

function timeoutTicks(remaining) {
  if (remaining == null) return '';
  return '<span class="timeout-ticks" role="img" title="'+remaining+' timeouts remaining" aria-label="'+
    remaining+' timeouts remaining">'+(remaining ? '<i></i>'.repeat(remaining) : '<i class="empty"></i>')+'</span>';
}

function possessionArrow(competition,fallback,sides,status,plays) {
  if (status.type?.state !== 'in') return '';
  const source = [competition,fallback].find(c=>c?.possessionArrowAvailable===true);
  const teamId = source?.situation?.possessionArrow?.team?.id ?? source?.situation?.possessionArrow?.id;
  const flagged = source?.competitors?.filter(side=>side.possession===true) ?? [];
  const official = teamId ?? (flagged.length===1 ? flagged[0].team.id : null);
  const owner = official ?? recordedPossessionArrow(plays,sides.map(side=>String(side.team.id)),status);
  const index = sides.findIndex(side=>owner!=null && String(side.team.id)===String(owner));
  const label = index<0 ? 'Possession arrow unavailable' :
    (official==null?'Estimated possession arrow: ':'Possession arrow: ')+sides[index].team.abbreviation;
  return '<span class="possession" role="img" aria-label="'+escape(label)+'" title="'+escape(label)+'">'+
    '<span aria-hidden="true">'+(index===0?'←':index===1?'→':'↔')+'</span><small>Poss</small></span>';
}

function renderScore(event,competition,plays=[],fallback={}) {
  const status = {...fallback.status,...competition.status};
  const state = status.type?.state;
  const sides = [...competition.competitors].sort((a,b) => Number(b.team.id === md)-Number(a.team.id === md));
  const trend = plays.length && state !== 'pre' ? scoreTrend(plays,sides,status) : null;
  const team = (t,i) => {
    const score = typeof t.score === 'object' ? (t.score?.displayValue ?? t.score?.value) : t.score;
    const id = String(t.team.id);
    const logo = /^\d+$/.test(id) ? '<img alt="" src="https://a.espncdn.com/i/teamlogos/ncaa/500/'+id+'.png">' : '';
    const name = escape(t.team.shortDisplayName ?? t.team.location ?? t.team.displayName);
    const count = trend?.counters[i];
    const provider = competition.timeoutsAvailable ? t.timeoutsRemaining : null;
    const remaining = Number.isInteger(provider) && provider>=0 ? provider : count?.timeoutsRemaining;
    const stats = count ? '<small>'+count.fouls+(count.fouls===1?' foul':' fouls')+'</small>' : '';
    return '<div class="scoreteam" style="--series:'+teamColor(t.team)+'">'+logo+
      '<div class="scoreteam-info"><strong>'+name+'</strong>'+stats+'</div>'+
      '<div class="score-number"><b>'+escape(state === 'pre' ? '—' : score ?? '—')+'</b>'+timeoutTicks(remaining)+'</div></div>';
  };
  const label = state === 'pre' ? gameDate(event.date) : status.type?.shortDetail ?? 'Game status pending';
  const markup = team(sides[0],0)+'<div class="clock">'+escape(label)+
    possessionArrow(competition,fallback,sides,status,plays)+'</div>'+team(sides[1],1);
  if ($('scoreboard').innerHTML !== markup) $('scoreboard').innerHTML = markup;
  renderTrend(trend,sides);
}

function renderFactors(teams,samples) {
  $('factors').innerHTML = descriptors.map(([title,labels,raw],i) => {
    const values = teams.map(t => rate(t.data.pairs[i]));
    const maximum = Math.max(25,Math.ceil(Math.max(...values,0)/25)*25);
    const ticks = '<div class="factor-axis" aria-hidden="true">'+[maximum,maximum/2,0]
      .map(tick=>'<span>'+tick+'%</span>').join('')+'</div>';
    const bars = teams.map(({team,data},j) => {
      const value = values[j];
      const height = 100*(value ?? 0)/maximum;
      const {style,note} = rateComparison(data.pairs[i],samples.get(team.id)?.factors[i],i===1);
      const label = escape(team.abbreviation+' '+percent(value)+' · '+note);
      return '<div class="factor-slot" style="--bar-height:'+height+'%;'+style+'"><span class="factor-value" title="'+label+
        '" aria-label="'+label+'">'+percent(value)+'</span>'+
        '<span class="factor-bar" style="--team-bar:'+teamColor(team)+'" aria-hidden="true"></span></div>';
    }).join('');
    const details = teams.map(({data})=>raw(data));
    const headings = teams.map(({team},j)=>'<th scope="col"'+(j===0?' class="md"':'')+'>'+escape(team.abbreviation)+'</th>').join('');
    const rows = labels.map((label,row)=>'<tr><th scope="row">'+label+'</th>'+details.map((values,j) => {
      const {text:value,pair} = values[row];
      const {style,note} = rateComparison(pair,samples.get(teams[j].team.id)?.details[i][row],i===1);
      const markup = Array.isArray(value)
        ? '<span class="factor-pair"><span>'+value[0]+'</span><span>'+value[1]+'</span></span>'
        : escape(value);
      return '<td><span class="factor-stat-value" style="'+style+'" title="'+note+'">'+markup+'</span></td>';
    }).join('')+'</tr>').join('');
    return '<article class="factor"><h3>'+title+'</h3>'+
      '<div class="factor-chart">'+ticks+'<div class="factor-gridlines" aria-hidden="true"></div>'+bars+'</div>'+
      '<table class="factor-stats" aria-label="'+title+' details"><thead><tr><td></td>'+headings+
      '</tr></thead><tbody>'+rows+'</tbody></table></article>';
  }).join('');
}

const columns = [
  ['Player'], ['MIN'], ['PTS'],
  ['eFG%','rates'], ['Player TO%','rates','TO%'],
  ['Offensive and defensive rebound percentages','rates','OR% / DR%'],
  ['Free throw rate (FTA/FGA)','rates','FTR'],
  ['FG','shooting'], ['2P','shooting'], ['3P','shooting'], ['FT','shooting'],
  ['ORB'], ['DRB'], ['TO'], ['AST'], ['STL'], ['BLK'], ['PF'],
  ['Minutes and points','totals','Time'], ['Offensive and defensive rebounds','totals','Reb'],
  ['Assists and turnovers','totals','Ball'], ['Steals, blocks and fouls','totals','Def']
];

for (const button of $('box-views').children) {
  button.onclick = () => {
    const view = button.dataset.view;
    $('players').dataset.view = view;
    for (const choice of $('box-views').children) {
      choice.setAttribute('aria-pressed',String(choice===button));
    }
  };
}

const rateColumn = columns.findIndex(([,view]) => view === 'rates');
const shootingColumn = columns.findIndex(([,view]) => view === 'shooting');
const totalsColumn = columns.findIndex(([,view]) => view === 'totals');

const columnAttr = i => columns[i][1] ? ' class="view-'+columns[i][1]+'"' : '';
const statCell = (html,i) => '<td'+columnAttr(i)+'>'+html+'</td>';
const shadedStat = (value,{style,note}) =>
  '<span class="box-shade" style="'+style+'" title="'+note+'">'+escape(value ?? '—')+'</span>';

function playerLabel(player) {
  const fullName = player.name ?? '';
  const parts = fullName.trim().split(/\s+/);
  const surname = parts.filter(part => !/^(?:Jr\.?|Sr\.?|II|III|IV|V)$/i.test(part)).at(-1);
  const abbreviated = /^[^ ]\. /.test(player.shortName ?? '') ? player.shortName :
    parts.length > 1 ? parts[0][0]+'. '+surname : fullName;
  const position = player.position ? ' '+player.position : '';
  return '<span class="player-line" title="'+escape(fullName+position)+'" aria-label="'+escape(fullName+position)+
    '" style="--name-length:'+Math.max(1,abbreviated.length+position.length)+'">'+escape(abbreviated)+
    '<span class="player-position">'+escape(position)+'</span></span>';
}

const rateNames = ['eFG%','TO%','OR%','DR%','FTR'];
function rateValue(pair,reference,i) {
  const {style,note} = rateComparison(pair,reference,i===1);
  const value = percent(rate(pair));
  const label = rateNames[i]+' '+value+' · '+note;
  return '<strong class="rate-value" title="'+label+'" aria-label="'+label+'" style="'+style+'">'+value+'</strong>';
}

function visibleTeams() {
  const selected = box.halves.get(selectedHalf);
  return selected ? box.teams.map(({team})=>({team,data:selected.get(team.id)})) : box.teams;
}

const profileLabels = ['eFG%', '2P%', '3P%', '3P Rate', 'TO%', 'Steal TO%', 'Non-steal TO%', 'OReb%', 'DReb%', 'FT Rate', 'FT%', 'Assist Rate', 'Block Rate'];
let profileData, profileKey;
async function renderProfiles() {
  if (!box || !$('team-profiles').open) return;
  const teams = box.teams.map(t => t.team);
  const key = teams.map(t => t.id).join('/');
  if (profileKey === key) return;
  profileKey = key;
  const out = $('profile-body');
  out.textContent = 'Loading…';
  try {
    profileData ??= fetch('./profiles.json').then(r => {
      if (!r.ok) throw Error('Profiles unavailable');
      return r.json();
    });
    const data = await profileData;
    if (profileKey !== key) return;
    const count = Object.keys(data.teams).length;
    const cell = (value,unit,span=1) => {
      const td = span === 2 ? '<td colspan="2">' : '<td>';
      if (!value) return td+'—</td>';
      const [n,rank] = value;
      const fraction = (rank-1)/Math.max(1,count-1);
      const color = fraction <= .5 ? 'var(--bench-green)' : 'var(--bench-red)';
      const shade = Math.round(Math.abs(1-2*fraction)*100);
      return td+'<span class="profile-value" style="background:color-mix(in srgb,'+color+' '+shade+
        '%,var(--bench-neutral))">'+n.toFixed(1)+unit+' <small>#'+rank+'</small></span></td>';
    };
    const order = [0,1,2,3,11,12,4,5,6,7,8,9,10];
    out.innerHTML = '<p>D-I games through '+escape(data.through)+' · '+count+' teams</p>'+
      '<table><thead><tr><th rowspan="2">Rate</th>'+teams.map(t=>
        '<th colspan="2">When '+escape(t.location || t.displayName)+' has the ball</th>').join('')+'</tr><tr>'+
      teams.map((off,j)=>'<th>'+escape(off.abbreviation)+'<br>Off</th><th>'+escape(teams[1-j].abbreviation)+'<br>Def</th>').join('')+
      '</tr></thead><tbody>'+order.map(i=>'<tr class="'+([0,4,7,9].includes(i)?'factor-row':'')+'"><th scope="row">'+profileLabels[i]+'</th>'+
        teams.map((off,j)=>cell(data.teams[off.id]?.[0]?.[i],'%')+cell(data.teams[teams[1-j].id]?.[1]?.[i],'%')).join('')+'</tr>').join('')+
      '</tbody><tbody class="team-metrics"><tr><th>Team comparison</th>'+teams.map(t=>'<th colspan="2">'+escape(t.abbreviation)+'</th>').join('')+'</tr>'+
      ['Tempo','Effective height','Roster experience'].map((label,i)=>
        '<tr><th scope="row">'+label+'</th>'+teams.map(t=>cell(data.comparison?.[t.id]?.[i],['','″',' yr'][i],2)).join('')+'</tr>'
      ).join('')+'</tbody></table>';
  } catch {
    profileData = profileKey = null;
    out.textContent = 'Profiles unavailable. Reopen to retry.';
  }
}
$('team-profiles').ontoggle = renderProfiles;

function renderSplit() {
  renderProfiles();
  for (const button of $('game-splits').children) {
    const half = Number(button.dataset.half);
    button.disabled = half!==0 && !box.halves.has(half);
    button.setAttribute('aria-pressed',String(half===selectedHalf));
  }
  renderFactors(visibleTeams(),box.samples);
  renderPlayers();
}

for (const button of $('game-splits').children) {
  button.onclick = () => {
    selectedHalf = Number(button.dataset.half);
    renderSplit();
  };
}

function renderPlayers() {
  if (!box) return;
  const teams = visibleTeams();
  const {samples} = box;
  const {data,team} = teams.find(t => t.team.id === selectedTeam) ?? teams[0];
  const existing = [...$('teams').children];
  if (existing.map(button => button.dataset.id).join() !== teams.map(t => t.team.id).join()) {
    $('teams').replaceChildren(...teams.map(({team}) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.id = team.id;
      button.textContent = team.abbreviation;
      button.onclick = () => {selectedTeam=team.id;renderPlayers();};
      return button;
    }));
  }
  for (const button of $('teams').children) button.setAttribute('aria-pressed',String(button.dataset.id===team.id));
  const row = (label,s,pairs,reference,rowClass='') => {
    const [efg,to,or,dr,ftr] = pairs.map((pair,i)=>rateValue(pair,reference?.rates[i],i));
    const metrics = [efg,to,'<div class="rebound-rates">'+or+dr+'</div>',ftr];
    const shooting = shootingStats(s).map(({text,pair},i)=>reference?.shooting ?
      shadedStat(text,rateComparison(pair,reference.shooting[i])) : escape(text));
    const count = key => escape(s[key] ?? '—');
    const raw = ['orb','drb','to','ast','stl','blk','pf'].map(count);
    return '<tr'+rowClass+'><th scope="row">'+label+'</th>'+
      statCell(count('min'),1)+statCell(count('pts'),2)+metrics.map((html,i)=>'<td'+columnAttr(i+rateColumn)+'>'+html+'</td>').join('')+
      [...shooting,...raw].map((html,i)=>statCell(html,i+shootingColumn)).join('')+
      totalGroups.map((group,i)=>statCell(group.map(([label,key])=>
        '<span class="box-stat"><b>'+count(key)+'</b> '+label+'</span>').join(''),i+totalsColumn)).join('')+'</tr>';
  };
  const sample = samples.get(team.id);
  const defensive = descriptors[2][2](data)[1].pair;
  const [efg,to,or,ftr] = data.pairs;
  const reference = sample ? {rates:[...sample.factors.slice(0,3),sample.details[2][1],sample.factors[3]]} : undefined;
  const teamTotal = row('Team total',data.stats,[efg,to,or,defensive,ftr],reference,' class="team-total"');
  const rows = data.players.map(p=>row(playerLabel(p),p.stats,p.pairs,sample?.players.get(p.id)));
  $('players').innerHTML = '<thead><tr>'+columns.map(([label,,short],i) =>
    '<th scope="col"'+columnAttr(i)+(short?' aria-label="'+label+'"':'')+'>'+
    (short?'<span class="box-long">'+label+'</span><span class="box-short">'+short+'</span>':label)+'</th>').join('')+
    '</tr></thead><tbody>'+teamTotal+(rows.join('') || '<tr><td colspan="'+columns.length+'">Player stats are pending.</td></tr>')+'</tbody>';
}

const minute = 60000;
let timer, nextCheck = 0, liveSchedule;

let stream;
function closeStream() {
  const old = stream;
  stream = null;
  old?.close();
}
function subscribe(id) {
  if (document.hidden || stream || !window.WebSocket) return;
  const socket = new WebSocket(api.replace('https:', 'wss:')+'/stream?event='+id);
  stream = socket;
  socket.onmessage = message => {
    if (stream !== socket || active !== id || document.hidden) return;
    refresh(JSON.parse(message.data));
  };
  socket.onclose = () => {
    if (stream !== socket) return;
    stream = null;
    nextCheck = Date.now() + 10000;
    armTimer();
  };
}

function scheduledTips(events) {
  return events.filter(e => type(e)?.state === 'pre' &&
    !/postponed|cancel|suspend/i.test(type(e)?.name ?? '') && Number.isFinite(Date.parse(e.date)));
}

function armTimer() {
  clearTimeout(timer);
  if (document.hidden || loading || !Number.isFinite(nextCheck)) return;
  // Browser timers have a signed 32-bit limit. Re-arm long waits without fetching.
  timer = setTimeout(() => {
    if (document.hidden) return;
    if (Date.now() < nextCheck) armTimer();
    else refresh();
  }, Math.min(2147483647, Math.max(0, nextCheck - Date.now())));
}

async function refresh(pushedGame) {
  if (loading) return;
  loading = true;
  $('refresh').disabled = true;
  try {
    const schedule = liveSchedule ?? await get('/teams/120/schedule');
    let staleFeed = schedule.feed?.stale ? schedule.feed : null;
    const events = [...schedule.events].sort((a,b) => Date.parse(a.date)-Date.parse(b.date));
    const now = Date.now();
    const tips = scheduledTips(events);
    const next = tips.find(e => Date.parse(e.date) > now);
    const starting = tips.find(e => Date.parse(e.date) <= now && now - Date.parse(e.date) < 4 * 60 * minute);
    nextCheck = next ? Date.parse(next.date) : Infinity;
    const event = (liveSchedule && events.find(e => e.id === active)) ?? events.find(e => type(e)?.state === 'in') ?? starting ?? events.filter(e => type(e)?.completed).at(-1) ?? next;
    if (!event) throw Error('Maryland schedule is empty');
    if (active !== event.id) {
      active = event.id;
      box = null;
      selectedTeam = md;
      selectedHalf = 0;
      $('analysis').hidden = true;
      renderScore(event,event.competitions[0]);
    }
    if (type(event)?.state !== 'pre' || event === starting) {
      const game = pushedGame ?? await get('/summary?event='+event.id);
      if (game.feed?.stale) staleFeed = game.feed;
      const competition = game.header?.competitions?.[0] ?? event.competitions[0];
      const status = competition.status?.type ?? type(event);
      const live = status?.state === 'in' && !/suspend|postponed|cancel/i.test(status.name ?? '');
      const waiting = event === starting && status?.state === 'pre' &&
        !/suspend|postponed|cancel/i.test(status.name ?? '');
      liveSchedule = live ? schedule : null;
      if (live) {
        subscribe(event.id);
        nextCheck = now + (stream ? minute : 10000);
      } else {
        closeStream();
        if (waiting) nextCheck = now + 5 * minute;
      }
      renderScore(event,competition,game.plays ?? [],event.competitions[0]);
      const teams = [...competition.competitors].map(({team}) =>
        ({team:{...team,id:String(team.id)},data:unpack(game,String(team.id))}))
        .sort((a,b) => Number(b.team.id===md)-Number(a.team.id===md));
      if (teams.length === 2 && teams.every(t=>t.data)) {
        const samples = box?.samples ?? new Map();
        box = {teams,samples,halves:halfBoxes(game,competition)};
        if (!box.halves.has(selectedHalf)) selectedHalf = 0;
        renderSplit();
        $('analysis').hidden = false;
        for (const {team} of teams) {
          if (samples.get(team.id)?.count === samples.get(team.id)?.total && samples.has(team.id)) continue;
          loadSeason(team.id,event,schedule).then(sample => {
            if (active !== event.id) return;
            samples.set(team.id,sample);
            renderSplit();
          }).catch(() => {});
        }
      } else if (!box) {
        $('status').textContent = 'Box score pending from ESPN.';
        return;
      }
    }
    $('status').textContent = staleFeed ? 'Feed delayed · Updated '+gameDate(staleFeed.asOf) : '';
  } catch {
    liveSchedule = null;
    nextCheck = Date.now() + 5 * minute;
    $('status').textContent = active ? 'ESPN refresh failed. Showing the last available update.' : 'ESPN feed unavailable. Try Refresh.';
    if (!active) $('scoreboard').textContent = 'Maryland schedule unavailable';
  } finally {
    loading = false;
    $('refresh').disabled = false;
    armTimer();
  }
}
$('refresh').onclick = () => {
  liveSchedule = null;
  refresh();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) closeStream();
  else if (liveSchedule) nextCheck = 0;
  armTimer();
});
armTimer();
