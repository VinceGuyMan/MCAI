# Phase 9.5 Research Comparison and Architecture Extraction

Project under comparison:

- Bot: tj
- Owner: ModVinny
- Runtime target: Minecraft Java 1.21.11 on local offline-mode Paper
- Bot framework: Mineflayer physical player
- Brain: local Ollama only. Current role routing uses `qwen3:14b` for command routing/planning, `mistral-nemo:12b` for dialogue, `qwen2.5-coder:14b` for structured/code helper work, and `phi4-mini:latest` as fallback.
- Requirement: no OpenAI API, no cloud API, no paid API

This report compares tj against several Minecraft AI projects and extracts architecture ideas that are useful without giving up tj's local-only, owner-controlled companion design.

## Sources

- Mindcraft: https://github.com/mindcraft-bots/mindcraft
- Voyager: https://github.com/MineDojo/Voyager
- Odyssey: https://github.com/zju-vipa/odyssey
- MineDojo: https://github.com/MineDojo/MineDojo
- MineRL: https://github.com/minerllabs/minerl
- VillagerAgent: https://github.com/cnsdqd-dyb/VillagerAgent-Minecraft-multiagent-framework
- AIminebot: https://github.com/Seshrut/AIminebot
- Atlas / mineflayer-chatgpt: https://github.com/JesseRWeigel/mineflayer-chatgpt
- Local tj docs reviewed: `AUDIT_1_0.md`, `VERSION.md`, `README.md`, package scripts, and project modules in `E:\Games\MCAI`

## Executive Summary

The blunt answer: keep building tj.

Mindcraft is the closest serious peer because it is Mineflayer-based, supports many LLM providers including Ollama, and has a real skill/profile/multi-agent structure. It is worth studying, but switching would trade away tj's current owner-only safety model, Minecraft 1.21.11 target, local-only assumptions, and already-built companion systems.

Voyager and Odyssey are more valuable as architecture papers/code references than as runnable replacements. Their best ideas are skill libraries, curriculum generation, task decomposition, execution feedback, and progress-driven planning. Their risky parts are LLM-authored code execution, OpenAI/GPT assumptions, old Minecraft versions, and research-environment complexity.

MineDojo and MineRL are not companion bot codebases. They are research platforms and benchmarks. They are useful for task taxonomies, evaluation discipline, and inspiration for measurable progress, not for replacing tj.

VillagerAgent is useful later as a task dependency and dashboard reference, but it adds cloud/API assumptions and multi-agent complexity that should not be pulled into tj before the single-bot architecture is stable.

AIminebot is a lightweight local-Ollama Mineflayer bot and is philosophically close to tj, but it appears much smaller in scope. It is useful for dashboard and voice-interface inspiration, not as a replacement.

Atlas is useful as a future multi-bot reference. It is older, OpenAI-based, and targets Minecraft 1.19.2, so it should not drive tj's current architecture.

## tj Baseline

### Purpose

tj is a local Minecraft companion bot for ModVinny. It is meant to be a physical Mineflayer player that can follow, survive, gather, craft, build small base utilities, mine carefully, farm, defend, remember places, plan goals, prepare for the Nether, and talk naturally while staying safe and owner-controlled.

### Setup Difficulty

Medium. It requires Node, Minecraft/Paper, Mineflayer dependencies, Ollama, and a local model. The 1.0 stabilization work added doctor, smoke, audit, config validation, memory hardening, and test scripts to reduce setup guesswork.

### Minecraft Version Compatibility

tj targets Minecraft 1.21.11 explicitly. This is a major advantage over research projects pinned to 1.19 or older.

### Mineflayer Usage

tj is built around Mineflayer as a physical player bot. Actions should go through deterministic modules, not direct LLM movement/dig/place/attack.

### Local Ollama Support

First-class requirement. tj is configured around local Ollama role models with no OpenAI/cloud requirement.

### Cloud/API Dependency

None required by design.

### Skill/Action System

tj has an actions layer, command registry, capabilities registry, planner validation, cancellation, and feature-specific modules. The current weakness is that skills are not yet formalized as reusable, measurable, curriculum-ranked units.

### Long-Term Planning

tj has goals/templates/validation/execution scaffolding and safety-gated planner integration. It is intentionally conservative: one safe step at a time.

### Memory System

tj uses multiple persistent memories: general memory, map memory, goals, and conversation memory. The Phase 9 stabilization pass hardened load/save behavior and documented caveats.

