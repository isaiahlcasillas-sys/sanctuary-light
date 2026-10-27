/**
 * Phase 4A: Look Designer, simulated crossfades and the new workspace's data rules.
 * Console tests use the FAKE console (server/tools/fake-eos.ts): simulated, not evidence about
 * the real sanctuary system.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clampToProfile, collectionOf, controlsUnknown, interpolateState, lookCollections, lookLevels, normalizeLookApprovals, profileAssumed, toLookFixtures,
  volunteerCanUseLook, type AppConfig, type FixtureProfile, type Look,
} from '@sanctuary/shared';
import { Controller } from '../src/controller';
import { ConfigStore } from '../src/store/configStore';
import { defaultConfig } from '../src/store/defaults';
import { startFakeEos, type FakeEos } from '../tools/fake-eos';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sl-p4a-'));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 6000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('timed out'); await wait(20); }
}

const rgbPar: FixtureProfile = { id: 'par', name: 'PAR', manufacturer: 'x', kind: 'led-par', capabilities: ['intensity', 'rgb'], eosParams: {}, verified: true } as FixtureProfile;
const dimmer: FixtureProfile = { id: 'eos-dim', name: 'Dimmer', manufacturer: 'x', kind: 'conventional', capabilities: ['intensity'], eosParams: {}, verified: false } as FixtureProfile;

/** A designed local look: stage PARs (RGB) blue, front light (intensity only) at 70, with a fade. */
function designedLook(cfg: AppConfig, fadeSeconds = 0): Look {
  return {
    id: 'designed', name: 'Easter Morning', description: '', icon: 'sun', gradient: ['#000', '#111'], action: { type: 'none' }, preview: [],
    volunteerVisible: true, collection: 'Seasonal', fadeSeconds,
    fixtures: [
      { channel: 1, intensity: 100, color: { r: 0, g: 10, b: 100 } },
      // A color on an intensity-only fixture must never be stored or shown.
      { channel: 20, intensity: 70, color: { r: 100, g: 0, b: 0 } },
    ],
  };
}

