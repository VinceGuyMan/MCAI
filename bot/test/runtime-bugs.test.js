import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vec3 } from 'vec3';
import { adaptActionArguments, createActions, normalizeActionCount } from '../actions.js';
import { createBrain } from '../brain.js';
import { setupChat } from '../chat.js';
import { clearAllConfirmations, listPendingConfirmations, requestConfirmation } from '../confirmationManager.js';
import { parseChatMessage } from '../commandParser.js';
import { findCommandAlias, getCommands, validateCommandWiring } from '../commandRegistry.js';
import { getToolCraftOptions, missingIngredients, resolveCraftItemName } from '../crafting.js';
import { huntPassiveFoodAnimal } from '../food.js';
import * as farming from '../farming.js';
import { sendDialogue } from '../dialogue.js';
import * as eventDialogue from '../eventDialogue.js';
import { dropItem } from '../inventory.js';
import { createMemory as createPersistentMemory } from '../memory.js';
import { runFoodResourceRun } from '../resourceRuns.js';
import { loadCurriculumMemory, saveCurriculumMemory } from '../curriculumMemory.js';
import { loadSkillMemory, saveSkillMemory } from '../skillMemory.js';
import { getSkills } from '../skillRegistry.js';
import { createTaskQueue } from '../taskQueue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function memory(initial = {}) {
  let state = { ...initial };
  return {
    get: () => state,
    set: (key, value) => {
      state = { ...state, [key]: value };
    },
    update: (patch) => {
      state = { ...state, ...patch };
    }
  };
}

async function mockActions() {
  const bot = {
    username: 'tj',
    players: {},
    entities: {},
    health: 20,
    food: 20,
    time: {},
    chat: () => {},
    pathfinder: { setMovements: () => {}, setGoal: () => {}, stop: () => {} },
    registry: null,
    entity: { position: { distanceTo: () => 0 } },
    inventory: { items: () => [], slots: [] }
  };
  return await createActions(bot, { ownerUsername: 'ModVinny', botUsername: 'tj', chatCooldownMs: 0 }, {
    memory: memory(),
    taskQueue: {},
    safety: {},
    perception: () => ({}),
    cancellation: {
      cancelAll: () => {},
      reset: () => {},
      isCancelled: () => false,
      throwIfCancelled: () => {}
    }
  });
}

async function routeChatCommand(rawText) {
  const bot = new EventEmitter();
  bot.username = 'tj';
  bot.mcaiConfig = { ownerUsername: 'ModVinny', botUsername: 'tj', botAliases: ['tj'] };
  const mem = memory();
  const config = { ownerUsername: 'ModVinny', botUsername: 'tj', botAliases: ['tj'] };
  const calls = [];
  let resolveCall;
  const called = new Promise((resolve) => { resolveCall = resolve; });
  const record = (name) => async (...args) => {
    const call = { name, args };
    calls.push(call);
    resolveCall(call);
    return { ok: true, message: name };
  };
  const actions = {
    answerChat: record('answerChat'),
    resourceRunWood: record('resourceRunWood'),
    resourceRunStone: record('resourceRunStone'),
    resourceRunCoal: record('resourceRunCoal'),
    resourceRunFood: record('resourceRunFood'),
    mineCoal: record('mineCoal'),
    mineIron: record('mineIron'),
    mineStone: record('mineStone'),
    mineflayerPluginStatus: record('mineflayerPluginStatus'),
    threatScan: record('threatScan'),
    fishForFood: record('fishForFood'),
    equipTool: record('equipTool'),
    followOwner: record('followOwner'),
    gatherWood: record('gatherWood'),
    collectDropsAction: record('collectDropsAction'),
    withdrawItem: record('withdrawItem'),
    giveOwnerItem: record('giveOwnerItem'),
    createGoalFromTemplate: record('createGoalFromTemplate'),
    resetCancellation: () => {},
    stop: record('stop'),
    hasAction: () => false
  };

  setupChat(bot, config, {
    actions,
    planner: { answerChat: async () => 'fallback' },
    perception: () => ({}),
    memory: mem
  });
  bot.emit('chat', 'ModVinny', rawText);
  return Promise.race([
    called,
    new Promise((resolve) => setTimeout(() => resolve(calls.at(-1) || null), 100))
  ]);
}

async function routeNaturalChatCalls(rawText) {
  const bot = new EventEmitter();
  bot.username = 'tj';
  bot.mcaiConfig = {
    ownerUsername: 'ModVinny',
    botUsername: 'tj',
    botAliases: ['tj'],
    naturalCommandRouterEnabled: true,
    llmFallbackForMessyCommands: false
  };
  const mem = memory();
  const config = { ...bot.mcaiConfig };
  const calls = [];
  const record = (name, returnValue) => async (...args) => {
    calls.push({ name, args });
    return returnValue;
  };
  const actions = {
    answerChat: record('answerChat', { ok: true }),
    resourceRunFood: record('resourceRunFood', undefined),
    lightHome: record('lightHome', undefined),
    resetCancellation: () => {},
    stop: record('stop', { ok: true }),
    hasAction: () => false
  };
  const planner = { answerChat: record('plannerAnswerChat', 'fallback') };

  setupChat(bot, config, {
    actions,
    planner,
    perception: () => ({}),
    memory: mem
  });
  bot.emit('chat', 'ModVinny', rawText);
  await new Promise((resolve) => setTimeout(resolve, 150));
  return calls;
}

