/**
 * Architectural lighting (Interactive Technologies SceneStation) — documentation model.
 *
 * Sanctuary Light has NO control path to SceneStation. This module only records what the
 * physical audit found and explains, from the manufacturer's documentation, what that
 * implies. Nothing here sends anything anywhere.
 *
 * Documented SceneStation behavior (SceneStation User's Manual v3.0, Interactive Technologies):
 *  - One bi-directional DMX port. If no input DMX is detected the station outputs DMX; if
 *    input from another console is detected it goes "passive" and the upstream controller
 *    has full control. There is no HTP/merge mode.
 *  - When input appears it always stops outputting; optionally it deactivates its current
 *    preset and/or locks its front-panel buttons.
 *  - When input is lost, one of: Hold Last Look, Snap to Current Preset, Fade to Current
 *    Preset, Fade to Black, or Activate Preset (x).
 *  - DIP switch 4 "DMX Output Only" disables input, so the station always outputs.
 *  - Remote stations can be wireless (2.4 GHz) slaves that need only power.
 *  - Power-on preset defaults to "Restore Previous".
 *  - Control from outside: front panel, IR remotes/IR codes (incl. automation systems),
 *    wireless from other stations, SceneStation Studio via a USB RF adaptor. No Ethernet/IP.
 */

export type SceneStationDmxRole =
  | 'unknown'
  /** Wired on the same DMX line as an upstream console; passive while the console outputs. */
  | 'inline-backup'
  /** DIP "DMX Output Only": always outputs, ignores any console on the line. */
  | 'output-only'
  /** Wireless remote of another station; no DMX wiring of its own. */
  | 'wireless-remote'
  /** Drives a universe Eos does not feed. */
  | 'separate-universe';

export type SceneStationLossAction =
  | 'unknown' | 'hold-last-look' | 'snap-to-current' | 'fade-to-current' | 'fade-to-black' | 'activate-preset';

export type Tri = 'unknown' | 'yes' | 'no';

export interface SceneStationRecord {
  id: string;
  name: string;
  location: string;
  /** e.g. "SS-305". Read from the station or SceneStation Studio; blank if not checked. */
  model: string;
  firmware: string;
  dmxRole: SceneStationDmxRole;
  /** Which DMX line/universe the station sits on, in the building's own terms. */
  dmxLine: string;
  lossAction: SceneStationLossAction;
  lossPreset: number | null;
  locksButtonsWhenConsoleActive: Tri;
  /** What each wall button does, in plain words. */
  buttons: string;
  /** true only after someone physically checked this record. */
  verified: boolean;
  verifiedBy: string;
  verifiedAt: number | null;
  notes: string;
}

export type UpstreamLossBehavior = 'unknown' | 'holds-last-look' | 'stops-output' | 'fades-out';

/** A device between Eos and the DMX lines (node, gateway, USB interface). */
export interface UpstreamDevice {
  id: string;
  name: string;
  role: string;
  /** What its DMX outputs do when Eos stops sending. Decides whether SceneStation ever takes over. */
  lossBehavior: UpstreamLossBehavior;
  feedsLines: string;
  verified: boolean;
  notes: string;
}

export interface ArchitecturalConfig {
  stations: SceneStationRecord[];
  upstream: UpstreamDevice[];
  auditCompletedAt: number | null;
  auditBy: string;
  /** Shown to volunteers on the Architectural Status page. */
  volunteerGuidance: string;
}

export type Confidence = 'by-design' | 'documented' | 'needs-audit' | 'hazard';

export interface FailureScenario {
  id: string;
  scenario: string;
  outcome: string;
  confidence: Confidence;
  action: string;
}

const DMX_ROLE_TEXT: Record<SceneStationDmxRole, string> = {
  unknown: 'DMX wiring not yet checked',
  'inline-backup': 'On the same DMX line as the console (passive while the console sends DMX)',
  'output-only': 'Set to "DMX Output Only" — always outputs, ignores the console',
  'wireless-remote': 'Wireless remote of another station (no DMX of its own)',
  'separate-universe': 'Drives a DMX line Eos does not feed',
};

const LOSS_TEXT: Record<SceneStationLossAction, string> = {
  unknown: 'an unknown action (check "DMX Options" in SceneStation Studio)',
  'hold-last-look': 'keeps the console\'s last look until a wall button is pressed',
  'snap-to-current': 'snaps to the station\'s currently selected preset',
  'fade-to-current': 'fades to the station\'s currently selected preset',
  'fade-to-black': 'fades its lights to black',
  'activate-preset': 'activates a specific preset',
};

