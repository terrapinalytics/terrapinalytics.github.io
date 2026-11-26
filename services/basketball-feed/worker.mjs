import {seasonRates} from '../../assets/basketball-live/benchmarks.mjs';
import { DurableObject } from 'cloudflare:workers';

const origin = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';
const minute = 60000, day = 1440 * minute;
const state = e => e.competitions?.[0]?.status?.type;
const sides = e => e.competitions?.[0]?.competitors ?? [];
class FeedError extends Error {
  constructor(status, message, retry = 5 * minute) {
    super(message);
    this.status = status;
    this.retry = retry;
  }
}
async function upstream(path) {
  const response = await fetch(origin + path, {signal: AbortSignal.timeout(9500)});
  if (!response.ok) {
    const h = response.headers.get('Retry-After');
    const delay = h && (/^\d+$/.test(h) ? Number(h)*1000 : Date.parse(h)-Date.now());
    throw new FeedError(503, 'Feed unavailable', Math.max(5*minute, delay || 0));
  }
  return response.json();
}
function ready(entry) {
  if (!entry?.data) throw new FeedError(503,'Feed temporarily unavailable', Math.max(5000,(entry?.until || 0)-Date.now()));
  return entry;
}
function schedule(shared, team, season) {
  return shared('schedule/' + team + '/' + (season || 'current'), async () => {
    const json = await upstream('/teams/'+team+'/schedule'+(season?'?season='+season:''));
    if (!Array.isArray(json.events) || !json.season) throw Error('Missing schedule');
    const events = json.events.map(({id,date,competitions})=>({id,date,competitions}));
    const now = Date.now();
    const last = events.some(e => state(e)?.state === 'in' ||
      (state(e)?.state === 'pre' && Date.parse(e.date)<=now && now-Date.parse(e.date)<4*60*minute));
    const tips = events.map(e=>Date.parse(e.date)-now).filter(t=>t>0);
    const ttl = last ? 5*minute : Math.max(minute,Math.min(6*60*minute,...tips));
    return {data:{season:json.season,events},ttl};
  }).then(ready);
}
async function route(url, shared, liveInterval) {
  const md = '/teams/120/schedule';
  const opponent = /^\/teams\/(\d+)\/schedule$/.exec(url.pathname);
  if (!opponent && !['/summary','/benchmarks'].includes(url.pathname)) throw new FeedError(404,'Unknown route');
  const maryland = await schedule(shared, '120');
  if (url.pathname === md) return maryland;
  const year = String(maryland.data.season.year);
  if (url.pathname === '/benchmarks') {
    const event = maryland.data.events.find(e=>String(e.id)===url.searchParams.get('event'));
    const team = url.searchParams.get('team');
    if (!event || !sides(event).some(side=>String(side.team.id)===team))
      throw new FeedError(404,'Matchup unavailable');
    return ready(await shared('benchmarks/v3/'+event.id+'/'+team,async () => {
      const calendar = team === '120' ? maryland : await schedule(shared,team,year);
      const data = await seasonRates(team,event,calendar.data,async id => {
        const prior = calendar.data.events.find(e=>String(e.id)===String(id));
        const entry = await gameSummary(shared,prior,liveInterval,false);
        return entry.data;
      });
      return {data,ttl:data.count === data.total && !calendar.stale ? day : 5*minute};
    }));
  }
  const team = opponent?.[1] ?? url.searchParams.get('team') ?? '120';
  let calendar = maryland;
  if (team !== '120') {
    if (!maryland.data.events.some(e=>sides(e).some(s=>String(s.team.id)===team))) throw new FeedError(404,'Unknown opponent');
    calendar = await schedule(shared, team, year);
  }
  if (opponent) return calendar;
  const id = url.searchParams.get('event');
  const event = calendar.data.events.find(e => String(e.id) === id);
  if (!event || (team !== '120' && !state(event)?.completed) || Date.parse(event.date)>Date.now()+minute)
    throw new FeedError(404,'Game unavailable');
  return gameSummary(shared,event,liveInterval);
}

async function gameSummary(shared,event,liveInterval,includeOfficials=true) {
  const id = event.id;
  return ready(await shared('games/'+id, async () => {
    const {header,boxscore,plays,gameInfo} = await upstream('/summary?event='+id);
    if (!header?.competitions?.length) throw Error('Missing game');
    const type = state(header);
    const ttl = type?.completed && boxscore?.players?.length
      ? (Date.now()-Date.parse(event.date)>day ? 30*day : 60*minute)
      : isLive(type) ? liveInterval : 5*minute;
    const officials = (gameInfo?.officials ?? header.competitions[0].officials ?? []).map(({fullName,displayName})=>({fullName,displayName}));
    return {data:{header,boxscore,plays,officials},ttl};
  },data=>!includeOfficials || Array.isArray(data?.officials)));
}
function isLive(type) {
  return type?.state === 'in' && !type.completed && !/suspend|postponed|cancel/i.test(type.name ?? '');
}
export class BasketballFeed extends DurableObject {
  pending = new Map();