async function routeSingleCommandWithActions(rawText, actionsPatch = {}) {
  const bot = new EventEmitter();
  bot.username = 'tj';
  bot.mcaiConfig = { ownerUsername: 'ModVinny', botUsername: 'tj', botAliases: ['tj'] };
  const mem = memory();
  const calls = [];
  const record = (name, returnValue = { ok: true, message: name }) => async (...args) => {
    calls.push({ name, args });
    return returnValue;
  };
  const actions = {
    answerChat: record('answerChat'),
    resetCancellation: () => calls.push({ name: 'resetCancellation', args: [] }),
    stop: record('stop'),
    confirmGearUpgrade: record('confirmGearUpgrade'),
    approveGoal: record('approveGoal'),
    confirmStep: record('confirmStep'),
    hasAction: () => false,
    ...actionsPatch
  };
  setupChat(bot, bot.mcaiConfig, {
    actions,
    planner: { answerChat: async () => 'fallback' },
    perception: () => ({}),
    memory: mem
  });
  bot.emit('chat', 'ModVinny', rawText);
  await new Promise((resolve) => setTimeout(resolve, 100));
  return calls;
}

test('tj gather food routes to the food helper command', async () => {
  const command = findCommandAlias('tj gather food');
  assert.ok(command);
  assert.equal(command.action, 'get_food');
});

test('common storage and build phrases route to existing safe actions', async () => {
  assert.equal(findCommandAlias('tj place storage chest')?.action, 'place_storage_chest');
  assert.equal(findCommandAlias('tj register chest')?.action, 'register_storage_chest');
  assert.equal(findCommandAlias('tj build workstation')?.action, 'build_workstation');
  assert.equal(findCommandAlias('tj build shelter')?.action, 'build_shelter');
});

test('implemented skills have command coverage and command actions are wired', async () => {
  const commands = getCommands();
  const commandNames = new Set(commands.map((command) => command.name));
  const commandActions = new Set(commands.map((command) => command.action));
  const missingSkills = getSkills()
    .filter((skill) => skill.implemented)
    .filter((skill) => !commandNames.has(skill.name) && !commandActions.has(skill.action))
    .map((skill) => `${skill.name}:${skill.action}`);

  assert.deepEqual(missingSkills, []);
  assert.deepEqual(validateCommandWiring(await mockActions()).missing, []);
});

test('command aliases are unique so no command is unreachable by exact text', async () => {
  const seen = new Map();
  const duplicates = [];
  for (const command of getCommands()) {
    for (const alias of command.aliases || []) {
      const key = alias.toLowerCase();
      const existing = seen.get(key);
      if (existing) duplicates.push(`${key}: ${existing} -> ${command.name}`);
      seen.set(key, command.name);
    }
  }
  assert.deepEqual(duplicates, []);
});

test('registry-only command aliases route to existing safe actions', async () => {
  assert.equal(findCommandAlias('tj safety status')?.action, 'safetyStatus');
  assert.equal(findCommandAlias('tj skills status')?.action, 'skills_status');
  assert.equal(findCommandAlias('tj fish for food')?.action, 'fish_for_food');
  assert.equal(findCommandAlias('tj kill some cows')?.action, 'hunt_passive_food');
  assert.equal(findCommandAlias('tj villager trade status')?.action, 'trading_status');
  assert.equal(findCommandAlias('tj confirm enchant')?.action, 'confirm_enchant');
  assert.equal(findCommandAlias('tj confirm use book')?.action, 'confirm_use_book');
  assert.equal(findCommandAlias('tj blueprint progress')?.action, 'blueprint_progress');
  assert.equal(findCommandAlias('tj blueprint continue build')?.action, 'blueprint_continue_build');
  assert.equal(findCommandAlias('tj give item to player')?.action, 'giveOwnerItem');
  assert.equal(findCommandAlias('tj make axe')?.action, 'craftGenericTool');
  assert.equal(findCommandAlias('tj find coal')?.action, 'mine_coal');
});

test('stray trailing bracket still routes follow command', async () => {
  const bot = { username: 'tj', mcaiConfig: { ownerUsername: 'ModVinny', botAliases: ['tj'] } };
  const parsed = await parseChatMessage(bot, memory(), {
    sender: 'ModVinny',
    rawText: 'tj follow me]',
    isOwner: true,
    addressedToBot: true,
    config: bot.mcaiConfig
  });
  assert.equal(parsed.type, 'command');
  assert.equal(parsed.command, 'follow me');
});

