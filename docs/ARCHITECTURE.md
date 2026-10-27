# Proposed architecture (Phase 3 and beyond)

## Today

```
 Volunteer / operator browser (Edge app window on the sanctuary Windows PC; optional tablets)
        │  HTTP + WebSocket (localhost by default)
        ▼
 Sanctuary Light server (Node; Windows: scheduled task + supervisor; Mac: launchd LaunchAgent)
   ├─ Controller: roles, safety rules, simulation, modes (offline / monitor / live)
   ├─ Group verifier: "Group N" only when the console's list matches exactly
   ├─ Config store: local JSON + per-save and daily backups  (never the Eos show file)
   └─ Eos OSC engine (TCP 3032 or 3037 / UDP)    ← the only path to lighting
        │  127.0.0.1 when Eos runs on the same PC (primary), or the console's IP
        ▼
 ETC Eos: ETCnomad on the same PC, or a console (Ion)
   ── owns patch, cues, submasters, DMX output ──►  Gadget II (USB) / nodes  ──►  wireless DMX / DMX lines  ──►  fixtures
                                                                           ▲
                         SceneStation wall stations (in-line backup or separate lines) ┘
                         Not connected to Sanctuary Light in any way.
```

Invariants that every phase must keep:

1. **Startup is offline.** The operating mode is never persisted, so Live requires an operator, a PIN and explicit arming.
2. **Nothing is sent on stop.** No blackout, no release, whether on disconnect, quit, crash or mode change.
3. **One output engine at a time.** The Ion-OSC engine and any future direct-DMX engine are mutually exclusive.
4. **Protected channels** (relays/utility) require a timed unlock in every mode. "Group N" is never trusted unless verified.
5. **Local data is labelled as local.** Looks, labels, layouts and audit records are Sanctuary Light data. The UI never claims they are on the Ion.
6. **SceneStation is documented, never controlled**, unless a deliberate, tested integration is added (see `SCENESTATION.md`).

## User-facing operating modes

| Mode | Who | Shows | Can change real lights? |
|---|---|---|---|
| **Volunteer** | Volunteer PIN | Large look buttons, GO/BACK on the master cue list, volunteer-approved house/stage groups and submasters, help text | Only through the Ion, and only with Live armed by an operator. Relay and macro looks are blocked. |
| **Design** (was *Worship*) | Operator PIN | Large stage plan; fixture and group browser; inspector for the selected lights (intensity, color, CCT, position, beam, only what each fixture supports); look library with collections and thumbnails; the **Look Designer**; cues; submasters | Inspector controls go through Eos when Live, as before. The Look Designer never sends anything. Every action reports sent / preview / blocked. |
| **Architectural Status** | Anyone (editing needs the operator PIN) | How SceneStation relates to the Ion; audit results; "what happens if…" analysis with its basis (by design / documented / needs audit / hazard); control availability | **No.** This page has no control path. |

These are separate from the **engine mode** in the top bar (SIM / MONITOR / LIVE). For example, Volunteer mode in SIM is a safe training environment.

## Looks: local vs show-file data

| Kind | Stored in | Firing it does | Labelled |
|---|---|---|---|
| **Local look** (`action: none`) | Sanctuary Light `config.json` | Changes the on-screen preview only, even in Live | "Local look · preview only" |
| **Ion look** (cue / preset / macro / sub / snapshot) | Mapping in Sanctuary Light; the lighting itself is in the **Ion show file** | Triggers that show-file object when Live | "Ion · Cue 1/5" etc.; its preview is an approximation |

The **Look Designer** creates and edits **local** looks fixture by fixture (see [LOOK_DESIGNER.md](LOOK_DESIGNER.md)); it works only in Offline Simulation and never sends a command. Volunteers will create looks without Eos syntax (Roadmap Phase 4) via a guarded "publish to Ion" step that records a cue on the console with an explicit confirmation. That step will show exactly which command-line text is sent (e.g. `Cue 1 / 105 Record`), and needs commissioning first. It is **not built**, and nothing today writes to the show file.

## Future components (not built)

| Component | Purpose | Prerequisites |
|---|---|---|
| Look editor (drag colors and levels onto groups, fade times) | Lightkey-style programming | Phase 3b UI work; local only |
| "Publish to Ion" (record or update cue) | Make local looks real | Commissioning complete; documented Eos record syntax tested on the Ion; operator confirmation; show-file backup first |
| Transitions preview (fade times in the simulation) | Rehearse looks offline | Local only |
| Run sheets (per-service ordered looks/cues) | Sunday flow | Local only |
| Off-machine backup | Disaster recovery | Church file share or cloud folder |
| IR bridge to SceneStation (option B) | One-button "building mode" | Audit + hardware + decision |
| Direct DMX engine | Retire the Ion | `PHASE5_DIRECT_DMX.md` decisions |
