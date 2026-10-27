# Implementation roadmap

Estimates assume a part-time volunteer developer plus on-site sessions at church. Each phase ends with its acceptance check. Nothing moves to Sunday use until **Commissioning** passes.

## ✅ Done

* **Phase 1**: visual prototype (stage plan, faders, color, looks, cues, volunteer view).
* **Phase 2**: Eos OSC engine (UDP / TCP 1.0 / TCP 1.1), Monitor and Live modes, feedback, safety rules.
* **Phase 2.5**: version-aware port rules, cue-list GO/BACK, group verification, setup wizard, migration, CI on Linux and Apple Silicon macOS.
* **Phase 4A**: **Visual experience and Look Designer.** A design workspace (large stage, fixture and group browser, context-sensitive inspector, collapsible looks/cues/submasters panel, hideable panels and a full-stage view), a compact top bar, the Look Designer (fixture-by-fixture local looks with only supported parameters, fade time, collections, thumbnails, edit/duplicate/rename/move/delete), simulated crossfades in Offline Simulation, honest preview markers (conceptual, not photometric; unconfirmed controls marked), and a new Volunteer Mode (now/next, GO/BACK only when authorised, approved looks and room lights). Live behaviour unchanged; looks are never recorded into Eos.
* **Phase 3.5**: **Installation and first sanctuary test.** First-launch welcome (always Offline Simulation), the import report (imported / incomplete / manual / never imported), Replace recommended for the first real import, a guided same-PC Monitor connection inside Verify with Eos, the SceneStation notice, installer pre-checks and plain-language errors, double-click health check and uninstall, a Windows CI install → uninstall run that leaves other programs alone, and a test-suite guard so tests can never reach Eos's ports on the sanctuary PC. Docs no longer suggest closing Eos, restarting the PC or unplugging anything before the SceneStation audit. Not yet run on the real system.
* **Phase 3.4**: **Sanctuary Setup.** A guided workflow covering review fixtures (by Eos type and controls, with flags for anything unverified), stage arranging (placement list, holding area, line-up/align, undo, arrangement files), worship looks with operator approval for volunteers, Show Verification against the console (read-only, complete-read rules, change warnings), and the First Real Connection checklist.
* **Phase 3.3**: **Import Eos Show.** An offline, read-only import of Eos CSV and USITT ASCII exports: patch, fixture types, groups, cue lists and timing, presets and palettes, and subs. It has a preview with conflicts and anything not interpreted, Merge/Replace, automatic backup and one-click undo, profiles built from parameter evidence, looks that fire the real cues, and stage arranging. Native .esf files are recognised and explained, not parsed.
* **Phase 3.2**: Windows 11 is the primary target. Sanctuary Light runs on the sanctuary PC next to ETCnomad and connects over 127.0.0.1. Adds a PowerShell installer, a start-at-sign-in scheduled task with a crash-restarting supervisor, a desktop launcher (Edge app/kiosk window), a read-only `check-windows.ps1`, and CI on `windows-latest` with a crash-recovery smoke test. Mac stays supported.
* **Phase 3**: Mac deployment tooling (LaunchAgent, launcher app, sleep prevention, daily backups, health endpoint, CI smoke test on macOS); Volunteer / Worship / Architectural Status modes; SceneStation research, audit questionnaire and failure analysis; local-vs-Ion look labelling and "Save stage as look".

## Next

| Step | Work | Who / where | Acceptance |
|---|---|---|---|
| **3a. Windows install** | `INSTALL_WINDOWS.md` on the sanctuary PC (next to ETCnomad); power, Windows Update, sign-in options; restart test | Lighting lead, at church | PC restarts into Sanctuary Light in SIM with no Terminal; desktop icon works; `check-windows.ps1` has no [FAIL]; log and daily backup present |
| **3b. System audit** | `SYSTEM_AUDIT.md` sections A–E, recorded in *Architectural audit* | 2–3 people, 2–3 hours, no event | Every station and node has a verified record; E3 result known |
| **3c. Commissioning** | Setup Wizard + `COMMISSIONING.md` on the real Ion | At church, outside services | Monitor test, single-channel test, cue feedback, GO/BACK and group verification recorded |
| **3d. Real configuration** | Import the actual patch, protected channels, Eos group numbers, map looks to real cues, draw the real room | Lighting lead | All looks are either verified Ion looks or clearly local; groups `verified` |
| **3e. Shadow Sunday** | Run Sanctuary Light in **Monitor** during a real service while the Ion operates normally | One service | No surprises in the traffic log; cue feedback correct throughout |
| **3f. First live Sunday** | Live mode with the Ion operator standing by; volunteer runs looks/GO | One service | Every action matches the Ion; fallback plan rehearsed |

## Phase 4: worship and volunteer features (after 3f)

1. Look editor: drag colors and levels onto groups, fade time, thumbnails. Local only.
2. Transition preview in simulation (fade times, crossfades).
3. Run sheets: ordered looks/cues per service type; one big "Next" for volunteers.
4. Volunteer-editable looks with operator approval before they reach Volunteer mode.
5. **Publish local look to Ion** (record or update a cue), guarded: operator only, explicit confirmation showing the exact command text, show-file backup reminder, test on the Ion first. Build only after the Eos record syntax has been verified on our console version.
6. Off-machine config backup (church share).
7. Packaged, signed installer (MSI/MSIX, or Tauri/Electron) if the script-based setup proves too fiddly. A Windows service (running before sign-in) is possible but deferred: Eos itself needs a signed-in desktop session, so starting earlier gains nothing today.

## Phase 5: optional, decision required

* SceneStation IR bridge (`SCENESTATION.md`, option B), only if the audit shows a need.
* Direct DMX engine via the ENTTEC ODE Mk3 (`PHASE5_DIRECT_DMX.md`), only after a universe-ownership plan, and never alongside Ion mode.

## Explicitly not planned

* Controlling SceneStation through undocumented protocols.
* Any automatic switch into Live mode, or any automatic lighting command at startup.
* Treating Sanctuary Light as a replacement for Eos. Eos (ETCnomad on the sanctuary PC) remains the lighting engine; volunteers just don't need to operate it directly.
