/**
 * Local PIN authentication. Two roles:
 *   volunteer — looks, GO/BACK, volunteer-visible groups and submasters
 *   operator  — everything, including arming live mode and editing configuration
 * PIN hashes live in data/auth.json. Defaults (operator 1234 / volunteer 0000) are
 * flagged in the UI until changed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Role } from '@sanctuary/shared';

interface PinRecord { salt: string; hash: string; isDefault: boolean }
interface AuthFile { operator: PinRecord; volunteer: PinRecord }

const SESSION_MS = 12 * 60 * 60 * 1000;

function hashPin(pin: string, salt = crypto.randomBytes(16).toString('hex')): { salt: string; hash: string } {
  return { salt, hash: crypto.scryptSync(pin, salt, 32).toString('hex') };
}

export class Auth {
  private file: string;
  private data: AuthFile;
  private sessions = new Map<string, { role: Role; expires: number }>();
  private failures: number[] = [];

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'auth.json');
    if (fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } else {
      this.data = {
        operator: { ...hashPin('1234'), isDefault: true },
        volunteer: { ...hashPin('0000'), isDefault: true },
      };
      this.save();
    }
  }

  private save() { fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 }); }

  get defaultPinsInUse() { return this.data.operator.isDefault || this.data.volunteer.isDefault; }

  private matches(pin: string, rec: PinRecord) {
    const { hash } = hashPin(pin, rec.salt);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(rec.hash, 'hex'));
  }

  login(pin: string): { role: Role; token: string } | { error: string } {
    const now = Date.now();
    this.failures = this.failures.filter((t) => now - t < 60_000);
    if (this.failures.length >= 5) return { error: 'Too many attempts. Wait a minute and try again.' };
    const role: Role | null = this.matches(pin, this.data.operator) ? 'operator' : this.matches(pin, this.data.volunteer) ? 'volunteer' : null;
    if (!role) { this.failures.push(now); return { error: 'Incorrect PIN' }; }
    const token = crypto.randomBytes(24).toString('base64url');
    this.sessions.set(token, { role, expires: now + SESSION_MS });
    return { role, token };
  }

  check(token: string | null | undefined): Role | null {
    if (!token) return null;
    const s = this.sessions.get(token);
    if (!s) return null;
    if (s.expires < Date.now()) { this.sessions.delete(token); return null; }
    return s.role;
  }

  logout(token: string | null | undefined) { if (token) this.sessions.delete(token); }

  setPin(role: Role, pin: string) {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4–8 digits');
    const other = role === 'operator' ? this.data.volunteer : this.data.operator;
    if (this.matches(pin, other)) throw new Error('Operator and volunteer PINs must differ');
    this.data[role] = { ...hashPin(pin), isDefault: false };
    this.save();
  }
}
