'use strict';

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const rate = (good, count) => count ? (100 * good / count).toFixed(1) + '%' : '—';
const clock = period => period <= 4 ? 'Q' + period : 'OT' + (period - 4);
const formatNumber = new Intl.NumberFormat('en-US').format;
const distance = yards => yards <= 3 ? 'Short (1–3)' : yards <= 6 ? 'Medium (4–6)' : 'Long (7+)';
const tally = rows => rows.reduce((sum, play) => sum + success(play), 0);
const success = play => state.offense ? play.success : 1 - play.success;
const gameScore = game => (game.md > game.opp ? 'W ' : game.md < game.opp ? 'L ' : 'T ') + game.md + '–' + game.opp;
const gameLabel = game => game.season + ' · ' + game.opponent;
const schoolIcon = (school, id) => window.TeamLogos?.icon(school, id) ?? '';
const filterIds = ['season', 'game', 'quarter', 'down', 'type', 'distance', 'score'];
const defaultTeam = '120';
const defaultSeason = '2026';
const defaultGroup = 'Down';
const scopeIds = ['league', 'matched'];
const state = {offense: true, expanded: new Set(), team: null, request: 0};
const distanceOrder = ['Short (1–3)', 'Medium (4–6)', 'Long (7+)'];
const playTypes = ['Rush', 'Dropback', 'Other'];
const observedPeriods = () => [...new Set([
  ...dataset.plays.map(play => play.period), ...dataset.drives.map(drive => drive.period)
])].sort((a, b) => a - b);
const groups = {
  Quarter: {key: row => clock(row.period), order: () => observedPeriods().map(clock), includeEmptyDrives: true},
  Season: {key: row => row.game.season, order: () => [...new Set(dataset.games.map(game => game.season))], includeEmptyDrives: true},
  Game: {key: row => row.game.id, label: id => gameLabel(dataset.games.find(game => game.id === id)),
    order: () => dataset.games.map(game => game.id), includeEmptyDrives: true},
  Down: {key: play => play.down, label: down => 'Down ' + down, order: () => [1, 2, 3, 4]},
  'Play type': {key: play => play.type, order: () => playTypes},
  Distance: {key: play => distance(play.distance), order: () => distanceOrder}
};
let dataset;
let coverage;
let conference;
const cachedTeams = new Map();

function options(id, entries, all) {
  $(id).replaceChildren(...(all ? [new Option(all, '')] : []),
    ...entries.map(entry => Array.isArray(entry) ? new Option(entry[1], entry[0]) : new Option(entry, entry)));
}

function normalize(raw) {
  const games = raw.games.map(([id, season, week, opponent, venue, md, opp, weekKey, league, ordinal]) =>
    ({id, season, week, opponent, venue, md, opp, weekKey, league, ordinal}));
  const drives = raw.drives.map(([game, number, offense, period, start, field, result, rated], index) =>
    ({index, game: games[game], number, offense: !!offense, period, start, field, result, rated}));
  const plays = raw.plays.map(([drive, period, time, down, toGo, type, detail, gain, needed, success, turnover, field,
                                score, text, id]) => ({
    drive: drives[drive], game: drives[drive].game, period, time, down, distance: toGo, type, detail, gain, needed,
    success, turnover, field, score: drives[drive].offense || score === null ? score : -score, text, id
  }));
  return {games, drives, plays, excluded: raw.excluded, withheldClocks: raw.withheldClocks};
}

function inScope(game, selected) {
  return (!selected.league || game.league) &&
    (!selected.matched || (game.ordinal !== null && game.ordinal <= coverage.matchedGames));
}

function refreshGames() {
  const previous = $('game').value;
  const selected = filters();
  const games = dataset.games.filter(game =>
    (!selected.season || String(game.season) === selected.season) && inScope(game, selected));
  options('game', games.map(game =>
    [game.id, gameLabel(game) + ' · ' + gameScore(game)]), 'All games');
  if (games.some(game => game.id === previous)) $('game').value = previous;
}

function filters() {
  return Object.fromEntries([...filterIds.map(id => [id, $(id).value]),
    ...scopeIds.map(id => [id, $(id).checked])]);
}

function filterPlays(play, selected) {
  const situation = play.score > 0 ? 'Ahead' : play.score < 0 ? 'Behind' : 'Tied';
  return (!selected.quarter || clock(play.period) === selected.quarter) &&
    (!selected.down || String(play.down) === selected.down) &&
    (!selected.type || play.type === selected.type) &&
    (!selected.distance || distance(play.distance) === selected.distance) &&
    (!selected.score || situation === selected.score);
}

