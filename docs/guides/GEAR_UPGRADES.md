# Gear Upgrades

The parked gear domain provides deterministic upgrade awareness: gear scoring, enchanting table support, anvil support, potion inventory planning, and honest brewing scaffolding.

This is owner-approved upgrade support, not autonomous optimization. Ollama may help explain recommendations, but it cannot choose or execute raw gear actions.

## Architecture

```text
configured owner chat
-> chat.js / commandRegistry.js
-> gearUpgradeSystem.js / enchanting.js / anvilSystem.js / potionSystem.js / brewing.js
-> gearSafety.js
-> actions.js
-> deterministic Mineflayer APIs
-> progressEvidence.js
```

Gear upgrade modules do not add OpenAI, cloud APIs, or LLM-generated code execution.

## Gear Scoring

`bot/gearScore.js` ranks tools, weapons, and armor using practical survival heuristics:

- material tier
- durability
- useful enchantments
- armor slot fit
- Nether context for gold armor and fire protection

The scoring is intentionally simple. It favors iron over stone, protection on armor, efficiency/fortune on pickaxes, sharpness on swords, and mending/unbreaking as long-term value.

## Enchanting

`bot/enchanting.js` uses Mineflayer's enchantment table API when available:

- `bot.openEnchantmentTable`
- target/lapis placement
- option inspection
- low-level confirmed enchant actions

Enchanting requires owner confirmation before spending XP or lapis. Diamond and netherite gear have extra confirmation gates.

## Anvils

`bot/anvilSystem.js` uses Mineflayer's anvil API when available:

- `bot.openAnvil`
- repair candidates
- combinable gear
- enchanted book tracking
- book application planning
- rename support

Anvil mutation requires confirmation. Rare books and best gear are protected by default.

## Potions

`bot/potionSystem.js` tracks carried potions and recommends useful loadouts.

Useful potion types include:

- fire resistance
- healing
- regeneration
- strength
- swiftness
- night vision
- water breathing
- slow falling

Potion use requires confirmation. Unknown or negative-effect potions are blocked by default.

## Brewing

`bot/brewing.js` is honest status/supply scaffolding for now. Installed Mineflayer exposes enchantment table and anvil helpers, but no reliable high-level brewing stand API was found in this project runtime.

The current gear helpers can:

- find brewing stands
- count brewing ingredients
- explain missing fire resistance/healing/strength/night vision/slow falling supplies

MCAI cannot honestly claim brewed potions unless a future reliable brewing interaction is implemented and verified.

## Safety Rules

The gear safety layer blocks or requires confirmation for:

- non-owner requests
- diamond gear
- netherite gear
- rare enchanted books
- best gear modification
- high XP/lapis spending
- last lapis reserve usage
- potion use
- brewing mutation
- unknown potion effects
- active cancellation or danger

`tj stop` still cancels active gear upgrade work.

## Evidence

Registered evidence includes:

- `gear_status_reported`
- `gear_upgrade_status_reported`
- `enchant_status_reported`
- `enchant_options_reported`
- `item_enchanted`
- `anvil_status_reported`
- `item_repaired`
- `book_applied`
- `potion_status_reported`
- `potion_used`
- `brewing_status_reported`
- `nether_gear_ready`

Status evidence is a report. Mutating evidence like `item_enchanted` or `book_applied` should only count after a real action result or inventory/world-state verification.

## Commands

```text
tj gear status
tj suggest gear upgrades
tj next gear upgrade
tj nether gear readiness
tj enchanting status
tj enchant options
tj enchant held item
tj confirm enchant
tj anvil status
tj repair pickaxe
tj apply book to pickaxe
tj confirm use book
tj potion status
tj recommend potion
tj use fire resistance
tj confirm use potion
tj brewing status
tj can you brew fire resistance?
tj brew fire resistance
tj confirm brewing
```

## Integrations

Skills added:

- `gear_status`
- `suggest_gear_upgrades`
- `enchant_status`
- `enchant_options`
- `anvil_status`
- `potion_status`
- `brewing_status`
- `nether_gear_readiness`

Curriculum readiness tracks added:

- `gear_readiness`
- `mining_gear_readiness`
- `combat_gear_readiness`
- `nether_gear_readiness`
- `enchanting_readiness`
- `potion_readiness`

Progression milestones added include enchanting status, anvil status, potion inventory, first enchanted item, first repaired item, first book applied, and Nether gear readiness.

Dashboard endpoints added if the dashboard is enabled:

- `/api/gear`
- `/api/gear/upgrades`
- `/api/enchanting`
- `/api/anvil`
- `/api/potions`
- `/api/brewing`

## Tests

```powershell
Set-Location .\bot
npm run gear:audit
npm run test:gear
```

Known caveats:

- Enchanting and anvil mutation depend on Mineflayer API behavior on Minecraft 1.21.11.
- Brewing mutation is not implemented yet.
- The system recommends upgrades conservatively.
- No gear upgrade action may spend valuable resources without confirmation from the configured owner.
