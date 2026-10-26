import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/store/defaults';
import { exportCsv, importCsv, importJson } from '../src/store/patchImport';

const cfg = defaultConfig();

describe('patch import', () => {
  it('imports CSV with aliases, DMX formats and unknown types', () => {
    const csv = 'Chan,Label,Type,DMX\n21,Front Left,Source Four WRD,2/101\n22,"Front, Center",Mystery Light,613\n';
    const r = importCsv(csv, cfg.profiles, cfg.fixtures, new Set());
    expect(r.fixtures).toHaveLength(2);
    expect(r.fixtures[0]).toMatchObject({ channel: 21, label: 'Front Left', profileId: 'etc-source4wrd', dmx: { universe: 2, address: 101 } });
    expect(r.fixtures[1]).toMatchObject({ label: 'Front, Center', profileId: 'generic', dmx: { universe: 2, address: 101 } });
    expect(r.warnings.some((w) => w.includes('Mystery Light'))).toBe(true);
  });
  it('requires a channel column', () => {
    expect(importCsv('address,label\n1,x\n', cfg.profiles, [], new Set()).warnings[0]).toMatch(/channel/);
  });
  it('drops duplicate channels and keeps existing stage positions', () => {
    const r = importCsv('channel\n1\n1\n', cfg.profiles, cfg.fixtures, new Set());
    expect(r.fixtures).toHaveLength(1);
    expect(r.fixtures[0].stage).toEqual(cfg.fixtures.find((f) => f.channel === 1)!.stage);
  });
  it('round-trips through CSV export', () => {
    const r = importCsv(exportCsv(cfg.fixtures), cfg.profiles, [], new Set());
    expect(r.fixtures.length).toBe(cfg.fixtures.length);
    expect(r.fixtures.find((f) => f.channel === 61)?.protected).toBe(true);
  });
  it('imports JSON arrays', () => {
    expect(importJson('[{"channel":5,"label":"x"}]', []).fixtures[0]).toMatchObject({ channel: 5, label: 'x', profileId: 'generic' });
  });
});
