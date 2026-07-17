import { getMilestone } from './progressionRegistry.js';
import { loadProgressionState } from './progressionState.js';

const paths = [
  path('safe_survival', 'Safe Survival', [
    'connect_bot',
    'obey_owner_only',
    'emergency_stop_ready',
    'status_check_ready',
    'get_food',
    'craft_basic_tools',
    'set_home',
    'make_torches',
    'place_storage',
    'create_wheat_farm',
    'mining_readiness',
    'gather_coal',
    'gather_iron',
    'craft_shield',
    'craft_iron_armor',
    'enchanting_status_known',
    'anvil_known',
    'potion_inventory_known',
    'nether_checklist'
  ], 'A cautious path that builds survival, base, food, mining, and Nether prep readiness.'),
  path('builder', 'Builder', ['set_home', 'place_storage', 'build_workstation', 'build_small_shelter', 'light_home', 'create_wheat_farm', 'create_animal_pen'], 'Base and infrastructure first.'),
  path('miner', 'Miner', ['get_food', 'craft_basic_tools', 'make_torches', 'mining_readiness', 'gather_coal', 'gather_iron', 'mining_pickaxe_upgraded', 'safe_branch_mine'], 'Mining readiness and resource progression.'),
  path('farmer', 'Farmer', ['get_food', 'create_wheat_farm', 'maintain_farm', 'food_security', 'create_animal_pen', 'breed_animals'], 'Food and animal safety progression.'),
  path('explorer', 'Explorer', ['get_food', 'set_home', 'remember_waypoint', 'scan_area', 'map_home_area', 'scout_and_return', 'mark_danger_zone'], 'Map memory and safe scouting progression.'),
  path('nether_prep', 'Nether Prep', ['craft_iron_tools', 'craft_shield', 'craft_iron_armor', 'nether_checklist', 'potion_inventory_known', 'nether_gear_ready', 'equip_gold_armor_piece', 'prepare_nether_supplies', 'build_portal'], 'Nether preparation without autonomous Nether entry.')
];

function path(name, displayName, milestones, description) {
  return { name, displayName, milestones, description };
}

function normalize(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
}

export function getProgressionPaths() {
  return paths.map((item) => ({ ...item, milestones: [...item.milestones] }));
}

export function getProgressionPath(name) {
  const key = normalize(name);
  const found = paths.find((item) => item.name === key || normalize(item.displayName) === key);
  return found ? { ...found, milestones: [...found.milestones] } : null;
}

export function listProgressionPaths() {
  return getProgressionPaths();
}

export function getRecommendedPathName(memory) {
  if (memory?.get) {
    const data = memory.get();
    return data?.progressionPreferredPath || 'safe_survival';
  }
  return memory?.progressionPreferredPath || 'safe_survival';
}

export function getNextMilestoneInPath(pathName, state = loadProgressionState()) {
  const progressionPath = getProgressionPath(pathName);
  if (!progressionPath) return null;
  const completed = new Set(Object.keys(state.completedMilestones || {}));
  const nextId = progressionPath.milestones.find((id) => !completed.has(id));
  return nextId ? getMilestone(nextId) : null;
}

export function explainPath(pathName) {
  const progressionPath = getProgressionPath(pathName);
  if (!progressionPath) return `Unknown path: ${pathName}`;
  const names = progressionPath.milestones
    .map((id) => getMilestone(id)?.name || id)
    .join(' -> ');
  return `${progressionPath.displayName}: ${progressionPath.description} Path: ${names}`;
}
