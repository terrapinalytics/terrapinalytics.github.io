# Maryland Basketball Live feed

Deploy from this directory with `npx wrangler deploy`. In Cloudflare Workers Builds, use this directory as the root and `npx wrangler deploy` as the deploy command. The Worker name is `terrapinalytics-basketball-feed`. The first deploy provisions one SQLite-backed Durable Object namespace.

Verify `/health`, `/teams/120/schedule` and the most recent completed Maryland game at `/summary?event=GAME_ID` before changing the API origin in `assets/basketball-live/app.mjs`. Increment its version query in `assets/basketball-live/index.html` at cutover.

The HTTP routes preserve the existing dashboard response contract. The receive-only WebSocket at `/stream?event=GAME_ID` sends a snapshot on connection, then sends refreshed snapshots on the shared cadence. The alarm stops rearming after the final or after the last viewer disconnects. `LIVE_SECONDS` defaults to 10 seconds.
