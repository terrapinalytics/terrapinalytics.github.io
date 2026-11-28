# Terrapinalytics dashboard refresh jobs

The repository uses standard Ubuntu runners on GitHub Actions. The sports jobs run twice daily in season, in Eastern time. Officiating runs at 7:17 a.m. and 1:17 p.m. from November through April. Football runs at 8:37 a.m. and 2:37 p.m. from August through January. Recruiting and finance source checks run Mondays at 10:23 a.m. Eastern.

Use **Actions → Refresh sports dashboard data → Run workflow** to select a dashboard for a manual refresh. Approved sports snapshots are committed only on material changes. The refresh explicitly requests the existing Pages workflow, which checks and publishes the site. A source or validation failure on one dashboard is recorded in Actions and the last validated files stay in place for that dashboard. Raw inputs are downloaded into a temporary directory and discarded. No OpenAI or Cloudflare service is used by these jobs.

## Sports sources

- Football uses SportsDataverse ESPN play-by-play and the existing CollegeFootballData fallbacks. ESPN team schedules independently verify current-season final scores and coverage. The first-11-games comparison retains its fixed cutoff.
- Officiating keeps the existing box-score possession estimate, the NCAA fouls and on-court player possession data, and ESPN crew assignments. The job refreshes the last seven days and merges by game ID. It uses the official Big Ten totals for the November 27, 2026 Northeastern–Northwestern and Penn State–Mississippi State games if the ESPN team lines are missing. Other final games missing from the bulk feed use ESPN summaries when both teams' box scores are available.
- The active season is explicit in each builder. When the next season starts, add the new season to the football builder and update the site selector. For officiating, initialize the next current-season snapshot and adjust its builder and workflow paths. Historical packs stay committed.

## Recruiting and athletics finance

Weekly checks report the authoritative source status to the Actions run summary. The 247Sports Composite and Knight-Newhouse sources may require interactive access, and those datasets need geocoding or filing-level review. The workflow reports unavailable sources and missing releases. An optional CFBD API key adds a structured recruiting comparison without changing the published Composite. For financial imports, normalize the source data into the existing panels and run the finance and spending explorer builders before publishing. Source checks do not consume ChatGPT credits or send ChatGPT messages.