### Dialogue/Personality

tj has a lifelike dialogue layer, typo tolerance, prompt-injection defense, and memory-aware conversation. Dialogue is not allowed to execute raw actions.

### Safety/Owner-Only Controls

This is one of tj's strongest differentiators. Only ModVinny can command actions. Risky actions require confirmation. Emergency stop is central. Dialogue cannot bypass safety.

### Prompt Injection Risk

Lower than many LLM-first bots because command parsing and deterministic safety gates run before dialogue. Risk still exists anywhere the LLM interprets intent or suggests plans.

### Code Execution Risk

Low by design compared with Voyager-style agents. tj should not execute LLM-generated JavaScript.

### Multi-Agent Support

Not a 1.0 feature. This should remain post-1.0.

### Practical for Local Companion Bot

Yes. tj is already aligned with ModVinny's actual server, version, local model, and desired companion behavior.

### Ideas Worth Borrowing

- A formal skill library with metadata, success criteria, and cooldowns
- Curriculum engine for choosing safe next tasks
- Better evidence-based progress tracking
- Skill success/failure history
- Optional future dashboard/voice interface

### Ideas to Avoid

- LLM-generated code execution
- Cloud/API assumptions
- Multi-agent complexity before single-bot stability
- Research environment dependency stacks that do not match Minecraft 1.21.11

## Mindcraft

Source: https://github.com/mindcraft-bots/mindcraft

### Purpose

Mindcraft is a general-purpose Minecraft agent framework built with Mineflayer and LLMs. It focuses on autonomous agents that can chat, use skills, and run with many model providers.

### Setup Difficulty

Medium. It needs Node, npm dependencies, a Minecraft server, a configured `settings.js`, and agent profiles. It supports offline auth and local server settings, but has more provider/profile configuration than tj.

### Minecraft Version Compatibility

The README references connecting with Minecraft 1.21.4. That is close to tj's target but not the same as 1.21.11. Compatibility would need verification.

### Mineflayer Usage

Strong. Mindcraft is explicitly Mineflayer-based.

### Local Ollama Support

Yes. Mindcraft lists Ollama among supported models and includes local profile examples.

### Cloud/API Dependency

Optional depending on profile. It supports OpenAI, Anthropic, Gemini, Groq, Hugging Face, OpenRouter, local Ollama, and many others. This flexibility is powerful but makes it easier to accidentally drift away from tj's local-only rule.

### Skill/Action System

Strong. Mindcraft supports skills through JavaScript skill files and profile skill lists. Its skill organization is one of the most relevant ideas for tj.

### Long-Term Planning

Moderate. It has agent prompts, skills, modes, self prompting, team behavior, and coder/builder profiles. It is not as directly aligned with tj's conservative goal templates and confirmation model.

### Memory System

Mindcraft has agent profiles and conversation examples. It likely has more agent context machinery than a simple bot, but tj's dedicated memory files are better aligned with persistent local companion behavior.

### Dialogue/Personality

Strong. Profiles contain names, examples, and model configuration. This is useful for personality organization.

### Safety/Owner-Only Controls

Not obviously equivalent to tj's owner-only and confirmation-first design. Mindcraft is more general and may require significant hardening for ModVinny-only control.

### Prompt Injection Risk

Medium to high depending on configuration. Any LLM-driven agent with broad skills and chat control has injection risk. tj's deterministic command-first parser should remain in front.

### Code Execution Risk

Medium. It supports skill files and coder-like behavior. The risk depends on whether agents can write or invoke code dynamically.

### Multi-Agent Support

Strong. Mindcraft has multiple example agent profiles and team-oriented components.

### Practical for Local Companion Bot

Partly. It is the closest project to tj technically, but switching would mean revalidating safety, version support, command behavior, memory, and local-only constraints.

### Ideas Worth Borrowing

- Skill pack organization
- Agent profile structure
- Clean separation of profile, model, skills, and settings
- Multi-agent conventions for a later phase
- Local Ollama profile examples

### Ideas to Avoid

- Provider sprawl in tj's main path
- Any behavior that lets the LLM bypass deterministic action modules
- Switching away from tj's owner-only command gate

## Voyager

Source: https://github.com/MineDojo/Voyager

### Purpose

Voyager is a research agent for open-ended embodied lifelong learning in Minecraft. It is designed around automatic curriculum, skill discovery, and iterative program improvement.

