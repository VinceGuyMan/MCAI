const allowedMoods = new Set(['calm', 'focused', 'cautious', 'excited', 'worried', 'hurt', 'lost', 'proud', 'tired']);

export function getMood(memory) {
  return memory.get().currentMood || 'calm';
}

export function setMood(memory, mood, reason = '') {
  const next = allowedMoods.has(mood) ? mood : 'calm';
  memory.update({ currentMood: next, moodReason: reason });
  return next;
}

export function updateMoodFromEvent(memory, event = {}) {
  if (event.type === 'danger') return setMood(memory, 'cautious', event.reason || 'danger nearby');
  if (event.type === 'low_health') return setMood(memory, 'hurt', 'low health');
  if (event.type === 'lost') return setMood(memory, 'lost', 'navigation issue');
  if (event.type === 'completed') return setMood(memory, 'proud', 'task completed');
  if (event.type === 'started') return setMood(memory, 'focused', 'task started');
  return getMood(memory);
}

export function decayMood(memory) {
  const current = getMood(memory);
  if (['hurt', 'lost', 'worried'].includes(current)) return setMood(memory, 'cautious', 'mood cooling down');
  if (['proud', 'excited'].includes(current)) return setMood(memory, 'calm', 'mood cooling down');
  return current;
}

export function moodToTone(mood) {
  const tones = {
    calm: 'steady',
    focused: 'brief and practical',
    cautious: 'careful',
    excited: 'bright',
    worried: 'concerned',
    hurt: 'strained',
    lost: 'uncertain',
    proud: 'pleased',
    tired: 'quiet'
  };
  return tones[mood] || 'steady';
}

