const state = {
  token: localStorage.getItem('mcaiDashboardToken') || '',
  intervalMs: 1000
};
let refreshInFlight = null;

function $(id) {
  return document.getElementById(id);
}

function text(id, value) {
  const element = $(id);
  if (element) element.textContent = value ?? '-';
}

function pos(position) {
  if (!position) return 'unknown';
  return `${position.x}, ${position.y}, ${position.z}`;
}

async function apiGet(path) {
  return fetchDashboardJson(path, { cache: 'no-store' });
}

function clearDashboardToken() {
  state.token = '';
  localStorage.removeItem('mcaiDashboardToken');
}

function ensureDashboardToken() {
  if (!state.token) {
    const token = prompt('Dashboard token');
    if (!token) throw new Error('Dashboard token required.');
    state.token = token;
    localStorage.setItem('mcaiDashboardToken', token);
  }
}

async function fetchDashboardJson(path, options = {}, retry = true) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers['x-dashboard-token'] = state.token;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json();
  if (response.status === 401 && retry) {
    clearDashboardToken();
    ensureDashboardToken();
    return fetchDashboardJson(path, options, false);
  }
  if (!response.ok || payload.ok === false) throw new Error(payload.reason || payload.message || `HTTP ${response.status}`);
  return payload;
}

async function apiPost(path, body = {}) {
  ensureDashboardToken();
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dashboard-token': state.token
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(payload.reason || payload.message || `HTTP ${response.status}`);
  return payload;
}

function setControlResult(message, bad = false) {
  const element = $('controlResult');
  if (!element) return;
  element.textContent = message || '';
  element.classList.toggle('bad', bad);
}

function renderChips(containerId, items) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = '';
  const values = items?.length ? items : ['clear'];
  for (const item of values) {
    const chip = document.createElement('span');
    chip.className = item === 'clear' ? 'chip ok' : 'chip danger-chip';
    chip.textContent = item;
    container.appendChild(chip);
  }
}

function renderList(id, items, formatter) {
  const list = $(id);
  if (!list) return;
  list.innerHTML = '';
  if (!items?.length) {
    const li = document.createElement('li');
    li.textContent = 'No entries yet.';
    list.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = formatter(item);
    list.appendChild(li);
  }
}

function renderStatus(data) {
  text('botConnected', data.bot.connected ? 'connected' : 'offline');
  text('botHealth', data.bot.health ?? '-');
  text('botFood', data.bot.food ?? '-');
  text('botPosition', pos(data.bot.position));
  text('botDimension', data.bot.dimension || '-');
  text('ownerName', data.owner.username || 'Player');
  text('ownerVisible', data.owner.visible ? 'yes' : 'no');
  text('ownerDistance', data.owner.distance === null ? 'unknown' : `${data.owner.distance} blocks`);
  text('hostilesNearby', data.safety.hostilesNearby ?? 0);
  text('currentTask', data.task.currentTask || 'none');
  text('activeSkill', data.skill.activeSkill?.skillName || 'none');
  text('activeCurriculum', data.curriculum.activeCurriculum?.name || 'none');
  text('activeGoal', data.goals.activeGoal?.name || 'none');
  text('progressionPercent', data.progression ? `${data.progression.percent}%` : '-');
  text('progressionCount', data.progression ? `${data.progression.completed}/${data.progression.total}` : '-');
  text('progressionNext', data.progression?.recommended?.name || 'none');
  text('progressionBlocked', data.progression?.blockedCount ?? '-');
  text('gearArmorScore', data.gear?.armorScore ?? '-');
  text('gearXp', data.gear?.xpLevel ?? '-');
  text('gearLapis', data.gear?.lapisCount ?? '-');
  text('gearNeed', data.gear?.needs?.slice?.(0, 2).join(', ') || 'none');
  text('gearBrewing', data.gear?.brewing?.apiAvailable ? 'available' : 'status-only');
  text('villagersNearby', data.villagers?.nearby?.length ?? 0);
  text('villagersKnown', data.villagers?.memory?.villagers ?? 0);
  text('villagesKnown', data.villagers?.memory?.villages ?? 0);
  text('emeraldCount', data.villagers?.economy?.emeralds ?? 0);
  text('knownTrades', data.villagers?.memory?.trades ?? 0);
  text('blueprintCount', data.blueprints?.counts?.available ?? 0);
  text('activeBuild', data.blueprints?.activeBuild?.blueprintId || 'none');
  text('buildPlaced', data.blueprints?.counts?.placed ?? 0);
  text('buildRemaining', data.blueprints?.counts?.remaining ?? 0);
  text('buildFailed', data.blueprints?.counts?.failed ?? 0);
  text('bridgeConnected', data.serverBridge?.connected ? 'connected' : 'offline');
  text('bridgeHealth', data.serverBridge?.health?.ok ? 'ok' : (data.serverBridge?.health?.reason || 'unavailable'));
  text('bridgeEvents', data.serverBridge?.status?.recentEvents?.length ?? 0);
  text('bridgeLastEvent', data.serverBridge?.status?.recentEvents?.at?.(-1)?.type || 'none');
  text('naturalLast', data.naturalRouting?.lastRoute?.canonicalCommand || 'none');
  text('naturalPending', data.naturalRouting?.pendingClarification?.canonicalCommand || (data.naturalRouting?.pendingClarification ? 'clarify' : 'none'));
  text('naturalLearned', data.naturalRouting?.learnedMappings?.length ?? 0);
  text('competencyReliable', data.competency?.counts?.reliable ?? 0);
  text('competencyImproving', data.competency?.counts?.improving ?? 0);
  text('competencyShaky', (data.competency?.counts?.shaky ?? 0) + (data.competency?.counts?.blocked ?? 0));
  text('competencyUntested', data.competency?.counts?.untested ?? 0);
  renderChips('dangerFlags', data.safety.dangerFlags);
  renderList('inventoryList', data.inventory.topItems, (item) => `${item.name}: ${item.count}`);
  renderList('evidenceList', data.skill.recentRuns, (run) => `${run.skillName}: ${run.evidenceSummary || run.resultStatus || (run.ok ? 'ok' : 'failed')}`);
  renderList('skillRunList', data.skill.recentRuns, (run) => `${run.skillName} - ${run.ok ? 'ok' : 'failed'} (${run.durationMs || 0}ms)`);
  renderList('villagerList', data.villagers?.nearby || [], (villager) => `${villager.profession || 'villager'} at ${villager.distance ?? '?'} blocks`);
  renderList('tradeList', data.villagers?.trading?.knownTrades || [], (trade) => `${trade.offered || trade.outputSummary || 'trade'} for ${trade.priceSummary || 'unknown cost'}`);
  renderList('blueprintList', data.blueprints?.history || [], (build) => `${build.blueprintId}: ${build.status}, ${build.placedBlocks?.length || 0} placed`);
  renderList('bridgeEventList', data.serverBridge?.status?.recentEvents || [], (event) => `${event.type}: ${event.message || event.id}`);
  renderList('learnedCommandList', data.naturalRouting?.learnedMappings || [], (item) => `${item.phrase} -> ${item.canonicalCommand}`);
  renderList('failureList', data.naturalRouting?.recentFailures || [], (event) => `${event.type}: ${event.reason || event.canonicalCommand || event.ownerText || ''}`);
}

