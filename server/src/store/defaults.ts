/**
 * Starting configuration for Lake Travis UMC.
 *
 * EVERYTHING here is a placeholder built from the preliminary channel groupings.
 * Fixture types per channel, DMX addresses, Eos groups, cues and submasters are NOT
 * read from the real Ion. Replace via Settings → Patch (CSV/JSON import or console sync).
 */
import { defaultArchitecture } from '@sanctuary/shared';
import type {
  AppConfig, CommissioningRecord, Fixture, FixtureGroup, FixtureProfile, Look, StageElement,
} from '@sanctuary/shared';

export const GENERIC_PROFILE: FixtureProfile = {
  id: 'generic', name: 'Generic intensity-only', manufacturer: '—', kind: 'conventional',
  capabilities: ['intensity'], eosParams: {}, verified: false,
  notes: 'Used for imported channels whose fixture type is not recognized.',
};

export const DEFAULT_PROFILES: FixtureProfile[] = [
  GENERIC_PROFILE,
  {
    id: 'stagelight-par-rgbw', name: 'LED PAR RGBW (Monoprice Stage Right)', manufacturer: 'Monoprice',
    kind: 'led-par', capabilities: ['intensity', 'rgb', 'white'],
    eosParams: { red: 'Red', green: 'Green', blue: 'Blue', white: 'White' }, verified: false,
    notes: 'Check the Eos library type the Ion uses for these PARs; parameter names must match.',
  },
  {
    id: 'chauvet-colorband-h9', name: 'COLORband H9 USB', manufacturer: 'Chauvet DJ',
    kind: 'led-bar', capabilities: ['intensity', 'rgb', 'white', 'amber', 'uv'],
    eosParams: { red: 'Red', green: 'Green', blue: 'Blue', white: 'White', amber: 'Amber', uv: 'UV' }, verified: false,
    notes: 'Channel mode on the fixture determines which parameters exist. Verify personality.',
  },
  {
    id: 'wonderbar', name: 'WonderBar LED bar', manufacturer: 'Unknown',
    kind: 'led-bar', capabilities: ['intensity', 'rgb'],
    eosParams: { red: 'Red', green: 'Green', blue: 'Blue' }, verified: false,
    notes: 'Manufacturer/model unconfirmed.',
  },
  {
    id: 'etc-source4wrd', name: 'Source Four WRD', manufacturer: 'ETC',
    kind: 'conventional', capabilities: ['intensity'], eosParams: {}, verified: false,
    notes: 'Fixed-white LED. Some WRD II variants offer selectable CCT — add "cct" if patched that way.',
  },
  {
    id: 'fuze-pendant', name: 'Fuze pendant', manufacturer: 'Unknown',
    kind: 'pendant', capabilities: ['intensity'], eosParams: {}, verified: false,
    notes: 'House pendant. Control path (dimmer vs. LED driver vs. SceneStation) needs confirmation.',
  },
  {
    id: 'chorus-line', name: 'Chorus Line LED strip', manufacturer: 'Altman',
    kind: 'striplight', capabilities: ['intensity', 'rgb', 'amber'],
    eosParams: { red: 'Red', green: 'Green', blue: 'Blue', amber: 'Amber' }, verified: false,
  },
  {
    id: 'relay', name: 'Relay / utility', manufacturer: '—',
    kind: 'relay', capabilities: ['relay'], eosParams: {}, verified: false,
    notes: 'Protected. Relays may switch power to fixtures or other equipment.',
  },
  {
    id: 'demo-mover', name: 'DEMO moving head (not in sanctuary)', manufacturer: 'Generic',
    kind: 'moving', capabilities: ['intensity', 'rgb', 'pantilt', 'zoom', 'focus'],
    eosParams: { red: 'Red', green: 'Green', blue: 'Blue', pan: 'Pan', tilt: 'Tilt', zoom: 'Zoom', focus: 'Edge' },
    verified: false, notes: 'Exists only to demonstrate pan/tilt/beam controls. Delete before going live.',
  },
];

function spread(n: number, from: number, to: number): number[] {
  if (n === 1) return [(from + to) / 2];
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}

function fx(channel: number, label: string, profileId: string, area: Fixture['area'], x: number, y: number, rotation = 0, extra: Partial<Fixture> = {}): Fixture {
  return {
    id: `fx-${channel}`, channel, label, profileId, dmx: null, area,
    protected: area === 'utility', stage: { x: Math.round(x), y: Math.round(y), rotation }, ...extra,
  };
}