### Setup Difficulty

High. It requires Python, Node, Java 8, Mineflayer, Fabric mods, and a Minecraft 1.19 setup. It is research-grade, not plug-and-play companion software.

### Minecraft Version Compatibility

Targets Minecraft 1.19 in its documented setup. That is not compatible with tj's 1.21.11 target without real porting work.

### Mineflayer Usage

Yes. Voyager is built with the official Minecraft game and Mineflayer API.

### Local Ollama Support

Not first-class in the documented workflow. The README centers OpenAI/Azure OpenAI style usage.

### Cloud/API Dependency

High by default. The documented setup expects OpenAI API access.

### Skill/Action System

Very strong as an architecture idea. Voyager's skill library stores executable behaviors and retrieves them for future tasks.

### Long-Term Planning

Very strong. Voyager's automatic curriculum proposes tasks based on exploration progress and agent state.

### Memory System

Strong for learned skills and progress. It is less like tj's owner/world/conversation memory and more like a research skill memory.

### Dialogue/Personality

Not the focus. Voyager is about autonomous learning and embodied tasks, not a loyal chat companion.

### Safety/Owner-Only Controls

Weak for tj's needs. Voyager is not built around owner-only commands on a private local survival server.

### Prompt Injection Risk

High if exposed to chat. Its architecture relies on powerful model prompting and generated code.

### Code Execution Risk

High. Voyager's central mechanism involves LLM-generated programs and execution feedback. This is exactly what tj should avoid in live uncontrolled gameplay.

### Multi-Agent Support

Not the main focus.

### Practical for Local Companion Bot

Not practical as a replacement. Very useful as an architecture reference.

### Ideas Worth Borrowing

- Curriculum engine
- Skill library with retrieval
- Execution feedback loop
- Success/failure based skill refinement
- Progress-based next-task suggestions

### Ideas to Avoid

- LLM-written code execution
- OpenAI dependency
- Research environment complexity
- Minecraft 1.19 assumptions
- Unbounded autonomous exploration

## Odyssey

Source: https://github.com/zju-vipa/odyssey

### Purpose

Odyssey is an embodied agent framework for open-world long-horizon tasks. It uses Minecraft as an environment and connects ideas to quadruped robot planning.

### Setup Difficulty

High. It combines Minecraft, Mineflayer-era dependencies, Python modules, planning components, and GPT-based model calls.

### Minecraft Version Compatibility

The dependency stack references older Mineflayer versions and research setup assumptions. It should not be assumed compatible with Minecraft 1.21.11.

### Mineflayer Usage

Yes. Mineflayer and minecraft-protocol are part of the dependency setup.

### Local Ollama Support

Not first-class in the README. The documented examples use OpenAI API settings.

### Cloud/API Dependency

High by default.

### Skill/Action System

Strong conceptually. Odyssey emphasizes modules such as propose, decompose, compose, guide, and execute.

### Long-Term Planning

Strong. The architecture is explicitly about long-horizon task execution and decomposition.

### Memory System

Useful as task/skill context, but not a direct match for tj's persistent map, goals, and conversation memory.

### Dialogue/Personality

Not the focus.

### Safety/Owner-Only Controls

Not aligned with tj's owner-only local companion model.

### Prompt Injection Risk

Medium to high if adapted directly, because model-driven decomposition can overreach without deterministic validation.

### Code Execution Risk

Potentially high depending on execution path. It should be treated as research inspiration, not directly imported execution logic.

### Multi-Agent Support

Not its main value for tj.

### Practical for Local Companion Bot

Not practical as a replacement.

### Ideas Worth Borrowing

- Explicit planning stages: propose, decompose, compose, guide, execute
- Separating high-level planning from deterministic execution
- Evaluating whether a task is feasible before running it
- Skill reuse for long-horizon goals

### Ideas to Avoid

- Robotics-specific complexity
- OpenAI/GPT assumptions
- Large research dependency stack
- Planner authority over raw execution

## MineDojo

Source: https://github.com/MineDojo/MineDojo

### Purpose

MineDojo is a research framework and simulation suite for open-ended Minecraft agents. It provides tasks, data, and benchmarking infrastructure.

### Setup Difficulty

High for a normal companion bot. It is Python/Java/research-environment oriented.

### Minecraft Version Compatibility

Not aligned with tj's 1.21.11 Mineflayer local server target.

### Mineflayer Usage

Not the core companion-bot style Mineflayer usage tj needs.

