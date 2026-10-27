import type { ArchitecturalConfig } from './architecture';
import type { CueTiming, EosShowReference } from './showImport';
import type { VerificationRecord } from './verification';

/**
 * Core data model for Sanctuary Light.
 *
 * IMPORTANT: `channel` everywhere in this model is an Eos *channel number* —
 * the logical number an operator types in Eos ("Chan 21 At 50"). It is NOT
 * a DMX address. DMX universe/address is stored separately and is purely
 * informational in Eos-controlled mode (Eos's patch owns that mapping).
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
  /** false = profile was guessed from equipment names, verify against the real Eos patch. */
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
  /** Informational only. In Eos mode the Eos patch is authoritative. */
  dmx: DmxAddress | null;
  area: AreaId;
  /** Protected channels (relays/utility) need a timed unlock before any live command. */
  protected: boolean;
  stage: StagePosition;
  notes?: string;
  /** Fixture type exactly as named in the imported Eos patch. */
  eosType?: string;
  /** Channel label exactly as it was in the imported Eos show (the local label can be renamed). */
  eosLabel?: string;
  /** Placed in a temporary grid by an import; cleared once moved on the stage. */
  unplaced?: boolean;
}

export interface FixtureGroup {
  id: string;
  name: string;
  color: string;
  channels: number[];
  /** Eos group number if this group exists in the show file; otherwise channels are addressed directly. */
  eosGroup: number | null;
  volunteerVisible: boolean;
  /** Group label as it was in the imported Eos show. `name` is the local (volunteer-facing) name. */
  eosLabel?: string;
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
  /**
   * Per-fixture states designed in the Look Designer (local only; never sent to Eos). Only
   * parameters the fixture's profile supports are kept. Older looks use `preview` instead.
   */
  fixtures?: LookFixtureState[];
  /** Simulated fade time when this look is played in Offline Simulation (seconds). */
  fadeSeconds?: number;
  /** Library collection, e.g. "Worship", "Sermon", "Seasonal", "Special Events". */
  collection?: string;
  /** Last edited in the Look Designer. */
  updatedAt?: number;
  /** A cue this look was recorded into in Eos, confirmed by reading the cue list back. */
  eosCue?: { list: number; cue: string; label: string; verifiedAt: number } | null;
  /**
   * An operator reviewed what this look does in Eos and authorised it for Volunteer Mode.
   * Required for any look with an Eos action: a cue, preset, sub or snapshot can do things
   * Sanctuary Light can't see. Cleared automatically when the action changes.
   */
  approval?: Approval | null;
}

export interface Approval { at: number; note: string }

/** One fixture's designed state in a local look. */
export interface LookFixtureState extends FixtureState { channel: number }

export interface CueEntry {
  cue: string;
  label: string;
  notes?: string;
  /** Timing as exported from Eos (text, not reinterpreted). */
  timing?: CueTiming;
  /** Came from an Eos show import. */
  fromEos?: boolean;
}

export interface CueListConfig {
  list: number;
  label: string;
  /** User-facing labels only; the Eos show file is never modified by editing these. */
  cues: CueEntry[];
  /**
   * An operator reviewed this whole cue list and authorised volunteers to step through it with
   * GO/BACK. GO fires whatever cue comes next, so the approval covers the exact cue numbers
   * present at review time; any change to them, or a re-import, withdraws it.
   */
  playbackApproval?: PlaybackApproval | null;
}

export interface PlaybackApproval extends Approval { cues: string[] }

export interface SubmasterConfig {
  sub: number;
  label: string;
  volunteerVisible: boolean;
  protected: boolean;
  /** Came from an Eos show import: needs an operator's approval before volunteers can use it. */
  fromEos?: boolean;
  approval?: Approval | null;
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

/** What has been checked on the real console (filled in by the Eos Setup Wizard). */
export interface CommissioningRecord {
  /** Version the operator read from the console's About screen. */
  versionConfirmedAt: number | null;
  networkCheckedAt: number | null;
  monitorTest: { at: number; ok: boolean; replyMs: number | null; reportedVersion: string | null; detail: string } | null;
  liveTest: { at: number; channel: number; level: number; operatorConfirmedLight: boolean | null; released: boolean } | null;
  /** Live look test (Phase 4B): a designed look applied to one fixture, and what the operator saw. */
  liveLookTest?: { at: number; lookId: string; channel: number; level: number; operatorConfirmedLight: boolean | null; note: string } | null;
  /** Last time the app was seen to lose and then regain the console (recorded automatically). */
  recoveryObservedAt: number | null;
  notes: string;
  /** First Real Connection workflow (operator confirmations; nothing here sends anything). */
  firstConnection?: FirstConnectionRecord;
}

export interface FirstConnectionRecord {
  /** Operator confirmed the Eos show was backed up (e.g. File → Save As to USB) today. */
  showBackedUpAt: number | null;
  /** Operator confirmed the imported file is a genuine export from the sanctuary's Eos. */
  genuineExportConfirmedAt: number | null;
  /** Operator reviewed the imported patch (Review Fixtures). */
  patchReviewedAt: number | null;
  /** The one approved, non-critical fixture for the supervised live test. */
  testFixture: { channel: number; approvedBy: string; at: number } | null;
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
  /** Reference data from the last Eos show import (palettes/presets, source file). null = never imported. */
  eosShow: EosShowReference | null;
  /** Result of the last complete Show Verification against the console. null = never verified. */
  verification: VerificationRecord | null;
}

export type OperatingMode = 'offline' | 'eos-monitor' | 'eos-live' | 'direct-dmx';

export const MODE_INFO: Record<OperatingMode, { label: string; short: string; description: string; transmits: boolean; available: boolean }> = {
  offline: {
    label: 'Offline Simulation', short: 'SIM',
    description: 'No network traffic. Every control changes only the on-screen preview.',
    transmits: false, available: true,
  },
  'eos-monitor': {
    label: 'Eos Monitor (read-only)', short: 'MONITOR',
    description: 'Connects to Eos and listens for feedback. Lighting commands are blocked.',
    transmits: false, available: true,
  },
  'eos-live': {
    label: 'Eos Live Control', short: 'LIVE',
    description: 'Sends OSC commands to Eos. Eos keeps doing all DMX output.',
    transmits: true, available: true,
  },
  'direct-dmx': {
    label: 'Direct DMX (sACN/Art-Net)', short: 'DMX',
    description: 'Future Phase 5 engine through the ENTTEC ODE Mk3. Not implemented; never runs alongside Eos mode.',
    transmits: true, available: false,
  },
};