test('followOwner sets a durable follow goal and records movement mode', async () => {
  const mem = memory();
  const goals = [];
  const bot = {
    username: 'tj',
    players: {
      ModVinny: { entity: { position: new Vec3(10, 64, 10) } }
    },
    entities: {},
    health: 20,
    food: 20,
    time: {},
    chat: () => {},
    clearControlStates: () => {},
    stopDigging: () => {},
    deactivateItem: () => {},
    pathfinder: {
      setMovements: () => {},
      setGoal: (goal, dynamic) => goals.push({ goal, dynamic }),
      stop: () => {}
    },
    registry: null,
    entity: { position: new Vec3(0, 64, 0) },
    inventory: { items: () => [], slots: [] }
  };
  const actions = await createActions(bot, {
    ownerUsername: 'ModVinny',
    botUsername: 'tj',
    chatCooldownMs: 0,
    followDistance: 3
  }, {
    memory: mem,
    taskQueue: { clearTask: () => {} },
    safety: {},
    perception: () => ({}),
    cancellation: {
      cancelAll: () => {},
      resetCancellation: () => {},
      isCancelled: () => false,
      throwIfCancelled: () => {}
    }
  });

  const result = await actions.followOwner();
  assert.equal(result.ok, true);
  assert.ok(result.evidence.includes('follow_goal_set'));
  assert.equal(mem.get().followOwnerActive, true);
  assert.equal(mem.get().movementMode, 'follow_owner');
  assert.equal(goals.at(-1).dynamic, true);
});

test('equipTool skips a nearly broken best tool and equips a usable fallback', async () => {
  const equipped = [];
  const bot = {
    username: 'tj',
    players: {},
    entities: {},
    health: 20,
    food: 20,
    time: {},
    chat: () => {},
    clearControlStates: () => {},
    stopDigging: () => {},
    deactivateItem: () => {},
    pathfinder: { setMovements: () => {}, setGoal: () => {}, stop: () => {} },
    registry: null,
    entity: { position: new Vec3(0, 64, 0) },
    inventory: {
      items: () => [
        { name: 'diamond_pickaxe', count: 1, durabilityUsed: 1550, maxDurability: 1551 },
        { name: 'stone_pickaxe', count: 1, durabilityUsed: 0, maxDurability: 131 }
      ],
      slots: []
    },
    equip: async (item, destination) => equipped.push({ item: item.name, destination })
  };
  const actions = await createActions(bot, {
    ownerUsername: 'ModVinny',
    botUsername: 'tj',
    chatCooldownMs: 0,
    allowToolUse: true
  }, {
    memory: memory(),
    taskQueue: { clearTask: () => {} },
    safety: {},
    perception: () => ({}),
    cancellation: {
      cancelAll: () => {},
      resetCancellation: () => {},
      isCancelled: () => false,
      throwIfCancelled: () => {}
    }
  });

  const result = await actions.equipTool('pickaxe');
  assert.equal(result.ok, true);
  assert.equal(result.data.itemName, 'stone_pickaxe');
  assert.deepEqual(equipped, [{ item: 'stone_pickaxe', destination: 'hand' }]);
});

test('mineStone mines one block through direct fallback and returns standard evidence', async () => {
  let cobblestone = 0;
  const dug = [];
  const gotoGoals = [];
  const equipped = [];
  const stoneBlock = { name: 'stone', diggable: true, position: new Vec3(2, 64, 0) };
  const bot = {
    username: 'tj',
    players: {},
    entities: {},
    health: 20,
    food: 20,
    time: {},
    chat: () => {},
    clearControlStates: () => {},
    stopDigging: () => {},
    deactivateItem: () => {},
    pathfinder: {
      setMovements: () => {},
      setGoal: () => {},
      stop: () => {},
      goto: async (goal) => gotoGoals.push(goal)
    },
    registry: null,
    entity: { position: new Vec3(0, 64, 0) },
    inventory: {
      items: () => [
        { name: 'stone_pickaxe', count: 1, durabilityUsed: 0, maxDurability: 131 },
        ...(cobblestone ? [{ name: 'cobblestone', count: cobblestone }] : [])
      ],
      slots: []
    },
    equip: async (item, destination) => equipped.push({ item: item.name, destination }),
    findBlocks: ({ matching }) => (typeof matching === 'function' && matching(stoneBlock) ? [stoneBlock.position] : []),
    blockAt: (position) => position === stoneBlock.position ? stoneBlock : null,
    dig: async (block) => {
      dug.push(block.name);
      cobblestone += 1;
    },
    nearestEntity: () => null
  };
  const actions = await createActions(bot, {
    ownerUsername: 'ModVinny',
    botUsername: 'tj',
    chatCooldownMs: 0,
    allowToolUse: true,
    maxDigAbortRetries: 0
  }, {
    memory: memory(),
    taskQueue: { clearTask: () => {} },
    safety: {
      safeToDig: (block) => block?.diggable ? { ok: true, reason: 'safe' } : { ok: false, reason: 'no block' }
    },
    perception: () => ({}),
    cancellation: {
      cancelAll: () => {},
      resetCancellation: () => {},
      isCancelled: () => false,
      throwIfCancelled: () => {}
    }
  });

  const result = await actions.mineStone(1);
  assert.equal(result.ok, true);
  assert.equal(result.data.usedPlugin, false);
  assert.equal(result.data.before, 0);
  assert.equal(result.data.after, 1);
  assert.ok(result.evidence.includes('block_collected'));
  assert.ok(result.evidence.includes('stone_count_increased_or_reason_reported'));
  assert.deepEqual(dug, ['stone']);
  assert.deepEqual(equipped, [{ item: 'stone_pickaxe', destination: 'hand' }]);
  assert.equal(gotoGoals.length, 1);
});

