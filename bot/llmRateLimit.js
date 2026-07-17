const calls = [];
let ollamaQueue = Promise.resolve();

export function getOllamaCallStats(now = Date.now()) {
  while (calls.length && now - calls[0] > 60000) calls.shift();
  return { callsLastMinute: calls.length };
}

export function canCallOllama(config = {}, now = Date.now()) {
  const max = config.maxOllamaCallsPerMinute || 6;
  return getOllamaCallStats(now).callsLastMinute < max;
}

export function recordOllamaCall(now = Date.now()) {
  calls.push(now);
  getOllamaCallStats(now);
}

export async function reserveOllamaCall(config = {}) {
  if (!canCallOllama(config)) {
    const error = new Error('Ollama rate limit reached');
    error.rateLimited = true;
    throw error;
  }
  recordOllamaCall();
}

export async function runExclusiveOllamaCall(fn) {
  const previous = ollamaQueue.catch(() => {});
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  ollamaQueue = previous.then(() => current);
  await previous;

  try {
    return await fn();
  } finally {
    release();
  }
}
