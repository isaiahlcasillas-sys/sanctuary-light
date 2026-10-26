/**
 * Host-computer helpers for the permanent sanctuary Mac. None of this touches lighting.
 */
import { spawn, type ChildProcess } from 'node:child_process';

export type SleepPrevention = 'off' | 'system' | 'display';

/**
 * Keep the Mac awake while the server runs, using macOS's built-in `caffeinate`.
 *   system  = -i  (no idle system sleep; the display may still sleep)
 *   display = -di (keep the display on too — for a dedicated touchscreen)
 * `-w <pid>` ends the assertion automatically if this process dies, so a crash can't
 * leave the Mac permanently awake. No-op on other platforms.
 */
export function preventSleep(mode: SleepPrevention, log: (msg: string) => void, platform = process.platform): ChildProcess | null {
  if (mode === 'off' || platform !== 'darwin') return null;
  const flags = mode === 'display' ? '-di' : '-i';
  try {
    const child = spawn('/usr/bin/caffeinate', [flags, '-w', String(process.pid)], { stdio: 'ignore' });
    child.on('error', (e) => log(`Sleep prevention unavailable: ${e.message}`));
    log(`Sleep prevention on (caffeinate ${flags}).`);
    return child;
  } catch (e) {
    log(`Sleep prevention unavailable: ${(e as Error).message}`);
    return null;
  }
}

export function parseSleepPrevention(value: string | undefined): SleepPrevention {
  return value === 'display' ? 'display' : value === 'system' || value === '1' ? 'system' : 'off';
}
