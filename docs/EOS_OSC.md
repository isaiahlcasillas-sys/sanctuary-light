# ETC Eos OSC: what Sanctuary Light uses

Everything here was checked against ETC's own documentation (sources at the bottom). Where ETC doesn't document a version boundary, this file says so instead of guessing. **Find the exact Eos version on the Ion before connecting:** use *Browser → Help → About*, or run the Ion Setup Wizard.

> Correction from v0.1: the first release defaulted to **TCP 3037 / SLIP for "Eos 2.x"**. That was wrong. Port 3037 ("Third Party OSC") only exists from **Eos 3.1.0**. On an Ion running 2.x, connect to **TCP 3032**. The app now refuses 3037 on versions older than 3.1.0, and migrates old configs automatically.

## Connection options by Eos version

| Eos version | Recommended | Port details |
|---|---|---|
| **1.x** | UDP | OSC over TCP and the `/eos/get` API are not documented for 1.x. |
| **2.0 – 2.8** | TCP **3032** | One TCP port, 3032. Its framing is set in **ECU (Shell) → Settings → Network → Interface Protocols → OSC TCP mode**: OSC 1.0 (packet-length, **default**) or OSC 1.1 (SLIP). Match it in Sanctuary Light. |
| **2.9.x** | TCP **3032** | Same as above, and you can also add extra OSC TCP ports, each set to 1.0 or 1.1 framing. **Ion Classic on Windows XP can't go past 2.9.x.** |
| **3.0.x** | TCP **3032** | No port 3037 yet. |
| **3.1.0 – 3.2.12.1** | TCP **3037** (SLIP) | **Third Party OSC** on TCP 3037: OSC 1.1 / SLIP only. It's toggled in **ECU (Shell) → Settings → Network**. From 3.2.0 the 3032 framing is set in **Setup → System → Show Control → OSC**. |
| **3.3.0+** | TCP **3037** (SLIP) | The Third Party OSC toggle moves to **Setup → Device Settings → Network → Interface Protocols** and is enabled by default. The 3.3.10 manual lists TCP ports: 3032 (general, enabled in Show Control), 3036 (reserved for aRFR/iRFR), 3037 (general third-party, always enabled), and 3038 (detailed third-party integration; includes show-control traffic; **3.3.9+**). |

Requirements on every version:

* **OSC RX and OSC TX** must be on: *Setup → System → Show Control → OSC* on 3.x, or *{String RX}/{String TX}* in *Setup → Show → Show Control* in the 2.x guide. TCP also needs these.
* **UDP** additionally needs `{UDP Strings & OSC}` enabled for the network interface. The console's *OSC UDP TX IP address* must point at this computer, because otherwise no feedback arrives. ETC suggests ports 8000/8001 or 4703–4727.
* With TCP, replies come back on the same connection, so no TX address is needed.

These rules live in `shared/src/eosVersion.ts` (`eosCapabilities`, `recommendConnection`, `checkConnectionCompat`). Settings validation, the setup wizard and the connection engine all use them. Impossible combinations are refused: 3037 before 3.1.0, 3037 without SLIP, 3038 before 3.3.9, extra ports before 2.9.0, the reserved 3036, and TCP on 1.x.

## GO / BACK

| Method | Addresses | Acts on | When used |
|---|---|---|---|
| **Cue list** | `/eos/cues/<list>/fire` (GO), `/eos/cues/<list>/stop` (Stop/Back: "stops an active fade … or goes back a cue if not fading") | The configured cue list, regardless of what's on the master fader | *Automatic* on Eos **3.3+**, where the OSC Dictionary documents it. You can force it on 3.0–3.2 after testing. It is refused on 2.x. |
| **Keys** | `/eos/key/go_0` and `/eos/key/stopback` (press 1.0, then release 0.0) | Whatever cue list is loaded on the console's master playback | *Automatic* on Eos 2.x–3.2, or when chosen. |

* `/eos/cues/...` is **not** in the 2017 Show Control guide (Eos 2.x era). ETC's current release notes don't say which 3.x release added it. The app therefore treats 3.0–3.2 as *unconfirmed*: it defaults to keys there, with a warning if you force cue-list mode.
* If the console reports a different version than the one configured (`/eos/out/get/version`), *Automatic* uses the more conservative of the two and a banner asks you to fix the setting.
* The v0.1 BACK key default `stop` was wrong. ETC's key list has `stop` (STOP), separate from `stopback` (PLAYBACK_STOP_BACK). It's now `stopback`, and old configs are migrated.
* The UI shows which method is active. With keys it shows a **"GO = master playback"** badge, so nobody assumes the button targets list 1.

## Commands sent

| Address | Used for | Notes |
|---|---|---|
| `/eos/newcmd "<text> #"` | Intensity (`Chan 20 Thru 29 At 75 #`, `Group 3 At Full #`), selection, presets (`Group 2 Preset 5 #`), release (`Chan 21 Sneak #`), snapshots | Clears the OSC user's command line, then types the text. `#` = Enter. |
| `/eos/cue/<list>/<cue>/fire` | Fire a specific cue | The list is always explicit. |
| `/eos/cues/<list>/fire`, `/eos/cues/<list>/stop` | GO / BACK (cue-list method) | See above. |
| `/eos/key/go_0`, `/eos/key/stopback` | GO / BACK (keys method) | Key names can be edited in Settings. |
| `/eos/sub/<n> <float 0–1>` | Submaster level | |
| `/eos/macro/<n>/fire` | Looks mapped to macros | **Operator-only**: a macro can do anything. |
| `/eos/param/<name> <float>` | Color, CCT, pan/tilt, zoom, edge on the selected channels | **verify**: names must match the Eos fixture library. |
| `/eos/ping` | Heartbeat every 3 s | Read-only |
| `/eos/get/version`, `/eos/subscribe 1` | On connect (Eos 2.x+) | Read-only |
| `/eos/get/group/<n>` | Group verification (below) | Read-only |
| `/eos/get/patch/...`, `/eos/get/cuelist/...`, `/eos/get/cue/<list>/...` | *Read patch & cues* | Read-only, sent at about 200 messages/s |