export const describeDmxRole = (r: SceneStationDmxRole) => DMX_ROLE_TEXT[r];
export const describeLossAction = (a: SceneStationLossAction, preset: number | null) =>
  a === 'activate-preset' && preset ? `activates preset ${preset}` : LOSS_TEXT[a];

/**
 * What happens in each failure case, given what the audit has (or hasn't) confirmed.
 * Statements about Sanctuary Light itself are by design; statements about SceneStation
 * cite its manual; anything depending on wiring or node settings says so.
 */
export function analyzeFailures(arch: ArchitecturalConfig): FailureScenario[] {
  const out: FailureScenario[] = [];
  const stations = arch.stations;
  const wired = stations.filter((s) => s.dmxRole === 'inline-backup');
  const outputOnly = stations.filter((s) => s.dmxRole === 'output-only');
  const unknownRole = stations.filter((s) => s.dmxRole === 'unknown');
  const upstreamUnknown = arch.upstream.filter((u) => u.lossBehavior === 'unknown');
  const upstreamHold = arch.upstream.filter((u) => u.lossBehavior === 'holds-last-look');

  out.push({
    id: 'mac-fails',
    scenario: 'Sanctuary Light crashes, is quit, or its computer restarts',
    outcome: 'Eos keeps running its current cue. Sanctuary Light sends nothing when it stops, and it starts again in Offline Simulation, never Live (on Windows it restarts itself within about 10 seconds after a crash). SceneStation is unaffected because this app never talks to it. If Eos runs on the same PC and the whole PC goes down, Eos stops too: see the next row.',
    confidence: 'by-design',
    action: 'Operate from Eos directly. Re-open Sanctuary Light from its desktop icon and re-arm Live mode deliberately.',
  });

  let ionOutcome: string;
  let ionConfidence: Confidence;
  if (!wired.length) {
    ionOutcome = unknownRole.length
      ? 'Unknown until the audit confirms how each SceneStation is wired.'
      : 'No SceneStation is wired in-line with the console, so none will take over. Lights do whatever the DMX nodes do when data stops.';
    ionConfidence = unknownRole.length ? 'needs-audit' : 'documented';
  } else if (upstreamUnknown.length) {
    ionOutcome = `Depends on the DMX nodes (${upstreamUnknown.map((u) => u.name).join(', ')}). If a node keeps outputting its last look when Eos stops, the in-line SceneStation never sees DMX disappear and does NOT take over. If the node stops outputting, the station takes over and ${wired.map((s) => `${s.name} ${describeLossAction(s.lossAction, s.lossPreset)}`).join('; ')}.`;
    ionConfidence = 'needs-audit';
  } else if (upstreamHold.length) {
    ionOutcome = `${upstreamHold.map((u) => u.name).join(', ')} hold${upstreamHold.length === 1 ? 's' : ''} the last look, so in-line SceneStations stay passive: lights freeze in Eos's last state and wall buttons may not change them.`;
    ionConfidence = 'documented';
  } else {
    ionOutcome = `DMX stops, so each in-line SceneStation takes over (manual: "When DMX Output is Restored"): ${wired.map((s) => `${s.name} ${describeLossAction(s.lossAction, s.lossPreset)}`).join('; ')}.`;
    ionConfidence = wired.some((s) => s.lossAction === 'unknown') ? 'needs-audit' : 'documented';
  }
  out.push({
    id: 'ion-fails',
    scenario: 'Eos stops: Eos is closed, crashes, or the PC running Eos (ETCnomad) shuts down, restarts or loses power',
    outcome: ionOutcome,
    confidence: ionConfidence,
    action: 'Know this before Sunday: test it once outside services and record the result in the audit.',
  });

  out.push({
    id: 'dmx-stops',
    scenario: 'A DMX cable, node or network link fails between Eos and the lights',
    outcome: wired.length
      ? 'Only fixtures downstream of the break are affected. An in-line SceneStation takes over only if it is downstream of the break and sees DMX disappear on its line. Dimmers/fixtures on lines without a station follow their own loss-of-data setting.'
      : 'Fixtures follow their own (or their dimmer\'s) loss-of-data setting. This varies by device and must be checked.',
    confidence: 'needs-audit',
    action: 'Use Eos\'s Patch/Output displays and the node indicators to find the break.',
  });

  const pressOutcome: string[] = [];
  if (wired.length) {
    pressOutcome.push(`In-line stations (${wired.map((s) => s.name).join(', ')}) are passive while the console sends DMX: per the manual the console has full control, so a button press does not change those lights${wired.some((s) => s.locksButtonsWhenConsoleActive === 'yes') ? ' (some are set to lock their buttons, as a visible cue)' : ''}.`);
  }
  if (outputOnly.length) {
    pressOutcome.push(`HAZARD: ${outputOnly.map((s) => s.name).join(', ')} ${outputOnly.length === 1 ? 'is' : 'are'} set to "DMX Output Only". If ${outputOnly.length === 1 ? 'it shares' : 'they share'} a DMX line with Eos's output, two sources drive the same line and the result is unpredictable.`);
  }
  if (stations.some((s) => s.dmxRole === 'separate-universe')) pressOutcome.push('Stations on lines Eos does not feed work normally and change their own lights at any time.');
  if (unknownRole.length) pressOutcome.push(`Unknown for ${unknownRole.map((s) => s.name).join(', ')} until the wiring is checked.`);
  out.push({
    id: 'wall-button',
    scenario: 'Someone presses a SceneStation wall button during a service',
    outcome: pressOutcome.join(' ') || 'No SceneStations recorded yet.',
    confidence: outputOnly.length ? 'hazard' : unknownRole.length ? 'needs-audit' : 'documented',
    action: 'Sanctuary Light cannot see or override this. Label wall stations if their buttons do nothing during services.',
  });

  out.push({
    id: 'power-restore',
    scenario: 'Building power returns after an outage',
    outcome: 'Each SceneStation restores the preset that was active before power loss unless it was configured otherwise (manual: Power-On Preset, default "Restore Previous"), then goes passive as soon as it detects console DMX. Sanctuary Light comes back in Offline Simulation and sends nothing.',
    confidence: stations.length && stations.every((s) => s.verified) ? 'documented' : 'needs-audit',
    action: 'Confirm the Power-On Preset setting of each station during the audit.',
  });
  return out;
}

