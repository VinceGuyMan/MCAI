# Public release checklist

The public repository already exists at [VinceGuyMan/MCAI](https://github.com/VinceGuyMan/MCAI). Use this checklist before tagging or publishing a new MCAI release.

## Scope and product claims

- [ ] Choose one version and use it consistently in `VERSION.md`, package metadata, release notes, and artifacts.
- [ ] Describe MCAI as a local, owner-controlled companion and state its public-alpha limitations.
- [ ] Confirm every advertised command in the quickstart against the current command registry.
- [ ] Label parked and experimental domains clearly; do not present archive code as supported.
- [ ] Update `BACKLOG.md` and release notes with user-visible changes and known limitations.

## Clean-checkout verification

- [ ] Test from a fresh clone or release archive, not the maintainer's live server folder.
- [ ] Verify `config.example.json` contains placeholders only and can produce a valid private `config.json`.
- [ ] Install dependencies from `bot/` using the committed lockfile.
- [ ] Verify Java and Paper setup instructions on the supported Windows version.
- [ ] Confirm the user explicitly reviews and accepts the Minecraft EULA before first server start.
- [ ] Start Paper, bot, and dashboard through the documented launcher path.
- [ ] Join with the configured Minecraft version and owner username.

## Quality gates

From `bot/`:

```powershell
npm run check
npm test
npm run doctor
```

- [ ] Run the short in-game smoke list in `TEST_COMMANDS.txt`.
- [ ] Verify emergency stop, come/follow/stay, food, wood, stone, coal, crafting, smelting, and surface iron.
- [ ] Confirm failures are honest and leave no active movement or task behind.
- [ ] Verify dashboard reads and controls require the configured token.
- [ ] Verify Minecraft, dashboard, and optional bridge bind only to loopback in the supported profile.
- [ ] Test graceful server shutdown and confirm the world reloads cleanly.

## Repository and privacy

- [ ] Review `git status` and the complete release diff.
- [ ] Confirm no live `config.json`, `.env`, memory, session log, world, player data, crash log, Paper jar, Java runtime, or `node_modules` is tracked or packaged.
- [ ] Search for real usernames, UUIDs, tokens, API keys, passwords, local absolute paths, and private server details.
- [ ] Check all current documentation links and commands.
- [ ] Keep point-in-time reports under `docs/history/`; current instructions belong in the root quickstart and `docs/guides/`.

## Publish

- [ ] Create release notes with upgrade steps, compatibility, fixes, known limitations, and rollback guidance.
- [ ] Tag the reviewed commit with the chosen version.
- [ ] Build release artifacts from the tagged commit and publish checksums.
- [ ] Verify the downloaded artifact independently before announcing the release.
- [ ] Keep the previous working release available for rollback.
