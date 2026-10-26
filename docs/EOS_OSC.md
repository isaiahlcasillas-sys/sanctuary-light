# ETC Eos OSC: what Sanctuary Light uses

Source: the "Show Control → Open Sound Control (OSC)" chapter of the **ETC Eos Family Operations Manual** for your software version. Download the manual for the exact version on the Ion (*Browser → Help → About* shows it), and check every address below against it. OSC support has grown across releases. The third-party "get/subscribe" API and OSC over TCP are **Eos 2.0+** features.

## Console setup (on the Ion)

1. *Setup → System → Show Control → OSC*: turn on **OSC RX** (receive) and **OSC TX** (transmit).
2. **TCP (recommended, Eos 2.0+):** no extra settings. Sanctuary Light connects to the console:
   * port **3037**: OSC 1.1, SLIP framing (`tcp-1.1`)
   * port **3032**: OSC 1.0, packet-length framing (`tcp-1.0`)
3. **UDP (all versions):** in the Shell / network settings, set *OSC UDP RX Port* (default used here: 8000). Set *OSC UDP TX Port* (8001) and the *OSC UDP TX IP Address* to the control computer. Without the TX address, no feedback arrives.
4. Optional but recommended: give Sanctuary Light its own **user number** (*Settings → Connection → OSC user*). Commands then go to `/eos/user/<n>/...` and never clear or type into the operator's command line.

## Commands sent

| Address | Used for | Notes |
|---|---|---|
| `/eos/newcmd "<text> #"` | Intensity (`Chan 20 Thru 29 At 75 #`, `Group 3 At Full #`), selection, presets (`Group 2 Preset 5 #`), snapshots | Clears the OSC user's command line, then types the text. `#` = Enter. This is the most portable method because it is ordinary Eos syntax. |
| `/eos/cue/<list>/<cue>/fire` | Fire a specific cue | The cue list is always explicit |
| `/eos/sub/<n> <float 0–1>` | Submaster level | |
| `/eos/macro/<n>/fire` | Looks mapped to macros | **verify** |
| `/eos/param/<name> <float>` | Red/Green/Blue/White/Amber/UV/CCT/Pan/Tilt/Zoom/Edge on the selected channels | **verify**. Parameter names must match the fixture library type on the Ion; spaces become `_`. |
| `/eos/key/<name> 1.0` then `0.0` | GO (`go_0`) and BACK (`stop`) | **verify** key names for your version. They are editable in Settings. GO acts on the console's *selected* cue list. |
| `/eos/ping` | Heartbeat every 3 s | Allowed in Monitor mode |
| `/eos/get/version`, `/eos/subscribe 1` | On connect (Eos 2.x+) | Read-only |
| `/eos/get/patch/count`, `/eos/get/patch/index/<i>`, `/eos/get/cuelist/...`, `/eos/get/cue/<list>/...` | "Read patch & cues" | Read-only, Eos 2.x+, rate-limited to about 200 messages/s |

## Feedback parsed

| Address | Shown as |
|---|---|
| `/eos/out/ping` | Connection alive and last-reply time |
| `/eos/out/get/version` | Eos version in the banner |
| `/eos/out/show/name` | Show name in the banner |
| `/eos/out/active/cue/text`, `/eos/out/pending/cue/text`, `/eos/out/previous/cue/text` | Current and next cue cards. Text like `1/45 Sermon 5 100%` is parsed into list/cue/label/percent. Anything unparseable is shown verbatim. |
| `/eos/out/active/cue/<list>/<cue> <0–1>` | Fade progress bar |
| `/eos/out/cmd` | Command line (stored, for diagnostics) |
| `/eos/out/get/patch/<chan>/<part>/list/...`, `/eos/out/get/cue/...`, `/eos/out/get/cuelist/...` | Sync results for review |

Everything else received still appears in *Settings → Traffic Log*.

**Not available:** per-channel output levels and submaster fader positions. The UI marks these "Commanded / not confirmed".

## On-site verification checklist (do this outside service times)

1. Note the Eos version. Choose UDP or TCP in Settings.
2. **MONITOR** → *Test connection*. Expect a reply time. The banner should show the Eos version (2.x+).
3. On the Ion, press GO on a harmless cue. The Current cue card should update with a **CONSOLE** badge.
4. **LIVE** → select one non-critical channel and set it to 50%. Confirm on the Ion's Live display and in the room.
5. Fire a cue from the cue list and check that the same cue runs on the Ion.
6. Move a submaster and confirm it on the Ion.
7. Try GO/BACK and correct the key names in Settings if needed.
8. Try one color change on an LED fixture. Fix the profile's Eos parameter names if needed.
9. Try relay channel 61: it must be **blocked** until you unlock it.
10. Switch back to SIM and check that the Ion output did not change.
11. Record the results here, along with any address that needed changing.
