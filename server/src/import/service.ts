/**
 * Import Eos Show: preview, then apply. Offline and read-only towards the console.
 *
 * Applying only replaces Sanctuary Light's local configuration (after a named backup). It
 * never sends OSC, never changes levels or the operating mode, and is refused while Live
 * control is armed so nothing in use changes underneath an operator.
 */
import crypto from 'node:crypto';
import {
  buildImportPlan, defaultImportOptions,
  type AppConfig, type ImportOptions, type ImportPlan, type OperatingMode, type ParsedShow,
} from '@sanctuary/shared';
import type { ConfigStore } from '../store/configStore';
import { parseShowFile } from './index';

export interface ImportHooks {
  mode(): OperatingMode;
  /** Configuration changed locally. Must not contact the console. */
  configChanged(prev: AppConfig, next: AppConfig): void;
  log(level: 'info' | 'warn', message: string): void;
}

export interface ApplyResult {
  ok: boolean;
  error?: string;
  backup?: string;
  changes?: ImportPlan['changes'];
  unplaced?: number[];
}

const PREVIEW_TTL_MS = 60 * 60 * 1000;

function sanitizeOptions(raw: unknown, show: ParsedShow, cfg: AppConfig): ImportOptions {
  const d = defaultImportOptions(show, cfg);
  const o = (raw ?? {}) as Partial<ImportOptions>;
  const inc = (o.include ?? {}) as Partial<ImportOptions['include']>;
  const bool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt);
  const list = Number(o.looksFromList);
  return {
    mode: o.mode === 'replace' ? 'replace' : 'merge',
    conflicts: o.conflicts === 'keep-local' ? 'keep-local' : 'use-imported',
    include: {
      fixtures: bool(inc.fixtures, d.include.fixtures), groups: bool(inc.groups, d.include.groups),
      cueLists: bool(inc.cueLists, d.include.cueLists), submasters: bool(inc.submasters, d.include.submasters),
      looks: bool(inc.looks, d.include.looks), palettes: bool(inc.palettes, d.include.palettes),
    },
    looksFromList: o.looksFromList === null ? null : show.cueLists.some((l) => l.list === list) ? list : d.looksFromList,
  };
}

export class ShowImportService {
  private previews = new Map<string, { show: ParsedShow; at: number }>();

  constructor(private store: ConfigStore, private hooks: ImportHooks) {}

  /** Read a file and keep the result for a later apply. Changes nothing. */
  preview(bytes: Uint8Array, fileName: string): { token: string; show: ParsedShow } {
    const now = Date.now();
    for (const [k, v] of this.previews) if (now - v.at > PREVIEW_TTL_MS) this.previews.delete(k);
    while (this.previews.size >= 5) this.previews.delete(this.previews.keys().next().value as string);
    const show = parseShowFile(bytes, fileName);
    const token = crypto.randomBytes(12).toString('hex');
    this.previews.set(token, { show, at: now });
    return { token, show };
  }

  /** Put back the configuration from before the last import. Local only, like the import. */
  undoLast(force = false): { ok: boolean; error?: string; changedSince?: boolean; restored?: string } {
    if (this.hooks.mode() === 'eos-live') return { ok: false, error: 'Live control is armed. Switch to SIM or Monitor first.' };
    const prev = this.store.get();
    let r: ReturnType<ConfigStore['undoLastImport']>;
    try { r = this.store.undoLastImport(force); } catch (e) { return { ok: false, error: `Could not restore: ${(e as Error).message}` }; }
    if (r.status === 'none') return { ok: false, error: 'There is no Eos import to undo.' };
    if (r.status === 'changed') return { ok: false, changedSince: true, error: 'Things were changed after the import (for example the stage was arranged). Undoing would also discard those changes to fixtures, groups, looks, cue lists and submasters.' };
    this.hooks.configChanged(prev, this.store.get());
    this.hooks.log('warn', `Eos import undone: fixtures, groups, looks, cue lists and submasters restored from ${r.restored}. Settings were left as they are. Local configuration only; nothing was sent to Eos.`);
    return { ok: true, restored: r.restored };
  }

  apply(token: string, rawOptions: unknown): ApplyResult {
    const entry = this.previews.get(token);
    if (!entry) return { ok: false, error: 'This preview has expired. Choose the file again.' };
    const { show } = entry;
    if (show.format === 'eos-native' || show.format === 'unsupported') return { ok: false, error: 'This file can\'t be imported. Export the show from Eos as CSV or USITT ASCII.' };
    if (this.hooks.mode() === 'eos-live') return { ok: false, error: 'Live control is armed. Switch to SIM or Monitor before importing, so nothing in use changes during operation.' };
    const prev = this.store.get();
    const options = sanitizeOptions(rawOptions, show, prev);
    if (!Object.values(options.include).some(Boolean)) return { ok: false, error: 'Nothing was selected to import.' };
    const plan = buildImportPlan(show, prev, options);
    let backup: string;
    try {
      backup = this.store.applyImport(plan.config);
    } catch (e) {
      return { ok: false, error: `The import could not be saved: ${(e as Error).message}` };
    }
    this.previews.delete(token);
    this.hooks.configChanged(prev, this.store.get());
    const c = plan.changes;
    this.hooks.log('info', `Imported Eos show "${show.fileName}" (${options.mode}): fixtures +${c.fixtures.added}/~${c.fixtures.updated}/-${c.fixtures.removed}, groups +${c.groups.added}/~${c.groups.updated}, cue lists +${c.cueLists.added}/~${c.cueLists.updated}, looks +${c.looks.added}. Local configuration only; previous version saved as ${backup}. Nothing was sent to Eos.`);
    return { ok: true, backup, changes: plan.changes, unplaced: plan.unplaced };
  }
}
