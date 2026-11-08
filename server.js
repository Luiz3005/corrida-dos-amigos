'use strict';
/*
 * Corrida dos Amigos: servidor online
 * - entrega o jogo (pasta public/) e mantém as salas via WebSocket em /ws
 * - até 6 jogadores por sala; a corrida começa quando todos estão prontos
 * - o anfitrião (primeiro jogador conectado) controla os pilotos da IA
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const CHARS = ['mariposa', 'majing', 'libelula', 'saci', 'pegrande', 'mae', 'valdumiru', 'jiujitsu'];
const MAX = 6, START_DELAY = 3000, LOBBY_GRACE = 12000, AFTER_FIRST_FINISH = 75000, RACE_MAX = 8 * 60000;

/* ---------------- arquivos do site ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok ' + rooms.size + ' salas'); }
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('não encontrado'); }
    const ext = path.extname(file).toLowerCase();
    const longCache = p.startsWith('/assets/');
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'content-length': st.size, 'cache-control': longCache ? 'public, max-age=604800' : 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

/* ---------------- salas ---------------- */
const rooms = new Map(); // código -> sala
const rid = n => Array.from({ length: n }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Piloto';
const TRACK_IDS = ['saci', 'oeste'];
function newCode() { for (let i = 0; i < 200; i++) { const c = String(1000 + Math.floor(Math.random() * 9000)); if (!rooms.has(c)) return c; } return null; }
function makeRoom() {
  const code = newCode(); if (!code) return null;
  const room = { code, players: new Map(), phase: 'lobby', host: null, startAt: 0, startTimer: null, raceTimer: null, overTimer: null, firstFin: 0, emptySince: 0, grid: null, track: 'saci' };
  rooms.set(code, room); return room;
}
const connected = room => [...room.players.values()].filter(p => p.ws);
function pickHost(room) {
  const cur = room.players.get(room.host);
  if (cur && cur.ws) return;
  const c = connected(room).sort((a, b) => a.slot - b.slot)[0];
  room.host = c ? c.key : null;
}
function publicState(room, forKey) {
  const me = room.players.get(forKey);
  return {
    t: 'room', code: room.code, phase: room.phase, track: room.track, you: me ? me.id : null,
    host: room.players.get(room.host) ? room.players.get(room.host).id : null,
    startsIn: room.startAt ? Math.max(0, room.startAt - Date.now()) : 0,
    players: [...room.players.values()].sort((a, b) => a.slot - b.slot).map(p => ({ id: p.id, name: p.name, c: p.c, slot: p.slot, ready: p.ready, on: !!p.ws, fin: p.fin || 0, racing: !!p.racing, voice: !!(p.ws && p.voice) })),
  };
}
function send(ws, o) { if (ws && ws.readyState === 1) ws.send(typeof o === 'string' ? o : JSON.stringify(o)); }
function broadcast(room) { for (const p of room.players.values()) if (p.ws) send(p.ws, publicState(room, p.key)); }
function relay(room, fromKey, o) { const s = JSON.stringify(o); for (const p of room.players.values()) if (p.ws && p.key !== fromKey) send(p.ws, s); }

function checkStart(room) {
  if (room.phase !== 'lobby') return;
  const on = connected(room), all = on.length > 0 && on.every(p => p.ready);
  if (all && !room.startAt) {
    room.startAt = Date.now() + START_DELAY;
    room.startTimer = setTimeout(() => startRace(room), START_DELAY);
    broadcast(room);
  } else if (!all && room.startAt) {
    clearTimeout(room.startTimer); room.startAt = 0; broadcast(room);
  }
}
function startRace(room) {
  room.startAt = 0;
  const on = connected(room).filter(p => p.ready);
  if (!on.length) return broadcast(room);
  // pilotos humanos + os personagens que sobraram (IA), em ordem de largada sorteada
  const used = new Set(on.map(p => p.c));
  const grid = on.map(p => ({ c: p.c, id: p.id, name: p.name })).concat(CHARS.filter(c => !used.has(c)).map(c => ({ c, id: null, name: '' })));
  for (let i = grid.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [grid[i], grid[j]] = [grid[j], grid[i]]; }
  room.phase = 'race'; room.grid = grid; room.firstFin = 0;
  for (const p of room.players.values()) { p.fin = 0; p.racing = on.includes(p); }
  pickHost(room);
  const host = room.players.get(room.host);
  for (const p of room.players.values()) if (p.ws) send(p.ws, { t: 'start', grid, track: room.track, host: host ? host.id : null, seed: Math.floor(Math.random() * 1e9) });
  room.raceTimer = setTimeout(() => endRace(room), RACE_MAX);
  broadcast(room);
}
function checkOver(room) {
  if (room.phase !== 'race') return;
  const racing = [...room.players.values()].filter(p => p.racing && p.ws);
  if (!racing.length || racing.every(p => p.fin)) return endRace(room);
  if (room.firstFin && !room.overTimer) room.overTimer = setTimeout(() => endRace(room), AFTER_FIRST_FINISH);
}
function endRace(room) {
  if (room.phase !== 'race') return;
  clearTimeout(room.raceTimer); clearTimeout(room.overTimer); room.overTimer = null;
  room.phase = 'lobby'; room.grid = null;
  for (const [k, p] of room.players) { p.ready = false; p.racing = false; if (!p.ws) { room.players.delete(k); } }
  for (const p of room.players.values()) if (p.ws) send(p.ws, { t: 'over' });
  pickHost(room); broadcast(room);
}
function freeChar(room, pref, exceptKey) {
  const taken = new Set([...room.players.values()].filter(p => p.key !== exceptKey).map(p => p.c));
  if (pref && CHARS.includes(pref) && !taken.has(pref)) return pref;
  return CHARS.find(c => !taken.has(c));
}
function joinRoom(ws, room, pref, stillRacing) {
  let p = room.players.get(ws.key);
  if (p) { // reconexão
    if (p.ws && p.ws !== ws) { try { p.ws.close(4000, 'outra aba'); } catch (e) { } }
    p.ws = ws; p.voice = false; p.name = ws.name || p.name; clearTimeout(p.dropTimer);
    if (room.phase === 'race' && p.racing && !stillRacing) p.racing = false; // voltou sem a corrida aberta: espera a próxima
  } else {
    if (room.players.size >= MAX) return send(ws, { t: 'err', msg: 'Essa sala já está cheia (6 jogadores).' });
    const slots = new Set([...room.players.values()].map(p => p.slot)); let slot = 0; while (slots.has(slot)) slot++;
    p = { key: ws.key, id: rid(10), name: ws.name, c: freeChar(room, pref, ws.key), slot, ready: false, ws, fin: 0, racing: false };
    room.players.set(ws.key, p);
  }
  if (ws.room && ws.room !== room) leaveRoom(ws);
  ws.room = room; room.emptySince = 0;
  pickHost(room); broadcast(room);
}
function leaveRoom(ws, dropNow) {
  const room = ws.room; if (!room) return; ws.room = null;
  const p = room.players.get(ws.key); if (!p || p.ws !== ws) return;
  p.ws = null;
  if (dropNow || room.phase === 'lobby') {
    const drop = () => { if (!p.ws && room.players.get(p.key) === p && room.phase === 'lobby') { room.players.delete(p.key); pickHost(room); checkStart(room); broadcast(room); } };
    if (dropNow) drop(); else { p.ready = false; p.dropTimer = setTimeout(drop, LOBBY_GRACE); }
  }
  pickHost(room); broadcast(room); checkStart(room); checkOver(room);
  if (!connected(room).length) room.emptySince = Date.now();
}
setInterval(() => { const now = Date.now(); for (const [c, r] of rooms) if (r.emptySince && now - r.emptySince > 60000) { clearTimeout(r.startTimer); clearTimeout(r.raceTimer); clearTimeout(r.overTimer); rooms.delete(c); } }, 15000);

/* ---------------- WebSocket ---------------- */
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', ws => {
  ws.alive = true; ws.budget = 80; ws.on('pong', () => ws.alive = true);
  ws.on('message', raw => {
    if (--ws.budget < 0) return; // excesso de mensagens: ignora
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    const room = ws.room, me = room && room.players.get(ws.key);
    switch (m.t) {
      case 'hello':
        if (typeof m.key !== 'string' || !/^[a-z0-9]{8,40}$/.test(m.key)) return ws.close(4001, 'chave inválida');
        ws.key = m.key; ws.name = cleanName(m.name); return;
      case 'create': {
        if (!ws.key) return;
        const r = makeRoom(); if (!r) return send(ws, { t: 'err', msg: 'Servidor lotado, tente de novo.' });
        return joinRoom(ws, r, m.c);
      }
      case 'join': {
        if (!ws.key) return;
        const r = rooms.get(String(m.code || '')); if (!r) return send(ws, { t: 'err', msg: 'Sala ' + String(m.code || '').slice(0, 4) + ' não encontrada. Confira o código.' });
        return joinRoom(ws, r, m.c, !!m.racing);
      }
      case 'leave': return leaveRoom(ws, true);
      case 'ping': return send(ws, { t: 'pong' });
    }
    if (!room || !me || me.ws !== ws) return;
    switch (m.t) {
      case 'pick': {
        if (room.phase !== 'lobby' && me.racing) return;
        if (me.ready || !CHARS.includes(m.c)) return;
        if ([...room.players.values()].some(p => p !== me && p.c === m.c)) return send(ws, { t: 'err', msg: 'Esse piloto já foi escolhido.' });
        me.c = m.c; return broadcast(room);
      }
      case 'ready': me.ready = !!m.v; broadcast(room); return checkStart(room);
      case 'track': {
        // só o anfitrião escolhe a pista, e só antes da largada
        if (room.phase !== 'lobby' || room.host !== me.key || !TRACK_IDS.includes(m.v) || room.startAt) return;
        room.track = m.v; return broadcast(room);
      }
      case 'st': case 'pw': case 'box': {
        if (room.phase !== 'race' || !me.racing) return;
        // cada aparelho só fala pelos karts que controla: o seu e, se for anfitrião, as IAs
        const humansOnline = new Set([...room.players.values()].filter(p => p.racing && p.ws && p !== me).map(p => p.c));
        const may = c => c === me.c || (room.host === me.key && room.grid && room.grid.some(g => g.c === c) && !humansOnline.has(c));
        if (m.t === 'st') { if (!Array.isArray(m.s)) return; const s = m.s.filter(a => Array.isArray(a) && a.length <= 16 && may(a[0])).slice(0, 8); if (s.length) relay(room, ws.key, { t: 'st', s }); }
        else if (m.t === 'pw') { if (m.d && may(m.d.by)) relay(room, ws.key, { t: 'pw', d: m.d }); }
        else relay(room, ws.key, { t: 'box', i: m.i | 0 });
        return;
      }
      case 'voice': me.voice = !!m.v; return broadcast(room);
      case 'rtc': {
        // sinalização do chat de voz (WebRTC): só repassa para alguém da mesma sala
        const to = [...room.players.values()].find(p => p.id === m.to);
        if (!to || !to.ws || to === me || !m.d || typeof m.d !== 'object') return;
        return send(to.ws, { t: 'rtc', from: me.id, d: m.d });
      }
      case 'fin': {
        if (room.phase !== 'race' || !me.racing || me.fin) return;
        me.fin = Math.max(1, +m.time || 1); if (!room.firstFin) room.firstFin = Date.now();
        broadcast(room); return checkOver(room);
      }
    }
  });
  ws.on('close', () => leaveRoom(ws));
});
// orçamento de mensagens por segundo + detecção de conexões mortas
setInterval(() => { for (const ws of wss.clients) ws.budget = 80; }, 1000);
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch (e) { } } }, 15000);

server.listen(PORT, () => console.log('Corrida dos Amigos online na porta ' + PORT));
