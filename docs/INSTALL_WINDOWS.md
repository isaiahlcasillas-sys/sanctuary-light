# Install Sanctuary Light on the sanctuary Windows PC

*Step 1 of [Start here](START_HERE.md). About 45 minutes. **Doesn't touch the lights.***

This guide installs Sanctuary Light on the **same Windows 11 PC that runs Eos (ETCnomad)**, so the two run side by side. Sanctuary Light talks to Eos over the PC's internal "loopback" address, `127.0.0.1`. Nothing leaves the computer for that, and no new cables or network settings are needed.

**What this install does NOT change:** the Eos show file, Eos settings, the ETCnomad USB key, the Gadget II, the wireless DMX, the SceneStations, or any light. Sanctuary Light always starts in **SIM** (Offline Simulation), which sends nothing to Eos.

**You'll need:**
- the sanctuary PC, signed in as the Windows user who normally runs Eos;
- an internet connection for this hour only;
- about 2 GB of free disk space.

Do this **outside worship and events**. Eos stays open the whole time; you won't touch it today.

---

## 1. Back up the Eos show file first

In Eos: **File → Save**, then **File → Save As** to a USB stick, and name the copy with today's date. Do this before every testing day. Sanctuary Light never writes to the show file, but backups are cheap.

## 2. Install Node.js (the engine Sanctuary Light runs on)

1. Open **https://nodejs.org** and download **Node.js 22 LTS** → **Windows Installer (.msi), x64**.
2. Run it and accept the defaults. You can **untick** "Automatically install the necessary tools" (Chocolatey/Python); Sanctuary Light doesn't need them.
3. If any installer offers to **restart Windows**, choose **later / no**: don't restart now, because on this PC a restart also closes Eos. Node.js doesn't need one.

*(Alternative for experienced users: open **Terminal** and run `winget install OpenJS.NodeJS.LTS`.)*

## 3. Download Sanctuary Light to `C:\SanctuaryLight`

Choose **one** of these.