### Local Ollama Support

No direct local Ollama companion-bot support.

### Cloud/API Dependency

Not mainly an LLM chat bot, but also not a direct local Ollama solution.

### Skill/Action System

Useful as a task taxonomy and environment abstraction, not as tj's skill system.

### Long-Term Planning

Not the focus in the same way as Voyager, though the environment supports task-based research.

### Memory System

Not a companion memory system.

### Dialogue/Personality

No.

### Safety/Owner-Only Controls

No direct match.

### Prompt Injection Risk

Low in its native benchmark setting, but irrelevant to tj's chat companion risk.

### Code Execution Risk

Not the same category as LLM code-writing agents.

### Multi-Agent Support

Not the reason to use it.

### Practical for Local Companion Bot

No. It is not a drop-in architecture for tj.

### Ideas Worth Borrowing

- Task taxonomy
- Evaluation discipline
- Success metrics
- Structured environment state thinking

### Ideas to Avoid

- Replacing tj's live Mineflayer bot with a research simulator
- Pulling in heavy Python environment dependencies for normal play

## MineRL

Source: https://github.com/minerllabs/minerl

### Purpose

MineRL is a reinforcement-learning environment and dataset project for Minecraft.

### Setup Difficulty

High for this use case. It targets Python RL workflows and older Java/Minecraft assumptions.

### Minecraft Version Compatibility

Not aligned with Minecraft 1.21.11.

### Mineflayer Usage

No direct Mineflayer companion-bot usage.

### Local Ollama Support

No.

### Cloud/API Dependency

No cloud LLM dependency, but also no local Ollama companion interface.

### Skill/Action System

RL environment action spaces, not tj-style deterministic skills.

### Long-Term Planning

Not directly applicable. It is about training/evaluation, not owner-commanded survival companion behavior.

### Memory System

No useful companion memory model.

### Dialogue/Personality

No.

### Safety/Owner-Only Controls

No direct match.

### Prompt Injection Risk

Not relevant in its normal use.

### Code Execution Risk

Not relevant in the LLM-agent sense.

### Multi-Agent Support

Not a practical reference for tj right now.

### Practical for Local Companion Bot

No.

### Ideas Worth Borrowing

- Test/evaluation mindset
- Metrics for completion and failure
- Benchmark-style acceptance criteria

### Ideas to Avoid

- Trying to turn tj into an RL training environment
- Importing old Python/Java constraints into the live bot

## VillagerAgent

Source: https://github.com/cnsdqd-dyb/VillagerAgent-Minecraft-multiagent-framework

### Purpose

VillagerAgent is a graph-based multi-agent framework for coordinating complex task dependencies in Minecraft.

### Setup Difficulty

High. It includes Python backend, Node frontend, environment variables, and API-key configuration.

### Minecraft Version Compatibility

Not clearly aligned with tj's 1.21.11 Mineflayer local survival target.

### Mineflayer Usage

Not the central value visible from the README. It is more about multi-agent task dependency coordination and dashboard/simulation structure.

### Local Ollama Support

Not first-class from the documented setup.

### Cloud/API Dependency

High. The setup calls for OpenAI and Anthropic API keys.

### Skill/Action System

Potentially useful as dependency graph inspiration.

### Long-Term Planning

Strong in the task-dependency sense.

### Memory System

Likely useful for task state and agent coordination, but not a direct tj memory replacement.

### Dialogue/Personality

Not the main focus.

### Safety/Owner-Only Controls

Not aligned with tj's single-owner companion requirements.

### Prompt Injection Risk

Medium to high if LLMs are involved in multi-agent planning without strict gates.

### Code Execution Risk

Depends on implementation, but the main risk for tj is complexity and API-driven planning authority.

### Multi-Agent Support

Strong. This is the project's main relevance.

### Practical for Local Companion Bot

Not as a replacement. Possibly useful later for a dashboard or multi-agent phase.

### Ideas Worth Borrowing

- Task dependency graphs
- Resource-aware planning
- Dashboard concepts
- Multi-agent role separation for a future phase

### Ideas to Avoid

- API key requirement
- Multi-agent complexity before tj is stable
- Dashboard-first architecture before the bot core is reliable

## AIminebot

Source: https://github.com/Seshrut/AIminebot

### Purpose

AIminebot is a local AI-powered Minecraft bot using Mineflayer, Ollama, and a browser dashboard with optional voice interaction.