function buildFixtures(): Fixture[] {
  const out: Fixture[] = [];
  // Stage / color: 1–8 LED PARs (two overhead pipes), 9–14 COLORbands, 15–19 WonderBars, 30/79/80 strips
  spread(4, 330, 870).forEach((x, i) => out.push(fx(1 + i, `Stage PAR US ${i + 1}`, 'stagelight-par-rgbw', 'stage', x, 175, 180)));
  spread(4, 330, 870).forEach((x, i) => out.push(fx(5 + i, `Stage PAR DS ${i + 1}`, 'stagelight-par-rgbw', 'stage', x, 290, 180)));
  spread(6, 260, 940).forEach((x, i) => out.push(fx(9 + i, `COLORband ${i + 1}`, 'chauvet-colorband-h9', 'stage', x, 395)));
  spread(5, 320, 880).forEach((x, i) => out.push(fx(15 + i, `WonderBar ${i + 1}`, 'wonderbar', 'stage', x, 60)));
  out.push(fx(30, 'Upstage Strip C', 'chorus-line', 'stage', 600, 35));
  out.push(fx(79, 'Upstage Strip L', 'chorus-line', 'stage', 330, 35));
  out.push(fx(80, 'Upstage Strip R', 'chorus-line', 'stage', 870, 35));
  // Front / spot: 20–29 Source Four WRD from the house position
  spread(10, 250, 950).forEach((x, i) => out.push(fx(20 + i, `Front ${i + 1}`, 'etc-source4wrd', 'front', x, 470, 180)));
  // House pendants: 31–54 grid over seating, 71–78 side aisles
  for (let i = 0; i < 24; i++) {
    const col = i % 6; const row = Math.floor(i / 6);
    const x = [260, 360, 460, 740, 840, 940][col];
    out.push(fx(31 + i, `House Pendant ${i + 1}`, 'fuze-pendant', 'house', x, 545 + row * 70));
  }
  spread(4, 545, 755).forEach((y, i) => out.push(fx(71 + i, `Side Pendant L${i + 1}`, 'fuze-pendant', 'house', 140, y)));
  spread(4, 545, 755).forEach((y, i) => out.push(fx(75 + i, `Side Pendant R${i + 1}`, 'fuze-pendant', 'house', 1060, y)));
  // Scenic battens 55–60
  spread(6, 300, 900).forEach((x, i) => out.push(fx(55 + i, `Scenic Batten ${i + 1}`, 'chorus-line', 'scenic', x, 110)));
  // Relays 61–70 (shown in a utility rack off-stage)
  for (let i = 0; i < 10; i++) out.push(fx(61 + i, `Relay ${i + 1}`, 'relay', 'utility', 1145, 140 + i * 42));
  // Demo movers
  out.push(fx(901, 'DEMO Mover L', 'demo-mover', 'stage', 200, 230, 0, { notes: 'Demo only — delete before going live.' }));
  out.push(fx(902, 'DEMO Mover R', 'demo-mover', 'stage', 1000, 230, 0, { notes: 'Demo only — delete before going live.' }));
  return out;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const DEFAULT_GROUPS: FixtureGroup[] = [
  { id: 'grp-stage', name: 'Stage Color', color: '#a78bfa', channels: [...range(1, 19), 30, 79, 80], eosGroup: null, volunteerVisible: true },
  { id: 'grp-front', name: 'Front Light', color: '#fbbf24', channels: range(20, 29), eosGroup: null, volunteerVisible: true },
  { id: 'grp-house', name: 'House Lights', color: '#f59e0b', channels: [...range(31, 54), ...range(71, 78)], eosGroup: null, volunteerVisible: true },
  { id: 'grp-scenic', name: 'Scenic Battens', color: '#38bdf8', channels: range(55, 60), eosGroup: null, volunteerVisible: false },
  { id: 'grp-utility', name: 'Relays & Utility', color: '#f87171', channels: range(61, 70), eosGroup: null, volunteerVisible: false },
  { id: 'grp-demo', name: 'DEMO Movers', color: '#34d399', channels: [901, 902], eosGroup: null, volunteerVisible: false },
];

const rgb = (r: number, g: number, b: number) => ({ r, g, b });

const look = (id: string, name: string, description: string, icon: string, gradient: [string, string], preview: Look['preview'], volunteerVisible = true): Look => ({
  id, name, description, icon, gradient, preview, volunteerVisible, action: { type: 'none' },
});

export const DEFAULT_LOOKS: Look[] = [
  look('look-preservice', 'Pre-Service', 'Warm house, soft blue stage', 'sunrise', ['#1e3a8a', '#f59e0b'], [
    { groupId: 'grp-house', intensity: 80, cct: 3000 }, { groupId: 'grp-stage', intensity: 40, color: rgb(20, 40, 100) },
    { groupId: 'grp-front', intensity: 0 }, { groupId: 'grp-scenic', intensity: 50, color: rgb(30, 50, 100) }]),
  look('look-traditional', 'Traditional Worship', 'Warm, even light on the chancel', 'church', ['#92400e', '#fde68a'], [
    { groupId: 'grp-house', intensity: 70 }, { groupId: 'grp-front', intensity: 85 },
    { groupId: 'grp-stage', intensity: 60, color: rgb(100, 75, 40) }, { groupId: 'grp-scenic', intensity: 40, color: rgb(100, 70, 30) }]),
  look('look-contemporary', 'Contemporary Worship', 'Saturated stage, dim house', 'music', ['#7c3aed', '#06b6d4'], [
    { groupId: 'grp-house', intensity: 15 }, { groupId: 'grp-front', intensity: 70 },
    { groupId: 'grp-stage', intensity: 90, color: rgb(55, 20, 100) }, { groupId: 'grp-scenic', intensity: 85, color: rgb(0, 70, 100) }]),
  look('look-sermon', 'Sermon', 'Clean front light, subdued stage', 'mic', ['#334155', '#e2e8f0'], [
    { groupId: 'grp-house', intensity: 50 }, { groupId: 'grp-front', intensity: 90 },
    { groupId: 'grp-stage', intensity: 30, color: rgb(40, 50, 100) }, { groupId: 'grp-scenic', intensity: 25, color: rgb(30, 40, 90) }]),
  look('look-communion', 'Communion', 'Warm glow, gentle house', 'wine', ['#7f1d1d', '#fcd34d'], [
    { groupId: 'grp-house', intensity: 45 }, { groupId: 'grp-front', intensity: 65 },
    { groupId: 'grp-stage', intensity: 55, color: rgb(100, 45, 20) }, { groupId: 'grp-scenic', intensity: 45, color: rgb(90, 30, 15) }]),
  look('look-prayer', 'Prayer', 'Low, calm, deep blue', 'hands', ['#0f172a', '#4338ca'], [
    { groupId: 'grp-house', intensity: 15 }, { groupId: 'grp-front', intensity: 35 },
    { groupId: 'grp-stage', intensity: 40, color: rgb(15, 15, 100) }, { groupId: 'grp-scenic', intensity: 30, color: rgb(30, 10, 90) }]),
  look('look-offering', 'Offering', 'Medium house, warm stage', 'gift', ['#065f46', '#a7f3d0'], [
    { groupId: 'grp-house', intensity: 60 }, { groupId: 'grp-front', intensity: 60 },
    { groupId: 'grp-stage', intensity: 60, color: rgb(100, 60, 30) }, { groupId: 'grp-scenic', intensity: 50, color: rgb(30, 90, 60) }]),
  look('look-special', 'Special Music', 'Focused front, magenta stage', 'sparkles', ['#831843', '#f472b6'], [
    { groupId: 'grp-house', intensity: 10 }, { groupId: 'grp-front', intensity: 80 },
    { groupId: 'grp-stage', intensity: 75, color: rgb(100, 10, 60) }, { groupId: 'grp-scenic', intensity: 65, color: rgb(60, 0, 100) }]),
  look('look-fullhouse', 'Full House Lights', 'All house lights to full', 'sun', ['#b45309', '#fef3c7'], [
    { groupId: 'grp-house', intensity: 100 }, { groupId: 'grp-front', intensity: 0 },
    { groupId: 'grp-stage', intensity: 0 }, { groupId: 'grp-scenic', intensity: 0 }]),
  look('look-wash', 'Stage Wash', 'Bright even white stage', 'lamp', ['#475569', '#f8fafc'], [
    { groupId: 'grp-house', intensity: 30 }, { groupId: 'grp-front', intensity: 100 },
    { groupId: 'grp-stage', intensity: 100, color: rgb(100, 95, 85) }, { groupId: 'grp-scenic', intensity: 70, color: rgb(100, 95, 85) }]),
  look('look-postservice', 'Post-Service', 'House up, stage glow', 'door', ['#1e293b', '#fbbf24'], [
    { groupId: 'grp-house', intensity: 90 }, { groupId: 'grp-front', intensity: 0 },
    { groupId: 'grp-stage', intensity: 25, color: rgb(30, 40, 100) }, { groupId: 'grp-scenic', intensity: 30, color: rgb(30, 40, 100) }]),
];

const el = (id: string, kind: StageElement['kind'], label: string, x: number, y: number, w: number, h: number): StageElement => ({ id, kind, label, x, y, w, h });

export const DEFAULT_STAGE_ELEMENTS: StageElement[] = [
  el('chancel', 'platform', 'Chancel', 220, 20, 760, 360),
  el('steps', 'step', 'Steps', 260, 380, 680, 40),
  el('choir', 'choir', 'Choir / Band', 300, 70, 600, 90),
  el('altar', 'altar', 'Communion Table', 545, 215, 110, 55),
  el('pulpit', 'pulpit', 'Pulpit', 270, 300, 70, 55),
  el('lectern', 'lectern', 'Lectern', 860, 300, 70, 55),
  el('font', 'font', 'Font', 960, 330, 45, 45),
  el('screen-l', 'screen', 'Screen L', 100, 120, 100, 14),
  el('screen-r', 'screen', 'Screen R', 1000, 120, 100, 14),
  el('pews-l', 'seating', 'Pews', 200, 520, 340, 260),
  el('pews-r', 'seating', 'Pews', 660, 520, 340, 260),
  el('rack', 'label', 'Utility Rack', 1110, 110, 70, 440),
];

export function defaultCommissioning(): CommissioningRecord {
  return { versionConfirmedAt: null, networkCheckedAt: null, monitorTest: null, liveTest: null, recoveryObservedAt: null, notes: '' };
}

export function defaultConfig(): AppConfig {
  // Deep copy: callers may edit the result, which must never change these module-level defaults.
  return structuredClone({
    settings: {
      sanctuaryName: 'Lake Travis UMC — Sanctuary',
      masterCueList: 1,
      commissioning: defaultCommissioning(),
      connection: {
        consoleIp: '',
        // Most compatible TCP option (Eos 2.x and 3.x). The Setup Wizard switches to
        // 3037 / SLIP on Eos 3.1+ once the version is confirmed.
        transport: 'tcp-1.0',
        udpConsolePort: 8000,
        udpLocalPort: 8001,
        tcpPort: 3032,
        // Unknown until the operator reads it from the console; connecting is refused until set.
        eosVersion: '',
        oscUser: null,
        heartbeatSeconds: 3,
        staleSeconds: 10,
        maxCommandRateHz: 10,
        goBackMethod: 'auto',
        goKey: 'go_0',
        // "stopback" = PLAYBACK_STOP_BACK in ETC's key list ("stop" is a different key).
        backKey: 'stopback',
      },
      safety: { requireConfirmToArm: true, protectedUnlockMinutes: 5, localhostOnly: true },
    },
    profiles: DEFAULT_PROFILES,
    fixtures: buildFixtures(),
    groups: DEFAULT_GROUPS,
    looks: DEFAULT_LOOKS,
    cueLists: [{
      list: 1, label: 'Main Service (example labels)',
      cues: [
        { cue: '1', label: 'Pre-Service' }, { cue: '2', label: 'Welcome' }, { cue: '3', label: 'Opening Song' },
        { cue: '4', label: 'Prayer' }, { cue: '5', label: 'Scripture' }, { cue: '6', label: 'Sermon' },
        { cue: '7', label: 'Communion' }, { cue: '8', label: 'Closing Song' }, { cue: '9', label: 'Benediction' },
        { cue: '10', label: 'Post-Service' },
      ],
    }],
    submasters: [
      { sub: 1, label: 'House Lights', volunteerVisible: true, protected: false },
      { sub: 2, label: 'Stage Wash', volunteerVisible: true, protected: false },
      { sub: 3, label: 'Front Light', volunteerVisible: false, protected: false },
      { sub: 4, label: 'Scenic', volunteerVisible: false, protected: false },
    ],
    stage: { width: 1200, height: 800, elements: DEFAULT_STAGE_ELEMENTS },
    architecture: defaultArchitecture(),
  });
}
