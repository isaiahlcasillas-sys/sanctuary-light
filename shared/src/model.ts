import type { ArchitecturalConfig } from './architecture';

/**
 * Core data model for Sanctuary Light.
 *
 * IMPORTANT: `channel` everywhere in this model is an Eos *channel number* —
 * the logical number an operator types on the Ion ("Chan 21 At 50"). It is NOT
 * a DMX address. DMX universe/address is stored separately and is purely
 * informational in Ion-controlled mode (the Ion's patch owns that mapping).
 */

export type ParamKey =
  | 'red' | 'green' | 'blue' | 'white' | 'amber' | 'uv'
  | 'cct' | 'pan' | 'tilt' | 'zoom' | 'focus';

export type Capability = 'intensity' | 'rgb' | 'white' | 'amber' | 'uv' | 'cct' | 'pantilt' | 'zoom' | 'focus' | 'relay';

export type FixtureKind =
  | 'led-par' | 'led-bar' | 'conventional' | 'pendant' | 'striplight' | 'moving' | 'relay';

export interface FixtureProfile {
  id: string;
  name: string;
  manufacturer: string;
  kind: FixtureKind;
  capabilities: Capability[];
  /**
   * Eos parameter names used with the `/eos/param/<name>` OSC address.
   * These must match the parameter names in the Eos fixture library for the
   * patched fixture type. Leave a key out if the fixture lacks the parameter.
   */
  eosParams: Partial<Record<ParamKey, string>>;
  /** false = profile was guessed from equipment names, verify against the real Ion patch. */
  verified: boolean;
  notes?: string;
}

export interface DmxAddress { universe: number; address: number }

export type AreaId = 'stage' | 'front' | 'house' | 'scenic' | 'utility';

export interface StagePosition { x: number; y: number; rotation: number }

export interface Fixture {
  id: string;
  /** Eos channel number (NOT a DMX address). */
  channel: number;
  label: string;
  profileId: string;
  /** Informational only. In Ion mode the Ion patch is authoritative. */
  dmx: DmxAddress | null;
  area: AreaId;
  /** Protected channels (relays/utility) need a timed unlock before any live command. */
  protected: boolean;
  stage: StagePosition;
  notes?: string;
}

export interface FixtureGroup {
  id: string;
  name: string;
  color: string;
  channels: number[];
  /** Eos group number if this group exists in the show file; otherwise channels are addressed directly. */
  eosGroup: number | null;
  volunteerVisible: boolean;
}

export interface RGB { r: number; g: number; b: number }

/** All values 0–100 except cct (Kelvin) and pan/tilt (degrees). */
export interface FixtureState {
  intensity: number;
  color?: RGB;
  white?: number;
  amber?: number;
  uv?: number;
  cct?: number;
  pan?: number;
  tilt?: number;
  zoom?: number;
  focus?: number;
}

/**
 * simulated  = only the local preview changed, nothing was sent.
 * commanded  = a command was sent to the console; no feedback confirms the result.
 * confirmed  = the console reported this value back.
 */
export type ValueSource = 'simulated' | 'commanded' | 'confirmed';

export type LookAction =
  | { type: 'none' }
  | { type: 'cue'; list: number; cue: string }
  | { type: 'preset'; preset: number; eosGroup: number | null }
  | { type: 'macro'; macro: number }
  | { type: 'sub'; sub: number; level: number }
  | { type: 'snapshot'; snapshot: number };

export interface LookPreviewEntry {
  groupId: string;
  intensity: number;
  color?: RGB;
  cct?: number;
}

export interface Look {
  id: string;
  name: string;
  description: string;
  icon: string;
  gradient: [string, string];
  action: LookAction;
  /** How the stage preview looks when this look is fired in simulation. */
  preview: LookPreviewEntry[];
  volunteerVisible: boolean;
}

export interface CueEntry { cue: string; label: string; notes?: string }

export interface CueListConfig {
  list: number;
  label: string;
  /** User-facing labels only; the Ion show file is never modified by editing these. */
  cues: CueEntry[];
}

export interface SubmasterConfig {
  sub: number;
  label: string;
  volunteerVisible: boolean;
  protected: boolean;
}

export type StageElementKind = 'platform' | 'step' | 'altar' | 'pulpit' | 'lectern' | 'choir' | 'seating' | 'screen' | 'font' | 'label';

