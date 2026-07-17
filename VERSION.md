# Version

Version: `0.2.0-public-alpha` (local crystallize / iron-age companion)

Status: `public alpha` — surface iron-age companion; advanced systems parked

Target Minecraft: `1.21.11`

Target server: local Paper offline-mode

Target bot: Mineflayer physical player `tj` (configurable)

Target owner: configured via `config.json` (`ownerUsername`)

Target models: local Ollama optional; default dialogue-oriented small model (see `config.example.json`). Commands are code-first and do not require an LLM.

## Required For 1.0

- Bot connects as `tj`.
- Only `ModVinny` can command actions.
- Emergency stop works everywhere practical.
- Status/help commands work.
- Follow/come/stay work.
- Inventory, food, armour, and crafting basics work.
- Home/base/storage basics work.
- Mining, farming, exploration, combat, Nether, planning, and dialogue modules do not crash during basic commands.
- Unsafe or risky features ask for confirmation.
- No paid API required.
- No cloud API required.
- Docs match reality and caveats are documented.

## Not Required For 1.0

- Perfect autonomous Minecraft completion.
- Perfect combat.
- Perfect Nether exploration.
- Perfect animal luring.
- Huge builds.
- Villager trading.
- Enchanting.
- Potions.
- Multi-bot behavior.
- External dashboard.
