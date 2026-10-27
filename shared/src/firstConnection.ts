/**
 * The First Real Connection workflow, step by step. Each step's state is derived from what
 * has actually happened (records written by the app) plus explicit operator confirmations.
 * Nothing here sends anything to the console.
 */
import type { AppConfig } from './model';

export type StepState = 'done' | 'todo' | 'attention';

export interface WorkflowStep {
  id: 'backup' | 'import' | 'inspect' | 'monitor' | 'compare' | 'choose' | 'live';
  title: string;
  state: StepState;
  detail: string;
}

const day = (t: number) => new Date(t).toDateString();

export function firstConnectionSteps(cfg: AppConfig, now = Date.now()): WorkflowStep[] {
  const c = cfg.settings.commissioning;
  const fc = c.firstConnection ?? { showBackedUpAt: null, genuineExportConfirmedAt: null, patchReviewedAt: null, testFixture: null };
  const imported = cfg.eosShow;
  const v = cfg.verification;
  const steps: WorkflowStep[] = [];

  steps.push(fc.showBackedUpAt && day(fc.showBackedUpAt) === day(now)
    ? { id: 'backup', title: 'Back up the Eos show', state: 'done', detail: `Confirmed today at ${new Date(fc.showBackedUpAt).toLocaleTimeString()}.` }
    : { id: 'backup', title: 'Back up the Eos show', state: 'todo', detail: fc.showBackedUpAt ? `Last confirmed ${new Date(fc.showBackedUpAt).toLocaleDateString()}. Back it up again today.` : 'In Eos: File → Save, then File → Save As to a USB stick.' });

  steps.push(!imported
    ? { id: 'import', title: 'Import a genuine export from Eos', state: 'todo', detail: 'Export the loaded show from Eos (File → Export → CSV) and use Import Eos Show.' }
    : !fc.genuineExportConfirmedAt || fc.genuineExportConfirmedAt < imported.importedAt
      ? { id: 'import', title: 'Import a genuine export from Eos', state: 'attention', detail: `"${imported.fileName}" is imported. Confirm it was exported from the sanctuary's Eos (not a sample or test file).` }
      : { id: 'import', title: 'Import a genuine export from Eos', state: 'done', detail: `"${imported.fileName}", confirmed as a genuine export.` });

  steps.push(imported && fc.patchReviewedAt && fc.patchReviewedAt >= imported.importedAt
    ? { id: 'inspect', title: 'Inspect the imported patch', state: 'done', detail: 'Reviewed in Review Fixtures.' }
    : { id: 'inspect', title: 'Inspect the imported patch', state: 'todo', detail: 'Open Review Fixtures, check every flagged item, then mark the review as done.' });

  steps.push(c.monitorTest?.ok
    ? { id: 'monitor', title: 'Connect in Monitor mode (OSC, read-only)', state: 'done', detail: c.monitorTest.detail }
    : { id: 'monitor', title: 'Connect in Monitor mode (OSC, read-only)', state: 'todo', detail: 'Eos Setup Wizard → steps 1–3. Monitor mode can only listen.' });

  if (!v) steps.push({ id: 'compare', title: 'Compare with the console', state: 'todo', detail: 'Show Verification → Read from Eos. Compares the patch, cue lists and groups.' });
  else {
    const problems = v.summary.different + v.summary['missing-in-eos'] + v.summary['extra-in-eos'];
    if (v.simulatedConsole) steps.push({ id: 'compare', title: 'Compare with the console', state: 'attention', detail: 'The last verification was against the FAKE simulator. That is not evidence about the real console. Verify against the sanctuary\'s Eos.' });
    else if (imported && imported.importedAt > v.at) steps.push({ id: 'compare', title: 'Compare with the console', state: 'attention', detail: 'A show was imported after the last verification. Verify again.' });
    else if (problems) steps.push({ id: 'compare', title: 'Compare with the console', state: 'attention', detail: `${problems} difference(s) to review in Show Verification.` });
    else steps.push({ id: 'compare', title: 'Compare with the console', state: 'done', detail: `Matched on ${new Date(v.at).toLocaleString()} (${v.summary.match} checks${v.summary.unknown ? `, ${v.summary.unknown} unknown` : ''}).` });
  }

  const tf = fc.testFixture;
  const tfFixture = tf ? cfg.fixtures.find((f) => f.channel === tf.channel) : undefined;
  steps.push(!tf
    ? { id: 'choose', title: 'Choose one approved, non-critical fixture', state: 'todo', detail: 'Pick one harmless, visible light (not a relay or house light) and record who approved it.' }
    : !tfFixture || tfFixture.protected
      ? { id: 'choose', title: 'Choose one approved, non-critical fixture', state: 'attention', detail: `Channel ${tf.channel} is ${tfFixture ? 'protected' : 'no longer in the patch'}. Choose another.` }
      : { id: 'choose', title: 'Choose one approved, non-critical fixture', state: 'done', detail: `Channel ${tf.channel} (${tfFixture.label}), approved by ${tf.approvedBy}.` });

  const lt = c.liveTest;
  steps.push(lt && tf && lt.channel === tf.channel && lt.operatorConfirmedLight === true && lt.released && lt.at >= tf.at
    ? { id: 'live', title: 'Supervised live test, outside worship', state: 'done', detail: `Channel ${lt.channel} came on and was released on ${new Date(lt.at).toLocaleString()}.` }
    : { id: 'live', title: 'Supervised live test, outside worship', state: 'todo', detail: 'Eos Setup Wizard → Live test, with three people present. Sends exactly one command to the chosen channel.' });
  return steps;
}