export interface StageElement {
  id: string;
  kind: StageElementKind;
  label: string;
  x: number; y: number; w: number; h: number;
}

export interface StageLayout {
  width: number;
  height: number;
  elements: StageElement[];
}

export type OscTransport = 'udp' | 'tcp-1.0' | 'tcp-1.1';
/** Eos software version as shown in About, e.g. "2.9.3" or "3.2.12". Empty = not identified yet. */
export type EosVersion = string;

/**
 * How GO/BACK reach the console:
 *   cue-list = /eos/cues/<list>/fire and /eos/cues/<list>/stop (acts on a specific cue list)
 *   keys     = /eos/key/<go>/<back> (acts on whatever list is on the console's master playback)
 *   auto     = cue-list where documented for the identified Eos version, otherwise keys
 */
export type GoBackMethod = 'auto' | 'cue-list' | 'keys';

export interface ConnectionSettings {
  consoleIp: string;
  transport: OscTransport;
  /** UDP: port we send to (Eos "OSC UDP RX Port"). */
  udpConsolePort: number;
  /** UDP: port we listen on (Eos "OSC UDP TX Port"). */
  udpLocalPort: number;
  /** TCP: 3032 = OSC 1.0 (length-prefixed), 3037 = OSC 1.1 (SLIP). */
  tcpPort: number;
  eosVersion: EosVersion;
  /** Send commands as this Eos user (/eos/user/<n>/...). null = console's OSC default user. */
  oscUser: number | null;
  heartbeatSeconds: number;
  staleSeconds: number;
  /** Max command-line updates per second for continuous controls (sliders). */
  maxCommandRateHz: number;
  goBackMethod: GoBackMethod;
  /** Eos key names used when GO/BACK use console keys; verify against the key list for your Eos version. */
  goKey: string;
  backKey: string;
}

export interface SafetySettings {
  requireConfirmToArm: boolean;
  protectedUnlockMinutes: number;
  /** Bind server to localhost only (true) or the whole LAN (false). Requires restart. */
  localhostOnly: boolean;
}

/** What has been checked on the real console (filled in by the Ion Setup Wizard). */
export interface CommissioningRecord {
  /** Version the operator read from the console's About screen. */
  versionConfirmedAt: number | null;
  networkCheckedAt: number | null;
  monitorTest: { at: number; ok: boolean; replyMs: number | null; reportedVersion: string | null; detail: string } | null;
  liveTest: { at: number; channel: number; level: number; operatorConfirmedLight: boolean | null; released: boolean } | null;
  /** Last time the app was seen to lose and then regain the console (recorded automatically). */
  recoveryObservedAt: number | null;
  notes: string;
}

export interface Settings {
  connection: ConnectionSettings;
  safety: SafetySettings;
  sanctuaryName: string;
  masterCueList: number;
  commissioning: CommissioningRecord;
}

export interface AppConfig {
  settings: Settings;
  profiles: FixtureProfile[];
  fixtures: Fixture[];
  groups: FixtureGroup[];
  looks: Look[];
  cueLists: CueListConfig[];
  submasters: SubmasterConfig[];
  stage: StageLayout;
  /** Documentation of the SceneStation/DMX topology. Never used to send anything. */
  architecture: ArchitecturalConfig;
}

export type OperatingMode = 'offline' | 'eos-monitor' | 'eos-live' | 'direct-dmx';

export const MODE_INFO: Record<OperatingMode, { label: string; short: string; description: string; transmits: boolean; available: boolean }> = {
  offline: {
    label: 'Offline Simulation', short: 'SIM',
    description: 'No network traffic. Every control changes only the on-screen preview.',
    transmits: false, available: true,
  },
  'eos-monitor': {
    label: 'Ion Monitor (read-only)', short: 'MONITOR',
    description: 'Connects to the Ion and listens for feedback. Lighting commands are blocked.',
    transmits: false, available: true,
  },
  'eos-live': {
    label: 'Ion Live Control', short: 'LIVE',
    description: 'Sends OSC commands to the Ion. The Ion keeps doing all DMX output.',
    transmits: true, available: true,
  },
  'direct-dmx': {
    label: 'Direct DMX (sACN/Art-Net)', short: 'DMX',
    description: 'Future Phase 5 engine through the ENTTEC ODE Mk3. Not implemented; never runs alongside Ion mode.',
    transmits: true, available: false,
  },
};