describe('Look Designer data rules (pure)', () => {
  it('keeps only what each fixture is known to support, within range', () => {
    expect(clampToProfile({ intensity: 140, color: { r: 120, g: -5, b: 50 }, pan: 20 }, rgbPar)).toEqual({ intensity: 100, color: { r: 100, g: 0, b: 50 } });
    expect(clampToProfile({ intensity: 50, color: { r: 1, g: 2, b: 3 }, zoom: 40 }, dimmer)).toEqual({ intensity: 50 });
    expect(clampToProfile({ intensity: 30 }, undefined)).toEqual({ intensity: 30 });
  });

  it('marks unknown controls without inventing them, and tells sample profiles apart', () => {
    expect(controlsUnknown(undefined)).toBe(true);
    expect(controlsUnknown(dimmer)).toBe(true);           // eos-* type with no parameters in the export
    expect(controlsUnknown(rgbPar)).toBe(false);
    expect(profileAssumed({ ...rgbPar, verified: false })).toBe(true); // hand-picked / sample profile
    expect(profileAssumed(dimmer)).toBe(false);
  });

  it('reads a designed look fixture by fixture, and an older look from its group preview', () => {
    const cfg = defaultConfig();
    const levels = lookLevels(cfg, designedLook(cfg));
    expect(levels.get(1)).toMatchObject({ intensity: 100, color: { r: 0, g: 10, b: 100 } });
    const front = cfg.fixtures.find((f) => f.channel === 20)!;
    const frontCaps = cfg.profiles.find((p) => p.id === front.profileId)!.capabilities;
    expect(levels.get(20)!.color != null).toBe(frontCaps.includes('rgb'));
    expect(levels.has(31)).toBe(false); // not in the look: left alone
    const legacy = cfg.looks.find((l) => l.preview.length > 0)!;
    const fromPreview = lookLevels(cfg, legacy);
    const g = cfg.groups.find((x) => x.id === legacy.preview[0].groupId)!;
    expect(fromPreview.get(g.channels[0])!.intensity).toBe(legacy.preview[0].intensity);
  });

  it('crossfades smoothly, and a light fading up from dark takes its new color at once', () => {
    const from = { intensity: 0, color: { r: 100, g: 0, b: 0 } };
    const to = { intensity: 80, color: { r: 0, g: 0, b: 100 } };
    expect(interpolateState(from, to, 0.5)).toMatchObject({ intensity: 40, color: { r: 0, g: 0, b: 100 } });
    const lit = { intensity: 100, color: { r: 100, g: 0, b: 0 } };
    expect(interpolateState(lit, to, 0.5)).toMatchObject({ intensity: 90, color: { r: 50, g: 0, b: 50 } });
    expect(interpolateState(lit, to, 2)).toMatchObject({ intensity: 80 });
  });

  it('saves designer states sorted, clamped, and only for patched channels', () => {
    const cfg = defaultConfig();
    const states = new Map([[20, { intensity: 50, color: { r: 1, g: 2, b: 3 } }], [1, { intensity: 101 }], [9999, { intensity: 10 }]]);
    const saved = toLookFixtures(states, cfg.fixtures, cfg.profiles);
    expect(saved.map((s) => s.channel)).toEqual([1, 20]);
    expect(saved[0].intensity).toBe(100);
  });

  it('organises looks into collections (defaults first, "Worship" when none is set)', () => {
    const cfg = defaultConfig();
    expect(lookCollections(cfg.looks).slice(0, 4)).toEqual(['Worship', 'Sermon', 'Seasonal', 'Special Events']);
    expect(lookCollections([{ ...cfg.looks[0], collection: 'Easter' }])).toContain('Easter');
    expect(collectionOf({ ...cfg.looks[0], collection: undefined })).toBe('Worship');
  });

  it('a designed local look needs no Eos approval, and editing it never creates one', () => {
    const cfg = defaultConfig();
    const look = designedLook(cfg);
    expect(volunteerCanUseLook(look)).toBe(true); // action "none": preview only, nothing is sent
    const edited = { ...look, fixtures: [{ channel: 1, intensity: 10 }], approval: { at: 1, note: 'forged' } };
    expect(normalizeLookApprovals([look], [edited]).looks[0].approval).toBeNull();
  });
});

describe('Saving designed looks', () => {
  it('stores fixtures, fade, collection and timestamps; rejects bad values', () => {
    const dir = tmp();
    const store = new ConfigStore(dir);
    const cfg = store.get();
    const look = { ...designedLook(cfg, 4), updatedAt: 123 };
    store.update('looks', [...cfg.looks, look]);
    expect(new ConfigStore(dir).get().looks.find((l) => l.id === 'designed')).toMatchObject({ fadeSeconds: 4, collection: 'Seasonal', updatedAt: 123, fixtures: look.fixtures });
    expect(() => store.update('looks', [{ ...look, fadeSeconds: 500 }])).toThrow(/fade time/);
    expect(() => store.update('looks', [{ ...look, fadeSeconds: -1 }])).toThrow(/fade time/);
    expect(() => store.update('looks', [{ ...look, collection: 'x'.repeat(41) }])).toThrow(/collection/);
    expect(() => store.update('looks', [{ ...look, fixtures: [{ channel: 0, intensity: 50 }] }])).toThrow(/channel/);
    expect(() => store.update('looks', [{ ...look, fixtures: [{ channel: 1, intensity: 150 }] }])).toThrow(/intensity/);
    expect(() => store.update('looks', [{ ...look, fixtures: [{ channel: 1, intensity: 50, color: { r: 200, g: 0, b: 0 } }] }])).toThrow(/color/);
  });
});

