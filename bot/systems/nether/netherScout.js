import * as lighting from '../../lighting.js';
import * as inventory from '../../inventory.js';
import * as mapMemoryStore from '../../mapMemory.js';
import * as netherPrep from './netherPrep.js';
import * as netherSafety from './netherSafety.js';
import * as portalManager from './portalManager.js';

function point(pos) {
  if (!pos) return null;
  return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
}

function compactDangers(dangers) {
  const out = [];
  if (dangers.lavaNearby) out.push('lava');
  if (dangers.fireNearby) out.push('fire');
  if (dangers.fallRisk) out.push('fall risk');
  if (dangers.ghastNearby) out.push('ghast');
  if (dangers.piglinNearby) out.push('piglins');
  if (dangers.hoglinNearby) out.push('hoglins');
  if (dangers.blazeNearby) out.push('blaze');
  if (dangers.witherSkeletonNearby) out.push('wither skeleton');
  if (dangers.magmaCubeNearby) out.push('magma cube');
  if (dangers.fortressPossibleNearby) out.push('possible fortress');
  if (dangers.bastionPossibleNearby) out.push('possible bastion');
  return out;
}

function rememberDangerSummary(bot, mapMemory, dangers) {
  const here = point(bot.entity?.position);
  if (!here) return [];
  const remembered = [];
  for (const name of compactDangers(dangers)) {
    const record = mapMemoryStore.addNetherDanger(mapMemory, {
      dangerType: name.replace(/\s+/g, '_'),
      position: here,
      radius: name.includes('possible') ? 16 : 10,
      severity: ['lava', 'ghast', 'blaze', 'wither skeleton', 'fall risk'].includes(name) ? 'high' : 'medium',
      notes: `Seen during Nether entry scan: ${name}.`
    });
    if (record) remembered.push(record);
  }
  return remembered;
}

export async function scanNetherEntryArea(bot, memory, mapMemory, options = {}) {
  const radius = options.radius || bot.mcaiConfig?.netherDangerScanRadius || 32;
  const dangers = netherSafety.scanNetherDangers(bot, radius);
  const remembered = netherSafety.isInNether(bot) ? rememberDangerSummary(bot, mapMemory, dangers) : [];
  if (remembered.length) mapMemoryStore.saveMapMemory(mapMemory);
  memory.update?.({
    lastNetherDangerScanAt: Date.now(),
    lastNetherDangerSummary: compactDangers(dangers)
  });
  return {
    ok: true,
    dangers,
    remembered,
    message: compactDangers(dangers).length
      ? `Nether scan found: ${compactDangers(dangers).join(', ')}.`
      : 'Nether entry area looks clear from here.'
  };
}

export async function placeNetherPortalMarkers(bot, memory, options = {}) {
  if (!netherSafety.isInNether(bot)) return { ok: false, message: 'I am not in the Nether.' };
  if (!lighting.hasTorches(bot)) return { ok: false, message: 'I do not have torches for portal markers.' };
  const torchCount = (bot.inventory?.items?.() || [])
    .filter((item) => item.name === 'torch')
    .reduce((sum, item) => sum + item.count, 0);
  if (torchCount <= 2) return { ok: false, message: 'I should keep my last torches for emergencies.' };
  const placed = await lighting.placeTorchNear(bot, {
    ownerUsername: options.ownerUsername || bot.mcaiConfig?.ownerUsername,
    survivalMode: true
  });
  if (placed.ok) {
    memory.update?.({ knownNetherSafeSpots: [{ position: placed.position, at: Date.now() }] });
  }
  return placed;
}

export async function buildSmallPortalSafetyPlatform(bot, memory, options = {}) {
  if (!netherSafety.isInNether(bot)) return { ok: false, message: 'I am not in the Nether.' };
  const blocks = inventory.countNetherBlocks(bot);
  if (blocks < 8) return { ok: false, message: 'I need more solid blocks before improving the portal platform.' };
  return { ok: true, message: 'Portal platform check is scaffolded; I will not build over lava in this phase.' };
}

export async function secureNetherPortalArea(bot, memory, mapMemory, options = {}) {
  const scan = await scanNetherEntryArea(bot, memory, mapMemory, options);
  if (!netherSafety.isInNether(bot)) return scan;
  if (netherSafety.shouldReturnToPortal(bot, memory, { config: bot.mcaiConfig }).shouldReturn) {
    return { ok: false, message: `Unsafe Nether portal area: ${netherSafety.netherAbortReason(bot, memory)}.`, scan };
  }
  const marker = await placeNetherPortalMarkers(bot, memory, options).catch((error) => ({ ok: false, message: error.message }));
  return {
    ok: true,
    scan,
    marker,
    message: marker.ok ? 'Nether portal area scanned and marked.' : `Nether portal area scanned. ${marker.message}`
  };
}

