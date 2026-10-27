/**
 * Volunteer approval. A look that triggers anything in Eos (cue, preset, sub, macro,
 * snapshot) can do things Sanctuary Light can't see — including house lights that
 * SceneStation also controls. So volunteers can only use it after an operator has reviewed
 * it and approved it. Importing a cue is never treated as approval.
 */
import type { AppConfig, CueListConfig, Look, SubmasterConfig } from './model';

export const needsApproval = (look: Look) => look.action.type !== 'none';
export const volunteerCanUseLook = (look: Look) => look.volunteerVisible && (!needsApproval(look) || !!look.approval);
/** Every submaster needs approval: moving it moves the real Eos sub, whatever it contains. */
export const volunteerCanUseSub = (sub: SubmasterConfig) => sub.volunteerVisible && !!sub.approval;

/**
 * When looks are saved through the ordinary settings path, approvals are owned by the server:
 * an existing look keeps the approval it already had (a stale screen can neither re-create nor
 * erase one), a new look starts unapproved, and changing a look's action withdraws its
 * approval (and hides it from volunteers until it's approved again). Approving happens only
 * through the approval action, with its acknowledgement.
 */
export function normalizeLookApprovals(prev: Look[], next: Look[]): { looks: Look[]; withdrawn: string[] } {
  const before = new Map(prev.map((l) => [l.id, l]));
  const withdrawn: string[] = [];
  const looks = next.map((l) => {
    const old = before.get(l.id);
    if (!old) return { ...l, approval: null };
    if (JSON.stringify(old.action) !== JSON.stringify(l.action)) {
      if (old.approval) withdrawn.push(l.name);
      return { ...l, approval: null, volunteerVisible: old.approval ? false : l.volunteerVisible };
    }
    return { ...l, approval: old.approval ?? null };
  });
  return { looks, withdrawn };
}

/** Same rule for submasters: approval and "came from Eos" are kept from the saved copy. */
export function normalizeSubApprovals(prev: SubmasterConfig[], next: SubmasterConfig[]): SubmasterConfig[] {
  const before = new Map(prev.map((s) => [s.sub, s]));
  return next.map((s) => {
    const old = before.get(s.sub);
    const fromEos = !!(old?.fromEos || s.fromEos);
    return { ...s, fromEos: fromEos || undefined, approval: old?.approval ?? null };
  });
}

/** Text an operator agrees to when approving a look or submaster for volunteers. */
export const APPROVAL_STATEMENT = 'I ran this outside worship and watched what it did in the room. It only does what its name says, and it does not switch relays, house power or SceneStation-controlled lights unexpectedly.';

/** The cue numbers a playback approval covers, in list order. */
export const cueNumbers = (list: CueListConfig) => list.cues.map((c) => c.cue);
const sameCues = (a: string[], b: string[]) => a.length === b.length && a.every((c, i) => Number(c) === Number(b[i]));

/** True when the list's playback approval still covers exactly the cues it has now. */
export const playbackApproved = (list: CueListConfig | undefined) =>
  !!list?.playbackApproval && list.cues.length > 0 && sameCues(list.playbackApproval.cues, cueNumbers(list));

/**
 * Why a volunteer may NOT use GO/BACK on `list` (null = allowed). GO fires whatever cue comes
 * next, and Sanctuary Light can't see what a cue does, so this fails safe:
 * - GO/BACK must address that cue list directly. Console keys act on whatever is loaded on
 *   the master playback, which Sanctuary Light can't identify.
 * - An operator must have reviewed and approved the whole list, and its cue numbers must not
 *   have changed since.
 * - If the console has reported this list and its cue numbers differ, the show in Eos isn't
 *   the one that was reviewed.
 */
export function volunteerPlaybackBlock(cfg: AppConfig, list: number, method: 'cue-list' | 'keys', consoleCues: string[] | null): string | null {
  if (method !== 'cue-list') return 'On this Eos version GO/BACK are console keys that act on whatever is on the master playback, and Sanctuary Light can\'t tell which cue list that is. GO/BACK are operator-only.';
  const cl = cfg.cueLists.find((l) => l.list === list);
  if (!cl || !cl.cues.length) return `Cue list ${list} hasn't been imported, so nobody has reviewed its cues. GO/BACK are operator-only.`;
  if (!cl.playbackApproval) return `Cue list ${list} hasn't been reviewed and approved for volunteer GO/BACK. Ask the lighting lead.`;
  if (!playbackApproved(cl)) return `Cue list ${list} has changed since it was approved for volunteers. An operator needs to review it again.`;
  if (consoleCues && !sameCues(consoleCues, cueNumbers(cl))) return `Eos reports different cues in list ${list} than the reviewed list. GO/BACK are operator-only until it's reviewed again.`;
  return null;
}

/** Cue lists saved through settings keep their approval only while the cue numbers are unchanged. */
export function normalizeCueListApprovals(prev: CueListConfig[], next: CueListConfig[]): { cueLists: CueListConfig[]; withdrawn: number[] } {
  const before = new Map(prev.map((l) => [l.list, l]));
  const withdrawn: number[] = [];
  const cueLists = next.map((l) => {
    const old = before.get(l.list)?.playbackApproval ?? null;
    if (!old) return { ...l, playbackApproval: null };
    if (!sameCues(old.cues, cueNumbers(l))) { withdrawn.push(l.list); return { ...l, playbackApproval: null }; }
    return { ...l, playbackApproval: old };
  });
  return { cueLists, withdrawn };
}

/** Text an operator agrees to when approving a whole cue list for volunteer GO/BACK. */
export const PLAYBACK_APPROVAL_STATEMENT = 'I stepped through every cue in this list outside worship and watched the whole room. None of them switch relays, house power or SceneStation-controlled lights unexpectedly. Sanctuary Light can\'t see what a cue does, so this approval is my review, not a verification.';
