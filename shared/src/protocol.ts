import type { AppConfig, FixtureState, OperatingMode, ParamKey, RGB, ValueSource } from './model';

export type Role = 'volunteer' | 'operator';

export type Target =
  | { type: 'channels'; channels: number[] }
  | { type: 'group'; groupId: string };

export type Command =
  | { kind: 'select'; target: Target }
  | { kind: 'setIntensity'; target: Target; value: number }
  | { kind: 'setColor'; target: Target; rgb: RGB }
  | { kind: 'setParam'; target: Target; param: ParamKey; value: number }
  | { kind: 'fireLook'; lookId: string }
  | { kind: 'fireCue'; list: number; cue: string }
  | { kind: 'go' }
  | { kind: 'back' }
  | { kind: 'setSub'; sub: number; value: number }
  | { kind: 'setMode'; mode: OperatingMode; confirm?: boolean }
  | { kind: 'unlockProtected'; confirm: boolean }
  | { kind: 'lockProtected' }
  | { kind: 'testConnection' }
  | { kind: 'syncFromConsole' };

/**
 * sent        = transmitted to the console (no guarantee it was accepted unless feedback confirms)
 * simulated   = applied to the preview only; nothing left this computer
 * blocked     = refused by a safety rule (monitor mode, protected channel, permissions...)
 * error       = transport or validation failure
 */
export type Delivery = 'sent' | 'simulated' | 'blocked' | 'error';

export interface CommandResult {
  ok: boolean;
  delivery: Delivery;
  message: string;
  osc?: string[];
}

export type ConnectionState = 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface CueFeedback {
  list: number | null;
  cue: string | null;
  label: string | null;
  text: string;
  /** 0–100, null when the console has not reported progress */
  progress: number | null;
  receivedAt: number;
  /** 'confirmed' = reported by the console; 'simulated' = offline preview. */
  source: ValueSource;
}

export type FeedbackAvailability = 'available' | 'unavailable' | 'unknown';

export interface FeedbackCapability {
  status: FeedbackAvailability;
  note: string;
}

export interface ServerStatus {
  mode: OperatingMode;
  connection: {
    state: ConnectionState;
    detail: string;
    target: string | null;
    lastRxAt: number | null;
    lastTxAt: number | null;
    stale: boolean;
    consoleVersion: string | null;
    showName: string | null;
  };
  feedback: {
    activeCue: CueFeedback | null;
    pendingCue: CueFeedback | null;
    previousCue: CueFeedback | null;
    commandLine: string | null;
    capabilities: Record<string, FeedbackCapability>;
  };
  protectedUnlockedUntil: number | null;
  defaultPinsInUse: boolean;
  serverTime: number;
}

export interface LevelsSnapshot {
  levels: Record<number, FixtureState>;
  sources: Record<number, ValueSource>;
  subs: Record<number, number>;
}

export interface LogEntry {
  id: number;
  at: number;
  level: 'info' | 'warn' | 'error' | 'tx' | 'rx';
  message: string;
}

export type ClientMessage =
  | { t: 'login'; pin: string }
  | { t: 'resume'; token: string }
  | { t: 'logout' }
  | { t: 'cmd'; id: string; cmd: Command };

export type ServerMessage =
  | { t: 'welcome'; role: Role | null; token: string | null; status: ServerStatus; config: AppConfig; levels: LevelsSnapshot; log: LogEntry[] }
  | { t: 'auth'; role: Role | null; token: string | null; error?: string }
  | { t: 'status'; status: ServerStatus }
  | { t: 'levels'; levels: LevelsSnapshot }
  | { t: 'config'; config: AppConfig }
  | { t: 'ack'; id: string; result: CommandResult }
  | { t: 'log'; entry: LogEntry };
