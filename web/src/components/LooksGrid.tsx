import { useState } from 'react';
import {
  BookOpen, Church, DoorOpen, Gift, HandHeart, Lamp, Mic, Music, Sparkles, Sun, Sunrise, Wine, type LucideIcon,
} from 'lucide-react';
import type { Look } from '@sanctuary/shared';
import { sendCommand, useApp } from '../state/store';
import { Tip } from './ui';

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

export function LooksGrid({ volunteer = false }: { volunteer?: boolean }) {
  const looks = useApp((s) => s.config?.looks ?? []);
  const [active, setActive] = useState<string | null>(null);
  const visible = looks.filter((l) => !volunteer || l.volunteerVisible);
  return (
    <div className="looks-grid" style={volunteer ? { gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' } : undefined}>
      {visible.map((l) => {
        const Icon = LOOK_ICONS[l.icon] ?? Sparkles;
        return (
          <Tip key={l.id} label={l.action.type === 'none' ? 'Local look: stored only in Sanctuary Light. Firing it changes the on-screen preview — nothing in Eos.' : `Plays show-file data in Eos (${actionLabel(l).replace('Eos · ', '')}) when Live. The preview is an approximation.`}>
            <button className={`look-btn${volunteer ? ' big' : ''}`} data-active={active === l.id}
              style={{ background: `linear-gradient(135deg, ${l.gradient[0]}, ${l.gradient[1]})` }}
              onClick={async () => { const r = await sendCommand({ kind: 'fireLook', lookId: l.id }); if (r.ok) setActive(l.id); }}>
              <Icon className="look-icon" size={volunteer ? 26 : 20} aria-hidden />
              <span className="look-name">{l.name}</span>
              <span className="look-desc">{l.description}</span>
              <span className="look-map" style={l.action.type === 'none' ? { color: '#bfdbfe' } : { color: '#bbf7d0' }}>{actionLabel(l)}</span>
            </button>
          </Tip>
        );
      })}
    </div>
  );
}
