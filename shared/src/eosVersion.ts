/**
 * Eos software version → OSC connection capabilities.
 *
 * Sources (see docs/EOS_OSC.md for links):
 *  - ETC Support, "TCP port for OSC communication with Eos Software"
 *  - Eos Family v3.3.10 User Manual: Eos OSC Setup, Setup > Device Settings > Network, OSC Dictionary
 *  - Eos Family Show Control User Guide Rev C (2017, Eos 2.x era)
 *  - ETC "Which Software" (Ion Classic on Windows XP cannot run v3.0+)
 *
 * Anything we could not confirm from ETC documentation is reported as `verify`,
 * never as supported.
 */
import { isLoopback } from './net';
import type { ConnectionSettings } from './model';

export interface EosVersionNumber { major: number; minor: number; patch: number }

/** Accepts "3.2.12", "3.2.12.1", "v2.9.3", "3.3.0.273" and legacy "2.x"-style values. */
export function parseEosVersion(text: string | null | undefined): EosVersionNumber | null {
  if (!text) return null;
  const legacy = text.trim().match(/^v?(\d+)\.x$/i);
  if (legacy) return { major: Number(legacy[1]), minor: 0, patch: 0 };
  // "major.minor[.patch[.build]]", optionally followed by a space and text (e.g. a build label).
  const m = text.trim().match(/^v?(\d+)\.(\d+)(?:\.(\d+))?(?:\.\d+)?(?:\s.*)?$/i);
  if (!m) return null;
  const major = Number(m[1]);
  // Eos releases are 1.x–3.x; anything far outside that is a typo (e.g. an IP address).
  if (major < 1 || major > 9) return null;
  return { major, minor: Number(m[2]), patch: Number(m[3] ?? 0) };
}

/** For settings: a real version number, not a "2.x" placeholder. */
export function isValidEosVersion(text: string): boolean {
  return !/x$/i.test(text.trim()) && parseEosVersion(text) != null;
}

export function versionAtLeast(v: EosVersionNumber | null, major: number, minor = 0, patch = 0): boolean {
  if (!v) return false;
  if (v.major !== major) return v.major > major;
  if (v.minor !== minor) return v.minor > minor;
  return v.patch >= patch;
}

export const formatVersion = (v: EosVersionNumber) => `${v.major}.${v.minor}.${v.patch}`;

export type Support = 'yes' | 'no' | 'verify';

export interface EosCapabilities {
  known: boolean;
  /** OSC over TCP on port 3032 (framing chosen on the console). */
  tcp3032: Support;
  /** Where the console sets the port-3032 framing (OSC 1.0 vs 1.1/SLIP). */
  tcp3032FramingSetting: string;
  /** Dedicated "Third Party OSC" server port 3037, SLIP (OSC 1.1) only. v3.1.0+ */
  thirdParty3037: Support;
  /** Where the Third Party OSC (3037) toggle lives. */
  thirdPartyToggle: string;
  /** Port 3038 "detailed third-party integration". v3.3.9+ */
  thirdParty3038: Support;
  /** Additional user-defined OSC TCP ports. v2.9.0+ */
  customTcpPorts: Support;
  /** /eos/get/... and /eos/subscribe third-party API. */
  getApi: Support;
  /** /eos/cues/<list>/fire and /eos/cues/<list>/stop (cue-list GO / Stop-Back). */
  cueListFireStop: Support;
  /** Where OSC RX/TX are enabled. */
  oscRxTxSetting: string;
  /** Where per-interface protocols (UDP Strings & OSC, OSC TCP, Third Party OSC) are enabled. */
  interfaceProtocols: string;
  notes: string[];
}

