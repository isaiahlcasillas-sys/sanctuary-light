/**
 * Decides whether a local group may be sent to the console as "Group N".
 *
 * Local group membership is only a note in Sanctuary Light's config — the real Eos
 * group can contain anything (including relays). So "Group N" is used only when the
 * console itself has told us, during this connection, that group N contains exactly
 * the channels we expect and none of them is protected. In every other case the
 * controller addresses the local channel list explicitly, which only ever touches
 * channels the operator can see and that passed the protected-channel check.
 */
import type { Fixture, FixtureGroup, GroupVerification } from '@sanctuary/shared';

interface ConsoleGroup {
  label: string | null;
  channels: Set<number>;
  unparsed: string[];
  gotInfo: boolean;
  gotChannels: boolean;
  /** Total elements in the channel-list reply (from /list/<index>/<total>). */
  total: number | null;
  /** Element position → raw value received; the list is trusted only when 0..total-1 all arrived. */
  covered: Map<number, string>;
  /** Packets disagreed with each other (different totals, or different values at one position). */
  conflict: boolean;
  lastPacketAt: number;
}

/** Wait this long after the last packet before trusting a (possibly multi-packet) channel list. */
export const SETTLE_MS = 400;
/** After this long without a reply, report the request as unanswered. */
export const REPLY_TIMEOUT_MS = 4000;
/** No real Eos group reply is this long; anything larger is treated as malformed. */
export const MAX_LIST_ELEMENTS = 10_000;

function complete(e: ConsoleGroup): boolean {
  for (let i = 0; i < (e.total ?? 0); i++) if (!e.covered.has(i)) return false;
  return true;
}

export class GroupVerifier {
  private groups = new Map<number, ConsoleGroup>();
  private requestedAt = new Map<number, number>();

  /** Forget everything (new connection, show changed, or a group-change notification). */
  invalidate() {
    this.groups.clear();
    this.requestedAt.clear();
  }

  markRequested(groups: number[], now = Date.now()) {
    for (const g of groups) {
      this.requestedAt.set(g, now);
      this.groups.delete(g);
    }
  }

  /** Groups with an Eos number that we have not asked about since the last invalidate. */
  needsRequest(eosGroups: number[]): number[] {
    return [...new Set(eosGroups)].filter((g) => !this.requestedAt.has(g));
  }

  private entry(group: number): ConsoleGroup {
    let e = this.groups.get(group);
    if (!e) { e = { label: null, channels: new Set(), unparsed: [], gotInfo: false, gotChannels: false, total: null, covered: new Map(), conflict: false, lastPacketAt: 0 }; this.groups.set(group, e); }
    return e;
  }

  /**
   * The info packet starts each reply, so channel data collected before it belongs to an
   * older request and is discarded. (Group verification is only used over TCP, where
   * packets arrive in order.)
   */
  onInfo(group: number, label: string, now = Date.now()) {
    const e = this.entry(group);
    Object.assign(e, { channels: new Set(), unparsed: [], gotChannels: false, total: null, covered: new Map(), conflict: false });
    e.label = label;
    e.gotInfo = true;
    e.lastPacketAt = now;
  }

  onChannels(group: number, channels: number[], unparsed: string[], now = Date.now(), packet?: { argIndex: number; argCount: number; total: number | null; values?: string[] }) {
    const e = this.entry(group);
    if (packet) {
      if (packet.total != null) {
        if (e.total != null && e.total !== packet.total) e.conflict = true;
        e.total = packet.total;
      }
      for (let i = 0; i < packet.argCount; i++) {
        const pos = packet.argIndex + i;
        const val = packet.values?.[i] ?? '';
        const prev = e.covered.get(pos);
        if (prev !== undefined && prev !== val) e.conflict = true;
        e.covered.set(pos, val);
      }
    }
    for (const c of channels) e.channels.add(c);
    e.unparsed.push(...unparsed);
    e.gotChannels = true;
    e.lastPacketAt = now;
  }

