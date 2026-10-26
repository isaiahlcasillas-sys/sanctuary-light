/**
 * Sanctuary Light local control server.
 *   Browser ⇄ (HTTP + WebSocket) ⇄ this server ⇄ (OSC) ⇄ ETC Ion / Eos
 */
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AppConfig, ClientMessage, Role, ServerMessage } from '@sanctuary/shared';
import { Auth } from './auth';
import { parseSleepPrevention, preventSleep } from './platform';
import { Controller } from './controller';
import { EOS_COMMAND_TABLE } from './engine/eosCommands';
import { ConfigStore } from './store/configStore';
import { exportCsv, importCsv, importJson } from './store/patchImport';
import type { SectionKey } from './store/validate';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const dataDir = process.env.SANCTUARY_DATA_DIR ?? path.join(root, 'data');
const webDist = path.join(root, 'web', 'dist');

const store = new ConfigStore(dataDir);
const auth = new Auth(dataDir);

interface Client { ws: WebSocket; token: string | null; role: Role | null }
const clients = new Set<Client>();

function send(c: Client, msg: ServerMessage) {
  if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
}
function broadcast(msg: ServerMessage) {
  const data = JSON.stringify(msg);
  for (const c of clients) if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
}

const controller = new Controller(store, broadcast, () => auth.defaultPinsInUse);
for (const note of store.migrationNotes) controller.log('warn', `Config updated: ${note}`);

// ───────────────────────────── HTTP API ─────────────────────────────

const app = express();
app.use(express.json({ limit: '5mb' }));

function role(req: Request): Role | null {
  const h = req.header('authorization');
  return auth.check(h?.startsWith('Bearer ') ? h.slice(7) : null);
}
function operatorOnly(req: Request, res: Response, next: NextFunction) {
  if (role(req) !== 'operator') { res.status(403).json({ error: 'Operator PIN required' }); return; }
  next();
}

const SECTIONS: SectionKey[] = ['settings', 'profiles', 'fixtures', 'groups', 'looks', 'cueLists', 'submasters', 'stage', 'architecture'];

const startedAt = Date.now();
const appVersion = (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string }).version;
// Used by the Mac launcher to tell whether the server is already running.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'sanctuary-light', version: appVersion, mode: controller.mode, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), platform: `${process.platform}-${process.arch}` });
});
app.get('/api/config', (_req, res) => { res.json(store.get()); });
app.get('/api/eos/commands', (_req, res) => { res.json(EOS_COMMAND_TABLE); });