function pivotGroups(plays, emptyDrives, group) {
  const buckets = new Map();
  function driveBucket(key, drive) {
    if (!buckets.has(key)) buckets.set(key, new Map());
    const drives = buckets.get(key);
    if (!drives.has(drive)) drives.set(drive, []);
    return drives.get(drive);
  }

  for (const play of plays) driveBucket(group.key(play), play.drive).push(play);
  for (const drive of emptyDrives) driveBucket(group.key(drive), drive);

  return group.order().filter(key => buckets.has(key)).map(key => {
    const drives = [...buckets.get(key)].sort(([a], [b]) => a.index - b.index);
    const snaps = drives.flatMap(([, rows]) => rows);
    const priorToMembership = coverage.joinedIn2024.includes(Number(state.team[0])) &&
      snaps.some(play => play.game.season < 2024);
    return {key, id: 'pivot-' + encodeURIComponent(key), label: group.label ? group.label(key) : key,
      drives, wins: tally(snaps), count: snaps.length, priorToMembership};
  });
}

function totals(wins, count) {
  return `<td class="num counts">${formatNumber(wins)} / ${formatNumber(count)}</td><td class="num"><strong>${rate(wins, count)}</strong></td>`;
}

function disclosure(id, label, school) {
  const open = state.expanded.has(id);
  return `<button type="button" class="disclosure" id="${id}" aria-expanded="${open}" data-expand="${id}"><span class="chevron" aria-hidden="true"></span><span class="team-label">${school ? schoolIcon(school) : ''}<span>${escapeHTML(label)}</span></span></button>`;
}

function playRow(play) {
  const good = success(play);
  const outcome = state.offense ? (good ? 'Success' : 'Failure') : (good ? 'Stop' : 'Allowed');
  const kind = play.detail && play.detail !== 'Unknown' && play.detail !== play.type
    ? play.type + ' · ' + play.detail : play.type;
  const context = [clock(play.period) + (play.time ? ' ' + play.time : ''),
    play.down + ' & ' + play.distance, kind].map(escapeHTML).join(' · ');
  const gain = play.gain === null ? 'Gain unavailable' : play.gain + ' yd gained';
  return `<tr class="play-row"><th scope="row"><small>${context}</small><span>${escapeHTML(play.text)}</span></th><td class="num play-gain">${gain}<br><small>${play.needed} needed</small></td><td class="num outcome ${good ? 'win' : 'loss'}">${outcome}</td></tr>`;
}

function driveRows(drives, groupID) {
  return drives.map(([drive, plays]) => {
    const id = groupID + '-drive-' + drive.index;
    const expanded = state.expanded.has(id);
    const label = 'Drive ' + drive.number;
    const details = [clock(drive.period) + ' ' + (drive.start || ''), drive.field, drive.result]
      .filter(Boolean).map(escapeHTML).join(' · ');
    const source = expanded
      ? ` · <a href="https://www.espn.com/college-football/playbyplay/_/gameId/${drive.game.id}" target="_blank" rel="noopener">ESPN play-by-play</a>` : '';
    return `<tr class="drive-row"><th scope="row">${plays.length ? disclosure(id, label) : escapeHTML(label)}<small>${details}${source}</small></th>${totals(tally(plays), plays.length)}</tr>` +
      (expanded ? plays.map(playRow).join('') : '');
  }).join('');
}

function gameRows(drives, groupID) {
  const games = new Map();
  for (const entry of drives) {
    const game = entry[0].game;
    if (!games.has(game)) games.set(game, []);
    games.get(game).push(entry);
  }
  return [...games].map(([game, gameDrives]) => {
    const id = groupID + '-game-' + encodeURIComponent(game.id);
    const plays = gameDrives.flatMap(([, rows]) => rows);
    return `<tr class="game-row"><th scope="row">${disclosure(id, gameLabel(game), game.opponent)}
      <small>${escapeHTML(game.venue)} · ${escapeHTML(gameScore(game))}</small></th>${totals(tally(plays), plays.length)}</tr>` +
      (state.expanded.has(id) ? driveRows(gameDrives, id) : '');
  }).join('');
}

