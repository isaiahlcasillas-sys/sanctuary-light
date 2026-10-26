import { Plus, Trash2 } from 'lucide-react';
import { channelExpression, parseChannelList, type FixtureGroup } from '@sanctuary/shared';
import { SaveBar, useSection } from './useSection';
import { useState } from 'react';

export function GroupSettings() {
  const { draft, setDraft, dirty, save, saving, revert } = useSection('groups');
  const [text, setText] = useState<Record<string, string>>({});
  const update = (id: string, patch: Partial<FixtureGroup>) => setDraft(draft.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  return (
    <div>
      <h4>Groups</h4>
      <p className="hint">If a group also exists in the Ion show file, enter its Eos group number so commands use "Group N" instead of listing channels.</p>
      <table className="data-table">
        <thead><tr><th>Name</th><th style={{ width: 60 }}>Color</th><th>Channels</th><th style={{ width: 90 }}>Eos group</th><th style={{ width: 80 }}>Volunteer</th><th style={{ width: 36 }} /></tr></thead>
        <tbody>
          {draft.map((g) => (
            <tr key={g.id}>
              <td><input className="input" value={g.name} aria-label="Group name" onChange={(e) => update(g.id, { name: e.target.value })} /></td>
              <td><input type="color" value={g.color} aria-label="Color" onChange={(e) => update(g.id, { color: e.target.value })} /></td>
              <td><input className="input" aria-label="Channels" value={text[g.id] ?? channelExpression(g.channels)}
                onChange={(e) => setText({ ...text, [g.id]: e.target.value })}
                onBlur={(e) => { update(g.id, { channels: parseChannelList(e.target.value) }); setText({ ...text, [g.id]: undefined as unknown as string }); }} /></td>
              <td><input className="input" type="number" placeholder="—" aria-label="Eos group number" value={g.eosGroup ?? ''} onChange={(e) => update(g.id, { eosGroup: e.target.value ? Number(e.target.value) : null })} /></td>
              <td style={{ textAlign: 'center' }}><input type="checkbox" checked={g.volunteerVisible} aria-label="Visible to volunteers" onChange={(e) => update(g.id, { volunteerVisible: e.target.checked })} /></td>
              <td><button className="btn sm icon ghost" aria-label={`Delete ${g.name}`} onClick={() => setDraft(draft.filter((x) => x.id !== g.id))}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setDraft([...draft, { id: `grp-${Date.now()}`, name: 'New group', color: '#94a3b8', channels: [], eosGroup: null, volunteerVisible: false }])}><Plus size={14} />Add group</button>
      <p className="hint">Channels accept lists like <code>1-19, 30, 79 thru 80</code>.</p>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onRevert={revert} />
    </div>
  );
}
