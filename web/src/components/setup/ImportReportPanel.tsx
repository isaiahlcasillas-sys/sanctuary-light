/**
 * What the last import gave Sanctuary Light: imported, incomplete, needs manual setup, and
 * never imported. Built from the configuration only (shared/src/importReport.ts).
 */
import { CheckCircle2, CircleAlert, CircleSlash, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { importReport, type ReportLine } from '@sanctuary/shared';
import { useApp } from '../../state/store';

function Section({ title, icon, tone, lines, empty }: { title: string; icon: ReactNode; tone?: string; lines: ReportLine[]; empty: string }) {
  return (
    <section className="report-section" data-tone={tone}>
      <h4>{icon} {title}</h4>
      {lines.length === 0 ? <p className="hint">{empty}</p> : (
        <ul>
          {lines.map((l) => <li key={l.label}><strong>{l.label}{l.count != null ? ` (${l.count})` : ''}</strong>: {l.detail}</li>)}
        </ul>
      )}
    </section>
  );
}

export function ImportReportPanel() {
  const config = useApp((s) => s.config)!;
  const r = importReport(config);
  return (
    <div className="import-report" aria-label="Import report">
      <Section title="Imported from the file" icon={<CheckCircle2 size={16} color="var(--ok)" />} lines={r.imported} empty="Nothing imported yet." />
      <Section title="Incomplete or not confirmed" icon={<CircleAlert size={16} color="var(--warn)" />} tone="warn" lines={r.incomplete} empty="Nothing flagged. (This only covers what the file said; compare with Eos to be sure.)" />
      <Section title="Needs setting up here" icon={<Wrench size={16} />} lines={r.manual} empty="" />
      <Section title="Never imported" icon={<CircleSlash size={16} />} lines={r.notImported} empty="" />
    </div>
  );
}