function benchmarkFor(grouping, selected) {
  const game = dataset.games.find(game => game.id === selected.game);
  const results = new Map();
  for (const row of conference) {
    const [season, week, offense, period, down, type, band, situation, league, matched, team, wins, count] = row;
    if (Boolean(offense) !== state.offense || (selected.league && !league) || (selected.matched && !matched) ||
        (selected.season && season !== Number(selected.season)) ||
        (game && (game.season !== season || game.weekKey !== week)) ||
        (selected.quarter && selected.quarter !== clock(period)) ||
        (selected.down && Number(selected.down) !== down) ||
        (selected.type && selected.type !== type) ||
        (selected.distance && selected.distance !== distanceOrder[band]) ||
        (selected.score && selected.score !== ['Behind', 'Tied', 'Ahead'][situation + 1])) continue;
    const key = {Quarter: clock(period), Season: season, Game: season + '/' + week,
      Down: down, 'Play type': type, Distance: distanceOrder[band]}[grouping];
    if (!results.has(key)) results.set(key, {wins: 0, count: 0, teams: new Map()});
    const cell = results.get(key);
    cell.wins += wins;
    cell.count += count;
    if (!cell.teams.has(team)) cell.teams.set(team, {wins: 0, count: 0});
    const teamRate = cell.teams.get(team);
    teamRate.wins += wins;
    teamRate.count += count;
  }
  return results;
}

function conferenceRank(peer, wins, count, priorToMembership) {
  const selectedTeam = Number(state.team[0]);
  if (priorToMembership || !peer?.teams.has(selectedTeam)) return null;
  let position = 1;
  for (const [team, record] of peer.teams) {
    if (team !== selectedTeam && record.wins * count > wins * record.count) position++;
  }
  return {position, teams: peer.teams.size};
}

function renderChart(buckets, grouping, selected) {
  const rated = buckets.filter(bucket => bucket.count);
  $('rate-chart').hidden = !rated.length;
  const benchmark = benchmarkFor(grouping, selected);
  const notes = [];
  if (selected.game || grouping === 'Game') {
    notes.push('Game comparisons use the same season and schedule week, or the same season’s postseason.');
  }
  if (rated.some(bucket => bucket.priorToMembership)) {
    notes.push('Rank unavailable for rows that include games played before this team joined the Big Ten.');
  }
  $('benchmark-note').textContent = notes.join(' ');
  $('benchmark-note').hidden = !notes.length;
  $('chart-bars').innerHTML = rated.map(({id, key, label, wins, count, priorToMembership}) => {
    const game = grouping === 'Game' ? dataset.games.find(game => game.id === key) : null;
    const peer = benchmark.get(game ? game.season + '/' + game.weekKey : key);
    const peerRate = peer ? rate(peer.wins, peer.count) : '—';
    const percent = rate(wins, count);
    const sample = formatNumber(wins) + ' / ' + formatNumber(count);
    const gap = peer ? Math.round((wins / count - peer.wins / peer.count) * 1000) / 10 : null;
    const signedGap = gap === null ? '' : (gap > 0 ? '+' : gap < 0 ? '−' : '') + Math.abs(gap).toFixed(1) + ' pp';
    const rank = conferenceRank(peer, wins, count, priorToMembership);
    const rankLabel = rank ? 'Big Ten rank ' + rank.position + ' of ' + rank.teams : 'Big Ten rank unavailable';
    const accessibleLabel = [label, percent, rankLabel, sample + ' snaps',
      peer ? 'Big Ten average ' + peerRate + ' over ' + formatNumber(peer.count) + ' snaps, gap ' + signedGap :
        'Big Ten average unavailable', 'Open rows'].join(', ');
    const marker = peer ? `<i class="benchmark-marker" style="left:${peerRate}"></i>` : '';
    const rankValue = rank ? `#${rank.position}<span class="rank-of"> / ${rank.teams}</span>` : '—';
    const peerDetail = peer ? `<small>Big Ten ${peerRate} · n=${formatNumber(peer.count)} · ${signedGap}</small>` : '';
    return `<li><button type="button" class="chart-bar" data-chart-group="${id}" aria-label="${escapeHTML(accessibleLabel)}">
      <span class="team-label">${game ? schoolIcon(game.opponent) : ''}<span>${escapeHTML(label)}</span></span>
      <span class="chart-track" aria-hidden="true"><span style="width:${percent}"></span>${marker}</span>
      <span class="chart-rates"><strong>${percent}</strong><span class="chart-rank" title="${rankLabel}">${rankValue}</span></span>
      <span class="chart-extra"><small>Team ${sample}</small>${peerDetail}</span>
    </button></li>`;
  }).join('');
}

