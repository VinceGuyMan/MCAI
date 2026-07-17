const state = {
  token: localStorage.getItem('mcaiDashboardToken') || '',
  availableModels: [],
  settings: null
};

function $(id) {
  return document.getElementById(id);
}

function setStatus(id, message, bad = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('bad', bad);
  el.classList.toggle('good', Boolean(message) && !bad);
}

function clearDashboardToken() {
  state.token = '';
  localStorage.removeItem('mcaiDashboardToken');
}

function ensureDashboardToken() {
  if (!state.token) {
    const token = prompt('Dashboard token (from config.json dashboardToken)');
    if (!token) throw new Error('Dashboard token required.');
    state.token = token;
    localStorage.setItem('mcaiDashboardToken', token);
  }
}

async function fetchDashboardJson(path, options = {}, retry = true) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers['x-dashboard-token'] = state.token;
  const response = await fetch(path, { ...options, headers });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`HTTP ${response.status}`);
  }
  if (response.status === 401 && retry) {
    clearDashboardToken();
    ensureDashboardToken();
    return fetchDashboardJson(path, options, false);
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.reason || payload.message || `HTTP ${response.status}`);
  }
  return payload;
}

async function apiGet(path) {
  return fetchDashboardJson(path, { cache: 'no-store' });
}

