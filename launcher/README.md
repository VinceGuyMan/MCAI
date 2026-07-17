# MCAI All-In-One launcher

**One entry point for daily use.**

| File | Role |
|------|------|
| **`../MCAI.cmd`** | Main launcher (interactive menu) |
| **`../MCAI.vbs`** | Same, quieter double-click |
| **`../MCAI-AIO.cmd`** | Alias → `MCAI.cmd` (old name) |
| **`aio-node.mjs`** | Real implementation (Node, no PowerShell) |

Legacy PowerShell / multi-alias starters live in **`../archive/launchers/`**.

## Commands

```bat
MCAI.cmd                   Interactive control panel
MCAI.cmd --start-server    Start Paper only
MCAI.cmd --start-bot       Start bot only (Paper should already be up)
MCAI.cmd --start           Start Paper + bot
MCAI.cmd --server-browser  Start Paper + dashboard web UI + open browser
MCAI.cmd --stop-bot        Stop bot only (leave Paper running)
MCAI.cmd --stop-server     Stop Paper only
MCAI.cmd --stop            Stop bot + Paper + dashboard
MCAI.cmd --status          Print ON/OFF status and exit
```

## Menu

**Start**

1. Setup LLM  
2. **Start Paper server only**  
3. **Start bot only (tj)**  
4. Start All (Paper + bot)  
5. Start server + browser (Paper + dashboard)  

**Browser**

6. Open Setup page  
7. Open Dashboard  

**Stop**

8. **Stop bot only**  
9. **Stop Paper server only**  
S. Stop All  
R. Refresh  
0. Exit  

## Typical flow

1. Menu **2** — start Paper  
2. Join Minecraft  
3. Menu **3** — start tj  
4. When done with the bot: menu **8** (server keeps running)  

Or use **4** for one-shot Paper + bot.

## Logs

- `.runtime/aio-node.log`  
- Windows titled `MCAI-Bot` / `MCAI-Server` / `MCAI-Dashboard`  

## Desktop shortcut (optional)

```powershell
.\launcher\Create-DesktopShortcut.ps1
```

## Requirements

- Node.js LTS  
- Java (for Paper)  
- `paper-<version>-*.jar` in project root  
- Ollama optional (for dialogue mode)  
