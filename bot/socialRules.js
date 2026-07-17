export function canRespondToPlayer(sender, config = {}) {
  if (sender === config.ownerUsername) return true;
  if (Array.isArray(config.friendlyPlayers) && config.friendlyPlayers.includes(sender)) return Boolean(config.chatWithFriendlyPlayers);
  return Boolean(config.respondToAllPlayers);
}

export function canObeyPlayer(sender, config = {}) {
  return !config.obeyOnlyOwner ? true : sender === config.ownerUsername;
}

export function getPlayerRelationship(sender, conversationMemory = {}) {
  if (sender === 'ModVinny') return 'owner';
  return conversationMemory.playerProfiles?.[sender]?.trust || 'unknown';
}

export function handleNonOwnerCommand() {
  return 'I can chat, but only ModVinny can give me orders.';
}

export function handleFriendlyPlayerChat(sender) {
  return `Hey ${sender}. I can chat, but ModVinny is still my command authority.`;
}

export function handleUnknownPlayerChat(sender) {
  return `Hi ${sender}. I am tj. I only take orders from ModVinny.`;
}

export function shouldMentionOwnerOnlyRule(sender, text) {
  if (!sender || sender === 'ModVinny') return false;
  return /^(come|follow|stay|stop|get|craft|mine|attack|give|drop|go|build|place)\b/i.test(String(text || ''));
}

