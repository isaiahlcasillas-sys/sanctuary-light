/** Look icons and how a look's Eos action is described (shared by the library, Volunteer Mode and settings). */
import {
  BookOpen, Church, DoorOpen, Gift, HandHeart, Lamp, Mic, Music, Sparkles, Sun, Sunrise, Wine, type LucideIcon,
} from 'lucide-react';
import type { Look } from '@sanctuary/shared';

export const LOOK_ICONS: Record<string, LucideIcon> = {
  sunrise: Sunrise, church: Church, music: Music, mic: Mic, wine: Wine, hands: HandHeart,
  gift: Gift, sparkles: Sparkles, sun: Sun, lamp: Lamp, door: DoorOpen, book: BookOpen,
};

export function actionLabel(l: Look): string {
  const a = l.action;
  switch (a.type) {
    case 'none': return 'Local look · preview only';
    case 'cue': return `Eos · Cue ${a.list}/${a.cue}`;
    case 'preset': return `Eos · Grp ${a.eosGroup} Preset ${a.preset}`;
    case 'macro': return `Eos · Macro ${a.macro}`;
    case 'sub': return `Eos · Sub ${a.sub} @ ${a.level}%`;
    case 'snapshot': return `Eos · Snapshot ${a.snapshot}`;
  }
}
