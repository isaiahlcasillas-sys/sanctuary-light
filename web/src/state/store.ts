import { create } from 'zustand';
import { api } from '../lib/api';
import {
  MAX_FADE_SECONDS, clampToProfile, collectionOf, lookLevels, toLookFixtures,
  type AppConfig, type AreaId, type Command, type CommandResult, type Fixture, type FixtureState, type LevelsSnapshot, type Look, type LogEntry,
  type Role, type ServerMessage, type ServerStatus, type StageElement, type Target,
} from '@sanctuary/shared';

export interface Toast { id: number; kind: 'sent' | 'simulated' | 'blocked' | 'error' | 'info'; message: string }

/** volunteer = Volunteer Mode, advanced = Worship Mode (operator), architecture = Architectural Status, setup = Sanctuary Setup (operator). */
export type UiMode = 'volunteer' | 'advanced' | 'architecture' | 'setup';

/** Which workspace panels are shown (persisted per computer). */
export interface Panels { left: boolean; right: boolean; bottom: boolean; maximized: boolean }
export type BottomTab = 'looks' | 'cues' | 'subs';

/**
 * A look being designed. Lives only in this browser until saved; editing it never sends a
 * command (not even in simulation). Saving writes a LOCAL look; nothing is recorded in Eos.
 */
export interface DesignerDraft {
  /** The look being edited, or null for a new one. */
  lookId: string | null;
  name: string;
  description: string;
  collection: string;
  icon: string;
  fadeSeconds: number;
  /** Designed state per channel. Channels not listed aren't part of the look. */
  states: Record<number, FixtureState>;
  dirty: boolean;
}

/** Steps of the Sanctuary Setup workflow. */
export type SetupStep = 'import' | 'review' | 'arrange' | 'looks' | 'verify' | 'testing';

interface AppState {
  socketState: 'connecting' | 'open' | 'closed';
  config: AppConfig | null;
  status: ServerStatus | null;
  levels: LevelsSnapshot | null;
  log: LogEntry[];
  role: Role | null;
  token: string | null;
  authError: string | null;
  uiMode: UiMode;
  selection: number[];
  editLayout: boolean;
  /** Unsaved layout edits (positions) — only written to disk on "Save layout". */
  draftFixtures: Fixture[] | null;
  draftElements: StageElement[] | null;
  toasts: Toast[];
  lastResult: CommandResult | null;
  /** Wall-clock offset between this browser and the server. */
  clockSkew: number;
  /** The Import Eos Show wizard is open. */
  importOpen: boolean;
  setupStep: SetupStep;
  /** Eos Setup Wizard (connection/commissioning) */
  wizardOpen: boolean;
  /** First-launch welcome (shown until dismissed on this computer). */
  welcomeOpen: boolean;
  setWelcomeOpen(open: boolean): void;
  wizardStep: number;

  setSetupStep(step: SetupStep): void;
  /** Open Sanctuary Setup at a step (operator screen). */
  goToSetup(step: SetupStep): void;
  openWizard(step?: number): void;
  closeWizard(): void;

  setImportOpen(open: boolean): void;
  /** After an import: go to the stage and start arranging fixtures. */
  startArranging(): void;

  setUiMode(m: UiMode): void;
  select(channels: number[], mode?: 'replace' | 'toggle' | 'add'): void;
  setEditLayout(on: boolean): void;
  moveFixture(id: string, x: number, y: number): void;
  rotateFixture(id: string, rotation: number): void;
  moveElement(id: string, x: number, y: number): void;
  discardLayout(): void;
  /** Layout snapshots for Undo while editing. */
  layoutHistory: Fixture[][];
  pushLayoutHistory(): void;
  undoLayout(): void;
  /** Line up / align the selected fixtures (draft only). */
  alignSelection(op: 'line-h' | 'line-v' | 'align-top' | 'align-left'): void;
  /** Set the category (area) of fixtures in the draft. */
  setDraftArea(channels: number[], area: AreaId): void;
  /** Save positions, placement and categories (local file only). */
  saveLayout(opts?: { keepEditing?: boolean }): Promise<boolean>;
  /** The layout draft differs from what is saved (positions, placement, category). */
  layoutChanged(): boolean;
  toast(kind: Toast['kind'], message: string): void;
  dismissToast(id: number): void;

