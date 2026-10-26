# Implementation roadmap

Estimates assume a part-time volunteer developer plus on-site sessions at church. Each phase ends with its acceptance check. Nothing moves to Sunday use until **Commissioning** passes.

## ✅ Done

* **Phase 1**: visual prototype (stage plan, faders, color, looks, cues, volunteer view).
* **Phase 2**: Eos OSC engine (UDP / TCP 1.0 / TCP 1.1), Monitor and Live modes, feedback, safety rules.
* **Phase 2.5**: version-aware port rules, cue-list GO/BACK, group verification, setup wizard, migration, CI on Linux and Apple Silicon macOS.
* **Phase 3 (this branch)**: Mac deployment tooling (LaunchAgent, launcher app, sleep prevention, daily backups, health endpoint, CI smoke test on macOS); Volunteer / Worship / Architectural Status modes; SceneStation research, audit questionnaire and failure analysis; local-vs-Ion look labelling and "Save stage as look".

## Next

| Step | Work | Who / where | Acceptance |
|---|---|---|---|
| **3a. Mac install** | Run `deploy/macos/install.sh` on the sanctuary Mac; set the macOS options in `MAC_DEPLOYMENT.md`; reboot and power-cut test | Lighting lead, at church | Mac reboots into Sanctuary Light in SIM with no Terminal; launcher works; log and daily backup present |
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
7. Packaged, signed Mac app (Tauri/Electron) if the LaunchAgent setup proves too fiddly.

## Phase 5: optional, decision required

* SceneStation IR bridge (`SCENESTATION.md`, option B), only if the audit shows a need.
* Direct DMX engine via the ENTTEC ODE Mk3 (`PHASE5_DIRECT_DMX.md`), only after a universe-ownership plan, and never alongside Ion mode.

## Explicitly not planned

* Controlling SceneStation through undocumented protocols.
* Any automatic switch into Live mode, or any automatic lighting command at startup.
* Treating the Mac as a replacement for the physical Ion before Phase 5 decisions.