export function eosCapabilities(versionText: string | null | undefined): EosCapabilities {
  const v = parseEosVersion(versionText);
  const notes: string[] = [];
  if (!v) {
    return {
      known: false, tcp3032: 'verify', tcp3032FramingSetting: 'unknown — identify the Eos version first',
      thirdParty3037: 'verify', thirdPartyToggle: 'unknown', thirdParty3038: 'verify', customTcpPorts: 'verify',
      getApi: 'verify', cueListFireStop: 'verify', oscRxTxSetting: 'Setup > System > Show Control',
      interfaceProtocols: 'unknown',
      notes: ['Eos version not identified. Run the Eos Setup Wizard before connecting.'],
    };
  }
  const v2 = versionAtLeast(v, 2, 0);
  const v3 = versionAtLeast(v, 3, 0);
  if (!v2) notes.push('Eos 1.x: OSC over TCP and the /eos/get third-party API are not documented for this version. Use UDP.');
  if (v.major === 2 || (v.major === 3 && v.minor === 0)) notes.push('Port 3037 (Third Party OSC) does not exist before Eos 3.1.0 — use TCP 3032.');
  if (!v3) notes.push('Ion Classic consoles running Windows XP cannot be upgraded past Eos 2.9.x.');
  if (v3 && !versionAtLeast(v, 3, 3)) notes.push('/eos/cues/<list>/fire|stop is documented in the Eos 3.3 manual; confirm it on this version before relying on it.');
  return {
    known: true,
    tcp3032: v2 ? 'yes' : 'no',
    tcp3032FramingSetting: versionAtLeast(v, 3, 2)
      ? 'Setup > System > Show Control > OSC (on 3.3+ also shown in Setup > Device Settings > Network > Interface Protocols > "OSC TCP"); default OSC 1.0'
      : 'ECU (Shell) > Settings > Network > Interface Protocols ("OSC TCP mode"; default OSC 1.0)',
    thirdParty3037: versionAtLeast(v, 3, 1) ? 'yes' : 'no',
    thirdPartyToggle: versionAtLeast(v, 3, 3)
      ? 'Setup > Device Settings > Network > Interface Protocols > "Third Party OSC" (enabled by default)'
      : versionAtLeast(v, 3, 1)
        ? 'ECU (Shell) > Settings > Network > "Third Party OSC"'
        : 'not available before Eos 3.1.0',
    thirdParty3038: versionAtLeast(v, 3, 3, 9) ? 'yes' : 'no',
    customTcpPorts: versionAtLeast(v, 2, 9) ? 'yes' : 'no',
    getApi: v2 ? 'yes' : 'no',
    cueListFireStop: versionAtLeast(v, 3, 3) ? 'yes' : v3 ? 'verify' : 'no',
    interfaceProtocols: versionAtLeast(v, 3, 3)
      ? 'Setup > Device Settings > Network > Interface Protocols'
      : 'ECU (Shell) > Settings > Network > Interface Protocols',
    oscRxTxSetting: v3 ? 'Setup > System > Show Control > OSC ({OSC RX} / {OSC TX})' : 'Setup > Show > Show Control ({String RX} / {String TX})',
    notes,
  };
}

export interface ConnectionRecommendation {
  transport: ConnectionSettings['transport'];
  port: number;
  summary: string;
  consoleSteps: string[];
}

/** The connection we recommend for a given Eos version. */
export function recommendConnection(versionText: string | null | undefined): ConnectionRecommendation {
  const caps = eosCapabilities(versionText);
  if (caps.thirdParty3037 === 'yes') {
    return {
      transport: 'tcp-1.1', port: 3037,
      summary: 'TCP port 3037 "Third Party OSC" (OSC 1.1 / SLIP). Replies come back on the same connection.',
      consoleSteps: [
        `Confirm "Third Party OSC" is enabled: ${caps.thirdPartyToggle}.`,
        `Enable {OSC RX} and {OSC TX}: ${caps.oscRxTxSetting}.`,
        'No OSC UDP TX address is needed for TCP.',
      ],
    };
  }
  if (caps.tcp3032 === 'yes') {
    return {
      transport: 'tcp-1.0', port: 3032,
      summary: 'TCP port 3032 with the console\'s OSC TCP format. The Eos default is OSC 1.0 (packet-length); choose OSC 1.1 here only if the console is set to SLIP.',
      consoleSteps: [
        `Enable OSC for the network interface Eos uses: ${caps.interfaceProtocols}${versionAtLeast(parseEosVersion(versionText), 3, 3) ? ' ("OSC TCP")' : ' ({UDP Strings & OSC})'}.`,
        `Check the OSC TCP format: ${caps.tcp3032FramingSetting}. Match it in Sanctuary Light.`,
        `Enable OSC receive and transmit: ${caps.oscRxTxSetting}.`,
      ],
    };
  }
  return {
    transport: 'udp', port: 8000,
    summary: 'UDP: send to the console\'s OSC UDP RX port; the console must send replies to this computer\'s IP.',
    consoleSteps: [
      `Enable {UDP Strings & OSC} for the network interface: ${caps.interfaceProtocols === 'unknown' ? 'ECU (Shell) > Settings > Network > Interface Protocols' : caps.interfaceProtocols}.`,
      `Set OSC UDP RX port, OSC UDP TX port and OSC UDP TX IP address (this computer) in ${caps.oscRxTxSetting.split(' (')[0]}.`,
      `Enable OSC receive and transmit: ${caps.oscRxTxSetting}.`,
    ],
  };
}

