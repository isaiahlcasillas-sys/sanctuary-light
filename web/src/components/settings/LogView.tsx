import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '@sanctuary/shared';
import { useApp } from '../../state/store';

const LEVELS: LogEntry['level'][] = ['info', 'warn', 'error', 'tx', 'rx'];

export function LogView() {
  const log = useApp((s) => s.log);
  const [on, setOn] = useState<Set<LogEntry['level']>>(new Set(LEVELS));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [log.length]);
  return (
    <div>
      <h4>Traffic log</h4>
      <p className="hint"><span className="log-tx">tx</span> = OSC sent to the console, <span className="log-rx">rx</span> = OSC received. Heartbeat pings are hidden.</p>
      <div className="row" style={{ marginBottom: 8 }}>
        {LEVELS.map((l) => (
          <label key={l} className="row hint"><input type="checkbox" checked={on.has(l)} onChange={(e) => { const n = new Set(on); if (e.target.checked) n.add(l); else n.delete(l); setOn(n); }} />{l}</label>
        ))}
      </div>
      <div className="log-view" ref={ref} role="log">
        {log.filter((e) => on.has(e.level)).map((e) => (
          <div key={e.id} className={`log-${e.level}`}>{new Date(e.at).toLocaleTimeString()} {e.level.padEnd(5)} {e.message}</div>
        ))}
      </div>
    </div>
  );
}