  panels: Panels;
  togglePanel(p: keyof Panels): void;
  bottomTab: BottomTab;
  setBottomTab(t: BottomTab): void;
  /** Library filter in the Looks panel ('all' or a collection name). */
  lookFilter: string;
  setLookFilter(f: string): void;

  designer: DesignerDraft | null;
  /** Open the Look Designer: a new look, an existing one, or a copy of one. Offline Simulation only. */
  openDesigner(look?: Look, opts?: { duplicate?: boolean }): boolean;
  closeDesigner(): void;
  /** When a draft fade preview started (the stage fades the draft up from dark). */
  designerPreviewAt: number | null;
  previewDesignerFade(): void;
  /** Set parameters for channels in the draft (adds them to the look if needed). */
  designerSet(channels: number[], patch: Partial<FixtureState>): void;
  designerRemove(channels: number[]): void;
  designerMeta(patch: Partial<Pick<DesignerDraft, 'name' | 'description' | 'collection' | 'icon' | 'fadeSeconds'>>): void;
  /** Save the draft as a local look (asNew: save a copy). */
  saveDesigner(asNew?: boolean): Promise<boolean>;
}

const DEFAULT_PANELS: Panels = { left: true, right: true, bottom: true, maximized: false };
function loadPanels(): Panels {
  try { return { ...DEFAULT_PANELS, ...JSON.parse(localStorageGet('sl-panels') ?? '{}'), maximized: false }; } catch { return DEFAULT_PANELS; }
}
const newLookId = () => `look-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const useApp = create<AppState>((set, get) => ({
  socketState: 'connecting',
  config: null,
  status: null,
  levels: null,
  log: [],
  role: null,
  token: sessionStorageGet('sl-token'),
  authError: null,
  uiMode: (localStorageGet('sl-ui-mode') as UiMode) ?? 'volunteer',
  selection: [],
  editLayout: false,
  draftFixtures: null,
  draftElements: null,
  toasts: [],
  lastResult: null,
  clockSkew: 0,
  importOpen: false,
  setupStep: (localStorageGet('sl-setup-step') as SetupStep) ?? 'import',
  wizardOpen: false,
  welcomeOpen: localStorageGet('sl-welcome-done') == null,
  setWelcomeOpen(open) { if (!open) localStorageSet('sl-welcome-done', '1'); set({ welcomeOpen: open }); },
  wizardStep: 0,

  setSetupStep(step) { localStorageSet('sl-setup-step', step); set({ setupStep: step }); },
  goToSetup(step) {
    localStorageSet('sl-ui-mode', 'setup'); localStorageSet('sl-setup-step', step);
    set({ uiMode: 'setup', setupStep: step });
    if (step === 'arrange') get().setEditLayout(true);
  },
  openWizard(step = 0) { set({ wizardOpen: true, wizardStep: step }); },
  closeWizard() { set({ wizardOpen: false }); },

  setImportOpen(open) { set({ importOpen: open }); },
  startArranging() {
    // Start from the imported configuration, not an older unsaved layout draft.
    set({ importOpen: false, draftFixtures: null, draftElements: null, editLayout: false });
    get().goToSetup('arrange');
  },

  setUiMode(m) { localStorageSet('sl-ui-mode', m); set({ uiMode: m }); },
  select(channels, mode = 'replace') {
    const cur = new Set(get().selection);
    if (mode === 'replace') { set({ selection: [...new Set(channels)].sort((a, b) => a - b) }); return; }
    for (const c of channels) {
      if (mode === 'toggle' && cur.has(c)) cur.delete(c); else cur.add(c);
    }
    set({ selection: [...cur].sort((a, b) => a - b) });
  },
  setEditLayout(on) {
    const cfg = get().config;
    if (on && cfg) set({ editLayout: true, draftFixtures: get().draftFixtures ?? cfg.fixtures, draftElements: get().draftElements ?? cfg.stage.elements });
    else set({ editLayout: on });
  },
  moveFixture(id, x, y) {
    const list = get().draftFixtures; if (!list) return;
    set({ draftFixtures: list.map((f) => (f.id === id ? { ...f, stage: { ...f.stage, x, y }, unplaced: false } : f)) });
  },
  rotateFixture(id, rotation) {
    const list = get().draftFixtures; if (!list) return;
    set({ draftFixtures: list.map((f) => (f.id === id ? { ...f, stage: { ...f.stage, rotation } } : f)) });
  },
  moveElement(id, x, y) {
    const list = get().draftElements; if (!list) return;
    set({ draftElements: list.map((e) => (e.id === id ? { ...e, x, y } : e)) });
  },
  discardLayout() { set({ draftFixtures: null, draftElements: null, editLayout: false, layoutHistory: [] }); },
  layoutHistory: [],
  pushLayoutHistory() {
    const d = get().draftFixtures; if (!d) return;
    set({ layoutHistory: [...get().layoutHistory.slice(-49), d] });
  },
  undoLayout() {
    const h = get().layoutHistory; if (!h.length) return;
    set({ draftFixtures: h[h.length - 1], layoutHistory: h.slice(0, -1) });
  },
  alignSelection(op) {
    const list = get().draftFixtures; const sel = new Set(get().selection);
    if (!list) return;
    const chosen = list.filter((f) => sel.has(f.channel));
    if (chosen.length < 2) { get().toast('info', 'Select two or more fixtures first (shift-click or shift-drag).'); return; }
    get().pushLayoutHistory();
    const horizontal = op === 'line-h' || op === 'align-top';
    const sorted = [...chosen].sort((a, b) => (horizontal ? a.stage.x - b.stage.x : a.stage.y - b.stage.y));
    const avg = (k: 'x' | 'y') => Math.round(chosen.reduce((n, f) => n + f.stage[k], 0) / chosen.length);
    const first = sorted[0].stage; const last = sorted[sorted.length - 1].stage;
    const pos = new Map<string, { x: number; y: number }>();
    sorted.forEach((f, i) => {
      const t = sorted.length > 1 ? i / (sorted.length - 1) : 0;
      if (op === 'line-h') pos.set(f.id, { x: Math.round(first.x + (last.x - first.x) * t), y: avg('y') });
      else if (op === 'line-v') pos.set(f.id, { x: avg('x'), y: Math.round(first.y + (last.y - first.y) * t) });
      else if (op === 'align-top') pos.set(f.id, { x: f.stage.x, y: avg('y') });
      else pos.set(f.id, { x: avg('x'), y: f.stage.y });
    });
    set({ draftFixtures: list.map((f) => (pos.has(f.id) ? { ...f, stage: { ...f.stage, ...pos.get(f.id)! } } : f)) });
  },
  setDraftArea(channels, area) {
    const list = get().draftFixtures; if (!list) return;
    get().pushLayoutHistory();
    const set2 = new Set(channels);
    set({ draftFixtures: list.map((f) => (set2.has(f.channel) ? { ...f, area } : f)) });
  },
  layoutChanged() {
    const { draftFixtures, draftElements, config } = get();
    if (!config || (!draftFixtures && !draftElements)) return false;
    const key = (list: Fixture[]) => JSON.stringify(list.map((f) => [f.id, f.stage, f.area, !!f.unplaced]));
    return (!!draftFixtures && key(draftFixtures) !== key(config.fixtures))
      || (!!draftElements && JSON.stringify(draftElements) !== JSON.stringify(config.stage.elements));
  },
  async saveLayout(opts = {}) {
    const st = get();
    const cfg = st.config;
    if (!cfg) return false;
    const draft = new Map((st.draftFixtures ?? []).map((f) => [f.id, f]));
    const fixtures = cfg.fixtures.map((f) => {
      const d = draft.get(f.id);
      return d ? { ...f, stage: d.stage, area: d.area, unplaced: d.unplaced || undefined } : f;
    });
    const elements = st.draftElements ?? cfg.stage.elements;
    try {
      await api.put('/api/config/fixtures', fixtures);
      await api.put('/api/config/stage', { ...cfg.stage, elements });
      set(opts.keepEditing
        ? { draftFixtures: fixtures, draftElements: elements, editLayout: true, layoutHistory: [] }
        : { draftFixtures: null, draftElements: null, editLayout: false, layoutHistory: [] });
      st.toast('info', 'Arrangement saved on this computer. The Eos show file was not changed.');
      return true;
    } catch (e) {
      st.toast('error', `Could not save the arrangement: ${(e as Error).message}`);
      return false;
    }
  },
  toast(kind, message) {
    const id = Date.now() + Math.random();
    // Collapse identical consecutive messages
    const toasts = get().toasts.filter((t) => t.message !== message);
    set({ toasts: [...toasts.slice(-3), { id, kind, message }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' || kind === 'blocked' ? 7000 : 3500);
  },
  dismissToast(id) { set({ toasts: get().toasts.filter((t) => t.id !== id) }); },

  panels: loadPanels(),
  togglePanel(p) {
    const panels = { ...get().panels, [p]: !get().panels[p] };
    localStorageSet('sl-panels', JSON.stringify({ ...panels, maximized: false }));
    set({ panels });
  },
  bottomTab: (localStorageGet('sl-bottom-tab') as BottomTab) ?? 'looks',
  setBottomTab(t) { localStorageSet('sl-bottom-tab', t); set({ bottomTab: t }); },
  lookFilter: 'all',
  setLookFilter(f) { set({ lookFilter: f }); },

  designer: null,
  openDesigner(look, opts = {}) {
    const { config, status, toast } = get();
    if (!config) return false;
    if ((status?.mode ?? 'offline') !== 'offline') {
      toast('blocked', 'The Look Designer works in Offline Simulation only. Switch to SIM first.');
      return false;
    }
    if (look && look.action.type !== 'none' && !opts.duplicate) {
      toast('info', `“${look.name}” plays an Eos ${look.action.type}. Its contents live in Eos, so it can't be edited here. Duplicate it to design a local version.`);
      return false;
    }
    const states: Record<number, FixtureState> = {};
    if (look) for (const [ch, s] of lookLevels(config, look)) states[ch] = s;
    set({
      designer: {
        lookId: look && !opts.duplicate ? look.id : null,
        name: look ? (opts.duplicate ? `${look.name} (copy)` : look.name) : 'New look',
        description: look?.description ?? '',
        collection: look ? collectionOf(look) : (get().lookFilter !== 'all' ? get().lookFilter : 'Worship'),
        icon: look?.icon ?? 'sparkles',
        fadeSeconds: look?.fadeSeconds ?? 3,
        states,
        dirty: !!opts.duplicate,
      },
      selection: [],
      editLayout: false,
    });
    return true;
  },
  closeDesigner() { set({ designer: null, designerPreviewAt: null }); },
  designerPreviewAt: null,
  previewDesignerFade() { set({ designerPreviewAt: Date.now() }); },
  designerSet(channels, patch) {
    const { designer, config } = get();
    if (!designer || !config) return;
    const profiles = new Map(config.profiles.map((p) => [p.id, p]));
    const states = { ...designer.states };
    for (const ch of channels) {
      const f = config.fixtures.find((x) => x.channel === ch);
      if (!f) continue;
      const prev = states[ch] ?? { intensity: 0 };
      states[ch] = clampToProfile({ ...prev, ...patch }, profiles.get(f.profileId));
    }
    set({ designer: { ...designer, states, dirty: true } });
  },
  designerRemove(channels) {
    const { designer } = get();
    if (!designer) return;
    const states = { ...designer.states };
    for (const ch of channels) delete states[ch];
    set({ designer: { ...designer, states, dirty: true } });
  },
  designerMeta(patch) {
    const { designer } = get();
    if (!designer) return;
    const next = { ...designer, ...patch, dirty: true };
    if (patch.fadeSeconds != null) next.fadeSeconds = Math.max(0, Math.min(MAX_FADE_SECONDS, Math.round(patch.fadeSeconds * 10) / 10));
    set({ designer: next });
  },
  async saveDesigner(asNew = false) {
    const { designer, config, toast } = get();
    if (!designer || !config) return false;
    const name = designer.name.trim();
    if (!name) { toast('error', 'Give the look a name first.'); return false; }
    const fixtures = toLookFixtures(new Map(Object.entries(designer.states).map(([k, v]) => [Number(k), v])), config.fixtures, config.profiles);
    const existing = !asNew && designer.lookId ? config.looks.find((l) => l.id === designer.lookId) : undefined;
    const base: Look = existing ?? {
      id: newLookId(), name, description: '', icon: designer.icon, gradient: ['#1e293b', '#475569'],
      action: { type: 'none' }, preview: [], volunteerVisible: false, approval: null,
    };
    const look: Look = {
      ...base, name, description: designer.description.trim(), icon: designer.icon, collection: designer.collection.trim() || 'Worship',
      fadeSeconds: designer.fadeSeconds, fixtures, preview: [], updatedAt: Date.now(),
    };
    const looks = existing ? config.looks.map((l) => (l.id === look.id ? look : l)) : [...config.looks, look];
    try {
      await api.put('/api/config/looks', looks);
      set({ designer: { ...designer, lookId: look.id, name, dirty: false } });
      toast('info', `Saved “${name}” as a local look (${fixtures.length} fixture${fixtures.length === 1 ? '' : 's'}). Nothing was recorded in Eos.`);
      return true;
    } catch (e) {
      toast('error', `Could not save the look: ${(e as Error).message}`);
      return false;
    }
  },
}));

