# Public GitHub release checklist

Use this when you are ready to create the remote repo (local prep already done).

## Local (done or verify)

- [x] Expanded `.gitignore` (worlds, jars, config.json, memory, logs, node_modules)
- [x] `config.example.json` (placeholders only)
- [x] `LICENSE` (MIT)
- [x] `README.md` public-alpha framing
- [x] `CONTRIBUTING.md` / `SECURITY.md`
- [x] Git for Windows installed (winget Git.Git)
- [x] `git init -b main` + first commit `d8569a5` (423 source files)
- [x] Review: `config.json`, jars, worlds, memory, node_modules **not** tracked

## GitHub (when you say go)

1. Install [Git for Windows](https://git-scm.com/download/win) if needed.
2. From `F:\Games\MCAI`:

```bat
git init -b main
git add .
git status
git commit -m "Initial public alpha: local Paper + Mineflayer companion (MCAI)"
```

3. Create empty public repo on GitHub (no README/license if already local).
4. Push:

```bat
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Or with GitHub CLI:

```bat
gh repo create mcai-companion --public --source=. --remote=origin --push
```

## Do not upload

- Live `config.json`, `memory.json`, `session-log.jsonl`
- Paper/Minecraft jars, `libraries/`, `versions/`, `cache/`
- World folders, `ops.json`, player data
- `.runtime/` Java install

## After publish

- Set repo description: "Local Minecraft companion bot (Mineflayer + optional Ollama)"
- Topics: `minecraft`, `mineflayer`, `paper`, `ollama`, `companion-bot`
- Optional: GitHub Discussions for playtest feedback
