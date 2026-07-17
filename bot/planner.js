function stateSummary(state) {
  return JSON.stringify({
    bot: state.botUsername,
    health: state.health,
    food: state.food,
    oxygen: state.oxygen,
    position: state.position,
    currentTask: state.currentTask,
    ownerDistance: state.ownerDistance,
    homeExists: state.homeExists,
    nearHome: state.nearHome,
    distanceFromHome: state.distanceFromHome,
    activeExploration: state.activeExploration,
    combatMode: state.combatMode,
    threatCount: state.threatCount,
    primaryThreat: state.primaryThreat,
    threatsNearOwner: state.threatsNearOwner?.slice(0, 4),
    threatsNearHome: state.threatsNearHome?.slice(0, 4),
    combatReady: state.combatReady,
    shouldFleeCombat: state.shouldFleeCombat,
    activeGoalName: state.activeGoalName,
    activeGoalStatus: state.activeGoalStatus,
    activeGoalNextStep: state.activeGoalNextStep,
    plannerPaused: state.plannerPaused,
    nearbyKnownWaypoint: state.nearbyKnownWaypoint,
    visibleResources: state.visibleResources?.slice(0, 6),
    visibleLandmarks: state.visibleLandmarks?.slice(0, 4),
    nearestDangerZone: state.nearestDangerZone,
    baseResourceCounts: state.baseResourceCounts,
    dangerFlags: state.dangerFlags,
    nearbyHostileMobs: state.nearbyHostileMobs.slice(0, 4),
    nearbyUsefulBlocks: state.nearbyUsefulBlocks.slice(0, 8),
    inventory: state.inventory
  });
}

export function createPlanner(config, ollama, memory) {
  async function answerChat(message, state) {
    return ollama.chatText([
      {
        role: 'system',
        content: 'You are tj, a physical Minecraft player. Reply briefly and casually. Do not claim to be unable to see Minecraft; use only the provided state.'
      },
      {
        role: 'user',
        content: `ModVinny said: ${message}\nState: ${stateSummary(state)}`
      }
    ]);
  }

  async function planFor(message, state) {
    const now = Date.now();
    const mem = memory.get();
    if (now - (mem.lastOllamaDecisionAt || 0) < config.ollamaDecisionCooldownMs) {
      return { intent: 'none', speak: '', priority: 'low', actions: [] };
    }

    memory.update({ lastOllamaDecisionAt: now });
    return ollama.plan([
      {
        role: 'system',
        content: 'You plan safe Minecraft companion behavior for tj. Return only valid schema JSON. Never override emergency safety. Prefer chat/status/follow/stay/gather_wood. Dialogue actions may answer, clarify, report personality, or report conversation memory, but dialogue must never execute raw movement/dig/attack/place/open chest/portal entry. Long-term planning actions may create, list, explain, start, pause, resume, cancel, approve, reject, or execute approved goals, but they must not directly execute raw movement/dig/attack/place. Crafting, food, armour, base building, storage, resource runs, mining, farming, animal care, exploration, routes, scanning, waypoint travel, combat, Nether preparation/portal handling, and goal execution are deterministic code; never invent recipes, cooking steps, farm layouts, pen layouts, mining paths, block blueprints, waypoints, routes, discoveries, map data, combat targets, attack rules, portal safety, unsupported actions, or fake progress. Map broad planning requests to goal actions only when clearly requested. Do not start building, mining, chest use, farms, animal luring, breeding, exploration travel, route following, combat engagement, long resource runs, valuables, dangerous items, redstone, diamonds, major builds, Nether portal lighting, Nether entry, Nether exploration, Nether mining, or decorative bulk tasks without owner command/confirmation. Never bypass goal, risky-step, large farm, animal, diamond, deep mining, caving, night exploration, long exploration, forget-location, PVP, dangerous-combat, neutral-attack, raid-defense, portal-lighting, or Nether-entry confirmations. Never start fortress or bastion search in this phase. Never mark goals complete without world-state evidence. Never attack players, pets, villagers, named mobs, baby mobs, or protected entities. Passive food-animal hunting is allowed only when ModVinny explicitly uses a registered food/hunt command and deterministic safety allows it; never invent raw attack targets. Never override flee logic.'
      },
      {
        role: 'user',
        content: `Message: ${message || '(semi autonomous tick)'}\nState: ${stateSummary(state)}`
      }
    ]);
  }

  return { answerChat, planFor };
}

