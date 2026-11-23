const assert=require('assert'),fs=require('fs'),vm=require('vm'),zlib=require('zlib');
const pc=require('../assets/peer-context.js');
const stats=pc.stats(20,[10,20,20,30,40,null,'',undefined,'bad']);
assert.equal(stats.n,5);assert.equal(stats.mean,24);assert.equal(stats.median,20);assert.equal(stats.rank,3);assert.equal(stats.percentile,37.5);assert.equal(pc.stats(20,[10,20,20,30,40],true).rank,2);
assert.equal(pc.stats(1,[1,2]).rank,null);assert.equal(pc.stats(0,[0,1,2,3,4]).percentile,0);assert.equal(pc.stats(4,[0,1,2,3,4]).percentile,100);
assert(pc.comparison({value:1,cohorts:[{label:'Small',values:[1,2]}]}).includes('<td>—</td>'));
assert(pc.comparison({value:null,cohorts:[]}).includes('selected value is missing'));
const els=new Proxy({}, {get:(o,k)=>o[k]??(o[k]={value:'',innerHTML:'',textContent:'',hidden:false,options:[{}],selectedOptions:[{textContent:'Blue chips'}],setAttribute(){},scrollIntoView(){},addEventListener(){}})});
function ctx(){return {console,PeerContext:pc,TeamLogos:{label:name=>name},document:{getElementById:k=>els[k],querySelectorAll:()=>[]},window:{},setTimeout(){}};}
// Real financial source/year filtering, retaining zero and source separation.
let f=fs.readFileSync('assets/finance/dashboard.js','utf8').split('loadData().then')[0],c=ctx();vm.createContext(c);vm.runInContext(f,c);
const finance=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync('assets/finance/data.packed.txt','utf8'),'base64'))).records;
vm.runInContext('DATA='+JSON.stringify(finance),c);
els.source.value='EADA';els.metric.value='fbrev';els.year.value='2024';els.window.value='1';els.dollars.value='nominal';els.conference.value='';els.school.value='Maryland';vm.runInContext('view="trend";render()',c);assert(els['peer-context'].innerHTML.includes('FY2024 · EADA'));assert(els['peer-context'].innerHTML.includes('Power Four reporting sample'));
// Real current player data and positional joins, search-independent cohort.
f=fs.readFileSync('assets/fouls/dashboard.js','utf8').split("document.querySelectorAll('[data-view]').forEach(b=>b.onclick")[0];c=ctx();vm.createContext(c);vm.runInContext(f,c);
const games=JSON.parse(zlib.gunzipSync(fs.readFileSync('assets/fouls/games-2027.json.gz'))),players=JSON.parse(zlib.gunzipSync(fs.readFileSync('assets/fouls/players-2027.json.gz'))),positions=JSON.parse(fs.readFileSync('assets/fouls/player-positions-2027.json')).positions;
vm.runInContext('games='+JSON.stringify(games)+';players='+JSON.stringify(players)+';playerPositions='+JSON.stringify(positions)+';state.view="players";state.minimum=3;rows=aggregate(getRecords());state.entity=rows.find(x=>playerPositions[x.id]&&x.p>=100&&x.n>=3).id;renderProfile();',c);
assert(els['peer-context'].innerHTML.includes('position · filtered season sample'));assert(els['peer-context'].innerHTML.includes('100 on-court possessions'));
const before=els['peer-context'].innerHTML;vm.runInContext('state.search="Nobody";renderProfile()',c);assert.equal(els['peer-context'].innerHTML,before);
// Historical single-player coverage cannot yield player ranks.
vm.runInContext('state.year=2024;playerPositions={};rows=rows.slice(0,1);state.entity=rows[0].id;renderProfile()',c);assert(els['peer-context'].innerHTML.includes('<td>—</td>'));
// Program detail actual metric cohorts use all 79 programs, independent of UI filters.
const rankings=JSON.parse(fs.readFileSync('assets/coaching/rankings.json'));const merged=rankings.programs.map(p=>({...rankings.panel.find(x=>x.school===p.school),...p}));assert.equal(merged.length,79);const md=merged.find(x=>x.school==='Maryland'),p4=merged.filter(x=>x.p4_2026==='True');assert(p4.length>60);assert(pc.stats(md.eada_football_expenses_mean_FY2022_2024_2025usd,p4.map(x=>x.eada_football_expenses_mean_FY2022_2024_2025usd)).n>60);
// Recruiting school peers use the full class pool, not the spatial viewport/crop.
f=fs.readFileSync('assets/recruiting/dashboard.js','utf8');const body=f.slice(f.indexOf('function showSchool(s)'),f.indexOf('function showPlayers(ps)'));c=ctx();vm.createContext(c);vm.runInContext(fs.readFileSync('assets/recruiting/data.js','utf8'),c);vm.runInContext('const data=window.RECRUIT_DATA;const players=data.players.map(v=>({year:v[0],name:v[1],rank:v[2],rating:v[3],stars:v[4],position:v[5],hs:v[6],city:v[7],state:v[8],lat:v[9],lon:v[10],commit:v[11],url:v[12],xy:v[9]!=null}));const schools=data.schools;const sf={first:2025,last:2026,type:"blue",radius:100};const years=2;const $=id=>document.getElementById(id);const esc=v=>String(v);const fmt=v=>Number(v).toFixed(1);const yearsLabel=()=>"2025–2026";'+f.slice(f.indexOf('function distance('),f.indexOf('function circle('))+'const R=3958.7613,rad=Math.PI/180;const schoolStats=()=>({per:1,captured:1,capture:.5});'+body+';showSchool(schools.find(s=>s.name==="Maryland"));',c);assert(els.details.innerHTML.includes('Local share committed to school'));assert(els.details.innerHTML.includes('map viewport'));
console.log('Passed statistics, missing/zero/ties, real finance source/year, positional foul cohorts, sample limits, search stability, P4 inputs and recruiting context.');