  get liveInterval() {
    const seconds = Number(this.env.LIVE_SECONDS);
    return Number.isFinite(seconds) && seconds >= 5 ? seconds * 1000 : minute;
  }

  async shared(key, load, accept) {
    const cached = await this.ctx.storage.transaction(async txn => {
      const count = await txn.get(key);
      if (!count) return null;
      const keys = chunkKeys(key, count);
      const parts = await txn.get(keys);
      return JSON.parse(keys.map(part => parts.get(part)).join(''));
    });
    if (cached?.until > Date.now() && (cached.stale || !accept || accept(cached.data))) return cached;
    if (!this.pending.has(key)) {
      this.pending.set(key, this.update(key, cached, load).finally(() => this.pending.delete(key)));
    }
    return this.pending.get(key);
  }

  async update(key, previous, load) {
    let entry;
    try {
      const {data, ttl} = await load();
      const asOf = Date.now();
      const unchanged = key.startsWith('games/') && JSON.stringify(previous?.data) === JSON.stringify(data);
      const revision = unchanged ? (previous.revision ?? previous.asOf) : asOf;
      entry = {data, asOf, revision, until: asOf + ttl};
    } catch (error) {
      entry = {...previous, stale: true, until: Date.now() + (error.retry ?? 5 * minute)};
    }
    const data = JSON.stringify(entry);
    const chunks = data.match(/[\s\S]{1,24000}/g);
    const keys = chunkKeys(key, chunks.length);
    await this.ctx.storage.transaction(async txn => {
      const count = await txn.get(key) ?? 0;
      await txn.put(Object.fromEntries([[key, chunks.length], ...keys.map((part, i) => [part, chunks[i]])]));
      if (count > chunks.length) await txn.delete(chunkKeys(key, count).slice(chunks.length));
    });
    return entry;
  }

  read(url) {
    return route(url, this.shared.bind(this), this.liveInterval);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const headers = {'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store'};
    try {
      if (request.method !== 'GET') throw new FeedError(405, 'GET required');
      if (url.pathname === '/health') return Response.json({ok: true, liveSeconds: this.liveInterval / 1000}, {headers});
      if (url.pathname === '/stream') {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
          throw new FeedError(426, 'WebSocket required');
        const id = url.searchParams.get('event');
        if (!/^\d+$/.test(id ?? '')) throw new FeedError(404, 'Game unavailable');
        const entry = await this.game(id);
        const pair = new WebSocketPair();
        const server = pair[1];
        this.ctx.acceptWebSocket(server, [id]);
        server.serializeAttachment({revision: revisionOf(entry), stale: !!entry.stale});
        server.send(JSON.stringify(snapshot(entry)));
        await this.arm(entry);
        return new Response(null, {status: 101, webSocket: pair[0]});
      }
      return Response.json(snapshot(await this.read(url)), {headers});
    } catch (error) {
      headers['Retry-After'] = String(Math.ceil((error.retry ?? minute) / 1000));
      return Response.json({error: error.status ? error.message : 'Service unavailable'},
        {status: error.status ?? 503, headers});
    }
  }

  game(id) {
    return this.read(new URL('/summary?event=' + id, 'https://feed.invalid'));
  }

  async arm(entry) {
    if (!isLive(state(entry.data.header))) return;
    const due = Math.max(Date.now() + 1000, entry.until);
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm == null || due < alarm) await this.ctx.storage.setAlarm(due);
  }

  async alarm() {
    const games = new Set(this.ctx.getWebSockets().flatMap(socket => this.ctx.getTags(socket)));
    for (const id of games) {
      const sockets = this.ctx.getWebSockets(id);
      try {
        const entry = await this.game(id);
        const revision = revisionOf(entry);
        const stale = !!entry.stale;
        let message;
        for (const socket of sockets) {
          if (socket.readyState !== WebSocket.OPEN) continue;
          const last = socket.deserializeAttachment();
          if (last?.revision !== revision || last?.stale !== stale) {
            message ??= JSON.stringify(snapshot(entry));
            socket.send(message);
            socket.serializeAttachment({revision, stale});
          }
        }
        if (this.ctx.getWebSockets(id).length) await this.arm(entry);
      } catch (error) {
        const due = Date.now() + (error.retry ?? minute);
        const next = await this.ctx.storage.getAlarm();
        if (next == null || due < next) await this.ctx.storage.setAlarm(due);
      }
    }
  }

  webSocketMessage(socket) {
    socket.close(1008, 'Receive-only feed');
  }
}

function chunkKeys(key, count) {
  return Array.from({length: count}, (_, index) => key + '/part/' + index);
}

const revisionOf = entry => entry.revision ?? entry.asOf;

function snapshot(entry) {
  return {...entry.data, feed:{asOf: entry.asOf, revision:revisionOf(entry), stale: !!entry.stale}};
}

export default {
  fetch(request, env) {
    return env.FEED.getByName('maryland').fetch(request);
  }
};
