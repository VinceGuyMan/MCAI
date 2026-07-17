const hostileMobNames = new Set([
  'zombie', 'husk', 'drowned', 'skeleton', 'stray', 'spider', 'cave_spider',
  'creeper', 'witch', 'slime', 'magma_cube', 'phantom', 'pillager', 'vindicator',
  'evoker', 'vex', 'ravager', 'guardian', 'elder_guardian', 'blaze', 'ghast',
  'wither_skeleton', 'zoglin', 'piglin_brute', 'silverfish', 'endermite',
  'shulker', 'warden'
]);

const neutralMobNames = new Set([
  'wolf', 'bee', 'iron_golem', 'llama', 'panda', 'polar_bear', 'goat',
  'piglin', 'enderman', 'zombified_piglin', 'hoglin'
]);

const passiveMobNames = new Set([
  'cow', 'sheep', 'pig', 'chicken', 'rabbit', 'horse', 'donkey', 'mule',
  'camel', 'cat', 'fox', 'frog', 'parrot', 'turtle', 'villager', 'wandering_trader',
  'mooshroom', 'sniffer', 'squid', 'cod', 'salmon'
]);

const protectedNames = new Set([
  'villager', 'wandering_trader', 'iron_golem', 'wolf', 'cat', 'horse',
  'donkey', 'mule', 'llama', 'camel', 'fox', 'bee', 'panda', 'turtle'
]);

function entityName(entity) {
  const raw = String(entity?.name || entity?.mobType || entity?.displayName || entity?.username || entity?.type || '')
    .toLowerCase()
    .replace(/\s+/g, '_');
  return raw.includes('.') ? raw.split('.').pop() : raw;
}

function point(position) {
  if (!position) return null;
  return { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) };
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  return a.distanceTo ? a.distanceTo(b) : Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function isNamedEntity(entity) {
  return Boolean(entity?.customName || entity?.displayName?.extra?.length || entity?.nametag);
}

export function isBabyEntity(entity) {
  return Boolean(entity?.metadata?.some?.((entry) => entry?.key === 16 && entry?.value < 0));
}

export function isTamedEntity(entity) {
  return Boolean(entity?.metadata?.some?.((entry) => entry?.key === 17 && entry?.value));
}

export function isHostileMob(entity) {
  const name = entityName(entity);
  if (name === 'enderman') return Boolean(entity?.target || entity?.metadata?.some?.((entry) => entry?.value === true));
  if (name === 'hoglin') return true;
  return hostileMobNames.has(name);
}

export function isNeutralMob(entity) {
  return neutralMobNames.has(entityName(entity));
}

export function isPassiveMob(entity) {
  return passiveMobNames.has(entityName(entity));
}

export function isProtectedEntity(entity, config = {}) {
  const name = entityName(entity);
  if (entity?.type === 'player' || entity?.username) return true;
  if (protectedNames.has(name) && !config.allowAttackingVillagers) return true;
  if (isNamedEntity(entity) && !config.allowAttackingNamedMobs) return true;
  if (isTamedEntity(entity) && !config.allowAttackingTamedMobs) return true;
  if (isBabyEntity(entity) && !config.allowAttackingBabyMobs) return true;
  if (isPassiveMob(entity) && !config.allowAttackingPassiveAnimals) return true;
  return false;
}

export function classifyEntity(entity, config = {}) {
  const name = entityName(entity);
  if (entity?.type === 'player' || entity?.username) return { name, kind: 'player', protected: true };
  if (isProtectedEntity(entity, config)) return { name, kind: 'protected', protected: true };
  if (isHostileMob(entity)) return { name, kind: 'hostile', protected: false };
  if (isNeutralMob(entity)) return { name, kind: 'neutral', protected: false };
  if (isPassiveMob(entity)) return { name, kind: 'passive', protected: !config.allowAttackingPassiveAnimals };
  return { name, kind: 'unknown', protected: true };
}

export function isThreatToBot(bot, entity) {
  if (!bot.entity || !entity?.position) return false;
  const name = entityName(entity);
  const dist = distance(bot.entity.position, entity.position);
  if (name === 'warden') return dist <= 32;
  if (name === 'creeper') return dist <= 10;
  return isHostileMob(entity) && dist <= (bot.mcaiConfig?.hostileDetectionRadius || 24);
}

export function isThreatToOwner(bot, entity, ownerEntity) {
  if (!ownerEntity || !entity?.position) return false;
  const dist = distance(ownerEntity.position, entity.position);
  if (entityName(entity) === 'creeper') return dist <= 12;
  return isHostileMob(entity) && dist <= (bot.mcaiConfig?.defendOwnerRadius || 16);
}

export function isThreatToBase(bot, entity, memory) {
  const home = memory.get?.().homeBasePosition;
  if (!home || !entity?.position) return false;
  const dist = Math.hypot(home.x - entity.position.x, home.y - entity.position.y, home.z - entity.position.z);
  return isHostileMob(entity) && dist <= (bot.mcaiConfig?.defendBaseRadius || 24);
}

export function scoreThreat(bot, entity, context = {}) {
  const name = entityName(entity);
  const botDistance = bot.entity?.position && entity?.position ? distance(bot.entity.position, entity.position) : 99;
  let score = Math.max(1, 40 - botDistance);
  if (name === 'warden') score += 100;
  if (name === 'creeper') score += 40;
  if (['witch', 'ravager', 'evoker', 'vex'].includes(name)) score += 30;
  if (['skeleton', 'stray', 'pillager', 'blaze', 'guardian'].includes(name)) score += 18;
  if (context.ownerThreat) score += 25;
  if (context.baseThreat) score += 15;
  return score;
}

export function scanThreats(bot, memory, radius = null) {
  const config = bot.mcaiConfig || {};
  const maxDistance = radius || config.hostileDetectionRadius || 24;
  const owner = bot.players?.[config.ownerUsername]?.entity || null;
  const threats = Object.values(bot.entities || {})
    .filter((entity) => entity && entity !== bot.entity && entity.position && bot.entity?.position)
    .map((entity) => {
      const classification = classifyEntity(entity, config);
      const dist = distance(bot.entity.position, entity.position);
      const ownerThreat = isThreatToOwner(bot, entity, owner);
      const baseThreat = isThreatToBase(bot, entity, memory);
      const botThreat = isThreatToBot(bot, entity);
      return {
        entity,
        id: entity.id,
        name: classification.name,
        kind: classification.kind,
        protected: classification.protected,
        position: point(entity.position),
        distance: Number(dist.toFixed(1)),
        botThreat,
        ownerThreat,
        baseThreat,
        score: scoreThreat(bot, entity, { ownerThreat, baseThreat })
      };
    })
    .filter((threat) => threat.distance <= maxDistance && (threat.botThreat || threat.ownerThreat || threat.baseThreat || threat.kind === 'hostile'))
    .sort((a, b) => b.score - a.score);

  return threats;
}

export function choosePrimaryThreat(bot, threats = []) {
  return threats
    .filter((threat) => threat.kind === 'hostile' && !threat.protected)
    .sort((a, b) => b.score - a.score || a.distance - b.distance)[0] || null;
}

export function summarizeThreats(threats = []) {
  if (!threats.length) return 'No hostile threats nearby.';
  return threats.slice(0, 6).map((threat) => `${threat.name} ${threat.distance}b`).join(', ');
}

export { hostileMobNames, neutralMobNames, passiveMobNames, entityName };
