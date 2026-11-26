// Each observation is a whole game worked by a crew. Whistles are unattributed.
const normalize = name => name.normalize('NFKD').replace(/\p{M}/gu,'')
  .toLowerCase().replace(/[^\p{L}]/gu,'');

function summarize(games) {
  const totals = {games:0, possessions:0, fouls:0, shootingGames:0, shootingPossessions:0, shootingFouls:0};
  for (const game of games) {
    totals.games++;
    totals.possessions += game.p;
    totals.fouls += game.hf + game.af;
    if (!game.clean || !Array.isArray(game.ht) || !Array.isArray(game.at)) continue;
    const reconciles = (counts, fouls) => {
      const sum = counts.reduce((a,b)=>a+b,0);
      return sum === fouls || sum-counts[5] === fouls;
    };
    if (!reconciles(game.ht,game.hf) || !reconciles(game.at,game.af)) continue;
    totals.shootingGames++;
    totals.shootingPossessions += game.p;
    totals.shootingFouls += game.ht[0]+game.at[0];
  }
  return {
    games:totals.games, shootingGames:totals.shootingGames,
    fouls:totals.possessions ? 100*totals.fouls/totals.possessions : null,
    shooting:totals.shootingPossessions ? 100*totals.shootingFouls/totals.shootingPossessions : null
  };
}

export function crewTendencies(games,names,cutoff,eventId) {
  const eligible = [...new Map(games.filter(g=>g.date < cutoff && String(g.id)!==String(eventId) &&
    g.p>0 && Number.isFinite(g.hf) && Number.isFinite(g.af) && g.refs?.length===3)
    .map(g=>[String(g.id),g])).values()];
  const byName = names.map(name=>({name,key:normalize(name),games:[]}));
  const crewGames = [];
  for (const game of eligible) {
    const members = new Set(game.refs.map(normalize));
    const matching = byName.filter(ref=>members.has(ref.key));
    for (const ref of matching) ref.games.push(game);
    if (matching.length) crewGames.push(game);
  }
  return {
    officials:byName.map(({name,games})=>({name,...summarize(games)})),
    crew:names.length===3 && byName.every(ref=>ref.games.length) ? summarize(crewGames) : null,
    average:summarize(eligible)
  };
}
