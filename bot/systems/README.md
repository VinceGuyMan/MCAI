# `bot/systems` — domain home (migration target)

Files still live as flat `bot/*.js` siblings today. This folder is the **target** layout described in `ARCHITECTURE.md` and `domains.json`.

## Planned folders

| Folder | Tier | Config gate |
|--------|------|-------------|
| `survival/` | 0–1 | always / survival flags |
| `base/` | 1 | base building flags |
| `mining/` | 1 | mining flags |
| `farming/` | 1 | farm flags |
| `exploration/` | 1 | map flags |
| `dialogue/` | 1 | dialogue |
| `planning/` | 1 | goals/skills |
| `learning/` | 1 | idle/learning |
| `combat/` | 2 parked | `experimentalCombatEnabled` |
| `curriculum/` | 2 parked | `curriculumExecutionEnabled` |
| `progression/` | 2 parked | `progressionExecutionEnabled` |
| `nether/` | 2 parked | `netherSystemEnabled` |
| `gear/` | 2 parked | gear systems |
| `villagers/` | 2 parked | `villagerSystemEnabled` |
| `blueprints/` | 2 parked | `blueprintSystemEnabled` |

## Migration procedure (when we move code)

1. Create `systems/<domain>/`.
2. Move implementation files there.
3. Leave a **shim** at the old path:

   ```js
   // bot/netherPrep.js (temporary shim)
   export * from './systems/nether/netherPrep.js';
   ```

4. Fix relative imports inside the moved file (`./x` → `../../x` or domain-local).
5. Run tests/audits when Node is available.
6. Remove shims only after nothing imports the old path.

## Do not

- Move all domains in one session without tests.
- Delete parked systems “to clean up” — park them; they are backlog.
- Put new features in the flat root if a domain folder already exists.
