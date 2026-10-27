import { create } from 'zustand';
import { api } from '../lib/api';
import type {
  AppConfig, AreaId, Command, CommandResult, Fixture, LevelsSnapshot, LogEntry, Role, ServerMessage, ServerStatus, StageElement, Target,
} from '@sanctuary/shared';

export interface Toast { id: number; kind: 'sent' | 'simulated' | 'blocked' | 'error' | 'info'; message: string }

/** volunteer = Volunteer Mode, advanced = Worship Mode (operator), architecture = Architectural Status, setup = Sanctuary Setup (operator). */
export type UiMode = 'volunteer' | 'advanced' | 'architecture' | 'setup';

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
  saveLayout(): Promise<boolean>;
  toast(kind: Toast['kind'], message: string): void;
  dismissToast(id: number): void;
}

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
  async saveLayout() {
    const st = get();
    const cfg = st.config;
    if (!cfg) return false;
    const draft = new Map((st.draftFixtures ?? []).map((f) => [f.id, f]));
    try {
      await api.put('/api/config/fixtures', cfg.fixtures.map((f) => {
        const d = draft.get(f.id);
        return d ? { ...f, stage: d.stage, area: d.area, unplaced: d.unplaced || undefined } : f;
      }));
      await api.put('/api/config/stage', { ...cfg.stage, elements: st.draftElements ?? cfg.stage.elements });
      set({ draftFixtures: null, draftElements: null, editLayout: false, layoutHistory: [] });
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