let pivotSort = null;
const pivotHeaders = [...document.querySelectorAll('[data-pivot-sort]')];
for (const button of pivotHeaders) button.addEventListener('click', () => {
  const key = button.dataset.pivotSort;
  pivotSort = {key, direction: pivotSort?.key === key ? -pivotSort.direction : key === 'label' ? 1 : -1};
  render();
});
function renderPivot(plays, buckets, grouping) {
  for (const button of pivotHeaders) {
    if (button.dataset.pivotSort === pivotSort?.key) {
      button.parentElement.setAttribute('aria-sort', pivotSort.direction === 1 ? 'ascending' : 'descending');
    } else button.parentElement.removeAttribute('aria-sort');
  }
  if (pivotSort) {
    const {key, direction} = pivotSort;
    const cmp = new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
    buckets = [...buckets].sort((a,b) => {
      if (key === 'label') return direction * cmp.compare(a.label,b.label);
      if (key === 'rate') return Number(!a.count)-Number(!b.count) ||
        direction * ((a.count ? a.wins/a.count : 0) - (b.count ? b.wins/b.count : 0));
      return direction * (a.wins-b.wins || a.count-b.count);
    });
  }
  const childRows = grouping === 'Game' ? driveRows : gameRows;
  $('pivot-rows').innerHTML = `<tr class="total-row"><th scope="row">Grand total</th>${totals(tally(plays), plays.length)}</tr>` +
    (buckets.map(({id, label, drives, wins, count}) => {
      const opponent = grouping === 'Game' ? drives[0]?.[1][0]?.game.opponent : null;
      return `<tr class="group-row"><th scope="row">${disclosure(id, label, opponent)} <small>${drives.length} ${drives.length === 1 ? 'drive' : 'drives'}</small></th>${totals(wins, count)}</tr>` +
        (state.expanded.has(id) ? childRows(drives, id) : '');
    }).join('') || '<tr><td class="empty" colspan="3">No snaps match these filters.</td></tr>');
}

let exportRows = [];

function render() {
  if (!state.team || $('team').value !== state.team[0]) return;
  $('share').textContent = 'Copy view link';
  const selected = filters();
  const games = new Set(dataset.games.filter(game =>
    (!selected.season || String(game.season) === selected.season) && (!selected.game || game.id === selected.game) && inScope(game, selected)));
  const plays = dataset.plays.filter(play => play.drive.offense === state.offense && games.has(play.game) && filterPlays(play, selected));
  const grouping = $('group').value;
  const group = groups[grouping];
  const situational = ['down', 'type', 'distance', 'score'].some(id => selected[id]);
  const emptyDrives = group.includeEmptyDrives && !situational ? dataset.drives.filter(drive =>
    !drive.rated && drive.offense === state.offense && games.has(drive.game) &&
    (!selected.quarter || clock(drive.period) === selected.quarter)) : [];

  const active = [...filterIds.filter(id => selected[id]).map(id => [id,
    $(id).closest('label').firstChild.textContent.trim() + ': ' + $(id).selectedOptions[0].textContent]),
    ...scopeIds.filter(id => selected[id]).map(id => [id, $(id).parentElement.textContent.trim()])];
  $('active-filters').hidden = !active.length;
  $('active-filters').innerHTML = active.map(([id, label]) =>
    `<button type="button" data-clear="${id}" aria-label="Clear ${escapeHTML(label)}">${escapeHTML(label)} ×</button>`).join('');
  $('offense').setAttribute('aria-pressed', state.offense);
  $('defense').setAttribute('aria-pressed', !state.offense);
  $('status').textContent = `${games.size} ${games.size === 1 ? 'game' : 'games'} selected · ${formatNumber(plays.length)} rated snaps`;
  const heading = state.team[1] + (state.offense ? ' offensive success rate' : ' defensive stop rate');
  $('pivot-heading').innerHTML = '<span class="team-label">' + schoolIcon(state.team[1], state.team[0]) + '<span>' + escapeHTML(heading) + '</span></span>';
  $('count-heading').textContent = state.offense ? 'Successes / snaps' : 'Stops / snaps';
  $('group-heading').textContent = grouping + (grouping === 'Game' ? '' : ' → Game') + ' → Drive → Play';
  $('rate-note').textContent = state.offense ? '' : 'Opponent success rate: ' + rate(plays.length - tally(plays), plays.length);
  $('rate-note').hidden = state.offense;
  $('collapse').disabled = !state.expanded.size;
  $('download').disabled = !plays.length;
  const buckets = pivotGroups(plays, emptyDrives, group);
  renderChart(buckets, grouping, selected);
  renderPivot(plays, buckets, grouping);
  exportRows = plays;
}

