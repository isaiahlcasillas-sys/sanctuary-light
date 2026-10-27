/** Group intensity faders (operator inspector and Volunteer Mode). The server decides who may move which group. */
import { useEffect, useState } from 'react';
import { sendCommand, useApp } from '../state/store';
import { Fader } from './ui';

function useLocalValue<T>(remote: T, deps: unknown[]): [T, (v: T) => void] {
  const [v, setV] = useState(remote);
  useEffect(() => { setV(remote); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return [v, setV];
}

export function GroupCards({ volunteerOnly = false }: { volunteerOnly?: boolean }) {
  const config = useApp((s) => s.config);
  const levels = useApp((s) => s.levels);
  const select = useApp((s) => s.select);
  const groups = (config?.groups ?? []).filter((g) => !volunteerOnly || g.volunteerVisible);
  return (
    <div className="group-cards" style={{ width: '100%' }}>
      {groups.map((g) => <GroupCard key={g.id} id={g.id} name={g.name} color={g.color} channels={g.channels}
        level={levels?.levels[g.channels.find((c) => levels.levels[c]) ?? -1]?.intensity ?? 0} onSelect={volunteerOnly ? undefined : () => select(g.channels)} />)}
    </div>
  );
}

function GroupCard({ id, name, color, channels, level, onSelect }: { id: string; name: string; color: string; channels: number[]; level: number; onSelect?(): void }) {
  const [v, setV] = useLocalValue(level, [level]);
  return (
    <div className="group-card">
      <header>
        <span className="dot" style={{ color }} />{name}
        <span className="lvl">{Math.round(v)}%</span>
      </header>
      <Fader label={`${name} intensity`} value={v} onChange={(x) => {
        setV(x);
        void sendCommand({ kind: 'setIntensity', target: { type: 'group', groupId: id }, value: x }).then((r) => { if (!r.ok) setV(level); });
      }} />
      {onSelect && <button className="btn sm ghost" onClick={onSelect} aria-label={`Select ${name} (${channels.length} channels)`}>Select · {channels.length} ch</button>}
    </div>
  );
}