// All seven published seasons reconcile before foul-type filters are applied.
const normalizedFouls = fs.readdirSync('assets/fouls').filter(name => /^games-\d{4}\.json\.gz$/.test(name));
c = ctx();
vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/fouls/dashboard.js','utf8').split("document.querySelectorAll('[data-view]').forEach(b=>b.onclick")[0], c);
const reconcile = vm.runInContext('reconcileGameTypes', c);
const sum = counts => counts.reduce((total, count) => total + count, 0);
let normalizedCount = 0;
for (const filename of normalizedFouls) {
  const sourceGames = JSON.parse(zlib.gunzipSync(fs.readFileSync('assets/fouls/' + filename)));
  for (const game of sourceGames) {
    const normalized = reconcile(game);
    assert.equal(normalized.clean, game.clean, game.id);
    assert.equal(normalized.hf, game.hf);
    assert.equal(normalized.af, game.af);
    if (normalized.clean) {
      assert.equal(sum(normalized.ht), game.hf, game.id);
      assert.equal(sum(normalized.at), game.af, game.id);
    }
    if (normalized !== game) normalizedCount++;
  }
}
assert(normalizedCount > 0, 'The snapshot includes a box score that excludes technicals');

const ncaaRows = finance.filter(record => record.a === 'NCAA');
const g6 = new Set(['American','C-USA','MAC','Mountain West','Pac-12','Sun Belt']);
for (const [source, reporting] of [['NCAA',64],['EADA',66]]) {
  const rows = finance.filter(r => r.a === source && r.y === 2025 && g6.has(r.c));
  assert.equal(new Set(rows.map(r => r.s)).size, 69);
  assert.equal(rows.filter(r => r.exp != null).length, reporting);
}
assert.equal(ncaaRows.filter(r => r.y === 2005 && g6.has(r.c) && r.exp != null).length, 59);
const flagged = ncaaRows.filter(record => record.fbexpFlagged);
assert.equal(flagged.length, 9);
assert(flagged.every(record => record.y === 2012 && record.fbexp == null));

// Distance bands are exclusive, and location gaps still count toward class share.
const recruitingSource = fs.readFileSync('assets/recruiting/dashboard.js', 'utf8');
const commitmentModel = recruitingSource.slice(
  recruitingSource.indexOf('const commitmentBands'), recruitingSource.indexOf('function showCommitments'));
const example = [
  {xy: true, miles: 100, commit: 'Maryland'},
  {xy: true, miles: 100.01, commit: 'Maryland'},
  {xy: true, miles: 250, commit: 'Virginia'},
  {xy: true, miles: 250.01, commit: 'Maryland'},
  {xy: false, commit: 'Maryland'}
];
const bandCounts = vm.runInNewContext(
  commitmentModel + '\nObject.values(commitmentBreakdown(example, {name: "Maryland"})).map(b => [b.eligible, b.commits.length]);',
  {example, distance: player => player.miles});
assert.equal(JSON.stringify(bandCounts), '[[1,1],[2,1],[1,1],[1,1]]');
