import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scoreTrade, classifyTrade, isValuableTrade } from '../tradeScoring.js';
import { canTradeWithVillager } from '../tradeSafety.js';
import { economyStatus, willViolateEmeraldReserve } from '../economyManager.js';
import { ensureVillagerMemoryShape, loadVillagerMemory, saveVillagerMemory } from '../villagerMemory.js';
import { tradingStatus } from '../villagerTrading.js';
import { getSkill } from '../skillRegistry.js';
import { getCommands } from '../commandRegistry.js';

function mockItem(name, count = 1) {
  return { name, count, displayName: name };
}

function mockBot(items = []) {
  return {
    entity: {
      position: {
        x: 0,
        y: 64,
        z: 0,
        distanceTo(other) {
          const dx = this.x - other.x;
          const dy = this.y - other.y;
          const dz = this.z - other.z;
          return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
      }
    },
    inventory: {
      items: () => items
    },
    entities: {},
    players: {
      ModVinny: {
        entity: {
          position: {
            x: 2,
            y: 64,
            z: 2
          }
        }
      }
    }
  };
}

const villagerEntity = {
  id: 1,
  name: 'villager',
  position: { x: 1, y: 64, z: 1 },
  metadata: {}
};

test('trade scoring ranks useful enchanted books high', () => {
  const trade = {
    inputItem1: mockItem('emerald', 24),
    inputItem2: mockItem('book', 1),
    outputItem: { name: 'enchanted_book', displayName: 'Enchanted Book', count: 1, nbt: { enchantments: ['mending'] } }
  };
  assert.equal(classifyTrade(trade), 'valuable_enchanted_book');
  assert.equal(isValuableTrade(trade), true);
  assert.ok(scoreTrade(trade) >= 70);
});

test('unknown expensive trades are scored cautiously', () => {
  const trade = {
    inputItem1: mockItem('emerald', 64),
    outputItem: mockItem('flower_pot', 1)
  };
  assert.ok(scoreTrade(trade) < 35);
});

test('economy manager enforces emerald reserve', () => {
  const bot = mockBot([mockItem('emerald', 6)]);
  const trade = {
    inputItem1: mockItem('emerald', 4),
    outputItem: mockItem('bread', 6)
  };
  const reserve = willViolateEmeraldReserve(bot, trade, 1);
  assert.equal(reserve.violates, true);
});

test('trade safety blocks non-owner and missing confirmation', () => {
  const bot = mockBot([mockItem('emerald', 20), mockItem('book', 1)]);
  const trade = {
    wanted: ['emerald', 'book'],
    offered: 'enchanted_book'
  };
  const result = canTradeWithVillager(bot, villagerEntity, trade, 1, { sender: 'Steve' });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => /ModVinny/.test(blocker)));
  assert.ok(result.blockers.some((blocker) => /confirmation/.test(blocker)));
});

test('trade safety blocks insufficient inputs', () => {
  const bot = mockBot([mockItem('emerald', 1)]);
  const trade = {
    inputItem1: mockItem('emerald', 8),
    outputItem: mockItem('arrow', 16)
  };
  const result = canTradeWithVillager(bot, villagerEntity, trade, 1, {
    sender: 'ModVinny',
    confirmed: true,
    confirmSpendEmeralds: true
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => /missing trade inputs/.test(blocker)));
});

test('villager memory validates and saves safely', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'villagers-')), 'villager-memory.json');
  const shaped = ensureVillagerMemoryShape({ knownVillages: [{ name: 'Test Village', center: { x: 1, y: 64, z: 2 } }] });
  saveVillagerMemory(shaped, file);
  const loaded = loadVillagerMemory(file);
  assert.equal(loaded.version, 1);
  assert.equal(loaded.knownVillages.length, 1);
});

test('trading status is honest when API is unavailable', () => {
  const result = tradingStatus(mockBot());
  assert.equal(result.ok, true);
  assert.match(result.message, /unavailable/i);
});

test('registry marks trade execution risky and confirmation-gated', () => {
  const skill = getSkill('execute_trade');
  assert.equal(skill.riskLevel, 'medium');
  assert.equal(skill.requiresConfirmation, true);
  const command = getCommands().find((item) => item.name === 'execute_trade');
  assert.equal(command.requiresConfirmation, true);
});
