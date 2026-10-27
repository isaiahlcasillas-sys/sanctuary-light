/**
 * JSON-file persistence for layouts, patch, looks and preferences.
 * Nothing here ever talks to the console: saving a layout cannot change the Eos show file.
 * Every save keeps a timestamped backup (last 50) under data/backups.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '@sanctuary/shared';
import { defaultConfig, GENERIC_PROFILE } from './defaults';
import { validateSection, type SectionKey } from './validate';

/**
 * Bring an older config file up to date. Fills new sections/keys from defaults and
 * corrects settings that earlier versions of this app defaulted to incorrectly.
 */
export function migrateConfig(raw: Partial<AppConfig>, defaults: AppConfig): { config: AppConfig; notes: string[] } {
  const notes: string[] = [];
  const conn = { ...defaults.settings.connection, ...raw.settings?.connection };
  // v0.1 stored coarse guesses ("2.x") that were never read from the console.
  if (['1.x', '2.x', '3.x'].includes(conn.eosVersion)) {
    notes.push(`Eos version "${conn.eosVersion}" was a placeholder, not read from the console. It has been cleared — run the Eos Setup Wizard.`);
    conn.eosVersion = '';
  }
  // v0.1 defaulted to TCP 3037, which only exists on Eos 3.1+.
  if (conn.transport === 'tcp-1.1' && conn.tcpPort === 3037 && !raw.settings?.commissioning) {
    notes.push('Connection reset from TCP 3037 (Eos 3.1+ only) to TCP 3032 / OSC 1.0 until the Eos version is confirmed.');
    conn.transport = 'tcp-1.0';
    conn.tcpPort = 3032;
  }
  // v0.1 defaulted BACK to the "stop" key; ETC's Stop/Back key is "stopback".
  if (conn.backKey === 'stop') {
    notes.push('BACK key changed from "stop" to "stopback" (ETC key PLAYBACK_STOP_BACK).');
    conn.backKey = 'stopback';
  }
  const config = {
    ...defaults,
    ...raw,
    settings: {
      ...defaults.settings,
      ...raw.settings,
      connection: conn,
      safety: { ...defaults.settings.safety, ...raw.settings?.safety },
      commissioning: { ...defaults.settings.commissioning, ...raw.settings?.commissioning },
    },
  } as AppConfig;
  if (!config.profiles.some((p) => p.id === 'generic')) config.profiles.unshift(GENERIC_PROFILE);
  return { config, notes };
}

const dailyName = (d: Date) => `daily-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;

export class ConfigStore {
  private config: AppConfig;
  private file: string;
  private backupDir: string;

  constructor(private dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, 'config.json');
    this.backupDir = path.join(dataDir, 'backups');
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.config = this.load();
  }

  private load(): AppConfig {
    const defaults = defaultConfig();
    if (!fs.existsSync(this.file)) {
      this.writeFile(defaults);
      return defaults;
    }
    const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<AppConfig>;
    const { config, notes } = migrateConfig(raw, defaults);
    this.migrationNotes = notes;
    if (notes.length) {
      this.backup();
      this.writeFile(config);
    }
    return config;
  }

  /** Human-readable notes about changes made while loading an older config file. */
  migrationNotes: string[] = [];

  get(): AppConfig { return this.config; }

  /** `backup: false` is for small automatic records (e.g. test results) so they can't push real backups out. */
  update<K extends SectionKey>(key: K, value: AppConfig[K], opts: { backup?: boolean } = {}): AppConfig {
    const err = validateSection(key, value, this.config);
    if (err) throw new Error(err);
    if (opts.backup !== false) this.backup();
    this.config = { ...this.config, [key]: value };
    this.writeFile(this.config);
    return this.config;
  }

  replaceAll(input: AppConfig): AppConfig {
    // Backups from older versions are upgraded the same way as config files on startup.
    const { config: next, notes } = migrateConfig(input, defaultConfig());
    this.migrationNotes = notes;
    for (const key of Object.keys(next) as SectionKey[]) {
      const err = validateSection(key, next[key], next);
      if (err) throw new Error(`${key}: ${err}`);
    }
    this.backup();
    this.config = next;
    this.writeFile(next);
    return next;
  }

  resetToDefaults(): AppConfig {
    this.backup();
    this.config = defaultConfig();
    this.writeFile(this.config);
    return this.config;
  }

  hasDailySnapshot(now = new Date()): boolean {
    return fs.existsSync(path.join(this.backupDir, dailyName(now)));
  }

  /**
   * Once per calendar day, keep a copy of the configuration (daily-YYYY-MM-DD.json),
   * retaining the last `keepDays`. Independent of the per-save backups, so a busy
   * editing session can never push out last week's known-good copy.
   */
  dailySnapshot(now = new Date(), keepDays = 30): string | null {
    const name = dailyName(now);
    const target = path.join(this.backupDir, name);
    let created: string | null = null;
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, JSON.stringify(this.config, null, 2));
      created = name;
    }
    const daily = fs.readdirSync(this.backupDir).filter((f) => /^daily-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
    for (const old of daily.slice(keepDays)) fs.rmSync(path.join(this.backupDir, old));
    return created;
  }

  listBackups(): string[] {
    return fs.readdirSync(this.backupDir).filter((f) => f.endsWith('.json')).sort().reverse();
  }

  private backup() {
    if (!fs.existsSync(this.file)) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(this.file, path.join(this.backupDir, `config-${stamp}.json`));
    const perSave = this.listBackups().filter((f) => f.startsWith('config-'));
    for (const old of perSave.slice(50)) fs.rmSync(path.join(this.backupDir, old));
  }

  private writeFile(cfg: AppConfig) {
    // Write-then-rename so a crash never leaves a half-written config.
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
    // On Windows, antivirus or the search indexer can hold the file for a moment.
    for (let attempt = 0; ; attempt++) {
      try { fs.renameSync(tmp, this.file); return; } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (attempt >= 10 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw e;
        const until = Date.now() + 50 * (attempt + 1);
        while (Date.now() < until) { /* brief synchronous wait; saves are rare */ }
      }
    }
  }
}