describe('Playing local looks', () => {
  function controller(look: Look) {
    const store = new ConfigStore(tmp());
    const cfg = store.get();
    store.update('looks', [...cfg.looks, look]);
    return new Controller(store, () => undefined, () => false);
  }

  it('crossfades in Offline Simulation over the look\'s fade time, then lands exactly', async () => {
    const cfg = defaultConfig();
    const c = controller(designedLook(cfg, 0.6));
    const r = await c.execute({ kind: 'fireLook', lookId: 'designed' }, 'operator');
    expect(r).toMatchObject({ ok: true, delivery: 'simulated' });
    expect(r.message).toMatch(/0.6 s fade/);
    await wait(250);
    const mid = c.levelsSnapshot().levels[1].intensity;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    await wait(600);
    expect(c.levelsSnapshot().levels[1]).toMatchObject({ intensity: 100, color: { r: 0, g: 10, b: 100 } });
    expect(c.status().activeLook).toMatchObject({ id: 'designed', name: 'Easter Morning' });
    c.shutdown();
  });

  it('a direct change stops a fade in progress', async () => {
    const cfg = defaultConfig();
    const c = controller(designedLook(cfg, 2));
    await c.execute({ kind: 'fireLook', lookId: 'designed' }, 'operator');
    await wait(150);
    await c.execute({ kind: 'setIntensity', target: { type: 'channels', channels: [1] }, value: 5 }, 'operator');
    await wait(300);
    expect(c.levelsSnapshot().levels[1].intensity).toBe(5);
    c.shutdown();
  });

  it('never stores or shows a color on a fixture that has no color', async () => {
    const cfg = defaultConfig();
    const front = cfg.fixtures.find((f) => f.channel === 20)!;
    const hasRgb = cfg.profiles.find((p) => p.id === front.profileId)!.capabilities.includes('rgb');
    const c = controller(designedLook(cfg));
    await c.execute({ kind: 'fireLook', lookId: 'designed' }, 'operator');
    await wait(100);
    if (!hasRgb) expect(c.levelsSnapshot().levels[20].color).toBeUndefined();
    expect(c.levelsSnapshot().levels[20].intensity).toBe(70);
    c.shutdown();
  });
});

describe('Local looks against the FAKE console (Live mode unchanged)', () => {
  let eos: FakeEos;
  beforeAll(async () => { eos = await startFakeEos({ slipPort: 0, lengthPort: 0, quiet: true, version: '3.3.10.0' }); });
  afterAll(() => eos.close());

  it('in Live, a designed local look only changes the preview (no fade, nothing sent)', async () => {
    const store = new ConfigStore(tmp());
    const cfg = store.get();
    Object.assign(cfg.settings.connection, { consoleIp: '127.0.0.1', eosVersion: '3.3.10', transport: 'tcp-1.1', tcpPort: eos.ports.slip! });
    cfg.looks.push(designedLook(cfg, 5));
    store.replaceAll(cfg);
    const c = new Controller(store, () => undefined, () => false);
    await c.execute({ kind: 'setMode', mode: 'eos-monitor' }, 'operator');
    await until(() => c.status().connection.state === 'connected');
    expect((await c.execute({ kind: 'setMode', mode: 'eos-live', confirm: true }, 'operator')).ok).toBe(true);
    eos.received.length = 0;
    const r = await c.execute({ kind: 'fireLook', lookId: 'designed' }, 'operator');
    expect(r.delivery).toBe('simulated');
    expect(r.message).toMatch(/not mapped to an Eos/);
    expect(r.osc ?? []).toEqual([]);
    await wait(300);
    expect(eos.received.filter((m) => !/^\/eos\/(get\/|ping|subscribe)/.test(m))).toEqual([]);
    // Instant in Live: no simulated fade outside Offline Simulation.
    expect(c.levelsSnapshot().levels[1].intensity).toBe(100);
    // Volunteers: unapproved Eos looks are still refused by the server.
    const eosLook = cfg.looks.find((l) => l.action.type !== 'none');
    if (eosLook) expect((await c.execute({ kind: 'fireLook', lookId: eosLook.id }, 'volunteer')).ok).toBe(false);
    c.shutdown();
  });
});
