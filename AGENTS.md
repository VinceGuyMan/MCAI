# AGENTS.md

## Project identity

MCAI is a local Minecraft companion bot built around:

- A local Paper Minecraft server
- A physical Mineflayer player
- Deterministic commands, action routers, plugins, and macros
- Optional local Ollama models for dialogue, intent classification, and bounded planning hints
- A local-only dashboard and optional experimental Paper bridge

The current product goal is a reliable surface-level companion that can follow the owner and progress through wood, stone, fuel, and iron.

Reliability is more important than adding impressive but unstable capabilities.

## Core engineering principle

MCAI is code-first and LLM-optional.

Physical actions such as movement, digging, gathering, crafting, smelting, eating, storing items, and following the owner must use deterministic code paths.

Do not make essential gameplay behavior depend on:

- An LLM returning valid JSON
- An LLM generating executable code
- A remote cloud service
- Unstructured natural-language reasoning
- A model being installed or available
- An unreliable broad-autonomy loop

Ollama may help with dialogue, intent recognition, explanations, or bounded planning hints. It must not replace the deterministic action layer.

## Supported environment

Primary environment:

- Windows host
- Node.js 20 or newer
- Java 21 or newer for Paper
- Paper 1.21.x
- Local offline Minecraft server
- Optional local Ollama installation

Linux and macOS may run the bot and Paper manually, but Windows launcher behavior is the primary supported workflow.

Do not introduce a cloud requirement unless the owner explicitly requests it.

## Local-only security boundary

MCAI is designed for a local private environment.

Never casually expose these services publicly:

- Minecraft server port `25565`
- Dashboard port `8787`
- Paper bridge endpoints
- Ollama endpoints
- Local telemetry endpoints

Do not recommend port forwarding as a normal setup step.

Preserve:

- Owner-only command enforcement
- Dashboard and bridge token checks
- Loopback or local-network restrictions
- Safe handling of server and player information
- Explicit authentication and authorization checks

A successful local test is not proof that a service is safe for public hosting.

## Architecture priorities

Use the repository's current tier model when deciding what to modify.

### Tier 0: protect first

These systems must stay simple and dependable:

- Boot, configuration, and logging
- Mineflayer plugin loading
- Plugin status and wrapper behavior
- `thinCore`
- Chat routing and command registration
- Cancellation and emergency stop behavior
- Safety gates and confirmation management
- Owner-only controls
- Inventory, food, crafting, storage, armor, and home basics

A regression in Tier 0 is more serious than losing an experimental feature.

### Tier 1: useful survival helpers

Examples include:

- Mining and resource runs
- Farming and animals
- Exploration, waypoints, and map memory
- Dialogue and personality
- Goal and skill status

Changes here must not destabilize Tier 0.

### Tier 2: parked or gated systems

Examples include:

- Broad autonomy
- Curriculum execution
- Progression execution
- Villager systems
- Nether systems
- Blueprint execution
- Experimental combat
- Advanced gear, enchanting, brewing, and potion systems

Do not enable a Tier-2 feature merely because its implementation exists.

Do not change an advanced system's default flag from `false` without explicit authorization and evidence that its behavior is safe and tested.

Preserve the default thin-core policy unless the task specifically requires changing it.

## Important files

Read relevant parts of these files before substantial changes:

