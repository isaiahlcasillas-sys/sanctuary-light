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
 * When looks are saved: an approval belongs to one exact action, so changing the action
 * withdraws it (and hides the look from volunteers until it's approved again).
 */
export function normalizeLookApprovals(prev: Look[], next: Look[]): { looks: Look[]; withdrawn: string[] } {
  const before = new Map(prev.map((l) => [l.id, l]));
  const withdrawn: string[] = [];
  const looks = next.map((l) => {
    const old = before.get(l.id);
    if (l.approval && old && JSON.stringify(old.action) !== JSON.stringify(l.action)) {
      withdrawn.push(l.name);
      return { ...l, approval: null, volunteerVisible: false };
    }
    if (l.approval && !old) return { ...l, approval: l.approval };
    return l;
  });
  return { looks, withdrawn };
}

/** Text an operator agrees to when approving a look or submaster for volunteers. */
export const APPROVAL_STATEMENT = 'I ran this outside worship and watched what it did in the room. It only does what its name says, and it does not switch relays, house power or SceneStation-controlled lights unexpectedly.';
