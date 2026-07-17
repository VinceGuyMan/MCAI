import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { getBlueprint, getBlueprints, validateAllBlueprints, validateBlueprint } from '../blueprintRegistry.js';
import { estimateMaterials, hasEnoughMaterials } from '../materialEstimator.js';
import { createBuildPlan, planPlacementOrder } from '../blueprintPlanner.js';
import { validateBlockSafety, validateBuildDimensions, validateBuildArea } from '../blueprintSafety.js';
import { importSchematic, schematicImportStatus } from '../schematicImport.js';
import { getSkill } from '../skillRegistry.js';
import { getEvidenceDefinition } from '../progressEvidence.js';

function mockBot(items = []) {
  return {
    username: 'tj',
    entity: { position: new Vec3(0, 64, 0) },
    players: {
      ModVinny: { entity: { position: new Vec3(0, 64, 0) } }
    },
    game: { dimension: 'overworld' },
    inventory: { items: () => items },
    entities: {},
    blockAt(position) {
      if (position.y < 64) return { name: 'grass_block', boundingBox: 'block', position };
      return { name: 'air', boundingBox: 'empty', position };
    }
  };
}

test('built-in blueprints validate', () => {
  const result = validateAllBlueprints();
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.ok(getBlueprints().length >= 7);
});

test('duplicate or invalid blueprint data is rejected', () => {
  const blueprint = {
    id: 'bad_blueprint',
    name: 'Bad',
    category: 'base',
    description: 'Bad blueprint.',
    riskLevel: 'low',
    requiresConfirmation: true,
    width: 1,
    length: 1,
    height: 1,
    origin: 'center_floor',
    blocks: [{ x: 0, y: 0, z: 0, block: 'tnt' }],
    tags: [],
    implemented: true
  };
  const result = validateBlueprint(blueprint);
  assert.equal(result.ok, false);
});

test('material estimation counts blocks correctly', () => {
  const blueprint = getBlueprint('starter_workstation');
  const materials = estimateMaterials(blueprint);
  assert.equal(materials.crafting_table, 1);
  assert.equal(materials.furnace, 1);
  assert.equal(materials.chest, 1);
});

test('missing materials are reported', () => {
  const blueprint = getBlueprint('starter_workstation');
  const status = hasEnoughMaterials(mockBot([]), blueprint);
  assert.equal(status.ok, false);
  assert.ok(status.missing.crafting_table >= 1);
});

test('dangerous blocks are rejected', () => {
  assert.equal(validateBlockSafety('tnt').ok, false);
  assert.equal(validateBlockSafety('oak_planks').ok, true);
});

test('oversized blueprints are rejected', () => {
  const blueprint = { ...getBlueprint('starter_workstation'), width: 99 };
  const result = validateBuildDimensions(blueprint, { maxBlueprintWidth: 16, maxBlueprintLength: 16, maxBlueprintHeight: 8, maxBlueprintBlocks: 256 });
  assert.equal(result.ok, false);
});

test('protected blocks in a build area block the plan', () => {
  const bot = mockBot([]);
  bot.blockAt = (position) => position.x === 3 && position.y === 64 && position.z === 3
    ? { name: 'chest', boundingBox: 'block', position }
    : position.y < 64
      ? { name: 'grass_block', boundingBox: 'block', position }
      : { name: 'air', boundingBox: 'empty', position };
  const plan = createBuildPlan(bot, {}, 'starter_workstation').plan;
  const result = validateBuildArea(bot, {}, plan);
  assert.equal(result.ok, false);
});

test('schematic import is disabled and path traversal is rejected', () => {
  assert.equal(schematicImportStatus().supported, false);
  const result = importSchematic('../outside.schem');
  assert.equal(result.ok, false);
  assert.match(result.reason, /schematics folder|disabled|unsupported/i);
});

test('build skills are confirmation gated and mutating', () => {
  const skill = getSkill('blueprint_build_small');
  assert.equal(skill.requiresConfirmation, true);
  assert.equal(skill.riskLevel, 'medium');
});

test('blueprint evidence names exist', () => {
  for (const name of ['blueprint_status_reported', 'blueprint_block_verified', 'blueprint_build_cancelled']) {
    assert.ok(getEvidenceDefinition(name), `${name} should exist`);
  }
});

test('build plan sorts foundation before roof/details', () => {
  const blueprint = getBlueprint('small_shelter_5x5');
  const blocks = planPlacementOrder(blueprint, new Vec3(0, 64, 0), 0);
  const firstRoofIndex = blocks.findIndex((entry) => entry.position.y > 65);
  const firstFloorIndex = blocks.findIndex((entry) => entry.position.y === 64);
  assert.ok(firstFloorIndex >= 0);
  assert.ok(firstRoofIndex === -1 || firstFloorIndex < firstRoofIndex);
});
