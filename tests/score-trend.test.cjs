const assert = require('node:assert/strict');
const {test} = require('node:test');

const sides = [
  {homeAway:'home',team:{id:1}},
  {homeAway:'away',team:{id:2}}
];

async function scoringRuns(events, spacing = 15) {
  const {scoreTrend} = await import('../assets/basketball-live/score-trend.mjs');
  let homeScore = 0, awayScore = 0;
  const plays = events.map(([home,away],i) => {
    const seconds = 1199-i*spacing;
    return {
      period:{number:1},
      clock:{displayValue:Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')},
      homeScore:homeScore+=home,
      awayScore:awayScore+=away
    };
  });
  return scoreTrend(plays,sides,{period:1}).runs.map(({team,points,allowed,killshots}) =>
    [team,points,allowed,killshots]);
}

test('shows the larger winning span around a killshot and keeps the shorter run on a tie', async () => {
  const streak = [[3,0],[3,0],[3,0],[2,0],[2,0]];
  assert.deepEqual(await scoringRuns([...streak,[0,2],[3,0],[2,0]]),[[0,18,2,[13]]]);
  assert.deepEqual(await scoringRuns([[2,0],[3,0],[0,2],...streak]),[[0,18,2,[13]]]);
  assert.deepEqual(await scoringRuns([...streak,[0,2],[2,0]]),[[0,13,0,[13]]]);
});

test('includes third and fourth killshots and excludes runs without ten unanswered points', async () => {
  const home = [[3,0],[3,0],[2,0],[2,0]];
  const away = home.map(([points]) => [0,points]);
  const events = [...home,...away,...home,...away,[3,0],[3,0],[3,0]];
  assert.deepEqual(await scoringRuns(events),[[0,10,0,[10]],[1,10,0,[10]],[0,10,0,[10]],[1,10,0,[10]]]);
});

test('keeps a long pure killshot and groups killshots sharing the same larger run', async () => {
  const streak = [[3,0],[3,0],[2,0],[2,0]];
  assert.deepEqual(await scoringRuns([...streak,[0,2],[3,0]],90),[[0,10,0,[10]]]);
  assert.deepEqual(await scoringRuns([...streak,[0,2],...streak]),[[0,20,2,[10,10]]]);
});
