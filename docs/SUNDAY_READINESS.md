# Sunday readiness: go / no-go

*Use this before the first time Sanctuary Light is used during worship. Even then, the first Sundays are **supervised**: someone qualified stays at the Ion, ready to take over.*

Sanctuary Light checks most of this for you: **Settings → Sunday readiness** shows a ✅ / ⚠️ / ❌ list, and `deploy/macos/check-mac.sh` checks the Mac itself. Neither changes anything.

## 1. PINs: default PINs replaced

| ☐ | Check | How to verify |
|---|---|---|
| ☐ | Operator PIN is no longer 1234 | *Settings → Sunday readiness*: "Default PINs replaced" ✅. `check-mac.sh` also reports it. |
| ☐ | Volunteer PIN is no longer 0000, and differs from the operator PIN | Same |
| ☐ | Only trained operators know the operator PIN | The operator PIN can arm LIVE, unlock relays and change settings |
| ☐ | The PINs are written down somewhere secure (church records) | Resetting a forgotten PIN is in [INSTALL_MAC.md](INSTALL_MAC.md) → Troubleshooting |

## 2. Local network security

| ☐ | Check | Why |
|---|---|---|
| ☐ | **Recommended:** "Network exposure: Only browsers on this Mac" ✅ | The default. iPads and other computers can't reach the app at all. |
| ☐ | If you installed with `--lan` (iPads), the Mac is on an **isolated lighting/production network**: not guest Wi-Fi, not the office network | Sanctuary Light uses plain HTTP on the local network. PINs and commands aren't encrypted, so anyone on the same network could watch traffic or try PINs. Wrong PINs are rate-limited (5 tries a minute). |
| ☐ | The Ion and the Mac aren't reachable from the internet (no port forwarding) | Neither was designed for internet exposure |
| ☐ | macOS Firewall on (*System Settings → Network → Firewall*) | `check-mac.sh` shows its state. If iPads must connect, allow incoming connections for `node`. |
| ☐ | The booth Mac account is a **Standard** user, and macOS updates are manual | Limits damage and prevents surprise restarts |

## 3. Connection recovery

| ☐ | Check | How to verify |
|---|---|---|
| ☐ | **Network blip:** with Sanctuary Light in MONITOR, unplug the Mac's network cable for ~20 s and plug it back in | The yellow STALE / "Not connected" banner appears, then clears by itself. *Settings → Sunday readiness → Connection recovery observed* ✅ |
| ☐ | **Ion silent but still connected:** if the Ion stops answering without dropping the connection (e.g. it freezes), Sanctuary Light drops and reconnects by itself after twice the stale time (20 s by default) | Automatic; automated tests cover it. Nothing is sent except read-only queries when reconnecting. |
| ☐ | **App crash:** `pkill -9 -f "server/src/index.ts"` | Back within about 15 s, in **SIM**, not Live |
| ☐ | **Mac restart:** restart the Mac | Sanctuary Light comes back after login in **SIM** |
| ☐ | **Power cut:** (only if the building allows a test) | The Mac powers on and logs in by itself (see [INSTALL_MAC.md](INSTALL_MAC.md) Part A), then Sanctuary Light starts in **SIM** |
| ☐ | **What LIVE does across a network blip** | LIVE stays armed, and **nothing is re-sent** when the connection returns: no commands are queued or replayed. Anything you pressed while disconnected was refused with an error message. |

## 4. Commissioning and configuration

| ☐ | Check | Readiness item |
|---|---|---|
| ☐ | Eos version confirmed, and the console reports the same version | "Eos version confirmed" ✅ |
| ☐ | Monitor test passed | ✅ |
| ☐ | Authorized single-channel live test done, light confirmed, released | ✅ |
| ☐ | Real patch imported; demo fixtures removed; relays protected | ✅ |
| ☐ | Volunteer looks are mapped to real Ion cues (or hidden from volunteers) | ✅ |
| ☐ | Groups verified against the Ion, or you accept that the app sends explicit channel lists | *Settings → Groups* "Console" column |
| ☐ | SceneStation / DMX audit completed | ✅ |
| ☐ | Daily backup exists; a downloaded backup is stored off the Mac | ✅ |

## 5. Go / no-go

**No-go (any one of these):** any ❌ in *Sunday readiness* or `check-mac.sh`; nobody qualified available at the Ion; an unresolved hazard from the SceneStation worksheet; the Ion show file not backed up this week.

**First Sunday plan:**
1. **Shadow Sunday:** run a whole service in **MONITOR** only. Compare the app's cue display with the Ion. No commands are possible.
2. **Supervised Live Sunday:** arm LIVE before the service. The volunteer uses looks and GO; the Ion operator watches and can take over at any time. Afterwards, review *Settings → Traffic Log*.
3. Only after both go smoothly, consider normal use, still with the Ion as the fallback.

## 6. During any service, if something goes wrong

1. The Ion operator takes over at the Ion, exactly as before Sanctuary Light existed.
2. In Sanctuary Light, click **SIM**. This disconnects without sending anything; lights stay as the Ion has them.
3. Note the time and what happened. Check *Settings → Traffic Log* after the service.