async function refreshOnce() {
  try {
    const payload = await apiGet('/api/status');
    if (payload.ok) renderStatus(payload.data);
    const logs = await apiGet('/api/logs?limit=20');
    renderList('logList', logs.data || [], (entry) => `${entry.level}/${entry.category}: ${entry.message}`);
  } catch (error) {
    setControlResult(`Dashboard refresh failed: ${error.message}`, true);
  }
}

function refresh() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = refreshOnce().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function pollDashboard() {
  try {
    await refresh();
  } finally {
    window.setTimeout(pollDashboard, state.intervalMs);
  }
}

async function runSkill(skillName) {
  try {
    const payload = await apiPost('/api/control/run-skill', { skillName });
    setControlResult(payload.message || `${skillName} finished.`);
    await refresh();
  } catch (error) {
    setControlResult(error.message, true);
  }
}

document.addEventListener('click', async (event) => {
  const skill = event.target?.dataset?.skill;
  if (skill) {
    runSkill(skill);
    return;
  }
  if (event.target?.id === 'tokenButton') {
    const token = prompt('Dashboard token', state.token);
    if (token) {
      state.token = token;
      localStorage.setItem('mcaiDashboardToken', token);
      setControlResult('Token saved locally in this browser.');
    }
  }
  if (event.target?.id === 'stopButton') {
    try {
      const payload = await apiPost('/api/control/stop', { reason: 'dashboard stop button' });
      setControlResult(payload.message || 'Stopped.');
      await refresh();
    } catch (error) {
      setControlResult(error.message, true);
    }
  }
  if (event.target?.id === 'runCurriculumStep') {
    try {
      const payload = await apiPost('/api/control/run-curriculum-step', {});
      setControlResult(payload.message || 'Curriculum step finished.');
      await refresh();
    } catch (error) {
      setControlResult(error.message, true);
    }
  }
  if (event.target?.id === 'cancelCurriculum') {
    try {
      const payload = await apiPost('/api/control/cancel-curriculum', { reason: 'dashboard cancel' });
      setControlResult(payload.message || 'Curriculum cancelled.');
      await refresh();
    } catch (error) {
      setControlResult(error.message, true);
    }
  }
  if (event.target?.id === 'planStarterBlueprint') {
    try {
      const payload = await apiPost('/api/blueprints/plan', { blueprintId: 'starter_workstation' });
      setControlResult(payload.message || payload.data?.message || 'Blueprint planned.');
      await refresh();
    } catch (error) {
      setControlResult(error.message, true);
    }
  }
  if (event.target?.id === 'continueBlueprint') {
    try {
      const payload = await apiPost('/api/blueprints/continue', {});
      setControlResult(payload.message || payload.data?.message || 'Build continued.');
      await refresh();
    } catch (error) {
      setControlResult(error.message, true);
    }
  }
  if (event.target?.id === 'cancelBlueprint') {
    try {
      const payload = await apiPost('/api/blueprints/cancel', { reason: 'dashboard cancel' });
      setControlResult(payload.message || payload.data?.message || 'Build cancelled.');
      await refresh();
    } catch (error) {
      setControlResult(error.message, true);
    }
  }
  if (event.target?.id === 'bridgeStop') {
    try {
      const payload = await apiPost('/api/server-bridge/emergency-stop', { reason: 'dashboard bridge stop test' });
      setControlResult(payload.message || payload.data?.message || 'Bridge emergency stop sent.');
      await refresh();
    } catch (error) {
      setControlResult(error.message, true);
    }
  }
});

void pollDashboard();
