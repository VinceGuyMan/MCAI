# MCAI product backlog

MCAI is currently a local, owner-controlled Minecraft companion. Reliability of the surface survival loop takes priority over adding broad autonomy or more gameplay domains.

## Now — make the companion dependable

- Make a clean checkout reach first successful start without hand-editing internal settings.
- Keep come, follow, stay, stop, food, wood, stone, coal, crafting, smelting, and surface iron reliable.
- Improve stuck recovery, water escape, path cancellation, and honest failure reporting.
- Show the active task, elapsed time, progress, and failure reason consistently in chat and the dashboard.
- Protect worlds and memories during shutdown, restart, testing, and upgrade.
- Keep Minecraft, dashboard, and optional bridge local by default.

## Next — improve daily use

- Provide a compact setup flow for owner name, bot name, local model provider, ports, and safety profile.
- Add world and memory backup/restore with clear confirmation.
- Generate a redacted support bundle with versions, health checks, logs, and crash summaries.
- Simplify the dashboard around companion status, safety, inventory, recent commands, and emergency stop.
- Add clean-checkout, Windows launcher, dashboard, and core-companion tests to CI.
- Publish a compatibility matrix for Node.js, Java, Paper, Mineflayer, and Minecraft versions.

## Later — evaluate after the core is measured

- Richer map and waypoint visualization.
- Small, deterministic base utilities and blueprints behind explicit feature flags.
- Gear, enchanting, villager, Nether, and exploration helpers only after live reliability tests.
- Goal editing that cannot bypass owner confirmation or action safety.
- Cross-platform launcher/supervisor support.

## Not currently planned for the supported build

- Publicly hosted dashboard or Minecraft server.
- LLM-generated code execution or block-by-block building.
- Unattended progression, boss completion, or broad autonomous exploration.
- Multi-bot teams.

Parked and experimental modules may remain in the repository for evaluation, but their presence does not make them part of the supported product.