app.put('/api/config/:section', operatorOnly, (req, res) => {
  const key = req.params.section as SectionKey;
  if (!SECTIONS.includes(key)) { res.status(404).json({ error: 'Unknown section' }); return; }
  const prev = store.get();
  try {
    const next = store.update(key, req.body as AppConfig[typeof key]);
    broadcast({ t: 'config', config: next });
    controller.onConfigChanged(prev);
    controller.log('info', `Saved ${key} (local file only — the Ion show file is unchanged).`);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post('/api/config/reset', operatorOnly, (req, res) => {
  if (req.body?.confirm !== true) { res.status(400).json({ error: 'Confirmation required' }); return; }
  const prev = store.get();
  const next = store.resetToDefaults();
  broadcast({ t: 'config', config: next });
  controller.onConfigChanged(prev);
  controller.log('warn', 'Configuration reset to the sample defaults (previous version backed up).');
  res.json({ ok: true });
});

app.get('/api/backup', operatorOnly, (_req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="sanctuary-light-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ app: 'sanctuary-light', version: 1, exportedAt: new Date().toISOString(), config: store.get() });
});

app.post('/api/restore', operatorOnly, (req, res) => {
  if (req.body?.confirm !== true) { res.status(400).json({ error: 'Confirmation required' }); return; }
  const cfg = (req.body?.backup?.config ?? req.body?.backup) as AppConfig | undefined;
  if (!cfg?.settings || !cfg.fixtures) { res.status(400).json({ error: 'Not a Sanctuary Light backup file' }); return; }
  const prev = store.get();
  try {
    const next = store.replaceAll(cfg);
    broadcast({ t: 'config', config: next });
    controller.onConfigChanged(prev);
    controller.log('warn', 'Configuration restored from backup.');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post('/api/patch/import', operatorOnly, (req, res) => {
  const { format, content } = req.body ?? {};
  if (typeof content !== 'string') { res.status(400).json({ error: 'No file content' }); return; }
  const cfg = store.get();
  const protectedChannels = new Set(cfg.fixtures.filter((f) => f.protected).map((f) => f.channel));
  const result = format === 'json' ? importJson(content, cfg.fixtures) : importCsv(content, cfg.profiles, cfg.fixtures, protectedChannels);
  res.json(result); // preview only — the browser applies it via PUT /api/config/fixtures
});

app.get('/api/patch/export', operatorOnly, (req, res) => {
  const fixtures = store.get().fixtures;
  if (req.query.format === 'json') { res.json({ fixtures }); return; }
  res.type('text/csv').send(exportCsv(fixtures));
});

/** This computer's IPv4 addresses, for the setup wizard's same-subnet check. Read-only. */
app.get('/api/network/interfaces', operatorOnly, (_req, res) => {
  const out = Object.entries(os.networkInterfaces()).flatMap(([name, list]) => (list ?? [])
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => ({ name, address: i.address, netmask: i.netmask, cidr: i.cidr ?? null })));
  res.json(out);
});

app.get('/api/sync', operatorOnly, (_req, res) => { res.json(controller.syncResult); });

app.post('/api/auth/pin', operatorOnly, (req, res) => {
  try {
    auth.setPin(req.body?.role === 'volunteer' ? 'volunteer' : 'operator', String(req.body?.pin ?? ''));
    controller.log('info', `${req.body?.role === 'volunteer' ? 'Volunteer' : 'Operator'} PIN changed.`);
    controller.pushStatus();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|ws).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.type('text').send('Sanctuary Light server is running. Start the web UI with "npm run dev" (http://localhost:5173) or build it with "npm run build".'));
}

// ───────────────────────────── WebSocket ─────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') { socket.destroy(); return; }
  // Reject cross-site pages trying to open a socket to the control server.
  const origin = req.headers.origin;
  if (origin) {
    const o = new URL(origin).hostname;
    const h = (req.headers.host ?? '').split(':')[0];
    if (o !== h && o !== 'localhost' && o !== '127.0.0.1') { socket.destroy(); return; }
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});

wss.on('connection', (ws: WebSocket) => {
  const client: Client = { ws, token: null, role: null };
  clients.add(client);
  send(client, {
    t: 'welcome', role: null, token: null, status: controller.status(), config: store.get(),
    levels: controller.levelsSnapshot(), log: controller.recentLog(),
  });
  ws.on('message', async (data) => {
    let msg: ClientMessage;
    try { msg = JSON.parse(String(data)); } catch { return; }
    switch (msg.t) {
      case 'login': {
        const r = auth.login(String(msg.pin ?? ''));
        if ('error' in r) { send(client, { t: 'auth', role: null, token: null, error: r.error }); return; }
        client.token = r.token; client.role = r.role;
        controller.log('info', `${r.role === 'operator' ? 'Operator' : 'Volunteer'} signed in.`);
        send(client, { t: 'auth', role: r.role, token: r.token });
        return;
      }
      case 'resume': {
        const r = auth.check(msg.token);
        client.token = r ? msg.token : null; client.role = r;
        send(client, { t: 'auth', role: r, token: client.token });
        return;
      }
      case 'logout':
        auth.logout(client.token);
        client.token = null; client.role = null;
        send(client, { t: 'auth', role: null, token: null });
        return;
      case 'cmd': {
        // Re-check the token on every command so expired sessions can't keep control.
        client.role = auth.check(client.token);
        const result = await controller.execute(msg.cmd, client.role);
        send(client, { t: 'ack', id: msg.id, result });
        if (result.delivery === 'sent' || result.delivery === 'blocked') {
          if (msg.cmd.kind !== 'setIntensity' && msg.cmd.kind !== 'setSub' && msg.cmd.kind !== 'setColor' && msg.cmd.kind !== 'setParam') {
            controller.log(result.delivery === 'blocked' ? 'warn' : 'info', result.message);
          }
        }
        return;
      }
    }
  });
  ws.on('close', () => clients.delete(client));
});

const settings = store.get().settings;
const host = process.env.HOST ?? (settings.safety.localhostOnly ? '127.0.0.1' : '0.0.0.0');
const port = Number(process.env.PORT ?? 4700);

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use — Sanctuary Light may already be running. Open http://localhost:${port}`);
    process.exit(2);
  }
  throw e;
});

// Daily configuration snapshot (startup, then hourly check). Local files only.
const snapshot = () => {
  try { const made = store.dailySnapshot(); if (made) controller.log('info', `Daily configuration backup saved (${made}).`); }
  catch (e) { controller.log('warn', `Daily backup failed: ${(e as Error).message}`); }
};
snapshot();
setInterval(snapshot, 60 * 60 * 1000).unref();

const caffeinate = preventSleep(parseSleepPrevention(process.env.SANCTUARY_PREVENT_SLEEP), (m) => controller.log('info', m));

server.listen(port, host, () => {
  console.log(`\n  Sanctuary Light control server`);
  console.log(`  ➜  http://${host === '0.0.0.0' ? 'localhost' : host}:${port}   (mode: Offline Simulation)`);
  console.log(`  ➜  data: ${dataDir}`);
  if (auth.defaultPinsInUse) console.log('  ⚠  Default PINs in use (operator 1234, volunteer 0000). Change them in Settings → Security.\n');
});

function shutdown() {
  // Closing the app never sends a blackout or release to the console.
  controller.shutdown();
  caffeinate?.kill();
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
