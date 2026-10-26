# Sanctuary Light

A Lightkey-inspired visual lighting controller for **Lake Travis United Methodist Church**. It drives the existing **ETC Ion running Eos** over ETC's documented OSC interface.

```
Web browser  ⇄  Sanctuary Light server (Node, localhost)  ⇄  OSC  ⇄  ETC Ion / Eos  ⇄  existing DMX network
 (React UI)        HTTP + WebSocket, safety rules             UDP/TCP     owns patch, cues, DMX output
```

The Ion stays the lighting engine and the fallback. Sanctuary Light sends it commands such as "Chan 21 Thru 29 At 75" or "fire cue 1/6", using the same syntax an operator types. **In Ion mode it never sends sACN or Art-Net.**

| Volunteer mode | Operator mode |
|---|---|
| ![Volunteer](docs/screenshots/volunteer.png) | ![Operator](docs/screenshots/operator.png) |

> **Status: Phase 1 complete, Phase 2 foundation implemented and tested against a *fake* Eos console.**
> The app has **not** been connected to the real Ion yet. The sample patch, groups, looks and cue labels are placeholders built from the preliminary channel groupings. Nothing in them has been checked against the real show file.

---

## Quick start

Requirements: **Node.js 20.19+** (22 LTS recommended) on the control computer.

```bash
npm install
npm start            # builds the UI and starts the server
```

Open **http://localhost:4700**. The app always starts in **Offline Simulation**.

Default PINs: **operator `1234`**, **volunteer `0000`**. Change them in *Settings → Safety & Security* before any live use. A badge appears until you do.

### Development (hot reload)

```bash
npm run dev          # server on :4700 (auto-restart) + UI on http://localhost:5173
npm test             # 32 unit/integration tests (OSC codec, framing, Eos commands, safety rules, patch import)
npm run typecheck
```

### Trying the full stack without the Ion

```bash
npm run eos-sim      # FAKE Eos console on 127.0.0.1 (TCP 3032/3037, UDP 8000→8001)
```

Then go to *Settings → Connection*, set **Ion IP = 127.0.0.1**, save, and switch to **MONITOR** and then **LIVE**. The fake console prints every OSC message it receives. It shows you exactly what the real Ion would get. It labels itself "FAKE SHOW (not a real console)", so it can't be mistaken for real feedback.

### Configuration

| Item | Where |
|---|---|
| Data (layout, patch, looks, settings) | `data/config.json`. Override with `SANCTUARY_DATA_DIR`. |
| Automatic backups (last 50) | `data/backups/` |
| PIN hashes | `data/auth.json` |
| Port / bind address | `PORT` (default 4700), `HOST`. By default the server binds to localhost only; see *Settings → Safety* to allow tablets on the LAN. |
| Example patch CSV | [`config/example-patch.csv`](config/example-patch.csv) |

---

## Operating modes

The modes are mutually exclusive. Only one output engine can exist at a time (`server/src/engine/`).

| Mode | Network traffic | Lighting commands |
|---|---|---|
| **SIM**: Offline Simulation (startup default) | none | Preview only. Every toast says "Nothing was sent". |
| **MONITOR**: Ion Monitor | OSC connection; only `/eos/ping`, `/eos/get/*` and `/eos/subscribe` are allowed | Blocked, both in the controller and again at the transmit layer |
| **LIVE**: Ion Live Control | OSC commands to the Ion | Sent. Requires an operator PIN and an explicit "Arm" confirmation. |
| **DMX**: Direct sACN/Art-Net | — | **Not implemented** (Phase 5). The button is disabled and the engine refuses to start. |

Every command returns one of `sent`, `simulated`, `blocked` or `error`, and the UI shows it. **No button silently changes only the preview.** For example, a look with no Eos action says *"not mapped — only the on-screen preview changed"*, even in Live mode.

### What is confirmed and what isn't

