(() => {
  const banner = document.getElementById('maryland-game-day');
  if (!banner) return;

  const easternDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric'
  });
  let checkedDay;
  let loading = false;

  async function checkGameDay() {
    const today = easternDate.format(new Date());
    if (loading || checkedDay === today || document.hidden) return;
    banner.hidden = true;
    loading = true;
    try {
      const response = await fetch('https://terrapinalytics-basketball-feed.terrapinalytics.workers.dev/teams/120/schedule',
        {signal: AbortSignal.timeout(12000)});
      if (!response.ok) return;
      const {events} = await response.json();
      const game = events.find(({date, competitions}) => {
        const tip = new Date(date);
        const status = competitions?.[0]?.status?.type;
        return Number.isFinite(tip.getTime()) && easternDate.format(tip) === today &&
          ['pre', 'in', 'post'].includes(status?.state) && !/postponed|cancel/i.test(status.name ?? '');
      });
      checkedDay = today;
      if (!game || easternDate.format(new Date()) !== today) return;
      const competition = game.competitions[0];
      const opponent = competition.competitors?.find(side => side.team && String(side.team.id) !== '120');
      const away = !competition.neutralSite && opponent?.homeAway === 'home';
      const name = opponent?.team.location || opponent?.team.displayName;
      banner.querySelector('.game-day-matchup').textContent = name ? (away ? 'Maryland at ' : 'Maryland vs. ') + name : 'Maryland basketball game day';
      banner.hidden = false;
    } catch {
      // A temporary feed failure leaves the banner hidden.
    } finally {
      loading = false;
    }
  }

  document.addEventListener('visibilitychange',checkGameDay);
  checkGameDay();
  // Recheck on a new Eastern calendar day if the homepage stays open overnight.
  setInterval(checkGameDay, 60000);
})();
