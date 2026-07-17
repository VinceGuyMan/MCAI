# MCAI Quickstart

## One launcher

Double-click:

```text
MCAI.cmd
```

(or `MCAI.vbs` for a quieter start)

Then:

1. **Setup LLM** (pick Ollama / LM Studio + model) if first time  
2. **Start All** (Paper + bot)  
3. Open Minecraft Java **1.21.11** → join `127.0.0.1:25565`  
4. Chat as **ModVinny**: `tj help`, `tj come here`, `tj companion mode`

### CLI shortcuts

```bat
MCAI.cmd --start
MCAI.cmd --status
MCAI.cmd --stop
```

### Optional desktop icon

```powershell
.\launcher\Create-DesktopShortcut.ps1
```

## Checks (optional)

```powershell
cd F:\Games\MCAI\bot
npm run doctor
npm test
```

## Notes

- **Single AIO path** = Node (`launcher/aio-node.mjs`). Old PowerShell starters are in `archive/launchers/`.
- Default play feel: **companion mode** (living Player 2 soft-follow + narration).
- Dashboard: `http://127.0.0.1:8787` (token in `config.json`, default `change-me-local-token`).
