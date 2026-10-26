/**
 * Builders for the ETC Eos OSC commands Sanctuary Light uses.
 *
 * Every address here comes from the "Show Control → Open Sound Control" chapter of
 * the Eos Family operations manual. Commands are grouped by how they reach the
 * console, and each entry notes which Eos versions it needs. Anything flagged
 * `verify: true` is documented but known to vary between versions/settings and
 * should be checked on the real Ion before a service (see docs/EOS_OSC.md).
 *
 * Notes on the command-line approach:
 *   /eos/newcmd "<text>"  clears the OSC user's command line, then types <text>.
 *   A trailing "#" in the text is the Enter key.
 * This is the most portable control method across Eos 1.x–3.x because it uses the
 * same syntax an operator types ("Chan 21 Thru 29 At 75 Enter").
 */
import { channelExpression, clamp, type ParamKey } from '@sanctuary/shared';
import { float, str, type OscMessage } from '../osc/codec';

export interface EosCommandDoc {
  address: string;
  purpose: string;
  minVersion: '1.x' | '2.x';
  affectsOutput: boolean;
  verify?: boolean;
}

export const EOS_COMMAND_TABLE: EosCommandDoc[] = [
  { address: '/eos/newcmd <string>', purpose: 'Clear command line and type text; "#" = Enter. Used for Chan/Group At, selection and presets.', minVersion: '1.x', affectsOutput: true },
  { address: '/eos/cue/<list>/<cue>/fire', purpose: 'Fire a specific cue in a specific cue list.', minVersion: '1.x', affectsOutput: true },
  { address: '/eos/sub/<n> <float 0–1>', purpose: 'Set submaster level.', minVersion: '1.x', affectsOutput: true },
  { address: '/eos/macro/<n>/fire', purpose: 'Run a macro.', minVersion: '1.x', affectsOutput: true, verify: true },
  { address: '/eos/param/<name> <float>', purpose: 'Set a non-intensity parameter (Red, Pan, Zoom…) on the selected channels.', minVersion: '1.x', affectsOutput: true, verify: true },
  { address: '/eos/key/<name> <1.0|0.0>', purpose: 'Press/release a console key (GO = go_0, Stop/Back).', minVersion: '1.x', affectsOutput: true, verify: true },
  { address: '/eos/ping', purpose: 'Heartbeat; console replies /eos/out/ping.', minVersion: '1.x', affectsOutput: false },
  { address: '/eos/get/version', purpose: 'Ask the console its software version (reply /eos/out/get/version).', minVersion: '2.x', affectsOutput: false },
  { address: '/eos/subscribe <1>', purpose: 'Subscribe to show-data change notifications (third-party API).', minVersion: '2.x', affectsOutput: false },
  { address: '/eos/get/patch/…, /eos/get/cuelist/…, /eos/get/cue/…', purpose: 'Read patch and cue list data (third-party API).', minVersion: '2.x', affectsOutput: false, verify: true },
];

/** Addresses allowed in read-only Monitor mode. Nothing here can change lighting. */
export function isReadOnlyAddress(address: string): boolean {
  const a = address.replace(/^\/eos\/user\/\d+/, '/eos');
  return a === '/eos/ping' || a.startsWith('/eos/get/') || a === '/eos/subscribe';
}

export class EosCommandBuilder {
  constructor(private oscUser: number | null) {}

  private addr(path: string): string {
    // "/eos/user/<n>/..." executes the command as a specific Eos user so we don't
    // disturb the operator's command line on the Ion.
    return this.oscUser != null ? path.replace(/^\/eos\//, `/eos/user/${this.oscUser}/`) : path;
  }

  private cmd(text: string): OscMessage {
    return { address: this.addr('/eos/newcmd'), args: [str(text)] };
  }

  private targetText(t: { channels: number[]; eosGroup: number | null }): string {
    if (t.eosGroup != null) return `Group ${t.eosGroup}`;
    const expr = channelExpression(t.channels);
    if (!expr) throw new Error('No channels to address');
    return `Chan ${expr}`;
  }

  select(t: { channels: number[]; eosGroup: number | null }): OscMessage[] {
    return [this.cmd(`${this.targetText(t)} #`)];
  }

  intensity(t: { channels: number[]; eosGroup: number | null }, level: number): OscMessage[] {
    const v = Math.round(clamp(level, 0, 100));
    const at = v === 100 ? 'Full' : v === 0 ? '0' : `${v}`;
    return [this.cmd(`${this.targetText(t)} At ${at} #`)];
  }

  /** Select, then set each parameter by its Eos parameter name. */
  params(t: { channels: number[]; eosGroup: number | null }, values: { eosName: string; value: number }[]): OscMessage[] {
    return [
      ...this.select(t),
      ...values.map((p) => ({ address: this.addr(`/eos/param/${encodeParamName(p.eosName)}`), args: [float(p.value)] })),
    ];
  }

  fireCue(list: number, cue: string): OscMessage[] {
    if (!/^\d+(\.\d+)?$/.test(cue)) throw new Error(`Invalid cue number "${cue}"`);
    return [{ address: this.addr(`/eos/cue/${list}/${cue}/fire`), args: [] }];
  }

  preset(preset: number, eosGroup: number | null): OscMessage[] {
    if (eosGroup == null) throw new Error('A preset look needs an Eos group to apply the preset to');
    return [this.cmd(`Group ${eosGroup} Preset ${preset} #`)];
  }

  macro(n: number): OscMessage[] {
    return [{ address: this.addr(`/eos/macro/${n}/fire`), args: [] }];
  }

  snapshot(n: number): OscMessage[] {
    return [this.cmd(`Snapshot ${n} #`)];
  }

  sub(n: number, level: number): OscMessage[] {
    return [{ address: this.addr(`/eos/sub/${n}`), args: [float(clamp(level, 0, 100) / 100)] }];
  }

  key(name: string): OscMessage[] {
    if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`Invalid Eos key name "${name}"`);
    const address = this.addr(`/eos/key/${name}`);
    return [{ address, args: [float(1)] }, { address, args: [float(0)] }];
  }

  ping(): OscMessage { return { address: '/eos/ping', args: [] }; }
  getVersion(): OscMessage { return { address: '/eos/get/version', args: [] }; }
  subscribe(): OscMessage { return { address: '/eos/subscribe', args: [float(1)] }; }
}

/** Eos parameter names may contain spaces (e.g. "Color Temperature"); OSC addresses use underscores. */
export function encodeParamName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function paramValueForEos(param: ParamKey, value: number): number {
  // Pan/tilt are degrees, CCT is Kelvin, everything else 0–100 %.
  return param === 'pan' || param === 'tilt' || param === 'cct' ? value : clamp(value, 0, 100);
}
