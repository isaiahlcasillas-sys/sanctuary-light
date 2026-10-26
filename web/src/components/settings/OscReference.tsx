import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface Doc { address: string; purpose: string; minVersion: string; affectsOutput: boolean; verify?: boolean }

export function OscReference() {
  const [docs, setDocs] = useState<Doc[]>([]);
  useEffect(() => { api.get<Doc[]>('/api/eos/commands').then(setDocs).catch(() => {}); }, []);
  return (
    <div>
      <h4>Implemented Eos OSC commands</h4>
      <p className="hint">Sanctuary Light only sends these addresses, from the OSC chapter of the ETC Eos Family manual. Rows marked "verify" are documented but vary by version or console setting — test them on your Ion (in a non-service time) before relying on them. See <code>docs/EOS_OSC.md</code>.</p>
      <table className="data-table">
        <thead><tr><th>Address</th><th>Purpose</th><th>Eos</th><th>Changes lights</th><th /></tr></thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.address}>
              <td><code>{d.address}</code></td><td>{d.purpose}</td><td>{d.minVersion}+</td>
              <td>{d.affectsOutput ? <span className="badge err">yes</span> : <span className="badge confirmed">no</span>}</td>
              <td>{d.verify && <span className="badge warn">verify</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