  /**
   * @param reliable false for UDP: packets can be lost, duplicated or reordered, so a
   *   console group is never treated as verified and explicit channel lists are always used.
   */
  evaluate(local: FixtureGroup[], fixtures: Fixture[], now = Date.now(), reliable = true): Record<string, GroupVerification> {
    const out: Record<string, GroupVerification> = {};
    const byChannel = new Map(fixtures.map((f) => [f.channel, f]));
    for (const g of local) {
      const base = { groupId: g.id, eosGroup: g.eosGroup, consoleChannels: null as number[] | null, consoleLabel: null as string | null, checkedAt: null as number | null };
      if (g.eosGroup == null) {
        out[g.id] = { ...base, state: 'not-applicable', detail: 'No Eos group number — channels are always addressed individually.' };
        continue;
      }
      const n = g.eosGroup;
      if (!reliable) {
        out[g.id] = { ...base, state: 'unverified', detail: `Group verification needs a TCP connection (UDP can drop or reorder replies). Commands use the explicit channel list instead of Group ${n}.` };
        continue;
      }
      const asked = this.requestedAt.get(n);
      const e = this.groups.get(n);
      const unverified = (detail: string) => ({ ...base, state: 'unverified' as const, detail: `${detail} Commands use the explicit channel list instead of Group ${n}.` });
      if (!e || (!e.gotChannels && !e.gotInfo)) {
        out[g.id] = asked == null
          ? unverified(`Group ${n} has not been read from the console in this session.`)
          : now - asked > REPLY_TIMEOUT_MS
            ? unverified(`The console did not answer for Group ${n} (it may not exist, or this Eos version lacks /eos/get).`)
            : unverified(`Reading Group ${n} from the console…`);
        continue;
      }
      if (now - e.lastPacketAt < SETTLE_MS) { out[g.id] = unverified(`Reading Group ${n} from the console…`); continue; }
      const consoleChannels = [...e.channels].sort((a, b) => a - b);
      const info = { ...base, consoleChannels, consoleLabel: e.label, checkedAt: e.lastPacketAt };
      if (!e.gotChannels) { out[g.id] = { ...info, state: 'unverified', detail: `Group ${n}'s channel list was not received. Commands use the explicit channel list.` }; continue; }
      if (e.conflict) {
        out[g.id] = { ...info, state: 'mismatch', detail: `Group ${n}: the console's replies were inconsistent with each other. The explicit channel list is used; press Verify groups to re-read.` };
        continue;
      }
      if (e.total == null || e.total > MAX_LIST_ELEMENTS || !complete(e)) {
        // A missing packet could hide a protected channel, so a partial list is never trusted.
        out[g.id] = { ...info, state: 'unverified', detail: `Group ${n}'s channel list arrived incomplete (${e.covered.size}/${e.total ?? '?'} elements). Commands use the explicit channel list.` };
        continue;
      }
      const prot = consoleChannels.filter((c) => byChannel.get(c)?.protected);
      if (prot.length) {
        out[g.id] = { ...info, state: 'protected', detail: `Eos Group ${n} contains protected channel(s) ${prot.slice(0, 8).join(', ')}. "Group ${n}" will never be sent; the explicit channel list is used.` };
        continue;
      }
      const unpatched = consoleChannels.filter((c) => !byChannel.has(c));
      const localSet = new Set(g.channels);
      const extra = consoleChannels.filter((c) => !localSet.has(c));
      const missing = g.channels.filter((c) => !e.channels.has(c));
      if (e.unparsed.length || extra.length || missing.length) {
        const parts: string[] = [];
        if (extra.length) parts.push(`console has extra ${extra.slice(0, 8).join(', ')}${unpatched.length ? ` (${unpatched.length} not in this app's patch)` : ''}`);
        if (missing.length) parts.push(`console lacks ${missing.slice(0, 8).join(', ')}`);
        if (e.unparsed.length) parts.push(`unreadable entries ${e.unparsed.slice(0, 4).join(', ')}`);
        out[g.id] = { ...info, state: 'mismatch', detail: `Eos Group ${n} differs from this app: ${parts.join('; ')}. The explicit channel list is used.` };
        continue;
      }
      out[g.id] = { ...info, state: 'verified', detail: `Eos Group ${n}${e.label ? ` "${e.label}"` : ''} matches (${consoleChannels.length} channels, none protected).` };
    }
    return out;
  }
}
