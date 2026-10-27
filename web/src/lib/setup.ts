/**
 * Helpers for the Sanctuary Setup screens. Everything here describes what is actually in the
 * configuration; nothing is guessed.
 */
import {
  firstConnectionSteps, needsApproval,
  type AppConfig, type AreaId, type Capability, type Fixture, type FixtureProfile, type GroupVerification,
} from '@sanctuary/shared';
import type { SetupStep } from '../state/store';

export const AREA_LABELS: Record<AreaId, string> = {
  front: 'Front light',
  stage: 'Stage wash',
  scenic: 'Scenic / cyc',
  house: 'House & pendants',
  utility: 'Utility & relays',
};
export const AREA_ORDER: AreaId[] = ['front', 'stage', 'scenic', 'house', 'utility'];
export const AREA_COLORS: Record<AreaId, string> = { front: '#fbbf24', stage: '#a78bfa', scenic: '#38bdf8', house: '#f59e0b', utility: '#f87171' };

export const CAP_LABELS: Record<Capability, string> = {
  intensity: 'Intensity', rgb: 'Color (RGB)', white: 'White', amber: 'Amber', uv: 'UV', cct: 'Color temp', pantilt: 'Pan/Tilt', zoom: 'Zoom', focus: 'Edge/Focus', relay: 'Relay (on/off)',
};

export type FlagKind = 'unknown-type' | 'assumed-controls' | 'no-address' | 'no-group' | 'unplaced' | 'protected' | 'renamed';

export interface FixtureFlag { kind: FlagKind; text: string; attention: boolean }

/** What the importer could not verify (or the operator should know) for one fixture. */
export function fixtureFlags(f: Fixture, profile: FixtureProfile | undefined, inGroup: boolean): FixtureFlag[] {
  const out: FixtureFlag[] = [];
  if (!f.eosType && (profile?.id ?? 'generic') === 'generic') out.push({ kind: 'unknown-type', text: 'Fixture type unknown: the export didn\'t say what this is', attention: true });
  if (profile && !profile.verified) {
    out.push({
      kind: 'assumed-controls', attention: true,
      text: profile.id.startsWith('eos-')
        ? 'Controls not confirmed: the export showed no parameters for this type, so only intensity is offered'
        : 'Fixture profile was guessed, not confirmed against Eos',
    });
  }
  if (!f.dmx) out.push({ kind: 'no-address', text: 'No DMX address in the export', attention: true });
  if (!inGroup) out.push({ kind: 'no-group', text: 'Not in any group', attention: false });
  if (f.unplaced) out.push({ kind: 'unplaced', text: 'Not placed on the stage yet', attention: false });
  if (f.protected) out.push({ kind: 'protected', text: 'Protected (relay/utility): needs a timed unlock', attention: false });
  if (f.eosLabel !== undefined && f.eosLabel !== f.label) out.push({ kind: 'renamed', text: `Renamed here; in Eos it's "${f.eosLabel || '(no label)'}"`, attention: false });
  return out;
}

export function capabilityKey(p: FixtureProfile | undefined) {
  return (p?.capabilities ?? ['intensity']).join('+');
}

/** Status of each Sanctuary Setup step, from the real configuration and console status. */
export function setupProgress(cfg: AppConfig, groupVerification: Record<string, GroupVerification> | undefined): Record<SetupStep, { done: boolean; text: string }> {
  const imported = cfg.eosShow;
  const fc = cfg.settings.commissioning.firstConnection;
  const unplaced = cfg.fixtures.filter((f) => f.unplaced).length;
  const eosLooks = cfg.looks.filter(needsApproval);
  const approved = eosLooks.filter((l) => l.approval);
  const v = cfg.verification;
  const steps = firstConnectionSteps(cfg);
  const testsDone = steps.filter((s) => s.state === 'done').length;
  const verifiedGroups = Object.values(groupVerification ?? {}).filter((g) => g.state === 'verified').length;
  return {
    import: imported ? { done: true, text: `${imported.fileName} · ${new Date(imported.importedAt).toLocaleDateString()}` } : { done: false, text: 'Not imported yet (using sample fixtures)' },
    review: imported && fc?.patchReviewedAt && fc.patchReviewedAt >= imported.importedAt ? { done: true, text: 'Reviewed' } : { done: false, text: `${cfg.fixtures.length} fixtures to review` },
    arrange: unplaced === 0 ? { done: true, text: 'All fixtures placed' } : { done: false, text: `${unplaced} not placed yet` },
    looks: eosLooks.length && approved.length ? { done: true, text: `${approved.length} of ${eosLooks.length} approved for volunteers` } : { done: false, text: eosLooks.length ? `${eosLooks.length} look(s) waiting for review` : 'No cues assigned to looks yet' },
    verify: v && !v.simulatedConsole && (!imported || v.at > imported.importedAt)
      ? { done: v.summary.different + v.summary['missing-in-eos'] + v.summary['extra-in-eos'] === 0, text: `Last checked ${new Date(v.at).toLocaleString()}${verifiedGroups ? ` · ${verifiedGroups} groups verified` : ''}` }
      : { done: false, text: v?.simulatedConsole ? 'Only checked against the simulator' : 'Not compared with Eos yet' },
    testing: { done: testsDone === steps.length, text: `${testsDone} of ${steps.length} steps done` },
  };
}
