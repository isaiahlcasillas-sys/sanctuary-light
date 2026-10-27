import type { AppConfig, LevelsSnapshot, Look, LookPreviewEntry } from '@sanctuary/shared';

/**
 * Turn what the stage view currently shows into a look preview, one entry per group.
 * Groups containing protected (relay/utility) channels are never captured.
 * This is local Sanctuary Light data — it is not written to the Eos show file.
 */
export function previewFromStage(config: AppConfig, levels: LevelsSnapshot | null): LookPreviewEntry[] {
  const prot = new Set(config.fixtures.filter((f) => f.protected).map((f) => f.channel));
  return config.groups
    .filter((g) => g.channels.length && !g.channels.some((c) => prot.has(c)))
    .map((g) => {
      const st = levels?.levels[g.channels.find((c) => levels.levels[c]) ?? -1];
      return { groupId: g.id, intensity: st?.intensity ?? 0, ...(st?.color ? { color: st.color } : {}), ...(st?.cct ? { cct: st.cct } : {}) };
    });
}

export function newLocalLook(name: string, preview: LookPreviewEntry[]): Look {
  return {
    id: `look-${Date.now()}`, name, description: 'Local look created from the stage view', icon: 'sparkles',
    gradient: ['#334155', '#94a3b8'], action: { type: 'none' }, preview, volunteerVisible: false,
  };
}

/** Where a look's lighting actually comes from. */
export const isLocalOnly = (l: Look) => l.action.type === 'none';
