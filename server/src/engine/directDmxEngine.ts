/**
 * Phase 5 placeholder: direct sACN / Art-Net output via the ENTTEC ODE Mk3.
 *
 * Deliberately NOT implemented. Before this can exist we must decide:
 *   - which universes Sanctuary Light would own vs. the Ion vs. SceneStation/Pathport
 *   - sACN priority strategy (never compete with the Ion on the same universe)
 *   - how the Ion is taken out of the data path (physically or by universe)
 * See docs/PHASE5_DIRECT_DMX.md. Starting this engine always throws.
 */
import type { EngineConnection, OutputEngine } from './types';

export class DirectDmxEngine implements OutputEngine {
  readonly id = 'direct-dmx' as const;
  start(): void {
    throw new Error('Direct DMX output is not implemented (Phase 5). Sanctuary Light will not transmit sACN or Art-Net.');
  }
  stop(): void { /* nothing to release */ }
  connection(): EngineConnection {
    return { state: 'disabled', detail: 'Direct DMX engine not implemented', target: null, lastRxAt: null, lastTxAt: null };
  }
}
