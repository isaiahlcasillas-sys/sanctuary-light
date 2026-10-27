/**
 * Phase 3.5: installation and first sanctuary test.
 * Simulated only: sample export files and the FAKE console. Nothing here is evidence about the
 * real sanctuary system.
 */
import dgram from 'node:dgram';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildImportPlan, defaultImportOptions, importReport, type AppConfig } from '@sanctuary/shared';
import { Controller } from '../src/controller';
import { parseShowFile } from '../src/import';
import { ConfigStore } from '../src/store/configStore';
import { defaultConfig } from '../src/store/defaults';
import { startFakeEos } from '../tools/fake-eos';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sl-p35-'));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', 'eos-import', name));

function imported(file: string): AppConfig {
  const show = parseShowFile(fixture(file), file);
  const base = defaultConfig();
  return buildImportPlan(show, base, { ...defaultImportOptions(show, base), mode: 'replace' }).config;
}

describe('Installing next to the real Eos: the test suite can never reach Eos ports', () => {
  it('refuses to connect to, send to or listen on Eos OSC ports', () => {
    for (const port of [3032, 3037]) {
      expect(() => net.connect(port, '127.0.0.1')).toThrow(/Test safety guard/);
      expect(() => net.createServer().listen(port, '127.0.0.1')).toThrow(/Test safety guard/);
    }
    const udp = dgram.createSocket('udp4');
    expect(() => udp.send(Buffer.from('x'), 8000, '127.0.0.1')).toThrow(/Test safety guard/);
    expect(() => udp.bind(8001)).toThrow(/Test safety guard/);
    udp.close();
  });
});

describe('Always starts in Offline Simulation', () => {
  it('never connects on start, even when a console is configured and was used Live before', async () => {
    const eos = await startFakeEos({ slipPort: 0, lengthPort: 0, quiet: true });
    const store = new ConfigStore(tmp());
    const cfg = store.get();
    Object.assign(cfg.settings.connection, { consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: eos.ports.slip! });
    cfg.settings.commissioning.liveTest = { at: 1, channel: 11, level: 50, operatorConfirmedLight: true, released: true };
    store.replaceAll(cfg);
    const c = new Controller(store, () => undefined, () => false);
    await wait(400);
    expect(c.mode).toBe('offline');
    expect(c.status().connection.state).toBe('disabled');
    expect(eos.received).toEqual([]);
    c.shutdown(); eos.close();
  });
});

describe('Import report: imported, incomplete, manual, never imported', () => {
  it('reports exactly what the sample CSV export contained', () => {
    const cfg = imported('eos-export.csv');
    const r = importReport(cfg);
    expect(r.source).toMatchObject({ fileName: 'eos-export.csv' });
    const byLabel = (lines: { label: string; count?: number }[]) => Object.fromEntries(lines.map((l) => [l.label, l.count]));
    const imp = byLabel(r.imported);
    const fixtures = cfg.fixtures.length;
    expect(imp.Channels).toBe(fixtures);
    expect(imp['DMX addresses']).toBe(cfg.fixtures.filter((f) => f.dmx).length);
    expect(imp['Cue lists']).toBe(cfg.cueLists.reduce((n, l) => n + l.cues.length, 0));
    // Counts add up: every channel either has a type or is reported as missing one.
    const inc = byLabel(r.incomplete);
    expect((imp['Fixture types'] ?? 0) + (inc['Fixture type unknown'] ?? 0)).toBe(fixtures);
    expect((imp['DMX addresses'] ?? 0) + (inc['No DMX address'] ?? 0)).toBe(fixtures);
    expect((imp.Controls ?? 0) + (inc['Controls not confirmed'] ?? 0)).toBe(fixtures);
    // Positions are always manual: imported fixtures wait to be placed.
    expect(byLabel(r.manual)['Place fixtures on the stage plan']).toBe(cfg.fixtures.filter((f) => f.unplaced).length);
    expect(r.notImported.map((l) => l.label)).toEqual(expect.arrayContaining(['Cue contents', 'Where the lights hang', 'SceneStation, Gadget II, wireless DMX']));
  });

  it('reports a USITT ASCII export honestly (no fixture types, nothing invented)', () => {
    const file = fs.readdirSync(path.join(__dirname, 'fixtures', 'eos-import')).find((f) => f.endsWith('.asc'))!;
    const cfg = imported(file);
    const r = importReport(cfg);
    const imp = Object.fromEntries(r.imported.map((l) => [l.label, l.count]));
    const inc = Object.fromEntries(r.incomplete.map((l) => [l.label, l.count]));
    expect(imp.Channels).toBe(cfg.fixtures.length);
    expect((imp['Fixture types'] ?? 0) + (inc['Fixture type unknown'] ?? 0)).toBe(cfg.fixtures.length);
    expect(cfg.fixtures.every((f) => f.unplaced)).toBe(true);
  });

  it('recommends Replace for the first import of a real show, Merge after that', () => {
    const show = parseShowFile(fixture('eos-export.csv'), 'eos-export.csv');
    const fresh = defaultConfig();
    expect(defaultImportOptions(show, fresh).mode).toBe('replace');
    const after = buildImportPlan(show, fresh, defaultImportOptions(show, fresh)).config;
    expect(after.eosShow).not.toBeNull();
    expect(defaultImportOptions(show, after).mode).toBe('merge');
    // The first import keeps nothing from the sample setup.
    expect(after.fixtures.every((f) => f.eosLabel !== undefined)).toBe(true);
  });

  it('says plainly when nothing has been imported', () => {
    const r = importReport(defaultConfig());
    expect(r.source).toBeNull();
    expect(r.imported).toEqual([]);
    expect(r.manual[0].label).toBe('Import your Eos show');
  });
});

describe('Docs never suggest stopping Eos or disconnecting DMX before the SceneStation audit', () => {
  // The audit documents themselves describe those tests, gated on a qualified person.
  const AUDIT_DOCS = new Set(['SYSTEM_AUDIT.md', 'SCENESTATION_WORKSHEET.md', 'PHASE5_DIRECT_DMX.md']);
  const RISKY = /(restart(ing)? (the|this) (sanctuary )?pc|power[- ]cycle|close[sd]? (and reopen )?eos|clos(e|ing) eos|quit eos|shut ?down eos|unplug|disconnect(s|ing)? (the |eos'?s? )?(dmx|lighting|network))/i;
  const GATED = /(audit|don'?t|do not|never|not |only after|qualified|not yet|unless)/i;
  it('every risky instruction outside the audit docs is gated or forbidden', () => {
    const dir = path.join(__dirname, '..', '..', 'docs');
    const offenders: string[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md') && !AUDIT_DOCS.has(x))) {
      fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
        if (RISKY.test(line) && !GATED.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
