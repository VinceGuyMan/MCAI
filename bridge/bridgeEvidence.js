export const BRIDGE_EVIDENCE_NAMES = [
  'bridge_status_reported',
  'bridge_connected',
  'bridge_unavailable',
  'bridge_event_received',
  'bridge_emergency_stop_received',
  'bridge_region_registered',
  'bridge_region_deleted',
  'bridge_player_death_recorded',
  'bridge_player_respawn_recorded',
  'bridge_advancement_recorded',
  'bridge_protected_region_event',
  'bridge_villager_event_recorded',
  'bridge_portal_event_recorded',
  'bridge_danger_event_recorded'
];

export function validateBridgeEvidenceName(name) {
  return BRIDGE_EVIDENCE_NAMES.includes(name);
}

export function bridgeEventToEvidence(event = {}) {
  const evidence = ['bridge_event_received'];
  switch (event.type) {
    case 'bridge_emergency_stop':
      evidence.push('bridge_emergency_stop_received');
      break;
    case 'bridge_region_registered':
      evidence.push('bridge_region_registered');
      break;
    case 'bridge_region_deleted':
      evidence.push('bridge_region_deleted');
      break;
    case 'player_death':
      evidence.push('bridge_player_death_recorded');
      break;
    case 'player_respawn':
      evidence.push('bridge_player_respawn_recorded');
      break;
    case 'player_advancement_done':
      evidence.push('bridge_advancement_recorded');
      break;
    case 'block_break_in_region':
    case 'block_place_in_region':
      evidence.push('bridge_protected_region_event');
      break;
    case 'villager_death':
    case 'iron_golem_death':
      evidence.push('bridge_villager_event_recorded');
      break;
    case 'portal_used':
      evidence.push('bridge_portal_event_recorded');
      break;
    case 'hostile_near_region':
    case 'explosion_near_region':
    case 'block_ignite_near_region':
      evidence.push('bridge_danger_event_recorded');
      break;
    default:
      break;
  }
  return [...new Set(evidence)];
}

export function recordBridgeEvidence(event, evidenceSystem = null) {
  const evidence = bridgeEventToEvidence(event);
  return {
    ok: true,
    eventId: event?.id || '',
    evidence,
    summary: evidence.join(', ')
  };
}

export function getBridgeEvidenceSummary(events = []) {
  const counts = {};
  for (const event of events) {
    for (const evidence of bridgeEventToEvidence(event)) counts[evidence] = (counts[evidence] || 0) + 1;
  }
  return counts;
}
