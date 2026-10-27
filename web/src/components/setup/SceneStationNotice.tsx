/**
 * Closing Sanctuary Light doesn't hand the lights back to SceneStation. A SceneStation takes
 * over only when DMX disappears from its line, and Eos keeps transmitting whether or not
 * Sanctuary Light is open. Shown wherever someone might expect otherwise.
 */
import { Building2 } from 'lucide-react';

export const SCENESTATION_NOTICE = 'Closing or disconnecting Sanctuary Light does not hand the lights back to SceneStation. Eos keeps transmitting DMX, and a SceneStation only takes over when DMX stops on its line. To use the wall stations, follow your building\'s normal procedure in Eos.';

export function SceneStationNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className="card" data-tone="warn" role="note" style={compact ? { fontSize: 12.5, margin: '8px 0' } : undefined}>
      <Building2 size={15} style={{ verticalAlign: -3 }} /> <strong>SceneStation:</strong> {SCENESTATION_NOTICE}
    </div>
  );
}
