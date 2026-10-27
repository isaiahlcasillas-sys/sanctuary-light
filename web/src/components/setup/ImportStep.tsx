/** Step 1: import the show from Eos, and confirm it really came from the sanctuary's Eos. */
import { ChevronRight, FileUp, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../state/store';
import { UndoImportButton } from '../import/UndoImportButton';
import { StepHeader } from './SanctuarySetup';

export function ImportStep({ onNext }: { onNext(): void }) {
  const config = useApp((s) => s.config)!;
  const show = config.eosShow;
  const fc = config.settings.commissioning.firstConnection;
  const genuine = !!(show && fc?.genuineExportConfirmedAt && fc.genuineExportConfirmedAt >= show.importedAt);
  const confirm = async (done: boolean) => {
    try { await api.post('/api/first-connection', { step: 'genuine', done }); }
    catch (e) { useApp.getState().toast('error', (e as Error).message); }
  };

  return (
    <div>
      <StepHeader title="Import my Eos show" intro="Start from the show that's already in Eos: its patch, groups, cue lists and labels become Sanctuary Light's starting point. It's an offline file import; Eos isn't touched.">
        <button className={`btn ${show ? '' : 'primary'}`} onClick={() => useApp.getState().setImportOpen(true)}><FileUp size={16} />{show ? 'Import again' : 'Import Eos Show'}</button>
      </StepHeader>

      {!show ? (
        <div className="empty-state">
          <FileUp size={40} />
          <h3>No show imported yet</h3>
          <p className="hint">Sanctuary Light is showing its built-in sample fixtures. In Eos choose <strong>File → Export → CSV</strong>, then press <strong>Import Eos Show</strong> and drop the file in.</p>
          <button className="btn primary" onClick={() => useApp.getState().setImportOpen(true)}><FileUp size={16} />Import Eos Show</button>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-tile"><div className="stat-value">{show.counts.channels}</div><div className="stat-label">Channels</div></div>
            <div className="stat-tile"><div className="stat-value">{show.counts.groups}</div><div className="stat-label">Groups</div></div>
            <div className="stat-tile"><div className="stat-value">{show.counts.cueLists}</div><div className="stat-label">Cue lists</div><div className="hint">{show.counts.cues} cues</div></div>
            <div className="stat-tile"><div className="stat-value">{show.counts.palettes}</div><div className="stat-label">Presets & palettes</div></div>
            <div className="stat-tile"><div className="stat-value">{show.counts.subs}</div><div className="stat-label">Submasters</div></div>
          </div>
          <div className="card">
            <strong>{show.fileName}</strong> <span className="hint">· imported {new Date(show.importedAt).toLocaleString()} · {show.format === 'eos-csv' ? 'Eos CSV export' : show.format === 'usitt-ascii' ? 'USITT ASCII' : 'patch spreadsheet'}</span>
            {Object.keys(show.source).length > 0 && <div className="hint">{Object.entries(show.source).map(([k, v]) => `${k.replace(/^\$+/, '')} ${v}`).join(' · ')}</div>}
          </div>
          <div className="card" data-tone={genuine ? 'ok' : 'warn'}>
            <label className="row" style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" checked={genuine} onChange={(e) => void confirm(e.target.checked)} style={{ marginTop: 3 }} />
              <span><strong>This file was exported from our sanctuary's Eos</strong>, from the show that is loaded there today. It isn't a sample, test or old file.
                <span className="hint" style={{ display: 'block' }}>Sanctuary Light's automated tests use sample files. Only a genuine export (and later, Show Verification against the console) tells you anything about your real system.</span></span>
            </label>
          </div>
          <p className="hint"><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> The imported data is Sanctuary Light's own copy. It's kept separate from the show loaded in Eos, which this app never changes. If Eos changes later, Show Verification will tell you.</p>
          <div className="row">
            <UndoImportButton className="btn ghost" fileName={show.fileName} />
            <span className="spacer" />
            <button className="btn primary" onClick={onNext}>Review fixtures<ChevronRight size={16} /></button>
          </div>
        </>
      )}
    </div>
  );
}