/** Errors block saving; warnings are shown but allowed. */
export function checkConnectionCompat(
  c: Pick<ConnectionSettings, 'eosVersion' | 'transport' | 'tcpPort' | 'goBackMethod'> & Partial<Pick<ConnectionSettings, 'consoleIp' | 'udpConsolePort' | 'udpLocalPort'>>,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const caps = eosCapabilities(c.eosVersion);
  if (!caps.known) {
    warnings.push('Eos version not set — connecting is disabled until it is identified.');
    return { errors, warnings };
  }
  if (c.transport !== 'udp') {
    if (caps.tcp3032 === 'no') errors.push('OSC over TCP is not documented for Eos 1.x. Use UDP.');
    if (c.tcpPort === 3037) {
      if (caps.thirdParty3037 === 'no') errors.push(`Port 3037 (Third Party OSC) needs Eos 3.1.0 or later; this console runs ${c.eosVersion}. Use TCP 3032.`);
      if (c.transport !== 'tcp-1.1') errors.push('Port 3037 accepts OSC 1.1 (SLIP) only. Choose "TCP — OSC 1.1 (SLIP)".');
    } else if (c.tcpPort === 3038) {
      if (caps.thirdParty3038 === 'no') errors.push('Port 3038 needs Eos 3.3.9 or later.');
      warnings.push('Port 3038 includes show-control traffic; 3037 is the general third-party port.');
    } else if (c.tcpPort === 3036) {
      errors.push('Port 3036 is reserved for aRFR/iRFR connections.');
    } else if (c.tcpPort !== 3032) {
      if (caps.customTcpPorts === 'no') errors.push('Additional OSC TCP ports need Eos 2.9.0 or later. Use 3032.');
      else warnings.push(`Port ${c.tcpPort} must be added as an OSC TCP port on the console with the matching format.`);
    } else if (c.transport === 'tcp-1.1') {
      warnings.push('Port 3032 defaults to OSC 1.0 (packet-length). OSC 1.1 only works if the console\'s OSC TCP format is set to SLIP.');
    }
  }
  if (isLoopback(c.consoleIp)) {
    // Same-PC deployment (Eos/ETCnomad and Sanctuary Light on one computer).
    if (!versionAtLeast(parseEosVersion(c.eosVersion), 3, 2)) warnings.push(`Connecting to Eos on this computer (loopback) is documented for Eos 3.2 and later; this is ${c.eosVersion}. If it doesn't connect, use this PC's own network address.`);
    if (c.transport === 'udp' && c.udpLocalPort === c.udpConsolePort) errors.push(`Eos on this computer already listens on UDP ${c.udpConsolePort}. Sanctuary Light must listen on a different port (Eos "OSC UDP TX").`);
  }
  if (c.goBackMethod === 'cue-list' && caps.cueListFireStop === 'no') {
    errors.push('/eos/cues/<list>/fire|stop is not in the Eos 2.x documentation. Use "Console keys" or "Automatic".');
  } else if (c.goBackMethod === 'cue-list' && caps.cueListFireStop === 'verify') {
    warnings.push('Cue-list GO/BACK is not documented for this version; test it outside services.');
  }
  return { errors, warnings };
}