async function apiPost(path, body = {}) {
  ensureDashboardToken();
  return fetchDashboardJson(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function selectedProvider() {
  return $('providerSelect')?.value || 'ollama';
}

function selectedBaseUrl() {
  return $('baseUrlInput')?.value?.trim() || '';
}

function fillProviders(settings) {
  const select = $('providerSelect');
  select.innerHTML = '';
  for (const provider of settings.providers || []) {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.label;
    if (provider.id === settings.provider) option.selected = true;
    select.appendChild(option);
  }
  $('baseUrlInput').value = settings.baseUrl || '';
  $('providerHint').textContent = settings.hint || '';
  $('summaryProvider').textContent = settings.providerLabel || settings.provider;
}

function modelOptionsHtml(selected) {
  const models = state.availableModels;
  const opts = ['<option value="">— select model —</option>'];
  const seen = new Set();
  for (const name of models) {
    seen.add(name);
    opts.push(`<option value="${escapeAttr(name)}"${name === selected ? ' selected' : ''}>${escapeHtml(name)}</option>`);
  }
  if (selected && !seen.has(selected)) {
    opts.push(`<option value="${escapeAttr(selected)}" selected>${escapeHtml(selected)} (configured)</option>`);
  }
  return opts.join('');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function renderRoleFields(settings) {
  const container = $('roleFields');
  container.innerHTML = '';
  const models = settings.models || {};
  for (const role of settings.roles || []) {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    wrap.innerHTML = `
      <span>${escapeHtml(role.label)} <code>${escapeHtml(role.id)}</code></span>
      <select data-role="${escapeAttr(role.id)}" class="role-select">
        ${modelOptionsHtml(models[role.id] || '')}
      </select>
    `;
    container.appendChild(wrap);
  }
}

function collectModelsFromForm() {
  const models = {};
  for (const select of document.querySelectorAll('.role-select')) {
    const role = select.getAttribute('data-role');
    const value = select.value.trim();
    if (role && value) models[role] = value;
  }
  return models;
}

async function loadModels() {
  setStatus('modelLoadStatus', 'Loading models…');
  try {
    const provider = selectedProvider();
    const baseUrl = selectedBaseUrl();
    const query = new URLSearchParams({ provider, baseUrl });
    const payload = await apiGet(`/api/setup/models?${query}`);
    const data = payload.data || {};
    state.availableModels = data.models || [];
    if (!data.reachable) {
      setStatus('modelLoadStatus', `Not reachable: ${data.reason || 'unknown'}`, true);
    } else {
      setStatus('modelLoadStatus', `Loaded ${state.availableModels.length} model(s).`);
    }
    // re-render role selects keeping current picks
    const current = collectModelsFromForm();
    if (state.settings) {
      state.settings.models = { ...state.settings.models, ...current };
      renderRoleFields(state.settings);
    }
  } catch (error) {
    setStatus('modelLoadStatus', error.message, true);
  }
}

async function testLlm() {
  setStatus('modelLoadStatus', 'Testing chat…');
  try {
    const models = collectModelsFromForm();
    const model = models.default || Object.values(models)[0];
    const result = await apiPost('/api/setup/test-llm', {
      provider: selectedProvider(),
      baseUrl: selectedBaseUrl(),
      model
    });
    if (result.ok === false || result.content === undefined && !result.ok) {
      setStatus('modelLoadStatus', result.reason || 'Test failed', true);
      return;
    }
    // apiPost throws if ok:false; for test endpoint we return data at top level sometimes
    const content = result.content ?? result.data?.content;
    const ok = result.ok !== false && (content !== undefined || result.data?.ok);
    if (result.data && result.data.ok === false) {
      setStatus('modelLoadStatus', result.data.reason || 'Test failed', true);
      return;
    }
    if (result.ok === false) {
      setStatus('modelLoadStatus', result.reason || 'Test failed', true);
      return;
    }
    // setup test returns { ok, content, ... } at top level from sendJson wrapping?
    // handlePost returns sendJson(res, 200, await testLlmChat(...)) so payload is {ok, content, ...}
    if (result.content !== undefined || result.model) {
      setStatus('modelLoadStatus', `Test OK (${result.model}): ${String(result.content || '').slice(0, 80)}`);
    } else {
      setStatus('modelLoadStatus', 'Test finished.');
    }
  } catch (error) {
    setStatus('modelLoadStatus', error.message, true);
  }
}

async function saveLlm() {
  setStatus('saveStatus', 'Saving…');
  try {
    const models = collectModelsFromForm();
    const result = await apiPost('/api/setup/llm', {
      provider: selectedProvider(),
      baseUrl: selectedBaseUrl(),
      ollamaModel: models.default,
      models
    });
    state.settings = result.settings || state.settings;
    setStatus('saveStatus', result.message || 'Saved.');
    $('summaryProvider').textContent = state.settings?.providerLabel || selectedProvider();
    await refreshChecklist();
  } catch (error) {
    setStatus('saveStatus', error.message, true);
  }
}

function applyDefaultToAll() {
  const models = collectModelsFromForm();
  const def = models.default;
  if (!def) {
    setStatus('saveStatus', 'Set Default role first.', true);
    return;
  }
  for (const select of document.querySelectorAll('.role-select')) {
    select.value = def;
    // if option missing, add it
    if (select.value !== def) {
      const opt = document.createElement('option');
      opt.value = def;
      opt.textContent = def;
      opt.selected = true;
      select.appendChild(opt);
    }
  }
  setStatus('saveStatus', `Copied ${def} to all roles (not saved yet).`);
}

function renderChecklist(data) {
  const summary = data.summary || {};
  $('summaryPass').textContent = summary.pass ?? '-';
  $('summaryWarn').textContent = summary.warn ?? '-';
  $('summaryFail').textContent = summary.fail ?? '-';
  if (summary.fail > 0) {
    $('summaryText').textContent = 'Needs attention';
    $('summaryText').className = 'bad-text';
  } else if (summary.warn > 0) {
    $('summaryText').textContent = 'OK with warnings';
    $('summaryText').className = 'warn-text';
  } else {
    $('summaryText').textContent = 'All clear';
    $('summaryText').className = 'good-text';
  }

  const list = $('checklist');
  list.innerHTML = '';
  for (const item of data.items || []) {
    const row = document.createElement('div');
    row.className = `check-row status-${item.status}`;
    row.innerHTML = `
      <span class="check-badge">${escapeHtml(item.status)}</span>
      <div class="check-body">
        <strong>${escapeHtml(item.label)}</strong>
        <div class="check-detail">${escapeHtml(item.detail || '')}</div>
        ${item.fix ? `<div class="check-fix">Fix: ${escapeHtml(item.fix)}</div>` : ''}
      </div>
    `;
    list.appendChild(row);
  }

  const errors = data.errors || {};
  $('errorLogs').textContent = (errors.logs && errors.logs.length)
    ? errors.logs.join('\n')
    : 'No recent error-looking log lines.';
  $('failureMemory').textContent = (errors.failures && errors.failures.length)
    ? errors.failures.map((f) => (typeof f === 'string' ? f : JSON.stringify(f))).join('\n')
    : 'No recent failures in memory.';
}

async function refreshChecklist() {
  try {
    const payload = await apiGet('/api/setup/checklist');
    renderChecklist(payload.data || {});
  } catch (error) {
    $('summaryText').textContent = error.message;
    $('summaryText').className = 'bad-text';
  }
}

async function init() {
  try {
    ensureDashboardToken();
  } catch (error) {
    $('summaryText').textContent = error.message;
    return;
  }

  try {
    const payload = await apiGet('/api/setup');
    state.settings = payload.data?.llm || null;
    if (state.settings) {
      fillProviders(state.settings);
      renderRoleFields(state.settings);
    }
  } catch (error) {
    setStatus('modelLoadStatus', error.message, true);
  }

  // Auto-load models + checklist
  await loadModels();
  await refreshChecklist();
}

$('tokenButton')?.addEventListener('click', () => {
  clearDashboardToken();
  try {
    ensureDashboardToken();
    init();
  } catch {
    /* ignore */
  }
});

$('providerSelect')?.addEventListener('change', () => {
  const id = selectedProvider();
  const preset = (state.settings?.providers || []).find((p) => p.id === id);
  if (preset) {
    $('baseUrlInput').value = preset.defaultUrl;
    $('providerHint').textContent = preset.hint || '';
  }
  loadModels();
});

$('loadModelsBtn')?.addEventListener('click', () => loadModels());
$('testLlmBtn')?.addEventListener('click', () => testLlm());
$('saveLlmBtn')?.addEventListener('click', () => saveLlm());
$('applyDefaultBtn')?.addEventListener('click', () => applyDefaultToAll());
$('refreshChecklist')?.addEventListener('click', () => refreshChecklist());

init();
