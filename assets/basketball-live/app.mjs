import {crewTendencies,refPercentile} from './officials.mjs?v=3';
import {descriptors,shootingStats,threePointRateColumn,seasonCounts} from './benchmarks.mjs?v=5';
import {rate,fmt,unpack} from './metrics.mjs?v=5';
import {halfBoxes} from './half-box.mjs?v=6';
import {scoreTrend,periodLabel,trendSnapshot,clockSeconds,gameElapsed} from './score-trend.mjs?v=9';

import {feedOrigin as api, gameOnDay, nextEasternMidnight, easternDay} from './game-day.mjs';
const md = '120';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percent = n => n == null ? '—' : fmt(n)+'%';
const time = (d, options) => new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',...options}).format(new Date(d));
const gameDate = d => time(d,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const type = e => e.competitions?.[0]?.status?.type;
const seasons = new Map();
const expandedSeasonRows = new Set();
let selectedTeam = md, selectedHalf = 0, active, box, loading = false;

async function get(path) {
  const response = await fetch(api+path,{signal:AbortSignal.timeout(25000)});
  if (!response.ok) throw Error('Shared feed returned '+response.status);
  return response.json();
}

const totalGroups = [
  [['MIN','min'],['PTS','pts']],
  [['ORB','orb'],['DRB','drb']],
  [['AST','ast'],['TO','to']],
  [['STL','stl'],['BLK','blk'],['PF','pf']]
];

function seasonShotLines(sample) {
  return Array.from({length:4},(_,i) => {
    const games = sample.shootingGames[i]?.[0];
    if (!games) return '—';
    const [made,attempted] = sample.shooting[i] ?? [0,0];
    const percentage = percent(rate([made,attempted]));
    if (i === threePointRateColumn) return percentage;
    return (made/games).toFixed(1)+'-'+(attempted/games).toFixed(1)+'<small>'+percentage+'</small>';
  });
}

function averageCounts(sample) {
  return Object.fromEntries(seasonCounts.map((key,i) => {
    const [total,games] = sample.counts[i] ?? [];
    return [key,games ? (total/games).toFixed(1) : null];
  }));
}

function loadSeason(teamId,event) {
  const key = event.id+':'+teamId;
  if (!seasons.has(key)) {
    const request = get('/benchmarks?event='+event.id+'&team='+teamId).then(sample => {
      sample.players = new Map(Object.entries(sample.players));
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

function scaleColor(value, descriptive=false) {
  const high = descriptive ? 'orange' : 'green';
  const low = descriptive ? 'blue' : 'red';
  const color = value >= 0 ? high : low;
  return 'color-mix(in srgb,var(--bench-'+color+') '+Math.round(Math.min(1,Math.abs(value))*100)+'%,var(--bench-neutral))';
}

function rateComparison(pair,reference,lower=false,descriptive=false,format=percent) {
  const value = rate(pair), average = rate(reference ?? []);
  if (value == null || average == null) return {style:'',note:'Season comparison unavailable'};
  const edge = (value-average)*(lower?-1:1);
  const strength = average > 0 ? Math.min(1,Math.abs(edge)/average*2) : Number(edge!==0);
  return {
    style:'--rate-bg:'+scaleColor(Math.sign(edge)*strength,descriptive),
    note:'Game '+format(value)+' · Season '+format(average)
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


const scoreMargin = scores => scores[0]-scores[1];
const marginY = (margin,maximum) => 50*(1-margin/maximum);

function inspectTrend(plot,points,end,maximum,sides) {
  const overlay = plot.querySelector('.trend-inspection');
  const clock = overlay.querySelector('.trend-inspect-clock');
  const score = overlay.querySelector('.trend-inspect-score');
  const dot = overlay.querySelector('.trend-dot');
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
    dot.style.top = marginY(scoreMargin(snapshot.scores),maximum)+'%';
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
  const maximum = Math.max(10,Math.ceil(Math.max(...points.map(p=>Math.abs(scoreMargin(p.scores))))/10)*10);
  const x = time => 100*time/end;
  const y = margin => marginY(margin,maximum);
  const path = points.map(({time,scores},j)=> j===0 ? 'M 0 '+y(scoreMargin(scores)) :
    'H '+x(time)+' V '+y(scoreMargin(scores))).join(' ');
  const runMarkers = runs.map((run,i)=>
    '<span class="trend-marker" aria-hidden="true" style="--x:'+x(run.end)+'%;--y:'+
    y(scoreMargin(run.scores))+'%">'+(i+1)+'</span>').join('');
  const runLabels = runs.map((run,i)=>'<li><b>'+(i+1)+'</b> '+escape(sides[run.team].team.abbreviation)+
    ' <strong>'+run.points+'–'+run.allowed+'</strong>'+
    (run.allowed ? ' <span>incl. '+run.killshots.map(points=>points+'–0').join(', ')+'</span>' : '')+
    ' <span>'+escape(periodLabel(run.period)+' '+run.clock)+'</span></li>').join('');
  const breaks = [1200,2400].filter(t=>t<end);
  for (let time=2700;time<end;time+=300) breaks.push(time);
  const grid = '<path class="trend-grid" d="M 0 0 H 100 M 0 50 H 100 M 0 100 H 100 '+
    breaks.map(time=>'M '+x(time)+' 0 V 100').join(' ')+'"/>';
  const ticks = [0,...breaks,end].map((time,i)=>
    '<span style="left:'+x(time)+'%">'+(i===0?'Tip':time===1200?'Half':time===2400?'40 min':time/60+' min')+'</span>').join('');
  const dot = '<i class="trend-dot" style="--series:#ffe08a"></i>';
  const inspection = '<div class="trend-inspection" hidden aria-hidden="true"><i class="trend-crosshair"></i>'+
    dot+'<div class="trend-tooltip"><span class="trend-inspect-clock"></span><strong class="trend-inspect-score"></strong></div></div>';
  const markup = '<div class="trend-plot" tabindex="0" role="slider" aria-valuemin="0" aria-label="Maryland score margin timeline">'+
    '<div class="trend-y" aria-hidden="true"><span>+'+maximum+'</span><span>0</span><span>−'+maximum+'</span></div>'+
    '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">'+grid+'<path class="trend-zero" d="M 0 50 H 100"/><path class="trend-line" style="--series:#ffe08a" d="'+path+'"/></svg>'+
    runMarkers+inspection+'<div class="trend-x" aria-hidden="true">'+ticks+'</div></div>'+
    (runs.length?'<ul class="trend-runs" aria-label="Scoring runs that include at least 10 unanswered points">'+runLabels+'</ul>':'');
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
  const markup = team(sides[0],0)+'<div class="clock">'+escape(label)+'</div>'+team(sides[1],1);
  if ($('scoreboard').innerHTML !== markup) $('scoreboard').innerHTML = markup;
  renderTrend(trend,sides);
}

const officialGames = new Map();
let crewKey, crewData;
function setOfficials(officials,event,year) {
  const names = [...new Set((Array.isArray(officials) ? officials : [])
    .map(official=>String(official.fullName ?? official.displayName ?? '').trim())
    .filter(name=>/\p{L}.*\s+.*\p{L}/u.test(name) && !/^(?:to be announced|not available|not announced|not assigned|unknown|no officials)$/i.test(name)))];
  const key = JSON.stringify([event.id,year,names]);
  if (key === crewKey) return;
  crewKey = key;
  crewData = {names,event,year};
  $('ref-crew').hidden = !names.length;
  $('ref-stats').textContent = names.join(' · ');
  renderOfficials();
}

async function renderOfficials() {
  if (!$('team-profiles').open || !crewData?.names.length) return;
  const {names,event,year} = crewData;
  const key = crewKey;
  const out = $('ref-stats');
  if (out.renderedCrew === key) return;
  out.renderedCrew = key;
  try {
    if (!Number.isInteger(Number(year))) throw Error('Season unavailable');
    if (!officialGames.has(year)) {
      const url = new URL('../fouls/games-'+year+'.json.gz',import.meta.url);
      const request = fetch(url).then(response=>{
        if (!response.ok) throw Error('Official assignments unavailable');
        return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
      }).catch(error=>{officialGames.delete(year);throw error;});
      officialGames.set(year,request);
    }
    const games = await officialGames.get(year);
    if (crewKey !== key) return;
    const [month,day,y] = easternDay(new Date(event.date)).split('/');
    const cutoff = [y,month.padStart(2,'0'),day.padStart(2,'0')].join('-');
    const {officials,crew,average,peers} = crewTendencies(games,names,cutoff,event.id);
    if (!officials.some(ref=>ref.games)) {
      out.textContent = names.join(' · ')+' — No prior assignments in this season’s data.';
      return;
    }
    const refCell = (value,metric,games,shade) => {
      const percentile = shade && games>=3 ? refPercentile(value,peers[metric]) : null;
      const display = (metric==='homeMargin' && value>0 ? '+' : '')+fmt(value);
      if (percentile == null) return display;
      return '<span class="profile-value" style="background:'+scaleColor(2*percentile-1,true)+
        '">'+display+'<small class="ref-percentile">'+Math.round(percentile*100)+'%ile</small></span>';
    };
    const row = (name,r,summary=false,shade=true)=>'<tr'+(summary?' class="ref-summary"':'')+'><th scope="row">'+escape(name)+
      '</th><td>'+r.games+'</td><td>'+refCell(r.fouls,'fouls',r.games,shade)+'</td><td>'+
      refCell(r.homeMargin,'homeMargin',r.homeGames,shade)+'</td></tr>';
    out.innerHTML = '<table><thead><tr><th scope="col">Official</th><th scope="col">Games</th><th scope="col">Fouls / 100</th>'+
      '<th scope="col" title="Visitor fouls minus home fouls per 100 possessions, excluding neutral sites">Home margin / 100</th></tr></thead><tbody>'+
      officials.map(ref=>row(ref.name,ref)).join('')+
      (crew ? row('Crew estimate',crew,true) : '')+row('D-I baseline',average,false,false)+'</tbody></table>';
  } catch {
    if (crewKey !== key) return;
    out.renderedCrew = null;
    out.textContent = names.join(' · ')+' — Tendencies unavailable.';
  }
}

function renderFactors(teams,samples) {
  const markup = descriptors.map(([title,labels,raw],i) => {
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
    const rows = labels.map((label,row)=>'<tr><th scope="row"'+(label==='FD/100'?' class="fd-label" title="Fouls drawn per 100 possessions" aria-label="Fouls drawn per 100 possessions"':'')+'>'+label+'</th>'+details.map((values,j) => {
      const {text:value,pair} = values[row];
      const foulRate = label === 'FD/100';
      const {style,note} = rateComparison(pair,samples.get(teams[j].team.id)?.details[i][row],i===1,
        foulRate || label==='3P Rate',foulRate ? n=>fmt(n)+' / 100' : percent);
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
  if ($('factors').renderedMarkup !== markup) {
    $('factors').innerHTML = markup;
    $('factors').renderedMarkup = markup;
  }
}

const columns = [
  ['Player'], ['MIN'], ['PTS'],
  ['Usage percentage and individual offensive rating','rates','Usg% / ORtg'],
  ['eFG%','rates'], ['Player TO%','rates','TO%'],
  ['Offensive and defensive rebound percentages','rates','OR% / DR%'],
  ['Free throw rate (FTA/FGA)','rates','FTR'],
  ['2P','shooting'], ['3P','shooting'], ['3P Rate','shooting'], ['FT','shooting'],
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

const profileLabels = ['eFG%', '2P%', '3P%', '3P Rate', 'TO%', 'Steal TO%', 'Non-steal TO%', 'OReb%', 'DReb%', 'FT Rate', 'FT%', 'Assist Rate', 'Block Rate', 'Fouls / poss.'];
const profileGroups = [[0,1,2,3,11,12],[4,5,6],[7,8],[9,10,13]];
let profileData, profileKey, matchupTeams = [];
async function renderProfiles() {
  if (matchupTeams.length !== 2 || !$('team-profiles').open) return;
  const teams = matchupTeams;
  const key = teams.map(t => t.id).join('/');
  if (profileKey === key) return;
  profileKey = key;
  const out = $('profile-body');
  out.textContent = 'Loading…';
  try {
    profileData ??= fetch(new URL('./profiles.json',import.meta.url)).then(r => {
      if (!r.ok) throw Error('Profiles unavailable');
      return r.json();
    });
    const data = await profileData;
    if (profileKey !== key) return;
    const count = Object.keys(data.teams).length;
    const cell = (value,unit,span=1,divider=false,foulLabel='',direction=0) => {
      const td = '<td'+(span === 2 ? ' colspan="2"' : '')+(divider ? ' class="matchup-divider"' : '')+'>';
      if (!value) return td+'—</td>';
      const [n,rank] = value;
      const fraction = (rank-1)/Math.max(1,count-1);
      const background = scaleColor((1-2*fraction)*(direction || 1),Boolean(direction));
      return td+'<span class="profile-value" style="background:'+background+
        '">'+(foulLabel ? (n/100).toFixed(2) : n.toFixed(1))+unit+' <small>#'+rank+'</small></span>'+(foulLabel ? '<small>'+foulLabel+'</small>' : '')+'</td>';
    };
    const factorCells = i => teams.map((off,j) => {
      const defense = teams[1-j];
      const fouls = i === 13;
      const descriptive = [3,11,13].includes(i);
      return cell(data.teams[off.id]?.[0]?.[i],fouls?'':'%',1,j===1,fouls?'Drawn':'',descriptive?1:0)+
        cell(data.teams[defense.id]?.[1]?.[i],fouls?'':'%',1,false,fouls?'Committed':'',descriptive?-1:0);
    }).join('');
    const comparison = '<table class="team-metrics"><thead><tr><th scope="col">Team comparison</th>'+
      teams.map(t=>'<th scope="col">'+escape(t.abbreviation)+'</th>').join('')+'</tr></thead><tbody>'+
      '<tr class="profile-headline"><th scope="row" title="Opponent-adjusted efficiency margin · Bart Torvik">AdjEM</th>'+
      teams.map(t=>cell(data.adjusted?.[t.id]?.[2],'')).join('')+'</tr>'+
      ['Tempo','Effective height','Roster experience'].map((label,i)=>
        '<tr><th scope="row">'+label+'</th>'+teams.map(t=>cell(data.comparison?.[t.id]?.[i],['','″',' yr'][i],1,false,'',1)).join('')+'</tr>'
      ).join('')+'</tbody></table>';
    out.innerHTML = comparison+'<p>D-I games through '+escape(data.through)+' · '+count+' teams · Adjusted ratings: <a href="https://barttorvik.com/">T-Rank</a> '+escape(data.ratingsDate ?? '')+'</p>'+
      '<table><colgroup><col class="profile-metric"></colgroup><colgroup span="2"></colgroup><colgroup span="2"></colgroup>'+
      '<thead><tr><th rowspan="2" scope="col">Metric</th>'+teams.map((t,i)=>
        '<th colspan="2" scope="colgroup" class="matchup-heading group-'+i+'">'+
        escape(t.location || t.displayName)+'<small>Has the ball</small></th>').join('')+'</tr><tr>'+
      teams.map((off,j)=>'<th scope="col"'+(j===1?' class="matchup-divider"':'')+'>'+escape(off.abbreviation)+'<small>Offense</small></th><th scope="col">'+escape(teams[1-j].abbreviation)+'<small>Defense</small></th>').join('')+
      '</tr></thead><tbody><tr class="profile-headline"><th scope="row" title="Bart Torvik · points per 100 possessions">Adj. efficiency</th>'+
      teams.map((off,j)=>cell(data.adjusted?.[off.id]?.[0],'',1,j===1)+cell(data.adjusted?.[teams[1-j].id]?.[1],'')).join('')+ '</tr></tbody>'+
      profileGroups.map(([metric,...components])=> {
        const groupId = 'profile-factor-'+metric;
        return '<tbody><tr class="factor-row"><th scope="row"><button type="button" class="profile-factor-toggle" aria-expanded="false" aria-controls="'+groupId+'">'+
          profileLabels[metric]+'</button></th>'+factorCells(metric)+'</tr></tbody>'+
          '<tbody id="'+groupId+'" hidden>'+components.map(i=>'<tr class="profile-component"><th scope="row"'+
            (i===13?' title="Box score fouls divided by estimated possessions"':'')+'>'+profileLabels[i]+'</th>'+factorCells(i)+'</tr>').join('')+'</tbody>';
      }).join('')+'</table>';
  } catch {
    profileData = profileKey = null;
    out.textContent = 'Profiles unavailable. Reopen to retry.';
  }
}
$('team-profiles').ontoggle = () => {
  renderProfiles();
  renderOfficials();
};
$('profile-body').addEventListener('click',event=>{
  const button = event.target.closest('.profile-factor-toggle');
  if (!button) return;
  const rows = $(button.getAttribute('aria-controls'));
  rows.hidden = !rows.hidden;
  button.setAttribute('aria-expanded',String(!rows.hidden));
});

function placeProfiles(competition, pregame) {
  matchupTeams = competition.competitors.map(({team})=>({...team,id:String(team.id)}))
    .sort((a,b)=>Number(b.id===md)-Number(a.id===md));
  const profile = $('team-profiles');
  const slot = $(pregame ? 'pregame-profile' : 'game-profile');
  if (profile.parentElement !== slot) {
    slot.append(profile);
    profile.open = pregame;
  }
  renderProfiles();
}

function renderSplit() {
  const suffix = selectedHalf ? ' · '+selectedHalf+'H' : '';
  $('factors-title').textContent = 'Four Factors'+suffix;
  $('players-title').textContent = 'Player box score'+suffix;
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

$('players').addEventListener('click', event => {
  const button = event.target.closest('[data-season-row]');
  if (!button) return;
  const id = button.dataset.seasonRow;
  const expanded = !expandedSeasonRows.has(id);
  if (expanded) expandedSeasonRows.add(id);
  else expandedSeasonRows.delete(id);
  button.setAttribute('aria-expanded',String(expanded));
  $(id).hidden = !expanded;
  $('players').renderedMarkup = null;
});

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
  const row = (label,s,pairs,reference,rowAttrs='',seasonShooting) => {
    const [efg,to,or,dr,ftr] = Array.from({length:5},(_,i)=>rateValue(pairs[i] ?? [],reference?.rates[i],i));
    const rating = pairs[6] ?? [];
    const shade = rateComparison(rating,reference?.rates[6]);
    const usage = pairs[5] ?? [];
    const usageShade = rateComparison(usage,reference?.rates[5],false,true);
    const role = '<div class="rebound-rates"><span class="rate-value" style="'+usageShade.style+'" title="Usage · '+usageShade.note+'">'+percent(rate(usage))+
      '</span><strong class="rate-value" style="'+shade.style+'" title="ORtg · Season '+fmt(rate(reference?.rates[6] ?? []))+'">'+fmt(rate(rating))+'</strong></div>';
    const metrics = [role,efg,to,'<div class="rebound-rates">'+or+dr+'</div>',ftr];
    const shooting = seasonShooting ?? shootingStats(s).map(({text,pair},i)=>reference?.shooting ?
      shadedStat(text,rateComparison(pair,reference.shooting[i],false,i===threePointRateColumn)) : escape(text));
    const count = key => escape(s[key] ?? '—');
    const raw = ['orb','drb','to','ast','stl','blk','pf'].map(count);
    return '<tr'+rowAttrs+'><th scope="row">'+label+'</th>'+
      statCell(count('min'),1)+statCell(count('pts'),2)+metrics.map((html,i)=>'<td'+columnAttr(i+rateColumn)+'>'+html+'</td>').join('')+
      [...shooting,...raw].map((html,i)=>statCell(html,i+shootingColumn)).join('')+
      totalGroups.map((group,i)=>statCell(group.map(([label,key])=>
        '<span class="box-stat"><b>'+count(key)+'</b> '+label+'</span>').join(''),i+totalsColumn)).join('')+'</tr>';
  };
  const sample = samples.get(team.id);
  const defensive = descriptors[2][2](data)[1].pair;
  const [efg,to,or,ftr] = data.pairs;
  const reference = sample ? {rates:[...sample.factors.slice(0,3),sample.details[2][1],sample.factors[3]]} : undefined;
  const focused = document.activeElement?.dataset.seasonRow;
  const withSeason = (id,name,label,stats,pairs,baseline,average,rowAttrs='') => {
    if (!average) return row(label,stats,pairs,baseline,rowAttrs);
    const target = 'season-'+team.id+'-'+id;
    const expanded = expandedSeasonRows.has(target);
    const disclosure = '<button type="button" class="season-disclosure" data-season-row="'+target+
      '" aria-label="'+escape(name+' season stats')+'" aria-controls="'+target+'" aria-expanded="'+expanded+'">'+
      label+'<span class="season-chevron" aria-hidden="true"></span></button>';
    return row(disclosure,stats,pairs,baseline,rowAttrs)+
      row('<span class="season-label">Season</span>',averageCounts(average),average.rates,undefined,
        ' id="'+target+'" class="season-row"'+(expanded?'':' hidden'),seasonShotLines(average));
  };
  const elapsed = selectedHalf ? clockSeconds(data.stats.min) : box.elapsed;
  const teamStats = {...data.stats,min:elapsed == null ? null : Math.floor(elapsed/60)};
  const teamTotal = withSeason('team','Team','Team total',teamStats,[efg,to,or,defensive,ftr,[],[data.stats.pts,to[1]]],
    reference,sample?.count ? sample.teamSeason : undefined,' class="team-total"');
  const rows = data.players.map(player => {
    const average = sample?.players.get(player.id);
    return withSeason(escape(player.id),player.name ?? 'Player',playerLabel(player),player.stats,player.pairs,average,average);
  });
  const markup = '<thead><tr>'+columns.map(([label,,short],i) =>
    '<th scope="col"'+columnAttr(i)+(short?' aria-label="'+label+'"':'')+'>'+
    (short?'<span class="box-long">'+label+'</span><span class="box-short">'+short+'</span>':label)+'</th>').join('')+
    '</tr></thead><tbody>'+teamTotal+(rows.join('') || '<tr><td colspan="'+columns.length+'">Player stats are pending.</td></tr>')+'</tbody>';
  if ($('players').renderedMarkup === markup) return;
  $('players').innerHTML = markup;
  $('players').renderedMarkup = markup;
  if (focused) $('players').querySelector('[aria-controls="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});
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

let selectedGame = '', renderedRevision;

function updateRecentGames(events) {
  const recent = events.filter(e=>type(e)?.completed).slice(-8).reverse();
  const items = recent.map(event => {
    const opponent = event.competitions[0].competitors.find(side=>String(side.team.id)!==md)?.team;
    const date = time(event.date,{month:'short',day:'numeric'});
    return '<option value="'+escape(event.id)+'">'+escape(date+' · '+(opponent?.shortDisplayName ?? opponent?.location ?? 'Maryland'))+'</option>';
  }).join('');
  if (items !== $('recent-game').recentOptions) {
    $('recent-game').innerHTML = '<option value="">Current matchup</option>'+items;
    $('recent-game').recentOptions = items;
  }
  if (selectedGame && !recent.some(e=>String(e.id)===selectedGame)) selectedGame = '';
  $('recent-game').value = selectedGame;
  $('recent-games').hidden = !recent.length;
}

$('recent-game').onchange = () => {
  selectedGame = $('recent-game').value;
  closeStream();
  liveSchedule = null;
  refresh();
};

function fillBenchmarks(teams,event,samples) {
  for (const team of teams) {
    if (samples.has(team.id) && samples.get(team.id).count === samples.get(team.id).total) continue;
    loadSeason(team.id,event).then(sample => {
      if (active !== event.id || box?.samples !== samples || samples.get(team.id) === sample) return;
      samples.set(team.id,sample);
      renderSplit();
    }).catch(() => {});
  }
}

async function refresh(pushedGame) {
  if (loading) return;
  loading = true;
  $('refresh').disabled = true;
  $('recent-game').disabled = true;
  try {
    const schedule = liveSchedule ?? await get('/teams/120/schedule');
    let staleFeed = schedule.feed?.stale ? schedule.feed : null;
    const events = [...schedule.events].sort((a,b) => Date.parse(a.date)-Date.parse(b.date));
    updateRecentGames(events);
    const now = Date.now();
    const tips = scheduledTips(events);
    const next = tips.find(e => Date.parse(e.date) > now);
    const starting = tips.find(e => Date.parse(e.date) <= now && now - Date.parse(e.date) < 4 * 60 * minute);
    const today = gameOnDay(events,now);
    nextCheck = Math.min(next ? Date.parse(next.date) : Infinity,nextEasternMidnight(now));
    const final = selectedGame && events.find(e=>String(e.id)===selectedGame);
    const event = (final || null) ?? (liveSchedule && events.find(e => e.id === active)) ?? events.find(e => type(e)?.state === 'in') ?? today ?? starting ?? events.filter(e => type(e)?.completed).at(-1) ?? next;
    if (!event) throw Error('Maryland schedule is empty');
    if (active !== event.id) {
      active = event.id;
      box = null;
      renderedRevision = undefined;
      expandedSeasonRows.clear();
      selectedTeam = md;
      selectedHalf = 0;
      $('analysis').hidden = true;
      setOfficials(event.competitions[0].officials,event,schedule.season.year);
      renderScore(event,event.competitions[0]);
    }
    if (type(event)?.state === 'pre' && event !== starting) {
      renderScore(event,event.competitions[0]);
      placeProfiles(event.competitions[0],true);
      // Warm the shared cache while the matchup is in its pregame view.
      for (const team of matchupTeams) loadSeason(team.id,event).catch(()=>{});
    } else {
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
      const revision = game.feed?.revision;
      if (revision == null || revision !== renderedRevision) {
        renderScore(event,competition,game.plays ?? [],event.competitions[0]);
        placeProfiles(competition,status?.state === 'pre');
        setOfficials(game.officials?.length ? game.officials : competition.officials ?? event.competitions[0].officials,event,schedule.season.year);
        const teams = matchupTeams.map(team=>({team,data:unpack(game,team.id)}));
        if (teams.length === 2 && teams.every(t=>t.data)) {
          const samples = box?.samples ?? new Map();
          box = {teams,samples,halves:halfBoxes(game,competition),elapsed:gameElapsed({...competition,status},game.plays)};
          if (!box.halves.has(selectedHalf)) selectedHalf = 0;
          renderSplit();
          $('analysis').hidden = false;
        }
        renderedRevision = revision;
      }
      if (box) {
        fillBenchmarks(box.teams.map(t=>t.team),event,box.samples);
      } else if (!waiting) {
        $('status').textContent = 'Box score pending from ESPN.';
        return;
      }
    }
    $('refresh').hidden = !staleFeed;
    $('status').textContent = staleFeed ? 'Feed delayed · Updated '+gameDate(staleFeed.asOf) : '';
  } catch {
    $('refresh').hidden = false;
    liveSchedule = null;
    nextCheck = Date.now() + 5 * minute;
    $('status').textContent = active ? 'ESPN refresh failed. Showing the last available update.' : 'Game feed unavailable.';
    if (!active) $('scoreboard').textContent = 'Maryland schedule unavailable';
  } finally {
    loading = false;
    $('refresh').disabled = false;
    $('recent-game').disabled = false;
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
