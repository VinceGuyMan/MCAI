import {
  getPlayerProfile,
  updatePlayerProfile
} from './conversationMemory.js';

export function getPlayerDialogueProfile(conversationMemory, playerName) {
  return conversationMemory.playerProfiles?.[playerName] || getPlayerProfile(playerName);
}

export function updatePlayerDialogueProfile(conversationMemory, playerName, updates) {
  return updatePlayerProfile(playerName, updates);
}

export function rememberPlayerPreference(playerName, preference) {
  const profile = getPlayerProfile(playerName);
  const preferences = Array.from(new Set([...(profile.preferences || []), preference])).slice(0, 20);
  return updatePlayerProfile(playerName, { preferences });
}

export function getPlayerTonePreference(playerName) {
  return getPlayerProfile(playerName).tonePreference || 'short';
}

export function notePlayerTrustLevel(playerName, change) {
  return updatePlayerProfile(playerName, { trust: change });
}