### Setup Difficulty

Low to medium. It uses npm, Ollama, `.env`, and a local web dashboard.

### Minecraft Version Compatibility

Not clearly guaranteed for tj's 1.21.11 target. It would need dependency/version testing.

### Mineflayer Usage

Yes. It uses Mineflayer to connect as an AI player.

### Local Ollama Support

Yes. This is its strongest similarity to tj.

### Cloud/API Dependency

No cloud requirement in the documented main path.

### Skill/Action System

Much lighter than tj. It appears oriented around interactive AI bot behavior rather than a broad deterministic survival architecture.

### Long-Term Planning

Not comparable to tj's goal/planning system.

### Memory System

Not comparable to tj's multi-file memory system.

### Dialogue/Personality

Likely useful for conversational UX and voice/dashboard interaction, but not a complete personality/safety layer.

### Safety/Owner-Only Controls

Not obviously as strong as tj's owner-only, confirmation, prompt-injection, and deterministic action stack.

### Prompt Injection Risk

Medium if the LLM is close to action interpretation.

### Code Execution Risk

Likely lower than Voyager if it does not generate code, but needs inspection before trusting.

### Multi-Agent Support

No major advantage here.

### Practical for Local Companion Bot

Useful as a local-Ollama reference, but tj is already more aligned with ModVinny's feature set.

### Ideas Worth Borrowing

- Simple local setup ergonomics
- Browser dashboard idea
- Voice interface idea
- Clear `.env` style configuration

### Ideas to Avoid

- Replacing tj's richer safety architecture with a simpler chat-bot loop
- Letting voice/chat bypass owner-only rules

## Atlas / mineflayer-chatgpt

Source: https://github.com/JesseRWeigel/mineflayer-chatgpt

### Purpose

Atlas is a ChatGPT-powered Mineflayer bot system with support for multiple bots and team behavior.

### Setup Difficulty

Medium. It requires Node, Minecraft server setup, Mineflayer dependencies, and OpenAI API configuration.

### Minecraft Version Compatibility

The README targets Minecraft Java 1.19.2. This is not compatible with tj's 1.21.11 target without porting.

### Mineflayer Usage

Yes. It uses Mineflayer.

### Local Ollama Support

Not in the documented main path.

### Cloud/API Dependency

High. It expects an OpenAI API key and model settings.

### Skill/Action System

Useful historically as a Mineflayer + ChatGPT action reference, but not as robust as tj's desired deterministic safety stack.

### Long-Term Planning

Not the main value compared with Voyager/Odyssey.

### Memory System

Not a strong replacement for tj's memory systems.

### Dialogue/Personality

Likely has ChatGPT-driven conversation behavior, but with cloud dependency.

### Safety/Owner-Only Controls

Not obviously sufficient for tj's standards.

### Prompt Injection Risk

Medium to high if chat prompts drive action behavior.

### Code Execution Risk

Lower than Voyager-style generated code if it only maps commands, but action safety still needs verification.

### Multi-Agent Support

Strongest reason to keep it in the reference list.

### Practical for Local Companion Bot

Not practical as a replacement. Useful later when considering multiple specialized bots.

### Ideas Worth Borrowing

- Multi-bot configuration patterns
- Bot naming/team conventions
- Future role split ideas such as miner, farmer, guard, builder

### Ideas to Avoid

- OpenAI-only architecture
- Minecraft 1.19.2 assumptions
- Multi-bot scope before tj is stable as one bot

## Cross-Project Comparison Matrix

| Project | Best Fit for tj | Main Problem | Borrow | Avoid |
| --- | --- | --- | --- | --- |
| Mindcraft | Closest Mineflayer/LLM peer | General framework, safety/version drift | Skill/profile organization, Ollama profile, multi-agent later | Provider sprawl, weaker owner-only assumptions |
| Voyager | Architecture inspiration | OpenAI, MC 1.19, LLM code execution | Curriculum, skill library, feedback loop | Generated JS execution, research stack |
| Odyssey | Long-horizon decomposition inspiration | OpenAI/research complexity | Propose/decompose/compose/execute split | Robotics-specific and GPT-heavy design |
| MineDojo | Evaluation/task taxonomy | Not a companion bot | Benchmarks, task categories | Replacing live Mineflayer bot |
| MineRL | Evaluation mindset | RL environment, old stack | Metrics and tests | RL rewrite |
| VillagerAgent | Future task graph/dashboard | API keys, multi-agent complexity | Dependency graph, dashboard later | Multi-agent before 1-bot stability |
| AIminebot | Local Ollama UX reference | Smaller safety/action architecture | Dashboard, voice, local setup | Replacing tj with simpler bot |
| Atlas | Future multi-bot reference | OpenAI, MC 1.19.2 | Multi-bot config patterns | Switching now |

