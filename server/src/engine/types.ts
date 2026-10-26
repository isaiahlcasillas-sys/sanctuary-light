import type { ConnectionState } from '@sanctuary/shared';
import type { OscMessage } from '../osc/codec';
import type { FeedbackEvent } from './eosFeedback';

export interface EngineHooks {
  log(level: 'info' | 'warn' | 'error' | 'tx' | 'rx', message: string): void;
  onFeedback(ev: FeedbackEvent, raw: OscMessage): void;
  onConnectionChange(): void;
  /** The link is open (TCP connected / UDP bound) and the initial queries were sent. */
  onOpen?(): void;
}

export interface EngineConnection {
  state: ConnectionState;
  detail: string;
  target: string | null;
  lastRxAt: number | null;
  lastTxAt: number | null;
}

/**
 * An output engine owns the network path to lighting. Exactly one engine runs at a
 * time; switching modes always stops the old engine before starting the new one, so
 * the Ion path and the future direct-DMX path can never transmit together.
 */
export interface OutputEngine {
  readonly id: 'eos-osc' | 'direct-dmx';
  start(): void;
  /** Stop and release the network. Must never transmit anything (no "all off"). */
  stop(): void;
  connection(): EngineConnection;
}