function sessionStorageGet(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } }
function localStorageGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
function sessionStorageSet(k: string, v: string | null) {
  try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch { /* ignore */ }
}

// ───────────────────────────── WebSocket link ─────────────────────────────

let ws: WebSocket | null = null;
let seq = 0;
const pending = new Map<string, (r: CommandResult) => void>();
let retry = 500;

export function connectSocket() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const sock = new WebSocket(url);
  ws = sock;
  useApp.setState({ socketState: 'connecting' });
  sock.onopen = () => {
    retry = 500;
    useApp.setState({ socketState: 'open' });
    const token = useApp.getState().token;
    if (token) sock.send(JSON.stringify({ t: 'resume', token }));
  };
  sock.onmessage = (ev) => handle(JSON.parse(ev.data) as ServerMessage);
  sock.onclose = () => {
    useApp.setState({ socketState: 'closed' });
    for (const [, resolve] of pending) resolve({ ok: false, delivery: 'error', message: 'Lost connection to the Sanctuary Light server' });
    pending.clear();
    setTimeout(connectSocket, retry);
    retry = Math.min(retry * 2, 5000);
  };
}

function handle(msg: ServerMessage) {
  const set = useApp.setState;
  switch (msg.t) {
    case 'welcome':
      set({ config: msg.config, status: msg.status, levels: msg.levels, log: msg.log, clockSkew: Date.now() - msg.status.serverTime });
      break;
    case 'auth':
      sessionStorageSet('sl-token', msg.token);
      set({ role: msg.role, token: msg.token, authError: msg.error ?? null });
      if (!msg.role && ['advanced', 'setup'].includes(useApp.getState().uiMode) && !msg.error) set({ uiMode: 'volunteer' });
      break;
    case 'status': set({ status: msg.status, clockSkew: Date.now() - msg.status.serverTime }); break;
    case 'levels': set({ levels: msg.levels }); break;
    case 'config': {
      const st = useApp.getState();
      set({ config: msg.config, ...(st.editLayout ? {} : { draftFixtures: null, draftElements: null }) });
      break;
    }
    case 'log': set({ log: [...useApp.getState().log.slice(-299), msg.entry] }); break;
    case 'notice': useApp.getState().toast(msg.level === 'error' ? 'error' : 'blocked', msg.message); break;
    case 'ack': {
      const r = pending.get(msg.id);
      pending.delete(msg.id);
      r?.(msg.result);
      break;
    }
  }
}