**Option A: ZIP download (simplest, no Terminal).**
1. In a browser, sign in to GitHub with the church's account and open **https://github.com/isaiahlcasillas-sys/sanctuary-light**.
2. Press the green **Code** button → **Download ZIP**.
3. Open the downloaded ZIP, drag the folder inside it (`sanctuary-light-main`) to **`C:\`**, and rename it **`SanctuaryLight`**. You should now have `C:\SanctuaryLight\deploy\windows`.
4. Updating later means downloading a new ZIP and installing again; your settings are kept (they live in `%LOCALAPPDATA%`, not in this folder).

**Option B: Git (lets you update with one command later).**
1. Install **Git for Windows** from **https://git-scm.com/download/win** (64-bit, defaults are fine; choose "later" if it ever offers a restart).
2. Press **Start**, type **Terminal**, open it, and paste these two lines (press **Enter** after each):

   ```powershell
   git clone https://github.com/isaiahlcasillas-sys/sanctuary-light C:\SanctuaryLight
   cd C:\SanctuaryLight
   ```

   If GitHub asks you to sign in (private repository), a browser window opens. Sign in with the church's GitHub account.

> **Why `C:\SanctuaryLight`?** Not the Desktop, Documents or OneDrive: OneDrive can lock or move files while the app runs, and the installer refuses OneDrive folders.

## 4. Run the installer

In File Explorer open `C:\SanctuaryLight\deploy\windows` and **double-click `Install Sanctuary Light.cmd`**.

*(Or, in Terminal: `powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1`.)*

It first prints what it **will** and **will not** change (it never stops or changes Eos, the USB key, the show, the Gadget II, wireless DMX or SceneStation; no administrator rights, no restart). Then it takes 3–10 minutes. It:
- checks Windows, Node.js, disk space, the folder location, and that its port (4700) is free;
- downloads the app's parts (`npm ci`), builds the interface, and **runs the full test suite** (all in simulation: nothing is sent to Eos, and the tests are blocked from Eos's ports, so they can't reach the real Eos on this PC);
- creates a **scheduled task** that starts Sanctuary Light hidden whenever this Windows user signs in, and **restarts it within about 10 seconds** if it ever crashes;
- keeps the PC from going to sleep while Sanctuary Light runs;
- puts a **Sanctuary Light** icon on the desktop and in the Start menu.

It finishes with **"Installed and running (mode: offline)"** and a reminder **not to restart the PC**. If it stops with an `ERROR:` line, read the message (it says what to fix) and run it again. It's safe to re-run; Eos keeps running throughout.

**Options** (add to the end of the Terminal command):

| Option | When to use it |
|---|---|
| `-Kiosk` | The desktop icon opens Sanctuary Light **full screen** (exit with Alt+F4). Good for a dedicated touchscreen. |
| `-OpenAtLogin` | Also opens the Sanctuary Light window automatically after sign-in. |
| `-KeepDisplayOn` | Keeps the screen from turning off while Sanctuary Light runs. |
| `-Lan` | Lets tablets on the **lighting network** open it too. Leave this off unless you need it; it also needs a firewall rule (the installer prints the command). |

## 5. Open it and change the PINs

1. Double-click **Sanctuary Light** on the desktop. It opens in its own window (Microsoft Edge "app" mode).
2. Sign in with the operator PIN **1234**, then go to **Settings → Safety & Security** and change **both** PINs (operator and volunteer). Write the new operator PIN somewhere safe in the booth.
3. The top banner says **OFFLINE SIMULATION**. That's correct.

## 6. Leave Eos alone for now

The connection to Eos is set up later, inside the app (**Setup → Verify with Eos**, see [SANCTUARY_SETUP.md](SANCTUARY_SETUP.md)), after you've imported the show. For today, leave Sanctuary Light in **SIM** and don't change anything in Eos.

## 7. Run the health check

In File Explorer open `C:\SanctuaryLight\deploy\windows` and **double-click `Check Sanctuary Light.cmd`**.

It changes nothing. Fix every **[FAIL]**, and decide on each **[WARN]** using the table below.

| Item | What we recommend for the sanctuary PC | Where |
|---|---|---|
| Sleep | **Never** on AC power. (Sanctuary Light also keeps the PC awake while it runs.) | Settings → System → Power → Screen and sleep |
| USB selective suspend | **Disabled**, so Windows never powers down the ETCnomad key or the Gadget II | Control Panel → Power Options → Change plan settings → Change advanced power settings → USB settings |
| Windows Update | Set **active hours** to cover services and rehearsals (e.g. 7:00–22:00). Before Easter, Christmas or big events, **Pause updates** for a week. Turn **off** "Get the latest updates as soon as they're available". | Settings → Windows Update → Advanced options |
| Automatic sign-in | Needed if the PC must recover from a power cut **unattended**: Sanctuary Light starts only after this Windows user signs in. Only do this if the booth PC is physically secured. Use Microsoft's **Sysinternals Autologon** tool, or *netplwiz* if its checkbox is available. | — |
| Power on after a power cut | A BIOS/UEFI setting, often called **"Restore on AC Power Loss → Power On"**. Ask whoever maintains the PC. | BIOS |
| Default PINs | Must be changed (step 6) | Sanctuary Light → Settings |

## 8. Restart test (5 minutes, still in SIM, Eos keeps running)

This restarts **Sanctuary Light only**. Don't restart the PC or sign out: on the shared PC that also closes Eos, which stops its DMX output. A full PC restart test waits until after the SceneStation audit ([SCENESTATION_WORKSHEET.md](SCENESTATION_WORKSHEET.md), part D2).

1. Press **Ctrl+Shift+Esc** (Task Manager) → **Details** → find **node.exe** → **End task**. (Only Sanctuary Light's `node.exe`; Eos isn't a node.exe.)
2. Wait about 15 seconds, then double-click **Sanctuary Light** on the desktop. It should open in **OFFLINE SIMULATION**. It never comes back in Live by itself.
3. Eos and the lights didn't change at any point.

## Checkpoint

- ☐ Show file backed up today
- ☐ Installer finished: "Installed and running (mode: offline)"
- ☐ PINs changed
- ☐ `Check Sanctuary Light.cmd`: no [FAIL] except items you've consciously decided on
- ☐ After ending `node.exe`, Sanctuary Light came back in SIM; Eos and the lights didn't change
- ☐ The PC was **not** restarted

Next: open **Setup** in the app and [import your Eos show](IMPORT_EOS_SHOW.md), so Sanctuary Light uses your real patch, groups and cues ([SANCTUARY_SETUP.md](SANCTUARY_SETUP.md)). The whole day is summarised in [INSTALLATION_READINESS.md](INSTALLATION_READINESS.md).

---

## Everyday reference

| Task | How |
|---|---|
| Open Sanctuary Light | Desktop icon **Sanctuary Light** (or Start menu). In any browser on this PC: `http://127.0.0.1:4700` |
| Quit it completely | You normally don't. Closing the window leaves the server running, ready for next time. To stop the service: Task Scheduler → *Sanctuary Light* → End. **Stopping never changes the lights.** It also doesn't hand the lights back to SceneStation: Eos keeps transmitting DMX, and a wall station only takes over when DMX stops on its line. |
| Health check | Double-click `deploy\windows\Check Sanctuary Light.cmd` (read-only) |
| Update (never during a service) | `powershell -ExecutionPolicy Bypass -File deploy\windows\update.ps1`. It refuses unless the app is in SIM, backs up the settings, stops Sanctuary Light for a few minutes (Eos keeps running), and rolls back automatically if anything fails. |
| Restore a backup | In the app: Settings → Backup. If the app won't start: `deploy\windows\restore-backup.ps1` (with no file name it lists the backups) |
| Uninstall | Double-click `deploy\windows\Uninstall Sanctuary Light.cmd`. It lists what it will remove and asks first; it removes only the background task and icons, keeps your settings (add `-RemoveData` in Terminal to delete them too), and never touches Eos, the USB key, the show, the Gadget II, wireless DMX or SceneStation. Then delete `C:\SanctuaryLight` if you like. |
| Settings, patch, looks, PINs, backups | `%LOCALAPPDATA%\Sanctuary Light` (paste into File Explorer's address bar) |
| Log file | `%LOCALAPPDATA%\Sanctuary Light\logs` (`server.log`, `server-errors.log`, `supervisor.log`) |

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Sanctuary Light did not start" box | Open the log file (above). Then run `check-windows.ps1`. Re-running the installer is safe. Meanwhile, **use Eos directly**. |
| The connection pill says "Eos is not answering on this computer" | Is Eos open? Is OSC turned on in Eos for this port (see the wizard's console steps)? Sanctuary Light keeps retrying by itself. |
| Connected in MONITOR, but no cue feedback | In Eos: OSC TX must be on. Check *Settings → Traffic Log* in Sanctuary Light. |
| Works until Windows restarts for updates | Set active hours (step 7). Check that automatic sign-in is set if nobody signs in after restarts. |
| A Windows Firewall prompt mentions Node.js | It doesn't appear for the normal same-PC setup. It can appear with `-Lan`, or when Eos is on **another** computer and the connection uses UDP. Allow **Private** networks only in those cases; otherwise choose **Cancel**. |
| `running scripts is disabled on this system` | Use the `.cmd` file, or start the command with `powershell -ExecutionPolicy Bypass -File …` as shown. |
