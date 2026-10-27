# Sunday readiness: go / no-go

*Use this before the first time Sanctuary Light is used during worship. Even then, the first Sundays are **supervised**: someone qualified stays in Eos, ready to take over.*

Sanctuary Light checks most of this for you: **Settings → Sunday readiness** shows a ✅ / ⚠️ / ❌ list, and `deploy\windows\check-windows.ps1` (Mac: `deploy/macos/check-mac.sh`) checks the computer itself. Neither changes anything.

## 1. PINs: default PINs replaced

| ☐ | Check | How to verify |
|---|---|---|
| ☐ | Operator PIN is no longer 1234 | *Settings → Sunday readiness*: "Default PINs replaced" ✅. `check-windows.ps1` / `check-mac.sh` also report it. |
| ☐ | Volunteer PIN is no longer 0000, and differs from the operator PIN | Same |
| ☐ | Only trained operators know the operator PIN | The operator PIN can arm LIVE, unlock relays and change settings |
| ☐ | The PINs are written down somewhere secure (church records) | Resetting a forgotten PIN is in [INSTALL_MAC.md](INSTALL_MAC.md) → Troubleshooting |

## 2. Local network security

| ☐ | Check | Why |
|---|---|---|
| ☐ | **Recommended:** "Network exposure: Only browsers on this computer" ✅ | The default. iPads and other computers can't reach the app at all. |
| ☐ | If you installed with `-Lan` / `--lan` (iPads), the sanctuary PC is on an **isolated lighting/production network**: not guest Wi-Fi, not the office network | Sanctuary Light uses plain HTTP on the local network. PINs and commands aren't encrypted, so anyone on the same network could watch traffic or try PINs. Wrong PINs are rate-limited (5 tries a minute). |
| ☐ | Eos and the sanctuary PC aren't reachable from the internet (no port forwarding) | Neither was designed for internet exposure |
| ☐ | Windows Defender Firewall on (the default) | Same-PC use needs no rule. With `-Lan`, add only the rule the installer prints (Private/Domain networks, one TCP port). |
| ☐ | Windows Update **active hours** cover services and rehearsals; updates paused before major services | Prevents surprise restarts (`check-windows.ps1` shows the active hours) |
| ☐ | Volunteers know: **don't close the Eos window** | On the shared PC, closing Eos stops its DMX output |

## 3. Connection recovery

| ☐ | Check | How to verify |
|---|---|---|
| ☐ | **Connection blip:** with Sanctuary Light in MONITOR, outside worship: Eos on this PC → close and reopen Eos (lights may change meanwhile); Eos on another console → unplug the network cable for ~20 s | The yellow STALE / "Not connected" banner appears, then clears by itself. *Settings → Sunday readiness → Connection recovery observed* ✅ |
| ☐ | **Eos silent but still connected:** if Eos stops answering without dropping the connection (e.g. it freezes), Sanctuary Light drops and reconnects by itself after twice the stale time (20 s by default) | Automatic; automated tests cover it. Nothing is sent except read-only queries when reconnecting. |
| ☐ | **App crash:** Task Manager → Details → `node.exe` → End task (Mac: `pkill -9 -f "server/src/index.ts"`) | Back within about 15 s, in **SIM**, not Live. Eos and the lights don't change. |
| ☐ | **PC restart:** restart the sanctuary PC outside worship | Sanctuary Light comes back after sign-in in **SIM**; Eos must be reopened (or starts by itself if you set that up) |
| ☐ | **Power cut:** (only if the building allows a test) | The PC powers on (BIOS setting) and signs in by itself (see [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md) step 8), then Sanctuary Light starts in **SIM** |
| ☐ | **What LIVE does across a network blip** | LIVE stays armed, and **nothing is re-sent** when the connection returns: no commands are queued or replayed. Anything you pressed while disconnected was refused with an error message. |

## 4. Commissioning and configuration

| ☐ | Check | Readiness item |
|---|---|---|
| ☐ | Eos version confirmed, and the console reports the same version | "Eos version confirmed" ✅ |
| ☐ | Monitor test passed | ✅ |
| ☐ | Authorized single-channel live test done, light confirmed, released | ✅ |
| ☐ | Real patch imported; demo fixtures removed; relays protected | ✅ |
| ☐ | Volunteer looks are mapped to real Eos cues (or hidden from volunteers) | ✅ |
| ☐ | Groups verified against Eos, or you accept that the app sends explicit channel lists | *Settings → Groups* "Console" column |
| ☐ | SceneStation / DMX audit completed | ✅ |
| ☐ | Daily backup exists; a downloaded backup is stored off the sanctuary PC | ✅ |

## 5. Go / no-go

**No-go (any one of these):** any ❌ in *Sunday readiness* or `check-windows.ps1`; nobody qualified available in Eos; an unresolved hazard from the SceneStation worksheet; Eos show file not backed up this week.

**First Sunday plan:**
1. **Shadow Sunday:** run a whole service in **MONITOR** only. Compare the app's cue display with Eos. No commands are possible.
2. **Supervised Live Sunday:** arm LIVE before the service. The volunteer uses looks and GO; Eos operator watches and can take over at any time. Afterwards, review *Settings → Traffic Log*.
3. Only after both go smoothly, consider normal use, still with Eos as the fallback.

## 6. During any service, if something goes wrong

1. Eos operator takes over in Eos, exactly as before Sanctuary Light existed.
2. In Sanctuary Light, click **SIM**. This disconnects without sending anything; lights stay as Eos has them.
3. Note the time and what happened. Check *Settings → Traffic Log* after the service.