test('direct chat compatibility aliases are represented in command registry', async () => {
  const expected = [
    ['tj death', 'deathStatus'],
    ['tj go to death spot', 'goToDeathSpot'],
    ['tj where are you?', 'whereBot'],
    ['tj where am i?', 'whereOwner'],
    ['tj who is nearby?', 'whoNearby'],
    ['tj clear home', 'clearHome'],
    ['tj base brain', 'home_status'],
    ['tj place torches around home', 'light_home'],
    ['tj bed status', 'bedStatus'],
    ['tj night status', 'nightStatus'],
    ['tj place crafting table', 'placeBlock'],
    ['tj crafting status', 'craftingStatus'],
    ['tj make light', 'craft_lighting'],
    ['tj hunger', 'food_status'],
    ['tj cook meat', 'cook_food'],
    ['tj fish', 'fish_for_food'],
    ['tj combat gear', 'combat_equipment_status'],
    ['tj nether gear', 'nether_status'],
    ['tj what did you think i meant?', 'explainLastIntent']
  ];

  for (const [alias, action] of expected) {
    assert.equal(findCommandAlias(alias)?.action, action, `${alias} should be represented in commandRegistry`);
  }
});

test('exact direct chat command strings have registry compatibility coverage', async () => {
  const chatSource = fs.readFileSync(new URL('../chat.js', import.meta.url), 'utf8');
  const exactCommands = [...chatSource.matchAll(/command\s*===\s*(['"])(.*?)\1/g)]
    .map((match) => match[2])
    .filter((command) => command !== 'don');
  const missing = [...new Set(exactCommands)]
    .filter((command) => !findCommandAlias(`tj ${command}`))
    .sort();

  assert.deepEqual(missing, []);
});

test('kill cow requests are parsed as commands instead of dialogue', async () => {
  const parsed = await parseChatMessage(
    { username: 'tj', mcaiConfig: { ownerUsername: 'ModVinny', botAliases: ['tj'] } },
    memory(),
    {
      sender: 'ModVinny',
      rawText: 'tj kill some cows',
      isOwner: true,
      addressedToBot: true,
      config: { ownerUsername: 'ModVinny', botAliases: ['tj'] }
    }
  );

  assert.equal(parsed.type, 'command');
  assert.equal(parsed.command, 'kill some cows');
});

test('generic make tool requests are parsed as commands', async () => {
  const parsed = await parseChatMessage(
    { username: 'tj', mcaiConfig: { ownerUsername: 'ModVinny', botAliases: ['tj'] } },
    memory(),
    {
      sender: 'ModVinny',
      rawText: 'tj make axe',
      isOwner: true,
      addressedToBot: true,
      config: { ownerUsername: 'ModVinny', botAliases: ['tj'] }
    }
  );

  assert.equal(parsed.type, 'command');
  assert.equal(parsed.command, 'make axe');
});

test('passive hunting stops after an unconfirmed kill instead of switching animals', async () => {
  const cow = { id: 1, name: 'cow', position: new Vec3(2, 64, 0), isValid: true, health: 10 };
  const sheep = { id: 2, name: 'sheep', position: new Vec3(3, 64, 0), isValid: true, health: 10 };
  const attacked = [];
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    entities: { 1: cow, 2: sheep },
    players: {},
    pathfinder: { goto: async () => {} },
    attack: (entity) => attacked.push(entity.id),
    nearestEntity: () => null
  };

  const result = await huntPassiveFoodAnimal(bot, {
    config: {
      allowPassiveHunting: true,
      maxFoodSearchDistance: 32,
      maxFoodDistanceFromOwner: 64,
      returnToOwnerAfterFoodTask: false
    },
    maxKills: 2,
    maxSwings: 3,
    swingDelayMs: 0,
    confirmDelayMs: 0,
    confirmChecks: 1
  });

  assert.equal(result.ok, false);
  assert.equal(result.unconfirmed, 1);
  assert.equal(result.stoppedOnUnconfirmed, true);
  assert.ok(attacked.length > 0);
  assert.equal(attacked.every((id) => id === 1), true);
});

test('confirmed food hunt tolerates interrupted return path', async () => {
  const cow = { id: 1, name: 'cow', position: new Vec3(2, 64, 0), isValid: true, metadata: [] };
  let gotoCalls = 0;
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    entities: { 1: cow },
    players: { ModVinny: { entity: { position: new Vec3(0, 64, 0) } } },
    registry: null,
    inventory: { items: () => [] },
    pathfinder: {
      goto: async () => {
        gotoCalls += 1;
        if (gotoCalls > 1) throw new Error('The goal was changed before it could be completed!');
      }
    },
    nearestEntity: (predicate) => Object.values(bot.entities).find((entity) => predicate(entity)) || null,
    attack: () => {
      delete bot.entities[1];
    }
  };

  const result = await huntPassiveFoodAnimal(bot, {
    config: {
      allowPassiveHunting: true,
      ownerUsername: 'ModVinny',
      returnToOwnerAfterFoodTask: true,
      maxFoodDistanceFromOwner: 32
    },
    maxKills: 1,
    swingDelayMs: 1,
    confirmDelayMs: 1
  });

  assert.equal(result.ok, true);
  assert.equal(result.kills, 1);
});

test('dialogue generated before stop is suppressed after stop', async () => {
  const mem = memory({ lastManualStopAt: 2000 });
  const messages = [];
  const bot = {
    mcaiConfig: { maxChatResponseLength: 180, dialogueCooldownMs: 0 },
    chat: (message) => messages.push(message)
  };

  const sent = sendDialogue(bot, mem, 'stale reply', { startedAt: 1000 });
  assert.equal(sent, false);
  assert.deepEqual(messages, []);
});

test('resource commands preserve requested counts', async () => {
  assert.deepEqual(await routeChatCommand('tj get 16 coal'), { name: 'resourceRunCoal', args: [16] });
  assert.deepEqual(await routeChatCommand('tj get us 9 coal'), { name: 'resourceRunCoal', args: [9] });
  assert.deepEqual(await routeChatCommand('tj mine 12 stone'), { name: 'resourceRunStone', args: [12] });
  assert.deepEqual(await routeChatCommand('tj collect 6 logs'), { name: 'resourceRunWood', args: [6] });
  assert.deepEqual(await routeChatCommand('tj find 4 iron'), { name: 'mineIron', args: [4] });
});

test('critical exact chat commands route to their command actions', async () => {
  assert.deepEqual(await routeChatCommand('tj plugin status'), { name: 'mineflayerPluginStatus', args: [] });
  assert.deepEqual(await routeChatCommand('tj equip axe'), { name: 'equipTool', args: ['axe'] });
  assert.deepEqual(await routeChatCommand('tj equip pickaxe'), { name: 'equipTool', args: ['pickaxe'] });
  assert.deepEqual(await routeChatCommand('tj follow me'), { name: 'followOwner', args: [] });
  assert.deepEqual(await routeChatCommand('tj mine stone'), { name: 'mineStone', args: [1] });
  assert.deepEqual(await routeChatCommand('tj get wood'), { name: 'resourceRunWood', args: [16] });
  assert.deepEqual(await routeChatCommand('tj find coal'), { name: 'mineCoal', args: [8] });
  assert.deepEqual(await routeChatCommand('tj what danger is there'), { name: 'threatScan', args: [] });
  assert.deepEqual(await routeChatCommand('tj keep fishing'), { name: 'fishForFood', args: [{ continuous: true }] });
  assert.deepEqual(await routeChatCommand('tj fish until i say stop'), { name: 'fishForFood', args: [{ continuous: true }] });
});

test('action argument adapter preserves object-style counts, items, and tools', async () => {
  assert.deepEqual(adaptActionArguments('gatherWood', { targetCount: 16 }), [16]);
  assert.deepEqual(adaptActionArguments('resourceRunCoal', { count: 9 }), [9]);
  assert.deepEqual(adaptActionArguments('craftGenericTool', { toolType: 'axe' }), ['axe']);
  assert.deepEqual(adaptActionArguments('craft_item', { itemName: 'stone_axe', count: 1 }), ['stone_axe', 1, { itemName: 'stone_axe', count: 1 }]);
  assert.deepEqual(adaptActionArguments('giveOwnerItem', { itemName: 'bread', count: 3 }), ['bread', 3]);
});

test('bad wood target counts are clamped to a safe finite number', async () => {
  assert.equal(normalizeActionCount({ targetCount: { nope: true } }, 8), 8);
  assert.equal(normalizeActionCount({ targetCount: 999 }, 8), 64);
  assert.equal(normalizeActionCount({ targetCount: -4 }, 8), 1);
});

test('resource parser does not steal non-resource get commands', async () => {
  assert.deepEqual(await routeChatCommand('tj get iron gear'), { name: 'createGoalFromTemplate', args: ['get_iron_gear'] });
});

test('field phrasing for mining readiness and approvals routes cleanly', async () => {
  assert.deepEqual(await routeChatCommand('tj ready to mine'), { name: 'createGoalFromTemplate', args: ['prepare_for_mining'] });
  assert.deepEqual(await routeSingleCommandWithActions('tj approve'), [
    { name: 'resetCancellation', args: [] },
    { name: 'answerChat', args: ['I do not have anything waiting for approval right now.'] }
  ]);
});

test('natural route that runs a command with no return does not fall through to planner dialogue', async () => {
  const calls = await routeNaturalChatCalls('tj light this place');
  assert.ok(calls.some((call) => call.name === 'lightHome'));
  assert.equal(calls.some((call) => call.name === 'plannerAnswerChat'), false);
});

test('crafting resolves material tool names and reports missing materials', async () => {
  const fakeBot = {
    registry: {
      itemsByName: {
        wooden_axe: { id: 1, name: 'wooden_axe' },
        stone_axe: { id: 2, name: 'stone_axe' },
        iron_axe: { id: 3, name: 'iron_axe' },
        golden_axe: { id: 4, name: 'golden_axe' },
        diamond_axe: { id: 5, name: 'diamond_axe' },
        stick: { id: 6, name: 'stick' },
        oak_planks: { id: 7, name: 'oak_planks' },
        cobblestone: { id: 8, name: 'cobblestone' }
      }
    },
    inventory: { items: () => [{ name: 'oak_planks', count: 2 }, { name: 'stick', count: 1 }] },
    recipesFor: (id) => (id === 1 ? [{ result: { count: 1 } }] : []),
    recipesAll: () => []
  };

  assert.equal(resolveCraftItemName(fakeBot, 'wood axe'), 'wooden_axe');
  const missing = missingIngredients(fakeBot, 'wooden_axe');
  assert.ok(missing.some((entry) => entry.item === 'planks' && entry.missing === 1));

  const options = getToolCraftOptions(fakeBot, 'axe');
  assert.ok(options.some((option) => option.itemName === 'wooden_axe' && option.canCraft));
  assert.ok(options.some((option) => option.itemName === 'stone_axe' && !option.canCraft));
});

test('task queue keeps interrupted digging task for retry instead of clearing it', async () => {
  const store = memory();
  const queue = createTaskQueue(store);
  queue.setTask('resourceRunWood', ['digNearestSafeBlock'], { resourceType: 'wood' });

  const result = await queue.runNextStep({
    handlers: {
      digNearestSafeBlock: async () => {
        throw new Error('Digging aborted');
      }
    },
    cancellation: {
      isCancelled: () => false,
      throwIfCancelled: () => {}
    }
  });

  assert.equal(result.failed, true);
  assert.equal(result.clearTask, false);
  assert.equal(result.retry, true);
  assert.match(result.message, /retrying/);
  assert.notEqual(queue.getCurrentTask(), null);
  assert.equal(queue.getCurrentTask().stepIndex, 0);
});

test('owner stop clears stale centralized and memory-backed confirmations', async () => {
  clearAllConfirmations('test setup');
  requestConfirmation('villager_trade', { description: 'test trade' }, { ownerUsername: 'ModVinny' });
  const mem = memory({
    pendingGearUpgradeConfirmation: { type: 'enchant_item' },
    pendingTradeConfirmation: { tradeIndex: 1 },
    pendingBlueprintBuild: { blueprintId: 'small_shelter_5x5' },
    pendingNaturalCommandIntent: { canonicalCommand: 'tj get food' },
    pendingNetherConfirmation: { action: 'nether_entry' },
    pendingNetherConfirmationExpiresAt: Date.now() + 60000,
    pendingGoalConfirmation: { goalId: 'goal_1' },
    pendingGoalConfirmationExpiresAt: Date.now() + 60000,
    pendingClearConversationMemoryConfirmation: { expiresAt: Date.now() + 60000 },
    thinCoreTaskActive: true,
    activeThinCoreAction: 'collect_resource',
    thinCoreTaskStartedAt: Date.now()
  });
  let cancelCalled = false;
  const actions = await createActions({
    username: 'tj',
    players: {},
    entities: {},
    health: 20,
    food: 20,
    time: {},
    chat: () => {},
    clearControlStates: () => {},
    stopDigging: () => {},
    deactivateItem: () => {},
    pathfinder: { setMovements: () => {}, setGoal: () => {}, stop: () => {} },
    registry: { blocksByName: {}, itemsByName: {} },
    entity: { position: new Vec3(0, 64, 0) },
    inventory: { items: () => [], slots: [] }
  }, { ownerUsername: 'ModVinny', botUsername: 'tj', chatCooldownMs: 0 }, {
    memory: mem,
    taskQueue: { clearTask: () => {}, getCurrentTask: () => null },
    safety: {},
    perception: () => ({}),
    cancellation: {
      cancelAll: () => { cancelCalled = true; },
      resetCancellation: () => {},
      isCancelled: () => false,
      throwIfCancelled: () => {}
    }
  });

  const result = await actions.stop();
  assert.equal(result.ok, true);
  assert.equal(cancelCalled, true);
  assert.equal(listPendingConfirmations().length, 0);
  const state = mem.get();
  assert.equal(state.pendingGearUpgradeConfirmation, null);
  assert.equal(state.pendingTradeConfirmation, null);
  assert.equal(state.pendingBlueprintBuild, null);
  assert.equal(state.pendingNaturalCommandIntent, null);
  assert.equal(state.pendingNetherConfirmation, null);
  assert.equal(state.pendingGoalConfirmation, null);
  assert.equal(state.pendingClearConversationMemoryConfirmation, null);
  assert.equal(state.thinCoreTaskActive, false);
  assert.equal(state.activeThinCoreAction, null);
  assert.equal(state.thinCoreTaskStartedAt, 0);
});

test('post-stop confirmation commands reset cancellation before handling', async () => {
  const calls = await routeSingleCommandWithActions('tj confirm enchant');
  assert.deepEqual(calls.map((call) => call.name).slice(0, 2), ['resetCancellation', 'confirmGearUpgrade']);
});

test('food resource run repeats food helper until requested target or no progress', async () => {
  let foodCount = 0;
  let attempts = 0;
  const bot = {
    inventory: {
      items: () => (foodCount > 0 ? [{ name: 'bread', count: foodCount }] : [])
    }
  };
  const mem = memory({});
  const result = await runFoodResourceRun(bot, mem, 3, {
    config: {},
    shouldStop: () => false,
    actions: {
      getFood: async () => {
        attempts += 1;
        foodCount += 1;
        return { ok: true, message: 'food found' };
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.count, 3);
  assert.equal(result.attempts, 3);
  assert.equal(attempts, 3);
});

test('give/drop item resolves plural and category names like logs', async () => {
  const tossed = [];
  const bot = {
    inventory: {
      items: () => [
        { name: 'oak_log', count: 4, type: 17 },
        { name: 'birch_log', count: 3, type: 18 }
      ]
    },
    toss: async (type, metadata, count) => tossed.push({ type, metadata, count })
  };

  const result = await dropItem(bot, 'logs', 6, { direct: true });
  assert.equal(result.ok, true);
  assert.match(result.message, /Dropped 6 logs/);
  assert.deepEqual(tossed.map((item) => item.count), [4, 2]);
});

test('give/drop item supports all of a resolved category', async () => {
  assert.deepEqual(await routeChatCommand('tj give me all food'), { name: 'giveOwnerItem', args: ['food', 'all'] });
  assert.deepEqual(await routeChatCommand('tj give iron'), { name: 'giveOwnerItem', args: ['iron', 1] });

  const tossed = [];
  const bot = {
    inventory: {
      items: () => [
        { name: 'bread', count: 2, type: 297 },
        { name: 'cooked_beef', count: 3, type: 364 },
        { name: 'oak_log', count: 8, type: 17 }
      ]
    },
    toss: async (type, metadata, count) => tossed.push({ type, metadata, count })
  };

  const result = await dropItem(bot, 'food', 'all', { direct: true });
  assert.equal(result.ok, true);
  assert.match(result.message, /Dropped 5 food/);
  assert.deepEqual(tossed.map((item) => item.count), [2, 3]);
});

test('thin core brain does not auto-craft furnaces from background survival crafting', async () => {
  let crafted = 0;
  const mem = memory({ lastOllamaDecisionAt: Date.now() });
  const brain = createBrain({
    thinCoreEnabled: true,
    competentCoreDisableAdvancedAutonomy: true,
    advancedAutonomyEnabled: false,
    autonomyEnabled: true,
    autonomyMode: 'semi',
    foodEnabled: true,
    lifelikeDialogueEnabled: false,
    allowTaskCommentary: false,
    idleAutonomyEnabled: false,
    brainTickMs: 1000,
    manualStopPauseMs: 0,
    longTermPlanningEnabled: false,
    stayNearFriendlyPlayers: false,
    homeBaseEnabled: false,
    allowAutonomousBaseMaintenance: false,
    ollamaDecisionCooldownMs: 999999
  }, {
    bot: { mcaiConfig: {}, chat: () => {} },
    perception: () => ({
      currentTask: null,
      position: { x: 0, y: 64, z: 0 },
      dimension: 'overworld',
      timeOfDay: 1000,
      rawFoodCount: 1,
      hasCobblestone: true,
      nearbyFurnace: false,
      canCraftFurnace: true,
      inventory: [{ name: 'cobblestone', count: 8 }],
      dangerFlags: {},
      missingArmorSlots: []
    }),
    safety: { assess: () => ({ emergency: false }) },
    actions: {
      craftItem: async () => { crafted += 1; },
      handleFoodSurvival: async () => false,
      ensureArmoredForSurvival: async () => false
    },
    taskQueue: { getCurrentTask: () => null },
    planner: { planFor: async () => ({ actions: [] }) },
    memory: mem,
    cancellation: { isCancelled: () => false }
  });

  await brain.tick();
  assert.equal(crafted, 0);
});

test('farm creation only records success after tilling and planting evidence', async () => {
  const mem = memory({
    homeBasePosition: { x: 0, y: 64, z: 0 },
    homeBaseDimension: 'overworld',
    knownFarms: [],
    farmCropTypes: [],
    farmHistory: []
  });
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    game: { dimension: 'overworld' },
    inventory: { items: () => [{ name: 'wheat_seeds', count: 1 }] },
    blockAt: (position) => ({ name: 'stone', position })
  };

  const result = await farming.createSmallFarm(bot, mem, { config: { ownerUsername: 'ModVinny' } });
  assert.equal(result.ok, false);
  assert.match(result.message, /could not make a wheat farm/i);
  assert.deepEqual(mem.get().knownFarms, []);
  assert.deepEqual(mem.get().farmHistory, []);
});

test('danger event comments are rate-limited during persistent danger', async () => {
  const messages = [];
  const mem = memory({ lastThreatWarningAt: 0, lastEventCommentAt: 0 });
  const bot = {
    mcaiConfig: { allowTaskCommentary: true, dangerWarningCooldownMs: 45000, maxChatResponseLength: 180 },
    chat: (message) => messages.push(message)
  };

  assert.equal(eventDialogue.maybeSayEventComment(bot, mem, eventDialogue.onDangerDetected({})), true);
  assert.equal(eventDialogue.maybeSayEventComment(bot, mem, eventDialogue.onDangerDetected({})), false);
  assert.deepEqual(messages, ['Careful. I see danger nearby.']);
});

test('memory loader removes stale temp files without treating them as live memory', async () => {
  const dir = path.resolve(__dirname, '..', '..', '.test-memory', String(process.pid), `memory-tmp-${Date.now()}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const memoryFile = path.join(dir, 'memory.json');
  const staleTemp = `${memoryFile}.tmp-1-1`;
  fs.writeFileSync(staleTemp, '{"currentTask":"stale"}');
  const oldTime = new Date(Date.now() - 10 * 60 * 1000);
  fs.utimesSync(staleTemp, oldTime, oldTime);

  const store = createPersistentMemory(memoryFile);
  assert.equal(fs.existsSync(staleTemp), false);
  assert.equal(store.get().currentTask, null);
});

test('memory loader clears expired pending confirmations', async () => {
  const dir = path.resolve(__dirname, '..', '..', '.test-memory', String(process.pid), `memory-expired-${Date.now()}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const memoryFile = path.join(dir, 'memory.json');
  fs.writeFileSync(memoryFile, JSON.stringify({
    pendingGoalConfirmation: { action: 'risky_goal_step', expiresAt: Date.now() - 1000 },
    pendingGoalConfirmationExpiresAt: Date.now() - 1000,
    pendingCraftScavengeConfirmation: { itemName: 'stone_pickaxe', expiresAt: Date.now() - 1000 }
  }));

  const store = createPersistentMemory(memoryFile);
  assert.equal(store.get().pendingGoalConfirmation, null);
  assert.equal(store.get().pendingGoalConfirmationExpiresAt, 0);
  assert.equal(store.get().pendingCraftScavengeConfirmation, null);
});

test('skill tests isolate default memory and retired curriculum does not write', async () => {
  const testMemoryDir = path.resolve(__dirname, '..', '..', '.test-memory', String(process.pid));
  const skillFile = path.join(testMemoryDir, 'skill-memory.json');
  const curriculumFile = path.join(testMemoryDir, 'curriculum-memory.json');
  fs.rmSync(testMemoryDir, { recursive: true, force: true });

  saveSkillMemory({ version: 1, createdAt: Date.now(), updatedAt: Date.now(), skills: {}, recentRuns: [] });
  saveCurriculumMemory({ version: 1, createdAt: Date.now(), updatedAt: Date.now(), lastSuggestions: [] });

  assert.equal(fs.existsSync(skillFile), true);
  assert.equal(fs.existsSync(curriculumFile), false);
  assert.equal(loadSkillMemory().version, 1);
  assert.equal(loadCurriculumMemory().retired, true);
});