* **Cue feedback**: the active cue, pending cue and fade progress come from `/eos/out/active|pending/cue/...`. They are shown with a green **CONSOLE** badge.
* **Channel levels are never claimed as confirmed.** Eos OSC does not give third-party apps a stream of every channel's level. Faders show **SIMULATED** (offline) or **COMMANDED** (sent, unconfirmed).
* **Submaster positions** are commanded only. If someone moves a fader on the Ion, this app won't know.
* **Stale feedback:** a heartbeat (`/eos/ping`) runs every 3 s. If no reply arrives for 10 s, a yellow STALE banner appears.

## Safety design

* The app starts offline, and live mode is never restored automatically after a restart.
* **Nothing is sent** when you disconnect, change mode, lose the network or close the app. There is no blackout and no "release". The Ion keeps its state.
* **Protected channels**: relays and utility (61–70 by default) are refused until an operator unlocks them. The unlock is time-limited (5 min), and it applies in every mode. Protected submasters work the same way.
* Volunteers can only fire volunteer-visible looks, GO/BACK, fire cues, and adjust volunteer-visible groups and submasters.
* Fader updates are rate-limited (10/s by default, latest value wins), so the Ion's command line is never flooded.
* Use a dedicated **OSC user** (*Settings → Connection*). Commands then go to `/eos/user/<n>/...` and never type into the operator's command line on the Ion.
* SceneStation and architectural zones are not in this app's patch. Keep it that way unless the Ion already controls them.
* Saving layouts, patch, looks and cue labels writes local JSON only. **No setting in this app modifies the Ion show file.** Destructive operations (replace patch, restore, reset) ask for confirmation and back up first.
* The WebSocket rejects cross-site origins. Every command is re-authorised against its session token.

---

## Project structure

```
shared/src/        Types shared by server and UI (model, WebSocket protocol, channel-list helpers)
server/src/
  index.ts         Express + WebSocket server, REST API, static UI hosting
  controller.ts    The control backend: roles, safety rules, simulation, mode switching, feedback
  auth.ts          PIN login (scrypt hashes), session tokens
  osc/             OSC 1.0 codec, UDP/TCP links, SLIP + length-prefix framing
  engine/          eosCommands (documented OSC builders), eosFeedback (parser),
                   eosOscEngine (connection/heartbeat/reconnect), directDmxEngine (Phase 5 stub)
  store/           JSON persistence + backups, validation, sample LTUMC config, CSV/JSON patch import/export
server/tools/      fake-eos.ts — development console simulator
server/test/       Vitest suites (includes end-to-end tests against the fake console over TCP)
web/src/           React + TypeScript UI (Radix UI primitives, Zustand, lucide icons)
docs/              EOS_OSC.md (implemented commands + Ion setup), PHASE5_DIRECT_DMX.md
```

## Patch import

*Settings → Patch → Import CSV/JSON* parses the file and shows a preview with warnings. You then choose **Merge** or **Replace**. Columns: `channel` (required; the **Eos channel number, not the DMX address**), `label`, `profile`, `universe`, `address` or `dmx` ("2/101" or absolute 613), `area`, `protected`, `x`, `y`, `rotation`, `notes`. Existing stage positions are kept by channel number.

On Eos 2.0+ you can also use *Settings → Connection → Read patch & cues from console*. It runs read-only `/eos/get/patch` and `/eos/get/cue` queries. The results are shown for review before anything is merged.

## Roadmap

1. **Phase 1, visual prototype** ✅: stage editor, simulated beams, faders, color wheel, CCT, pan/tilt, beam, looks, cues, volunteer mode.
2. **Phase 2, real ETC integration** ✅ *(code complete; awaiting on-site verification)*: OSC over UDP / TCP 1.0 / TCP 1.1, monitor and live modes, cue feedback, connection testing. Next step: run the checklist in [`docs/EOS_OSC.md`](docs/EOS_OSC.md) on the Ion during a non-service time.
3. **Phase 3, real sanctuary configuration**: import the actual Ion patch, set Eos group numbers, map looks to real cues and presets, and draw the real room.
4. **Phase 4, volunteer and worship features**: per-service run sheets, look editing for worship leaders, more volunteer polish.
5. **Phase 5, optional direct DMX**: see [`docs/PHASE5_DIRECT_DMX.md`](docs/PHASE5_DIRECT_DMX.md).