export function defaultArchitecture(): ArchitecturalConfig {
  return {
    stations: [{
      id: 'ss-1', name: 'Sanctuary wall station', location: 'Not yet recorded', model: '', firmware: '',
      dmxRole: 'unknown', dmxLine: '', lossAction: 'unknown', lossPreset: null, locksButtonsWhenConsoleActive: 'unknown',
      buttons: '', verified: false, verifiedBy: '', verifiedAt: null,
      notes: 'Placeholder. Replace with each real station found during the system audit (docs/SYSTEM_AUDIT.md).',
    }],
    upstream: [
      { id: 'up-pathport', name: 'Pathway Pathport', role: 'Network-to-DMX node', lossBehavior: 'unknown', feedsLines: '', verified: false, notes: 'Check the port\'s loss-of-data behavior in Pathscape.' },
      { id: 'up-ode', name: 'ENTTEC ODE Mk3', role: 'Network-to-DMX node', lossBehavior: 'unknown', feedsLines: '', verified: false, notes: 'Check its loss-of-data / hold setting in the ENTTEC web interface.' },
      { id: 'up-gadget', name: 'ETC Gadget II', role: 'USB-to-DMX interface on the Eos (ETCnomad) PC, 2 DMX ports', lossBehavior: 'unknown', feedsLines: '', verified: false, notes: 'Driven by Eos on the sanctuary Windows PC. Record which DMX lines/transmitters it feeds and what its outputs do when Eos stops or the PC restarts.' },
      { id: 'up-wireless', name: 'Wireless DMX', role: 'Wireless DMX transmitter and receivers', lossBehavior: 'unknown', feedsLines: '', verified: false, notes: 'Record make/model. Check its manual and test: when the transmitter loses DMX, do receivers hold the last look (for how long?) or stop output?' },
    ],
    auditCompletedAt: null,
    auditBy: '',
    volunteerGuidance: 'The wall buttons (SceneStation) control the room when the lighting console is off. During services the booth lighting computer (ETC Eos, operated through Sanctuary Light) is in charge. Do not close the Eos window on that computer. Sanctuary Light does not control the wall buttons. If the house lights do not respond, ask the lighting lead.',
  };
}
