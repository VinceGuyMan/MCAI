import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreArmorPiece, scoreTool, getEnchantments } from '../gearScore.js';
import { canBrewPotion, canEnchantItem, canUseBook } from '../gearSafety.js';
import { classifyPotion } from '../potionSystem.js';
import { getApplicableBooks } from '../anvilSystem.js';
import { enchantingStatus } from '../enchanting.js';
import { brewingStatus } from '../brewing.js';
import { getEvidenceDefinition } from '../progressEvidence.js';
import { getSkill } from '../skillRegistry.js';
import { validateMilestoneDefinitions } from '../progressionRegistry.js';

function mockBot(items = [], patch = {}) {
  return {
    mcaiConfig: {
      ownerUsername: 'ModVinny',
      requireConfirmationForEnchanting: true,
      requireConfirmationForAnvilUse: true,
      requireConfirmationForBookUse: true,
      requireConfirmationForDiamondGearEnchanting: true,
      requireConfirmationForNetheriteGear: true,
      requireConfirmationForPotionUse: true,
      requireConfirmationForBrewing: true,
      brewingEnabled: false,
      keepLapisReserve: 3,
      ...patch.config
    },
    experience: { level: patch.level ?? 0, points: 0 },
    inventory: {
      items: () => items,
      slots: []
    },
    ...patch
  };
}

test('gear scoring ranks iron tools above stone tools', () => {
  assert.ok(scoreTool({ name: 'iron_pickaxe', count: 1 }) > scoreTool({ name: 'stone_pickaxe', count: 1 }));
});

test('gear scoring values useful enchantments', () => {
  const plain = { name: 'iron_chestplate', count: 1 };
  const enchanted = { name: 'iron_chestplate', count: 1, enchants: [{ name: 'protection', level: 2 }, { name: 'unbreaking', level: 2 }, { name: 'mending', level: 1 }] };
  assert.ok(scoreArmorPiece(enchanted) > scoreArmorPiece(plain));
  assert.deepEqual(getEnchantments(enchanted).map((item) => item.name), ['protection', 'unbreaking', 'mending']);
});

test('gear scoring handles missing NBT safely', () => {
  assert.equal(getEnchantments({ name: 'iron_sword' }).length, 0);
  assert.ok(scoreTool({ name: 'wooden_pickaxe' }) > 0);
});

test('gear safety blocks diamond enchanting without explicit diamond confirmation', () => {
  const bot = mockBot([], { level: 10 });
  const result = canEnchantItem(bot, { name: 'diamond_pickaxe' }, { sender: 'ModVinny', confirmed: true });
  assert.equal(result.ok, false);
  assert.match(result.reason, /diamond/i);
});

test('gear safety blocks rare enchanted book use without rare-book confirmation', () => {
  const bot = mockBot();
  const result = canUseBook(
    bot,
    { name: 'enchanted_book', enchants: [{ name: 'mending', level: 1 }] },
    { name: 'iron_pickaxe' },
    { sender: 'ModVinny', confirmed: true }
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /rare|book/i);
});

test('gear safety blocks brewing when support is disabled', () => {
  const bot = mockBot();
  const result = canBrewPotion(bot, 'fire_resistance', { sender: 'ModVinny', confirmed: true });
  assert.equal(result.ok, false);
  assert.match(result.reason, /disabled|support/i);
});

test('potion classification treats unknown potions conservatively', () => {
  const classified = classifyPotion({ name: 'potion', displayName: 'Mysterious Potion' });
  assert.equal(classified.type, 'unknown');
  assert.equal(classified.safeDefault, false);
});

test('anvil book applicability prefers compatible useful books', () => {
  const bot = mockBot([
    { name: 'enchanted_book', count: 1, enchants: [{ name: 'efficiency', level: 2 }] },
    { name: 'enchanted_book', count: 1, enchants: [{ name: 'sharpness', level: 2 }] }
  ]);
  const books = getApplicableBooks(bot, { name: 'iron_pickaxe' });
  assert.ok(books.some((book) => book.enchantments.some((enchant) => enchant.name === 'efficiency')));
});

test('enchanting supply check reports missing XP and lapis', () => {
  const bot = mockBot([{ name: 'iron_pickaxe', count: 1 }], { level: 0 });
  const status = enchantingStatus(bot);
  assert.equal(status.ok, true);
  assert.equal(status.data.supplies.xpLevel, 0);
  assert.equal(status.data.supplies.lapis, 0);
});

test('gear evidence names are registered', () => {
  for (const name of ['gear_status_reported', 'item_enchanted', 'anvil_status_reported', 'potion_status_reported', 'brewing_status_reported']) {
    assert.ok(getEvidenceDefinition(name), `${name} missing`);
  }
});

test('mutating gear skills are risky and confirmation gated', () => {
  for (const name of ['enchant_item', 'repair_item', 'apply_book_to_item', 'use_potion', 'brew_potion']) {
    const skill = getSkill(name);
    assert.ok(skill, `${name} missing`);
    assert.equal(skill.requiresConfirmation, true);
    assert.ok(['medium', 'high'].includes(skill.riskLevel));
  }
});

test('progression milestones validate with gear additions', () => {
  const result = validateMilestoneDefinitions();
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('brewing status does not claim implementation when API is unavailable', () => {
  const result = brewingStatus(mockBot());
  assert.equal(result.ok, true);
  assert.equal(result.data.apiAvailable, false);
  assert.match(result.message, /not implemented|scaffolded|not reliable/i);
});
