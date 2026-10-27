# Installing Sanctuary Light on an Apple Silicon Mac

*Beginner-friendly walkthrough. Nothing in this guide connects to the Ion or changes any lights.*

**You'll need:** the sanctuary Mac (Apple Silicon: M1 or newer, macOS 12 or later), an administrator password, an internet connection, and about 45 minutes.

> **Check it's Apple Silicon:** Apple menu → *About This Mac*. "Chip: Apple M…" = Apple Silicon ✅. "Processor: Intel" also works, but our automated tests run on Apple Silicon.

---

## Part A: One-time Mac preparation (15 min)

1. **Create a dedicated booth account** (recommended): *System Settings → Users & Groups → Add User*, a **Standard** account such as "Sanctuary Booth". Sanctuary Light runs under whichever account installs it, so do everything below while logged in as that account.
2. **Install Node.js 22 LTS** (the engine Sanctuary Light runs on):
   * Go to <https://nodejs.org>, download **Node.js 22 LTS → macOS Installer (.pkg)**, and run it.
   * Don't use other installation methods (nvm, Volta, etc.) on the booth Mac; they can break the background service later.
3. **Install Apple's command-line tools** (provides `git`): open **Terminal**, type `xcode-select --install`, press Return, and accept the dialog.
4. **Power and login settings** (these decide what happens after a power cut; see the box below):
   * *System Settings → Energy*: turn on **"Start up automatically after a power failure"** (Mac mini, Mac Studio, iMac). Turn on **"Prevent automatic sleeping when the display is off"**.
   * *System Settings → Users & Groups → Automatically log in as*: the booth account.
   * *System Settings → Lock Screen*: set the screen saver and lock to **Never** for the booth account.
   * *System Settings → General → Software Update → Automatic updates*: turn **off** "Install macOS updates", so a Saturday-night update can't restart the Mac.

> **Login vs. power cut: what actually starts Sanctuary Light**
> * **At login:** the Sanctuary Light background service starts automatically every time the booth account logs in. Installation sets this up.
> * **After a power cut:** the Mac has to turn itself on **and** log in by itself first. That needs both settings in step 4. **FileVault (disk encryption) blocks automatic login**, so with FileVault on, someone has to type the password after every outage, and nothing starts until they do. Decide with whoever manages church IT whether FileVault stays on.
> * In both cases Sanctuary Light starts in **SIM** and sends nothing to the Ion.

## Part B: Install (20 min)

Open **Terminal** and type each line, pressing Return after each:

```bash
cd ~
git clone https://github.com/isaiahlcasillas-sys/sanctuary-light SanctuaryLight
cd SanctuaryLight
./deploy/macos/install.sh
```

* Because the repository is private, `git clone` asks you to sign in to GitHub. Use a GitHub account with access to the repository and a personal access token as the password, or download the ZIP from GitHub and unzip it into your home folder as **SanctuaryLight**.
* **Keep the folder at `~/SanctuaryLight`.** Don't put it on the Desktop or in Documents, Downloads or iCloud Drive: macOS blocks background services from reading those folders, and the installer refuses to continue if you try.
* The installer downloads components, builds the interface, **runs the full test suite** (it stops if any test fails), installs the background service, and creates **Sanctuary Light.app**.
* Options: `./deploy/macos/install.sh --kiosk` makes the launcher open a full-screen Google Chrome window (Chrome must be installed). `--lan` lets iPads or other computers on the network open the app. **Leave it off** unless the lighting network is isolated (see [Sunday readiness](SUNDAY_READINESS.md)).

When it finishes you'll see `Installed. Sanctuary Light starts at login…`.

## Part C: Verify the installation (10 min)

1. In Terminal, run the read-only health check:
   ```bash
   ~/SanctuaryLight/deploy/macos/check-mac.sh
   ```
   It lists ✅ good, ⚠️ review and ❌ fix items for Node, the app folder, the background service, the power-cut settings, PINs, backups and the log. **It changes nothing.** Expect ❌ "default PIN" until Part D.
