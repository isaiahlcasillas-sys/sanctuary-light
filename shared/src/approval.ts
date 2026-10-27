/**
 * Volunteer approval. A look that triggers anything in Eos (cue, preset, sub, macro,
 * snapshot) can do things Sanctuary Light can't see — including house lights that
 * SceneStation also controls. So volunteers can only use it after an operator has reviewed
 * it and approved it. Importing a cue is never treated as approval.
 */
import type { Look, SubmasterConfig } from './model';

export const needsApproval = (look: Look) => look.action.type !== 'none';
export const volunteerCanUseLook = (look: Look) => look.volunteerVisible && (!needsApproval(look) || !!look.approval);
export const volunteerCanUseSub = (sub: SubmasterConfig) => sub.volunteerVisible && (!sub.fromEos || !!sub.approval);

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
