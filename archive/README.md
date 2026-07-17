# Archive

Old launchers, one-shot restructure scripts, backups, and **removed meta systems** kept out of the live Player-2 tree.

**Do not run these for normal play.** Use root **`MCAI.cmd`** (or **`MCAI.vbs`**) instead.

## Layout

| Folder | Contents |
|--------|----------|
| `launchers/` | PowerShell AIO, old Start/Stop, duplicate AIO entry points |
| `scripts/restructure/` | One-time extract/wire helpers |
| `bot/` | Pre-restructure backups |
| **`removed-for-player2/`** | Curriculum OS, progression/milestones OS, orphans, old tests/docs — see that folder’s README |

## Why archived

- **One AIO path:** Node launcher only (`launcher/aio-node.mjs`) — avoids Norton false positives on `powershell.exe`.
- **Less clutter:** root no longer has 6+ start/stop aliases.
- **Safety:** restructure scripts are kept for history, not daily use.

## Restore (if you really need PS launcher)

Copy a file back from `archive/launchers/` to the project root or `launcher/`. Prefer fixing the Node AIO instead.