2. Open **Finder → Go → Home → Applications** and drag **Sanctuary Light** to the Dock.
3. Click it. A browser window opens at `http://127.0.0.1:4700` showing a blue **OFFLINE SIMULATION** banner.
4. **Restart test:** restart the Mac. Without touching anything, Sanctuary Light should be running after login. Click the Dock icon to check. The banner must say **OFFLINE SIMULATION**.
5. **Crash-recovery test (optional):** in Terminal run `pkill -9 -f "server/src/index.ts"`. This simulates a crash; `-9` matters, because a normal quit is deliberately *not* restarted. The browser shows "Lost contact…" and within about 10–15 seconds recovers by itself, still in SIM.

## Part D: First sign-in and PINs (5 min)

1. Click **Sign in** and enter the default operator PIN **1234**.
2. **Settings (⚙) → Safety & Security**: set a new **operator PIN** and a different **volunteer PIN** (4–8 digits). Write them in your secure church records.
3. Run `check-mac.sh` again. The PIN line should now be ✅.

---

## Updating

Only update **outside services**, with Sanctuary Light in **SIM**.

```bash
~/SanctuaryLight/deploy/macos/update.sh
```

It refuses to run if Sanctuary Light is connected to the Ion. It backs up your settings, downloads the update, rebuilds, and reruns all tests. **If anything fails it rolls back to the previous version automatically.** The app then restarts in SIM. Afterwards, run `check-mac.sh`.

## Uninstalling

```bash
~/SanctuaryLight/deploy/macos/uninstall.sh
```

This stops the background service and removes the launcher. Your settings and backups stay in `~/Library/Application Support/Sanctuary Light`. Delete that folder too only if you want a completely fresh start. Nothing is sent to the Ion.

## Backups and restoring

Backups happen automatically:

* every time you save something (the newest 50 are kept);
* once a day (the newest 30 days are kept);
* before every update or manual restore.

They're all in `~/Library/Application Support/Sanctuary Light/backups`.

**Normal restore:** in the app, *Settings → Backup → Restore from file…* and choose a backup. The current settings are backed up first.

**If the app won't open:**
```bash
~/SanctuaryLight/deploy/macos/restore-backup.sh            # lists available backups
~/SanctuaryLight/deploy/macos/restore-backup.sh ~/Library/Application\ Support/Sanctuary\ Light/backups/daily-2026-11-01.json
```

It asks for confirmation, saves the current settings, restores, and restarts in SIM.

**Extra safety:** once a month, use *Settings → Backup → Download backup* and keep the file on the church file server or a USB drive.

> Sanctuary Light backups contain **Sanctuary Light's** settings only: layout, patch copy, looks, labels, audit notes. They never contain or change the Ion show file. Keep backing up the Ion show file on the Ion as you always have.

## Troubleshooting

| Problem | Try this |
|---|---|
| Clicking the icon shows "Sanctuary Light did not start" | Run `check-mac.sh` and fix any ❌. Then look at the end of the log: `tail -50 ~/Library/Logs/Sanctuary\ Light/server.log` |
| `check-mac.sh` says the app folder is in Desktop/Documents | Move the folder to your home folder as `SanctuaryLight` and run `install.sh` again |
| "Node path in service is missing" | Node was removed or reinstalled differently. Reinstall Node 22 from nodejs.org, then rerun `install.sh` |
| "App path in service is missing" | The folder was moved or renamed. Put it back at `~/SanctuaryLight` or rerun `install.sh` from its new location |
| Browser shows "Lost contact with the Sanctuary Light server" | The service is restarting (wait 15 s). If it persists, click the Dock icon again, then check the log |
| Nothing after a power cut | The Mac didn't power on or log in automatically. Check Part A step 4 and FileVault |
| Forgot the operator PIN | Delete only `auth.json` from `~/Library/Application Support/Sanctuary Light`, then restart the service: `launchctl kickstart -k gui/$(id -u)/org.ltumc.sanctuary-light`. PINs return to 1234/0000. Change them immediately. Your other settings are untouched. |
| The Ion isn't responding in MONITOR | See [First-day testing](FIRST_DAY_TESTING.md), step M3 |
| Anything during a service | **Use the Ion.** Sanctuary Light can be ignored or closed at any time without affecting the lights. |

When asking for help, attach the output of `check-mac.sh` and the last 50 lines of the log.