export async function safeNetherEntry(bot, memory, mapMemory, options = {}) {
  const config = bot.mcaiConfig || {};
  if (config.requireConfirmationForNetherEntry && !options.confirmed && !options.override) {
    return { ok: false, requiresConfirmation: 'nether_entry', message: 'Nether entry needs confirmation.' };
  }

  const checklist = netherPrep.getNetherChecklist(bot, memory);
  if (!checklist.ready && !options.override) {
    memory.update?.({ netherChecklistLastResult: checklist, netherReadyLastCheckedAt: Date.now() });
    return {
      ok: false,
      message: `I am not Nether-ready yet. Missing: ${checklist.missing.join(', ') || 'unknown'}.`,
      checklist
    };
  }

  const entered = await portalManager.enterNetherPortal(bot, memory, mapMemory, { ...options, confirmed: true });
  if (!entered.ok) return entered;

  memory.update?.({
    netherScoutActive: true,
    netherReturnTarget: memory.get?.().netherPortalPosition || point(bot.entity?.position)
  });

  const scan = await scanNetherEntryArea(bot, memory, mapMemory, options);
  const unsafe = netherSafety.shouldReturnToPortal(bot, memory, { config }).shouldReturn;
  let marker = null;
  if (!unsafe) marker = await secureNetherPortalArea(bot, memory, mapMemory, options).catch((error) => ({ ok: false, message: error.message }));

  let returned = null;
  if (unsafe || config.returnToOverworldAfterFirstEntry) {
    returned = await portalManager.exitNetherPortal(bot, memory, mapMemory, { ...options, confirmed: true }).catch((error) => ({ ok: false, message: error.message }));
  }

  mapMemoryStore.addNetherEntryRecord(mapMemory, {
    overworldPortal: memory.get?.().overworldPortalPosition || null,
    netherPortal: memory.get?.().netherPortalPosition || null,
    dangers: compactDangers(scan.dangers),
    returned: Boolean(returned?.ok),
    at: Date.now()
  });
  mapMemoryStore.saveMapMemory(mapMemory);

  memory.update?.({
    netherScoutActive: false,
    lastNetherAbortReason: unsafe ? netherSafety.netherAbortReason(bot, memory) : null
  });

  const dangerText = compactDangers(scan.dangers).join(', ') || 'no immediate danger';
  if (unsafe) return { ok: false, message: `Entered, scanned ${dangerText}, then returned/attempted return because it was unsafe.`, scan, returned };
  if (returned?.ok) return { ok: true, message: `Safe entry complete. I scanned ${dangerText} and returned to the Overworld.`, scan, marker, returned };
  return { ok: true, message: `Safe entry complete. I scanned ${dangerText} and stayed near the portal.`, scan, marker };
}

export async function netherScout(bot, memory, mapMemory, options = {}) {
  const config = bot.mcaiConfig || {};
  const maxDistance = Math.min(options.distance || config.maxNetherScoutDistance || 32, config.maxNetherScoutDistance || 32);
  const fromPortal = portalManager.findReturnPortalInNether(bot, memory, mapMemory);
  if (!netherSafety.isInNether(bot)) return safeNetherEntry(bot, memory, mapMemory, options);
  if (!fromPortal.ok) return fromPortal;
  if (maxDistance > (config.maxDistanceFromNetherPortal || 32)) {
    return { ok: false, message: 'That is farther than my Nether safety limit.' };
  }
  const scan = await scanNetherEntryArea(bot, memory, mapMemory, options);
  if (netherSafety.shouldReturnToPortal(bot, memory, { config }).shouldReturn) {
    const returned = await portalManager.exitNetherPortal(bot, memory, mapMemory, { confirmed: true }).catch((error) => ({ ok: false, message: error.message }));
    return { ok: false, message: `Nether scout aborted: ${netherSafety.netherAbortReason(bot, memory)}.`, scan, returned };
  }
  return { ok: true, message: scan.message, scan };
}

export async function returnFromNetherScout(bot, memory, mapMemory, options = {}) {
  return portalManager.exitNetherPortal(bot, memory, mapMemory, { ...options, confirmed: true });
}

export function reportNetherScoutResults(bot, memory, mapMemory) {
  const summary = mapMemoryStore.summarizeNetherMemory(mapMemory);
  const last = memory.get?.().lastNetherDangerSummary || [];
  return {
    ok: true,
    summary,
    message: `Nether memory: ${summary.netherPortals} portal(s), ${summary.netherDangers} danger zone(s), ${summary.entries} entry record(s). Last scan: ${last.length ? last.join(', ') : 'clear or unknown'}.`
  };
}