## Blunt Recommendation

### 1. Keep building tj

Yes. This is the right path.

tj already matches the actual constraints: ModVinny-only control, Minecraft 1.21.11, local offline Paper, Mineflayer physical player, local Ollama, no cloud, no paid API, safety-first commands, and companion personality.

The best outside projects are not better replacements. They are references.

### 2. Fork Mindcraft

No, not now.

Mindcraft is worth studying closely, but a fork would force tj's design into a broader framework with more provider options, different assumptions, and likely more safety work. A fork only makes sense if tj later needs Mindcraft's multi-agent ecosystem badly enough to justify a migration.

### 3. Switch to Mindcraft

No.

Switching would throw away hard-won alignment with your server, owner-only safety, command registry, memory files, 1.0 stabilization work, and local companion behavior.

### 4. Merge ideas from Voyager/Odyssey into tj

Yes, but merge architecture, not code.

Borrow the ideas:

- Skill library
- Curriculum engine
- Task decomposition
- Evidence-based progress
- Execution feedback
- Skill success/failure memory

Do not borrow:

- LLM-generated code execution
- OpenAI dependency
- old Minecraft setup
- unbounded autonomy

### 5. Use Atlas as a multi-bot reference later

Yes, later.

Atlas is useful when tj is stable and you want separate bots with roles. It should not influence the current single-bot 1.0/Phase 10 work except as a future reference.

## Architecture Extraction

The repeated winning pattern across the best systems is:

1. Describe capabilities as reusable skills.
2. Pick next goals based on world state.
3. Decompose goals into small executable steps.
4. Run steps through deterministic actions.
5. Measure success from actual world state.
6. Store results so the agent gets better over time.

For tj, this should be adapted as:

```text
ModVinny chat
-> commandParser / commandRegistry
-> goal or curriculum request
-> skillRegistry
-> skillValidator
-> skillRunner
-> actions.js
-> deterministic Mineflayer modules
-> progress/evidence tracker
-> skill memory
```

The LLM can suggest, explain, or rank options. It must not write executable behavior or directly control Mineflayer.

## Proposed Phase 10: Skill Library and Curriculum Engine

Do not implement this until ModVinny approves.

### Goal

Turn tj's current action set into a cleaner, measurable skill system, then add a safe curriculum layer that can suggest or execute approved next steps based on actual world state.

This is not a new gameplay feature phase. It is an architecture upgrade that makes existing systems easier to reuse, validate, test, and improve.

### Principles

- Local only
- Owner-commanded or owner-approved
- No raw LLM code execution
- No cloud requirement
- No OpenAI requirement
- No unsafe autonomy expansion
- One skill step at a time
- Every skill checks cancellation
- Every skill returns evidence
- Risky skills require confirmation
- Unimplemented skills cannot be selected

### New or Updated Modules

#### skillRegistry.js

Single source of truth for executable skills.

Each skill should define:

```json
{
  "name": "mine_coal",
  "category": "mining",
  "description": "Mine a small safe amount of visible or reachable coal.",
  "implemented": true,
  "riskLevel": "medium",
  "requiresConfirmation": false,
  "preconditions": ["has_pickaxe", "has_food", "has_torches"],
  "inputs": {
    "targetCount": "number"
  },
  "successEvidence": ["coal_count_increased", "returned_safely"],
  "cooldownMs": 30000,
  "maxRuntimeMs": 180000,
  "action": "mine_coal"
}
```

#### skillValidator.js

Validates whether a skill is safe and available before it can run.

Checks:

- implemented
- owner permission
- confirmation
- inventory requirements
- distance limits
- health/food
- danger state
- current dimension
- active cancellation
- cooldowns
- configured feature flags

#### skillRunner.js

Executes one skill through `actions.js`.

Rules:

- never calls Mineflayer directly
- never calls Ollama to execute
- checks cancellation before, during, and after
- records result object
- writes skill evidence
- updates task/goal state if attached

#### skillMemory.js

Stores skill outcomes.

Tracks:

