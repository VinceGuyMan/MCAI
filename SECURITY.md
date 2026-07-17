# Security

## Local-only project

MCAI is designed for a **local offline Paper server** (`online-mode=false`, `127.0.0.1`).

- Do **not** port-forward Minecraft (25565) or the dashboard (8787) to the public internet.
- Change `dashboardToken` and `serverPluginToken` in your private `config.json` if anything else on your LAN can reach the machine.
- Only the configured `ownerUsername` should be able to issue bot actions.

## Reporting issues

If you find a vulnerability (e.g. non-owner command execution, token bypass, path traversal in the dashboard), please open a private security advisory on GitHub when the repo is public, or contact the maintainers without posting exploit details in a public issue.

## What is intentionally not secret

- Example tokens in `config.example.json` (`change-me-local-token`) are placeholders only.
- The bot uses offline auth for a private single-player-style server; it is not hardened for multiplayer public hosting.