- `README.md`
- `ARCHITECTURE.md`
- `MODULE_MAP.md`
- `BACKLOG.md`
- `QUICKSTART_1_0.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `config.example.json`
- `bot/package.json`
- `bot/domains.json`
- `docs/guides/THIN_CORE.md`

Important runtime areas include:

- `bot/bot.js`
- `bot/config.js`
- `bot/configSchema.js`
- `bot/chat.js`
- `bot/commandRegistry.js`
- `bot/naturalCommandRouter.js`
- `bot/thinCore.js`
- `bot/pluginWrappers.js`
- `bot/coreMacros.js`
- `bot/competentCore.js`
- `bot/actionGate.js`
- `bot/safety.js`
- `bot/cancellation.js`
- `bot/actions.js`
- `bot/actions/`
- `bot/systems/`
- `dashboard/`
- `launcher/`
- `bridge/`
- `server-plugin/`

Do not assume a file is unused merely because another module appears to supersede it. Compatibility shims and lazy imports may intentionally preserve old paths.

## Required workflow before editing

Before making changes:

1. Read this file.
2. Check Git status.
3. Do not overwrite, revert, or reformat unrelated work.
4. Inspect the relevant entry points and their callers.
5. Identify the system tier affected by the proposed change.
6. Inspect matching configuration flags and schema.
7. Inspect existing tests and audit scripts for that domain.
8. State any material assumptions.
9. Choose the smallest coherent solution.

For bug fixes, trace the failure through the existing deterministic path before introducing a fallback.

## Change discipline

Make focused changes.

Do not:

- Perform repository-wide rewrites for style reasons
- Mass-move JavaScript modules
- Replace functioning deterministic code with LLM calls
- Enable parked systems while reorganizing files
- Combine unrelated feature work with a bug fix
- Delete compatibility shims without checking every import
- Hide failures behind broad `catch` blocks
- Report partial success as complete success
- Add dependencies when the current stack can reasonably solve the problem

When moving a domain module:

1. Move one domain at a time.
2. Preserve the old import path with a re-export shim when necessary.
3. Update imports deliberately.
4. Run the domain's targeted tests.
5. Run the core checks.
6. Remove a shim only after confirming it is no longer imported.

Prefer splitting large modules by meaningful domain handlers rather than renaming or moving code solely for appearance.

## Gameplay safety

Safety behavior is part of the product, not an obstacle to bypass.

Preserve or improve:

- Emergency stop and cancellation
- Oxygen checks before underwater digging
- Dry-path digging
- Health and hunger checks
- Distance limits
- Timeouts and retry limits
- Tool checks
- Inventory-space checks
- Confirmation requirements
- Owner-only actions
- Protection for named and tamed mobs
- Honest failure reporting
- Return-to-owner or return-home behavior

Do not loosen a safety limit merely to make a test or demo succeed.

A bot that safely refuses an unsafe action is behaving better than a bot that performs it unreliably.

## Configuration rules

`config.example.json` is the shared default configuration.

Private `config.json` files are local user data and must not be committed.

When adding or changing configuration:

- Update the configuration loader
- Update schema validation
- Update `config.example.json`
- Choose a conservative default
- Document the setting
- Add or update tests
- Check compatibility with existing private configurations
- Avoid silently renaming existing settings

Do not place real usernames, tokens, UUIDs, filesystem paths, server addresses, or private model details into shared examples.

Machine-specific paths such as local drive letters must not become required runtime assumptions.

## Persistent data

Treat memory and session files as private, mutable runtime data.

Never commit or expose:

- `config.json`
- `.env` files
- Memory JSON files
- Player UUIDs
- Session logs
- Conversation history
- Learned-command data
- Map memory
- World folders
- Paper server configuration
- Server logs and crash reports
- Paper or Minecraft jars
- `node_modules`
- Dashboard or bridge tokens
- Private server information

Do not change a persistent-data format without considering migration or backwards compatibility.

Tests that use memory must use isolated temporary directories or fixtures rather than the owner's real data.

## Error handling

Errors must be useful and honest.

When an action cannot complete:

- Explain what stopped it
- Preserve cancellation state
- Avoid claiming resources were collected when they were not
- Avoid silently switching to riskier behavior
- Include enough context for debugging without exposing secrets
- Return a structured failure where the surrounding API expects one

Partial success must be labeled as partial success.

Do not swallow exceptions indicating broken plugin state, unsafe navigation, corrupted configuration, or failed persistence.

## Testing requirements

Use the most relevant existing tests and audits.

Baseline core validation:

```bash
cd bot
npm run check
npm test
npm run test:thin-core
npm run test:competent-core
```

Run targeted tests for the changed domain when available, including:

```bash
npm run test:plugins
npm run test:natural-router
npm run test:core-hardening
npm run test:bridge
npm run dashboard:test
```

Use corresponding audit scripts when they provide meaningful coverage.

For gameplay changes, perform or clearly request an in-game smoke test using commands such as:

```text
tj status
tj come here
tj stop
tj get wood
tj craft basic tools
tj progress to iron
```

A unit test does not fully validate Mineflayer pathfinding or real Paper-world behavior.

Do not claim an in-game behavior works unless it was tested in an actual running environment. When that environment is unavailable, state exactly what remains unverified.

## Dashboard changes

The dashboard is local telemetry and safe control functionality.

For dashboard changes:

- Preserve local-only behavior
- Preserve authentication or token checks
- Avoid exposing sensitive configuration or memory
- Keep controls bounded and cancellable
- Include useful disconnected and error states
- Preserve responsiveness and keyboard accessibility
- Do not create a remote administration surface accidentally

## Dependencies

Before adding a dependency:

- Check whether the current stack already provides the required behavior
- Confirm Node.js 20 compatibility
- Review maintenance and security implications
- Explain why the dependency is necessary
- Update the lockfile intentionally
- Verify installation and tests

Do not casually replace established Mineflayer plugins or upgrade several Minecraft-related packages in one change.

Minecraft protocol and plugin updates can create subtle compatibility regressions. Treat them as dedicated changes.

## Documentation

Update documentation during the same task when changing:

- Setup
- Commands
- Configuration
- Architecture
- Module locations
- Feature flags
- Supported behavior
- Security assumptions
- Test procedures

Documentation must distinguish:

- Working behavior
- Best-effort behavior
- Experimental behavior
- Parked behavior
- Planned behavior

Do not describe an imported or partially implemented module as a working feature without evidence.

## Git rules

Do not commit, push, merge, deploy, publish a release, create a tag, or open a pull request unless explicitly requested.

Do not discard unrelated uncommitted changes.

When asked to commit:

- Keep the commit focused
- Use a clear descriptive message
- Do not include runtime files or personal data
- Review the staged diff before committing

## Completion standard

Before calling a task complete:

1. Review the full diff.
2. Confirm no unrelated files changed.
3. Run appropriate syntax checks and tests.
4. Run targeted audits where relevant.
5. Check configuration compatibility.
6. Check for secret or personal-data exposure.
7. Remove debug output and temporary files.
8. Update affected documentation.
9. Identify behavior that still requires in-game verification.

The final response must report:

- What changed
- Why it changed
- Files affected
- Commands run
- Tests and audits passed or failed
- What was not verified
- Remaining risks
- Manual testing steps
- Safe rollback instructions for substantial changes
