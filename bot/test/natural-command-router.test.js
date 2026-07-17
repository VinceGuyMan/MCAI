import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChatMessage } from '../commandParser.js';
import {
  mapIntentToCanonicalCommand,
  routeNaturalCommand
} from '../naturalCommandRouter.js';

function memory(initial = {}) {
  let state = { ...initial };
  return {
    get: () => state,
    update: (patch) => {
      state = { ...state, ...patch };
    },
    set: (key, value) => {
      state = { ...state, [key]: value };
    }
  };
}

function bot(config = {}) {
  return {
    username: 'tj',
    mcaiConfig: {
      ownerUsername: 'ModVinny',
      botUsername: 'tj',
      naturalCommandRouterEnabled: true,
      llmFallbackForMessyCommands: false,
      ...config
    }
  };
}

async function route(rawText, options = {}) {
  return routeNaturalCommand(bot(options.config), options.memory || memory(), {
    rawText,
    sender: options.sender || 'ModVinny',
    isOwner: options.isOwner ?? true,
    addressedToBot: true,
    dryRun: options.dryRun ?? true,
    config: bot(options.config).mcaiConfig
  });
}

test('natural food and resource requests map to canonical commands', async () => {
  assert.equal((await route('tj we need food')).canonicalCommand, 'tj run core get food');
  assert.equal((await route('tj get fud')).canonicalCommand, 'tj run core get food');
  assert.equal((await route('tj find food')).canonicalCommand, 'tj run core get food');
  assert.equal((await route('tj get wood')).canonicalCommand, 'tj run core gather wood');
  assert.equal((await route('tj get coal')).canonicalCommand, 'tj run core mine coal');
  assert.equal((await route('tj get irn')).canonicalCommand, 'tj run core mine iron');
});

test('natural prep, base, and storage requests map or clarify safely', async () => {
  assert.equal((await route('tj lets get ready for mining')).canonicalCommand, 'tj run core prepare for mining');
  assert.equal((await route('tj make camp')).canonicalCommand, 'tj make camp');
  assert.equal((await route('tj make storage')).canonicalCommand, 'tj place storage chest');
  assert.equal((await route('tj light this place')).canonicalCommand, 'tj light home');

  const shelter = await route('tj build shelter');
  assert.equal(shelter.canonicalCommand, 'tj build shelter');
  assert.equal(shelter.riskLevel, 'medium');
  assert.equal(shelter.mode, 'clarify');

  const safe = await route('tj make us safe');
  assert.equal(safe.mode, 'clarify');
  assert.equal(safe.intent, 'make_safe');
  assert.ok(safe.alternatives.some((item) => item.canonicalCommand === 'tj run core prepare for night'));
});

test('unsupported and risky natural requests do not execute directly', async () => {
  const castle = await route('tj build a giant castle');
  assert.equal(castle.mode, 'refuse');
  assert.match(castle.speak, /giant builds/i);

  const nether = await route('tj go nether');
  assert.equal(nether.mode, 'clarify');
  assert.equal(nether.canonicalCommand, 'tj safe nether entry');
  assert.equal(nether.requiresConfirmation, true);
});

test('natural villager and gear requests map to existing commands', async () => {
  assert.equal((await route('tj find mending')).canonicalCommand, 'tj best trades');
  assert.equal((await route('tj find me good books')).canonicalCommand, 'tj best trades');
  assert.equal((await route('tj get better gear')).canonicalCommand, 'tj suggest gear upgrades');
  assert.equal((await route('tj check if we are ready for the Nether')).canonicalCommand, 'tj nether checklist');
  assert.equal((await route('tj equip axe')).canonicalCommand, 'tj equip axe');
  assert.equal((await route('tj equipt wood axr')).canonicalCommand, 'tj equip wooden axe');
  assert.equal((await route('tj equip pickaxe')).canonicalCommand, 'tj equip pickaxe');
});

test('critical natural command map covers direct action hooks without core router', async () => {
  const options = { config: { competentCoreEnabled: false } };
  assert.equal((await route('tj plugin status', options)).canonicalCommand, 'tj plugin status');
  assert.equal((await route('tj equip axe', options)).canonicalCommand, 'tj equip axe');
  assert.equal((await route('tj equip pickaxe', options)).canonicalCommand, 'tj equip pickaxe');
  assert.equal((await route('tj follow me', options)).canonicalCommand, 'tj follow me');
  assert.equal((await route('tj mine stone', options)).canonicalCommand, 'tj mine stone');
  assert.equal((await route('tj get wood', options)).canonicalCommand, 'tj gather wood');
  assert.equal((await route('tj find coal', options)).canonicalCommand, 'tj mine coal');
});

test('non-owner natural commands are refused', async () => {
  const result = await route('tj we need food', { sender: 'Steve', isOwner: false });
  assert.equal(result.mode, 'refuse');
  assert.match(result.speak, /Only ModVinny/i);
});

test('emergency stop still bypasses natural routing', async () => {
  const parsed = await parseChatMessage(bot(), memory(), {
    sender: 'ModVinny',
    rawText: 'tj nevermind',
    isOwner: true,
    addressedToBot: true,
    config: bot().mcaiConfig
  });
  assert.equal(parsed.type, 'command');
  assert.equal(parsed.command, 'stop');
  assert.equal(parsed.emergency, true);
});

test('LLM or caller-provided unknown commands cannot become routes', () => {
  assert.equal(mapIntentToCanonicalCommand({ canonicalCommand: 'tj teleport to diamonds', confidence: 1 }), null);
});

test('pending natural confirmation yes executes and no cancels', async () => {
  const store = memory();
  const ambiguous = await routeNaturalCommand(bot(), store, {
    rawText: 'tj make a little spot here',
    isOwner: true,
    addressedToBot: true,
    dryRun: false,
    config: bot().mcaiConfig
  });
  assert.equal(ambiguous.mode, 'clarify');
  assert.equal(store.get().pendingNaturalCommandIntent?.canonicalCommand, 'tj make camp');

  const yes = await routeNaturalCommand(bot(), store, {
    rawText: 'tj yes',
    isOwner: true,
    addressedToBot: true,
    config: bot().mcaiConfig
  });
  assert.equal(yes.mode, 'execute');
  assert.equal(yes.canonicalCommand, 'tj make camp');

  const secondStore = memory();
  await routeNaturalCommand(bot(), secondStore, {
    rawText: 'tj make a little spot here',
    isOwner: true,
    addressedToBot: true,
    dryRun: false,
    config: bot().mcaiConfig
  });
  const no = await routeNaturalCommand(bot(), secondStore, {
    rawText: 'tj no',
    isOwner: true,
    addressedToBot: true,
    config: bot().mcaiConfig
  });
  assert.equal(no.mode, 'refuse');
  assert.equal(secondStore.get().pendingNaturalCommandIntent, null);
});
