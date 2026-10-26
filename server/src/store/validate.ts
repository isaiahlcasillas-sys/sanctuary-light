import { checkConnectionCompat, isIPv4, isValidEosVersion, type AppConfig } from '@sanctuary/shared';

export type SectionKey = keyof AppConfig;

const isInt = (n: unknown, min = 0) => Number.isInteger(n) && (n as number) >= min;
const isPort = (n: unknown) => isInt(n, 1) && (n as number) <= 65535;

/** Returns an error message, or null when the section is valid. */
export function validateSection(key: SectionKey, value: unknown, cfg: AppConfig): string | null {
  switch (key) {
    case 'settings': {
      const s = value as AppConfig['settings'];
      const c = s?.connection;
      if (!c) return 'Missing connection settings';
      if (c.consoleIp && !isIPv4(c.consoleIp)) return 'Console IP must be an IPv4 address like 10.101.100.101';
      if (!['udp', 'tcp-1.0', 'tcp-1.1'].includes(c.transport)) return 'Unknown transport';
      if (!isPort(c.udpConsolePort) || !isPort(c.udpLocalPort) || !isPort(c.tcpPort)) return 'Ports must be 1–65535';
      if (c.eosVersion && !isValidEosVersion(c.eosVersion)) return 'Eos version should look like 2.9.3 or 3.2.12 (as shown in the Ion\'s About screen)';
      if (!['auto', 'cue-list', 'keys'].includes(c.goBackMethod)) return 'Unknown GO/BACK method';
      const compat = checkConnectionCompat(c);
      if (compat.errors.length) return compat.errors[0];
      if (c.oscUser != null && !isInt(c.oscUser, 0)) return 'OSC user must be a whole number or empty';
      if (!(c.heartbeatSeconds >= 1 && c.staleSeconds > c.heartbeatSeconds)) return 'Stale timeout must be longer than the heartbeat interval';
      if (!(c.maxCommandRateHz >= 1 && c.maxCommandRateHz <= 30)) return 'Command rate must be 1–30 per second';
      if (!/^[a-z0-9_]+$/i.test(c.goKey) || !/^[a-z0-9_]+$/i.test(c.backKey)) return 'Key names may only contain letters, digits and _';
      if (!isInt(s.masterCueList, 1)) return 'Master cue list must be a positive number';
      if (!s.commissioning || typeof s.commissioning.notes !== 'string') return 'Missing commissioning record';
      return null;
    }
    case 'fixtures': {
      const list = value as AppConfig['fixtures'];
      if (!Array.isArray(list)) return 'Fixtures must be a list';
      const seen = new Set<number>();
      const profileIds = new Set(cfg.profiles.map((p) => p.id));
      for (const f of list) {
        if (!isInt(f.channel, 1)) return `Invalid channel ${f.channel}`;
        if (seen.has(f.channel)) return `Channel ${f.channel} is listed twice`;
        seen.add(f.channel);
        if (!profileIds.has(f.profileId)) return `Channel ${f.channel}: unknown profile "${f.profileId}"`;
        if (f.dmx && (!isInt(f.dmx.universe, 1) || !isInt(f.dmx.address, 1) || f.dmx.address > 512)) return `Channel ${f.channel}: DMX address must be universe ≥1 and address 1–512`;
        if (!f.stage || !Number.isFinite(f.stage.x) || !Number.isFinite(f.stage.y)) return `Channel ${f.channel}: missing stage position`;
      }
      return null;
    }
    case 'groups': {
      const list = value as AppConfig['groups'];
      if (!Array.isArray(list)) return 'Groups must be a list';
      for (const g of list) {
        if (!g.id || !g.name) return 'Every group needs an id and name';
        if (!Array.isArray(g.channels)) return `Group ${g.name}: channels must be a list`;
        if (g.eosGroup != null && !isInt(g.eosGroup, 1)) return `Group ${g.name}: Eos group must be a positive number`;
      }
      return null;
    }
    case 'looks': {
      const list = value as AppConfig['looks'];
      if (!Array.isArray(list)) return 'Looks must be a list';
      for (const l of list) {
        if (!l.id || !l.name) return 'Every look needs an id and name';
        const a = l.action;
        if (!a) return `${l.name}: missing action`;
        if (a.type === 'cue' && (!isInt(a.list, 1) || !/^\d+(\.\d+)?$/.test(a.cue))) return `${l.name}: cue list and cue number required`;
        if (a.type === 'macro' && !isInt(a.macro, 1)) return `${l.name}: macro number required`;
        if (a.type === 'preset' && (!isInt(a.preset, 1) || !isInt(a.eosGroup, 1))) return `${l.name}: preset and Eos group required`;
        if (a.type === 'sub' && (!isInt(a.sub, 1) || !(a.level >= 0 && a.level <= 100))) return `${l.name}: submaster and level 0–100 required`;
        if (a.type === 'snapshot' && !isInt(a.snapshot, 1)) return `${l.name}: snapshot number required`;
      }
      return null;
    }
    case 'cueLists': {
      const list = value as AppConfig['cueLists'];
      if (!Array.isArray(list)) return 'Cue lists must be a list';
      for (const c of list) {
        if (!isInt(c.list, 1)) return 'Cue list numbers must be positive';
        for (const q of c.cues) if (!/^\d+(\.\d+)?$/.test(q.cue)) return `List ${c.list}: invalid cue number "${q.cue}"`;
      }
      return null;
    }
    case 'submasters': {
      const list = value as AppConfig['submasters'];
      if (!Array.isArray(list)) return 'Submasters must be a list';
      for (const s of list) if (!isInt(s.sub, 1)) return 'Submaster numbers must be positive';
      return null;
    }
    case 'profiles': {
      const list = value as AppConfig['profiles'];
      if (!Array.isArray(list) || !list.some((p) => p.id === 'generic')) return 'Profiles must include "generic"';
      return null;
    }
    case 'stage': {
      const s = value as AppConfig['stage'];
      if (!s || !(s.width > 0) || !(s.height > 0) || !Array.isArray(s.elements)) return 'Invalid stage layout';
      return null;
    }
    default:
      return `Unknown section ${String(key)}`;
  }
}