`/eos/user/<n>/` is prefixed **only** to user-scoped addresses: the command line (`newcmd`), `param` and `key`. Cue, cues, sub and macro addresses are sent without it, because ETC marks only some addresses as compatible with the `/user` syntax.

Monitor mode can transmit only `/eos/ping`, `/eos/get/*` and `/eos/subscribe`. The transmit layer enforces this as well as the controller.

## Feedback parsed

| Address | Shown as |
|---|---|
| `/eos/out/ping` | Connection alive, last-reply time |
| `/eos/out/get/version` | Eos version, compared against the configured one |
| `/eos/out/show/name` | Show name. A change resets group verification. |
| `/eos/out/active/cue/text`, `/eos/out/pending/cue/text`, `/eos/out/previous/cue/text` | Cue cards. Text is `"<list>/<cue> <label> <duration>"`, sometimes with a trailing `"<n>%"`. Both forms are parsed. |
| `/eos/out/active/cue/<list>/<cue> <0–1>` | Fade progress |
| `/eos/out/pending/cue/<list>/<cue>[/<part>]`, `/eos/out/previous/cue/...` | Next and previous cue numbers, even without text |
| `/eos/out/notify/<target>/...` | Group or patch changed on the console, so groups are re-read |
| `/eos/out/get/group/<n>/list/...`, `/eos/out/get/group/<n>/channels/list/...` | Group label and channel list. Ranges arrive as `"x-y"` strings and decimal channels (parts) as strings. Lists may span several packets (OSC List Convention). |
| `/eos/out/get/patch/...`, `/eos/out/get/cue/...`, `/eos/out/get/cuelist/...` | Sync results for review. Only the first packet of each list reply (arg index 0) is read as a record. |

**Not available:** per-channel output levels and submaster positions. The UI labels these "Commanded / not confirmed".

## Group and relay safety

Local group membership is **not** treated as proof of what the real Eos group contains. Someone may edit Group 3 on the Ion, and if the app then sent "Group 3 At Full", that could switch relays. The rules:

1. **"Group N" is only sent when it has been verified.** On connect, after any `/eos/out/notify/group|patch`, after a show change, and when you press *Verify groups*, the app reads each referenced group with `/eos/get/group/<n>`. It waits for the multi-packet reply to settle, then compares:
   * console membership **identical** to the local list, with **no protected channel** → `verified`, and "Group N" is used;
   * console group contains a protected channel → `protected`. "Group N" is never sent, and the app falls back to the explicit local channel list;
   * any difference, including unreadable entries such as channel parts → `mismatch`, and the explicit list is used;
   * no reply, Eos 1.x, offline, or still reading → `unverified`, and the explicit list is used.
2. **The fallback is always the explicit local channel list** (`Chan 1 Thru 19 + 30 + 79 + 80`). Each channel in it is in the local patch and has passed the protected-channel check, and a `Thru` run only spans channels that are all locally patched.
3. **Groups that list channels missing from the local patch are refused**, not silently trimmed.
4. **Preset looks** apply to "Group N", so they are **blocked in Monitor and Live** unless that group is verified.
5. **Relays and utility channels** stay locked behind a timed unlock, in every mode.
6. **Limits:** cues, macros and submasters are opaque. Their contents belong to the show file and can't be checked from here. Macro looks are therefore operator-only. Commission relays on the Ion itself, and keep relay channels out of cues and submasters that volunteers can trigger.

You can see each group's state in *Settings → Groups* (the Console column), in the fixture panel (`Eos Group 3 ✓` or `Group 3 unverified → channels`), and in the setup wizard.

## Sources

* ETC Support: [TCP port for OSC communication with Eos Software](https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/TCP_port_for_OSC_communication_with_Eos_Software). Covers 3032, extra ports from 2.9.0, 3037 from 3.1.0, and toggle locations by version.
* Eos Family v3.3.10 User Manual (online help): *Eos OSC Setup*, *Setup → Device Settings → Network*, *OSC Dictionary* (`/eos/cues/<index>/fire|stop`, key list, `/eos/get/group`, output formats), *Eos OSC Conventions* (numbers and ranges, `/user`, fire vs go), *OSC Get*. <https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/>
* Eos Family Show Control User Guide, Rev C (2017-02, Eos 2.x era): TCP 3032 with the ECU OSC TCP mode (default OSC 1.0), key names `go_0` and `stopback`, `/eos/cue/<list>/<cue>/fire`, `/eos/user/<n>`.
* ETC: [Which Software](https://etcconnect.com/Products/Consoles/Eos-Consoles/Which-Software.aspx). Ion Classic on Windows XP is limited to 2.9.x.
* Eos release notes 3.3.9: "Port 3038 is now available for third-party app integration."