export function login(pin: string) { ws?.send(JSON.stringify({ t: 'login', pin })); }
export function logout() { ws?.send(JSON.stringify({ t: 'logout' })); }

const CONTINUOUS = new Set<Command['kind']>(['setIntensity', 'setColor', 'setParam', 'setSub']);
/** Commands that change app state rather than lights. */
const SYSTEM = new Set<Command['kind']>(['setMode', 'unlockProtected', 'lockProtected']);

/** Send a command to the control server. Every result is surfaced to the operator. */
export function sendCommand(cmd: Command): Promise<CommandResult> {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      const r: CommandResult = { ok: false, delivery: 'error', message: 'Not connected to the Sanctuary Light server' };
      useApp.getState().toast('error', r.message);
      resolve(r);
      return;
    }
    const id = `c${++seq}`;
    pending.set(id, (r) => {
      useApp.setState({ lastResult: r });
      const quiet = CONTINUOUS.has(cmd.kind) && r.ok;
      const kind = r.ok && SYSTEM.has(cmd.kind) ? 'info' : r.delivery;
      if (!quiet) useApp.getState().toast(kind, r.message);
      resolve(r);
    });
    ws.send(JSON.stringify({ t: 'cmd', id, cmd }));
  });
}

/** Prefer addressing a group when the selection is exactly one group (uses the Eos group number if set). */
export function targetForSelection(selection: number[], config: AppConfig | null): Target {
  const key = [...selection].sort((a, b) => a - b).join(',');
  const g = config?.groups.find((x) => [...x.channels].sort((a, b) => a - b).join(',') === key);
  return g ? { type: 'group', groupId: g.id } : { type: 'channels', channels: selection };
}