- last run time
- success count
- failure count
- average duration
- common failure reasons
- last evidence
- per-skill cooldown

This gives tj a practical memory of what works in this world without pretending to learn arbitrary code.

#### curriculumEngine.js

Ranks safe next skills based on current needs.

Example priorities:

1. Emergency survival
2. Eat/heal/flee
3. Stay near owner/home
4. Food security
5. Lighting
6. Tools
7. Storage
8. Base readiness
9. Mining readiness
10. Farm maintenance
11. Nether readiness

The curriculum engine should suggest by default. It should only execute if the owner approved the current goal and the skill is low-risk.

#### curriculumTemplates.js

Defines reusable curriculum tracks:

- survival_basics
- base_readiness
- mining_readiness
- food_security
- storage_cleanup
- exploration_readiness
- combat_readiness
- nether_readiness

Each track is a list of skills with preconditions and stop conditions.

#### progressEvidence.js

Unifies evidence checking for skills and goals.

Examples:

- `torch_count_increased`
- `near_home`
- `registered_farm_exists`
- `coal_count_increased`
- `storage_chest_known`
- `nether_checklist_passed`

This prevents "the model said it worked" from becoming completion.

### Phase 10 Milestones

#### Milestone 1: Skill Inventory

- Convert current capabilities/actions into skill definitions.
- Mark each skill `implemented=true` or `implemented=false`.
- Add tests that unimplemented skills cannot run.

#### Milestone 2: Skill Runner

- Route a small set of existing safe skills through `skillRunner.js`.
- Start with status, inventory, home status, mining status, farm status, and nether checklist.

#### Milestone 3: Evidence Tracking

- Add success/failure evidence for the safest skills.
- Save skill results in `skill-memory.json`.

#### Milestone 4: Curriculum Suggestions

- Add `tj curriculum status`.
- Add `tj what should you practice?`
- Add `tj suggest next skill`.
- Suggestions only, no autonomous execution yet.

#### Milestone 5: Approved Curriculum Execution

- Allow approved low-risk curriculum steps to execute one at a time.
- `tj stop` cancels the current skill and pauses the curriculum.

### What Phase 10 Should Borrow

From Mindcraft:

- Skill pack organization
- Profile-like metadata
- Cleaner separation of model, skills, and settings

From Voyager:

- Skill library
- Curriculum selection
- Execution feedback
- Progress-based next task choice

From Odyssey:

- Propose/decompose/compose/execute style staging
- Feasibility checks before action

From VillagerAgent:

- Dependency graph ideas, later

From Atlas:

- Multi-bot role ideas, much later

### What Phase 10 Must Avoid

- LLM-generated JavaScript
- Cloud model dependency
- "train itself" claims
- Unlimited autonomous exploration
- New major gameplay systems
- Multi-bot behavior
- Dashboard work
- Letting curriculum bypass ModVinny approval

### Proposed Phase 10 Command Set

These are proposed only:

- `tj skills`
- `tj skill status`
- `tj skill status mining`
- `tj what skills do you have?`
- `tj what can you practice?`
- `tj suggest next skill`
- `tj curriculum status`
- `tj start curriculum survival basics`
- `tj pause curriculum`
- `tj resume curriculum`
- `tj cancel curriculum`
- `tj explain curriculum`

### Acceptance Criteria

Phase 10 should be considered successful only if:

1. Existing commands still work.
2. No new major gameplay systems are added.
3. Skills are listed from a registry.
4. Unimplemented skills are not advertised as working.
5. Skill execution goes through `actions.js`.
6. Skill results include real evidence.
7. Curriculum suggestions are grounded in current world state.
8. Curriculum cannot bypass confirmations.
9. `tj stop` cancels skill and curriculum execution.
10. Ollama is optional for suggestions and never required for deterministic execution.

## Final Recommendation

Keep tj as the main codebase.

Use Mindcraft as the closest practical design reference, especially for skill organization and agent profiles. Use Voyager and Odyssey to shape Phase 10's skill library and curriculum engine. Treat MineDojo and MineRL as evaluation inspiration. Keep VillagerAgent and Atlas in the post-1.0 backlog for dashboard, dependency graph, and multi-bot ideas.

Do not switch projects.

Do not fork Mindcraft yet.

Do not import LLM-generated-code patterns.

The right next architecture move is a conservative Skill Library and Curriculum Engine that makes tj's existing deterministic abilities cleaner, safer, and more measurable.