function csvValue(value) {
  let text = String(value ?? '');
  if (typeof value === 'string' && /^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function download() {
  const heading = ['season','week','game_id','team','opponent','venue','team_score','opponent_score','unit',
    'drive','drive_result','period','clock','down','distance','play_type','feed_type','yards_gained','yards_needed',
    'possession_team_success','team_success','turnover','yards_to_goal','team_score_margin_before_play','description','play_id','big_ten_league_game','regular_season_game_number'];
  const contents = exportRows.map(p => [p.game.season,p.game.week,p.game.id,state.team[1],p.game.opponent,p.game.venue,p.game.md,
    p.game.opp,p.drive.offense ? 'Offense' : 'Defense',p.drive.number,p.drive.result,p.period,p.time,p.down,p.distance,
    p.type,p.detail,p.gain,p.needed,p.success,success(p),p.turnover,p.field,p.score,p.text,p.id,Number(p.game.league),p.game.ordinal]);
  const csv = [heading, ...contents].map(row => row.map(csvValue).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  const link = Object.assign(document.createElement('a'), {href:url, download:state.team[1].toLowerCase().replaceAll(' ', '-') + '_play_success.csv'});
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(path + ' HTTP ' + response.status);
  return response.json();
}

async function selectTeam(id, saved) {
  const request = ++state.request;
  $('status').textContent = 'Loading team plays…';
  $('rate-chart').hidden = true;
  $('pivot-rows').innerHTML = '<tr><td colspan="3">Loading team plays…</td></tr>';
  $('download').disabled = true;
  try {
    if (!cachedTeams.has(id)) cachedTeams.set(id, normalize(await loadJSON('teams/' + id + '.json')));
    if (request !== state.request) return;
    dataset = cachedTeams.get(id);
    state.team = coverage.teams.find(([team]) => team === id);
    state.expanded.clear();
    const previousSeason = saved?.get('season') ?? $('season').value;
    options('season', [...new Set(dataset.games.map(game => game.season))].reverse(), 'All seasons');
    $('season').value = [...$('season').options].some(option => option.value === previousSeason) ? previousSeason : '';
    $('game').value = '';
    refreshGames();
    const previousQuarter = saved?.get('quarter') ?? $('quarter').value;
    const periods = observedPeriods().map(clock);
    options('quarter', periods, 'All quarters');
    if ([...$('game').options].some(option => option.value === saved?.get('game'))) $('game').value = saved.get('game');
    if (periods.includes(previousQuarter)) $('quarter').value = previousQuarter;
    $('exclusions').textContent = 'Feed rows excluded for this team · ' + Object.entries(dataset.excluded).map(
      ([label, count]) => label + ' ' + formatNumber(count)).join(' · ') + '. Play clocks withheld on ' +
      formatNumber(dataset.withheldClocks) + ' rated snaps.';
    render();
  } catch (error) {
    if (request !== state.request) return;
    if (state.team) {
      $('team').value = state.team[0];
      render();
    }
    $('status').textContent = 'Could not load that team’s plays. Try again.';
    console.error(error);
  }
}

async function loadConference() {
  const response = await fetch('benchmark-teams.json.gz');
  if (!response.ok) throw new Error('Big Ten benchmark HTTP ' + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).json();
}

async function start() {
  [coverage, conference] = await Promise.all([loadJSON('coverage.json'), loadConference()]);
  options('team', coverage.teams);
  const saved = new URLSearchParams(location.search);
  const hasSavedView = [...filterIds, ...scopeIds, 'team', 'unit', 'group', 'counts'].some(id => saved.has(id));
  if (!hasSavedView) saved.set('season', defaultSeason);
  $('chart-details').checked = saved.get('counts') === '1';
  $('team').value = coverage.teams.some(([id]) => id === saved.get('team')) ? saved.get('team') : defaultTeam;
  options('down', [1, 2, 3, 4], 'All downs');
  options('type', playTypes, 'All play types');
  options('distance', distanceOrder, 'All distances');
  options('score', ['Ahead', 'Tied', 'Behind'], 'Any margin');
  options('group', Object.keys(groups));
  $('group').value = Object.hasOwn(groups, saved.get('group')) ? saved.get('group') : hasSavedView ? 'Quarter' : defaultGroup;
  state.offense = saved.get('unit') !== 'defense';
  for (const id of ['down','type','distance','score']) {
    if ([...$(id).options].some(option => option.value === saved.get(id))) $(id).value = saved.get(id);
  }
  for (const id of scopeIds) $(id).checked = saved.get(id) === '1';
  if ([...scopeIds, 'type', 'distance', 'score', 'quarter'].some(id => saved.has(id))) $('more-filters').open = true;
  $('team').addEventListener('change', () => selectTeam($('team').value));
  $('team').disabled = false;
  for (const id of filterIds) $(id).addEventListener('change', () => {
    if (id === 'season') refreshGames();
    render();
  });
  for (const id of scopeIds) $(id).addEventListener('change', () => {
    if (dataset) refreshGames();
    render();
  });
  $('group').addEventListener('change', () => {
    state.expanded.clear();
    render();
  });
  $('method-link').addEventListener('click', () => { $('method').open = true; });
  for (const id of ['offense','defense']) $(id).addEventListener('click', () => {
    state.offense = id === 'offense';
    render();
  });
  $('reset').addEventListener('click', () => {
    for (const id of filterIds) $(id).value = '';
    for (const id of scopeIds) $(id).checked = false;
    $('group').value = defaultGroup;
    $('chart-details').checked = false;
    state.offense = true;
    state.expanded.clear();
    if (state.team?.[0] === defaultTeam && $('team').value === defaultTeam) {
      $('season').value = defaultSeason;
      refreshGames();
      render();
    } else {
      $('team').value = defaultTeam;
      selectTeam(defaultTeam, new URLSearchParams({season: defaultSeason}));
    }
  });
  $('active-filters').addEventListener('click', event => {
    const id = event.target.closest('[data-clear]')?.dataset.clear;
    if (!id) return;
    if (scopeIds.includes(id)) $(id).checked = false;
    else $(id).value = '';
    if (['season', ...scopeIds].includes(id)) refreshGames();
    render();
    const next = $('active-filters').querySelector('button') || $('more-filters').querySelector('summary');
    next.focus();
  });
  $('share').addEventListener('click', async () => {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('team', $('team').value);
    url.searchParams.set('unit', state.offense ? 'offense' : 'defense');
    url.searchParams.set('group', $('group').value);
    url.searchParams.set('season', $('season').value);
    if ($('chart-details').checked) url.searchParams.set('counts', '1');
    for (const [id, value] of Object.entries(filters())) {
      if (value) url.searchParams.set(id, value === true ? '1' : value);
    }
    try {
      await navigator.clipboard.writeText(url.href);
      $('share').textContent = 'View link copied';
    } catch {
      window.prompt('Copy view link', url.href);
    }
  });
  $('download').addEventListener('click', download);
  $('collapse').addEventListener('click', () => {
    state.expanded.clear();
    render();
    $('pivot-rows').querySelector('[data-expand]')?.focus({preventScroll: true});
  });
  $('chart-bars').addEventListener('click', event => {
    const button = event.target.closest('[data-chart-group]');
    if (!button) return;
    const id = button.dataset.chartGroup;
    state.expanded.add(id);
    render();
    $(id)?.focus();
  });
  $('pivot-rows').addEventListener('click', event => {
    const button = event.target.closest('[data-expand]');
    if (!button) return;
    const id = button.dataset.expand;
    if (state.expanded.has(id)) {
      for (const key of state.expanded) {
        if (key === id || key.startsWith(id + '-')) state.expanded.delete(key);
      }
    } else {
      state.expanded.add(id);
    }
    render();
    $(id)?.focus({preventScroll: true});
  });
  await selectTeam($('team').value, saved);
}

document.querySelector('.control-panel').setAttribute('aria-busy','true');
start().catch(error => {
  $('status').textContent = 'Could not load the play-by-play. Reload the page to try again.';
  console.error(error);
}).finally(() => document.querySelector('.control-panel').removeAttribute('aria-busy'));
