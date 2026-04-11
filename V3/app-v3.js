const ANTHROPIC_API_KEY = '';
const API_BASE = window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:3000';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const COLORS = [
  '#185FA5', '#1D9E75', '#D4537E', '#BA7517',
  '#7F77DD', '#D85A30', '#E24B4A', '#0F6E56',
  '#533489', '#888780'
];

const DEFAULT_GROUPS = [
  { id: 'work', label: 'Работа', color: '#185FA5' },
  { id: 'life', label: 'Личное', color: '#1D9E75' },
];

const DEFAULT_SUBS = [
  { id: '4stanka', label: '4Станка', group: 'work', color: '#185FA5' },
  { id: 'shmel', label: 'SHMEL', group: 'work', color: '#1D9E75' },
  { id: 'modulpak', label: 'МОДУЛЬПАК', group: 'work', color: '#7F77DD' },
  { id: 'raptor', label: 'РАПТОР', group: 'work', color: '#BA7517' },
  { id: 'ai', label: 'ИИ', group: 'work', color: '#533489' },
  { id: 'sport', label: 'Спорт', group: 'life', color: '#1D9E75' },
  { id: 'family', label: 'Семья', group: 'life', color: '#D4537E' },
  { id: 'home', label: 'Дом', group: 'life', color: '#BA7517' },
  { id: 'study', label: 'Изучение', group: 'life', color: '#7F77DD' },
  { id: 'friends', label: 'Друзья', group: 'life', color: '#D85A30' },
  { id: 'culture', label: 'Культура', group: 'life', color: '#888780' },
];

let state = {
  groups: [],
  subs: [],
  recurring: [],
  recurringStatus: {},
  backlog: {},
  taskProjects: {},
  achievements: {},
  achievementProjects: {},
  achievementYears: [],
  profile: {},
  settings: {},
  data: {},
  projectTemplates: {},
  dayProjects: {},
  weekOffset: 0,
  currentView: 'graph',
  winsYearFilter: 'all',
  recurringFilterGroup: 'all',
  recurringFilterProject: 'all',
  ui: {
    sidebarOpen: false,
    sidebarCollapsed: false,
    groupsOpen: false,
    projectsOpen: false,
    achievementYearsOpen: {},
  },
  dayColumnWidths: {},
  archivedCatalog: {
    groups: [],
    subs: [],
  },
};

let _taskMeta = null;
let _inlineTaskMeta = null;
let _inlineBacklogMeta = null;
let _dayProjectMeta = null;
let _createTaskMeta = null;
let manageRecurringId = null;
let manageProjectId = null;
let manageGroupId = null;
let manageAchievementId = null;
let newProjGroup = 'work';
let newProjColor = COLORS[0];
let newGroupColor = COLORS[0];
let _dayResize = null;
let authMode = 'login';
let currentUser = null;
let _confirmMeta = null;
let _sidebarDragMeta = null;
let _planningSyncTimer = null;
let _lastPlanningSyncSignature = '';
let _isApplyingServerPlanning = false;
let _achievementsSyncTimer = null;
let _lastAchievementsSyncSignature = '';
let _isApplyingServerAchievements = false;
let _hasPersistedLocalWorkspace = false;
let _graphTouchPan = null;

const DEFAULT_PROFILE = {
  name: 'Степан',
  email: '',
  role: 'Основатель',
  city: 'Калуга',
  about: '',
};

const DEFAULT_SETTINGS = {
  defaultView: 'graph',
  sidebarCollapsedOnStart: false,
  openCurrentYearInAchievements: true,
  workspaceName: 'ДЕЙСТВИЯ',
};

function authFetch(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

function getGraphScroller() {
  return document.getElementById('graph-view');
}

function canPanGraphFromPage() {
  const scroller = getGraphScroller();
  return state.currentView === 'graph' && scroller && scroller.scrollWidth > scroller.clientWidth + 4;
}

function shouldIgnoreGraphPanTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('button, input, textarea, select, .modal, .sidebar, .mobile-nav'));
}

function handleGraphPageWheel(event) {
  if (!canPanGraphFromPage() || shouldIgnoreGraphPanTarget(event.target)) return;

  const scroller = getGraphScroller();
  if (!scroller) return;

  const delta = Math.abs(event.deltaX) > 0 ? event.deltaX : (event.shiftKey ? event.deltaY : 0);
  if (!delta) return;

  scroller.scrollLeft += delta;
  event.preventDefault();
}

function handleGraphTouchStart(event) {
  if (!canPanGraphFromPage() || shouldIgnoreGraphPanTarget(event.target) || event.touches.length !== 1) {
    _graphTouchPan = null;
    return;
  }

  const touch = event.touches[0];
  _graphTouchPan = {
    startX: touch.clientX,
    startY: touch.clientY,
    horizontal: false,
  };
}

function handleGraphTouchMove(event) {
  if (!canPanGraphFromPage() || !_graphTouchPan || event.touches.length !== 1) return;

  const scroller = getGraphScroller();
  if (!scroller) return;

  const touch = event.touches[0];
  const deltaX = touch.clientX - _graphTouchPan.startX;
  const deltaY = touch.clientY - _graphTouchPan.startY;

  if (!_graphTouchPan.horizontal) {
    if (Math.abs(deltaX) <= 6) return;
    if (Math.abs(deltaX) <= Math.abs(deltaY)) {
      _graphTouchPan = null;
      return;
    }
    _graphTouchPan.horizontal = true;
  }

  scroller.scrollLeft -= deltaX;
  _graphTouchPan.startX = touch.clientX;
  _graphTouchPan.startY = touch.clientY;
  event.preventDefault();
}

function handleGraphTouchEnd() {
  _graphTouchPan = null;
}

async function apiJson(path, options = {}) {
  const response = await authFetch(path, options);
  const payload = await response.json();

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'API_REQUEST_FAILED');
  }

  return payload.data;
}

function toCatalogGroups(groups) {
  return (groups || []).map(group => ({
    id: group.id,
    label: group.name,
    color: group.color,
  }));
}

function toCatalogProjects(projects) {
  return (projects || []).map(project => ({
    id: project.id,
    label: project.name,
    group: project.groupId,
    color: project.color,
  }));
}

function setAuthError(message = '') {
  const errorNode = document.getElementById('auth-error');
  if (!message) {
    errorNode.style.display = 'none';
    errorNode.textContent = '';
    return;
  }
  errorNode.textContent = message;
  errorNode.style.display = 'block';
}

function switchAuthMode(mode) {
  authMode = mode;
  document.getElementById('auth-tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('auth-tab-register').classList.toggle('active', mode === 'register');
  document.getElementById('auth-login-form').style.display = mode === 'login' ? 'flex' : 'none';
  document.getElementById('auth-register-form').style.display = mode === 'register' ? 'flex' : 'none';
  setAuthError('');
}

function showAuthShell() {
  document.getElementById('auth-shell').style.display = 'grid';
  document.getElementById('app').style.display = 'none';
}

function showAppShell() {
  document.getElementById('auth-shell').style.display = 'none';
  document.getElementById('app').style.display = 'grid';
}

function applyCurrentUser(user) {
  currentUser = user;
  state.profile = normalizeProfile({
    ...state.profile,
    name: user.profile?.name || state.profile.name,
    email: user.email || state.profile.email,
    role: user.profile?.role || state.profile.role,
    city: user.profile?.city || state.profile.city,
    about: user.profile?.about || state.profile.about,
  });
  const accountName = user.profile?.name || user.email || 'Пользователь';
  const workspaceName = state.settings.workspaceName || user.workspace?.name || DEFAULT_SETTINGS.workspaceName;
  document.getElementById('sidebar-account-name').textContent = accountName;
  document.getElementById('sidebar-workspace-name').textContent = workspaceName;
}

function applyAccountPayload(account) {
  if (!account) return;

  state.profile = normalizeProfile({
    ...state.profile,
    ...(account.profile || {}),
  });
  state.settings = normalizeSettings({
    ...state.settings,
    ...(account.settings || {}),
  });

  if (currentUser) {
    currentUser = {
      ...currentUser,
      email: state.profile.email || currentUser.email,
      profile: {
        ...(currentUser.profile || {}),
        name: state.profile.name || '',
        role: state.profile.role || '',
        city: state.profile.city || '',
        about: state.profile.about || '',
        avatarUrl: account.profile?.avatarUrl || currentUser.profile?.avatarUrl || '',
      },
      workspace: {
        ...(currentUser.workspace || {}),
        ...(account.workspace || {}),
        name: account.workspace?.name || currentUser.workspace?.name || '',
      },
    };
    applyCurrentUser(currentUser);
  }
}

async function fetchCurrentUserSession() {
  const response = await authFetch('/api/auth/me', {
    method: 'GET',
    headers: {},
  });

  if (response.status === 401) {
    return null;
  }

  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'AUTH_ME_FAILED');
  }

  return payload.data;
}

async function fetchAccountFromServer() {
  return apiJson('/api/account', {
    method: 'GET',
    headers: {},
  });
}

async function fetchBootstrapFromServer() {
  if (!currentUser?.id || !currentUser?.workspace?.id) {
    throw new Error('BOOTSTRAP_SESSION_MISSING');
  }

  return apiJson(
    `/api/bootstrap?userId=${encodeURIComponent(currentUser.id)}&workspaceId=${encodeURIComponent(currentUser.workspace.id)}`,
    {
      method: 'GET',
      headers: {},
    },
  );
}

async function syncAccountFromServer() {
  const account = await fetchAccountFromServer();
  applyAccountPayload(account);
  save();
  return account;
}

function buildAchievementsPayload() {
  return {
    achievementYears: state.achievementYears,
    achievements: state.achievements,
    achievementProjects: state.achievementProjects,
  };
}

function buildPlanningPayload() {
  return {
    backlog: state.backlog,
    taskProjects: state.taskProjects,
    recurring: state.recurring,
    recurringStatus: state.recurringStatus,
    data: state.data,
    projectTemplates: state.projectTemplates,
    dayProjects: state.dayProjects,
  };
}

function getPlanningSyncSignature() {
  return JSON.stringify(buildPlanningPayload());
}

function getAchievementsSyncSignature() {
  return JSON.stringify(buildAchievementsPayload());
}

function hasAnyObjectEntries(value) {
  return value && typeof value === 'object' && Object.keys(value).length > 0;
}

function hasLocalPlanningData() {
  if (!_hasPersistedLocalWorkspace) return false;
  return (
    state.recurring.length > 0 ||
    hasAnyObjectEntries(state.recurringStatus) ||
    hasAnyObjectEntries(state.backlog) ||
    hasAnyObjectEntries(state.data) ||
    hasAnyObjectEntries(state.projectTemplates) ||
    hasAnyObjectEntries(state.dayProjects)
  );
}

function isServerPlanningEmpty(payload) {
  return !(
    (payload?.recurring || []).length > 0 ||
    hasAnyObjectEntries(payload?.recurringStatus) ||
    hasAnyObjectEntries(payload?.backlog) ||
    hasAnyObjectEntries(payload?.data) ||
    hasAnyObjectEntries(payload?.projectTemplates) ||
    hasAnyObjectEntries(payload?.dayProjects)
  );
}

function hasLocalAchievementsData() {
  if (!_hasPersistedLocalWorkspace) return false;
  return (
    hasAnyObjectEntries(state.achievements) ||
    Object.values(state.achievementProjects || {}).some(groupMap =>
      Object.values(groupMap || {}).some(projectIds => Array.isArray(projectIds) && projectIds.length > 0),
    ) ||
    (state.achievementYears || []).some(year => year !== String(new Date().getFullYear()))
  );
}

function isServerAchievementsEmpty(payload) {
  return !(
    (payload?.achievementYears || []).length > 0 ||
    hasAnyObjectEntries(payload?.achievements) ||
    hasAnyObjectEntries(payload?.achievementProjects)
  );
}

function applyPlanningPayload(payload) {
  _isApplyingServerPlanning = true;
  try {
    state.recurring = normalizeRecurring(payload?.recurring, state.subs);
    state.recurringStatus = payload?.recurringStatus || {};
    state.backlog = normalizeBacklog(payload?.backlog);
    state.taskProjects = normalizeTaskProjects(
      payload?.taskProjects ?? buildInitialGroupProjectMap(state.groups, state.subs),
      state.groups,
      state.subs,
    );
    state.data = normalizeData(payload?.data);
    state.projectTemplates = payload?.projectTemplates || {};
    ensureProjectTemplates(false);
    state.dayProjects = normalizeDayProjects(payload?.dayProjects);
    _lastPlanningSyncSignature = getPlanningSyncSignature();
  } finally {
    _isApplyingServerPlanning = false;
  }
}

function applyAchievementsPayload(payload) {
  _isApplyingServerAchievements = true;
  try {
    state.achievements = normalizeAchievements(payload?.achievements, state.subs);
    state.achievementProjects = normalizeAchievementProjects(
      payload?.achievementProjects ?? buildInitialAchievementProjectMap(state.groups, state.subs, state.achievements),
      state.groups,
      state.subs,
      state.achievements,
      payload?.achievementYears,
    );
    state.achievementYears = normalizeAchievementYears(
      payload?.achievementYears,
      state.achievements,
      state.achievementProjects,
    );
    _lastAchievementsSyncSignature = getAchievementsSyncSignature();
  } finally {
    _isApplyingServerAchievements = false;
  }
}

async function syncPlanningFromServer() {
  const payload = await fetchBootstrapFromServer();
  const shouldSeedPlanningFromLocal = isServerPlanningEmpty(payload) && hasLocalPlanningData();
  const shouldSeedAchievementsFromLocal = isServerAchievementsEmpty(payload) && hasLocalAchievementsData();

  if (shouldSeedPlanningFromLocal) {
    await syncPlanningStateToServer();
  } else {
    applyPlanningPayload(payload);
  }

  if (shouldSeedAchievementsFromLocal) {
    await syncAchievementsStateToServer();
  } else {
    applyAchievementsPayload(payload);
  }

  save();
  return payload;
}

async function syncPlanningStateToServer() {
  if (!currentUser) return;

  const signature = getPlanningSyncSignature();
  if (signature === _lastPlanningSyncSignature) return;

  await apiJson('/api/planning-state', {
    method: 'PATCH',
    body: JSON.stringify(buildPlanningPayload()),
  });

  _lastPlanningSyncSignature = signature;
}

function queuePlanningSync() {
  if (!currentUser || _isApplyingServerPlanning) return;
  if (_planningSyncTimer) clearTimeout(_planningSyncTimer);

  _planningSyncTimer = setTimeout(async () => {
    _planningSyncTimer = null;
    try {
      await syncPlanningStateToServer();
    } catch (error) {
      console.error('PLANNING_SYNC_FAILED', error);
    }
  }, 250);
}

async function syncAchievementsStateToServer() {
  if (!currentUser) return;

  const signature = getAchievementsSyncSignature();
  if (signature === _lastAchievementsSyncSignature) return;

  await apiJson('/api/achievements-state', {
    method: 'PATCH',
    body: JSON.stringify(buildAchievementsPayload()),
  });

  _lastAchievementsSyncSignature = signature;
}

function queueAchievementsSync() {
  if (!currentUser || _isApplyingServerAchievements) return;
  if (_achievementsSyncTimer) clearTimeout(_achievementsSyncTimer);

  _achievementsSyncTimer = setTimeout(async () => {
    _achievementsSyncTimer = null;
    try {
      await syncAchievementsStateToServer();
    } catch (error) {
      console.error('ACHIEVEMENTS_SYNC_FAILED', error);
    }
  }, 250);
}

async function submitLogin(event) {
  event.preventDefault();
  setAuthError('');

  const submitButton = document.getElementById('auth-login-submit');
  submitButton.disabled = true;
  submitButton.textContent = 'Входим...';

  try {
    const response = await authFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-password').value,
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || 'LOGIN_FAILED');
    }

    const user = await fetchCurrentUserSession();
    if (!user) {
      throw new Error('AUTH_ME_FAILED');
    }

    applyCurrentUser(user);
    await syncCatalogFromServer();
    await syncAccountFromServer();
    await syncPlanningFromServer();
    state.currentView = state.settings.defaultView || 'graph';
    save();
    renderSidebarLists();
    renderCurrentView();
    showAppShell();
  } catch (error) {
    const code = error instanceof Error ? error.message : 'LOGIN_FAILED';
    const message = code === 'INVALID_CREDENTIALS'
      ? 'Неверная почта или пароль.'
      : code === 'USER_IS_DISABLED'
        ? 'Аккаунт отключен.'
        : code === 'USER_HAS_NO_WORKSPACE'
          ? 'Для пользователя не найдено рабочее пространство.'
          : 'Не удалось войти. Проверь данные и попробуй ещё раз.';
    setAuthError(message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Войти';
  }
}

async function submitRegister(event) {
  event.preventDefault();
  setAuthError('');

  const submitButton = document.getElementById('auth-register-submit');
  submitButton.disabled = true;
  submitButton.textContent = 'Создаем...';

  try {
    const response = await authFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('register-name').value.trim(),
        email: document.getElementById('register-email').value.trim(),
        password: document.getElementById('register-password').value,
        workspaceName: document.getElementById('register-workspace-name').value.trim() || 'ДЕЙСТВИЯ',
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || 'REGISTER_FAILED');
    }

    const user = await fetchCurrentUserSession();
    if (!user) {
      throw new Error('AUTH_ME_FAILED');
    }

    applyCurrentUser(user);
    await syncCatalogFromServer();
    await syncAccountFromServer();
    await syncPlanningFromServer();
    state.currentView = state.settings.defaultView || 'graph';
    save();
    renderSidebarLists();
    renderCurrentView();
    showAppShell();
  } catch (error) {
    const code = error instanceof Error ? error.message : 'REGISTER_FAILED';
    const message = code === 'EMAIL_ALREADY_IN_USE'
      ? 'Такая почта уже занята.'
      : 'Не удалось создать аккаунт. Проверь поля и попробуй ещё раз.';
    setAuthError(message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Создать аккаунт';
  }
}

async function logoutUser() {
  try {
    await authFetch('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  } catch (error) {
    console.error(error);
  }

  currentUser = null;
  showAuthShell();
}

function taskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeTask(task) {
  if (typeof task === 'string') return { id: taskId(), text: task, done: false, note: '' };
  return {
    id: task.id || taskId(),
    text: task.text || '',
    done: Boolean(task.done),
    note: task.note || '',
  };
}

function normalizeGroups(groups) {
  const source = Array.isArray(groups) && groups.length ? groups : DEFAULT_GROUPS;
  return source.map((group, index) => ({
    id: group.id || `group_${index}_${Date.now()}`,
    label: group.label || `Группа ${index + 1}`,
    color: group.color || COLORS[index % COLORS.length],
  }));
}

function normalizeSubs(subs, groups) {
  const fallbackGroupId = groups[0]?.id || DEFAULT_GROUPS[0].id;
  return (subs || DEFAULT_SUBS).map((sub, index) => ({
    id: sub.id || `sub_${index}_${Date.now()}`,
    label: sub.label || `Проект ${index + 1}`,
    group: groups.some(group => group.id === sub.group) ? sub.group : fallbackGroupId,
    color: sub.color || COLORS[index % COLORS.length],
  }));
}

function normalizeData(data) {
  const normalized = {};
  Object.entries(data || {}).forEach(([wk, subs]) => {
    normalized[wk] = {};
    Object.entries(subs || {}).forEach(([subId, days]) => {
      normalized[wk][subId] = {};
      Object.entries(days || {}).forEach(([dayIdx, tasks]) => {
        normalized[wk][subId][dayIdx] = (tasks || []).map(makeTask).filter(task => task.text.trim());
      });
    });
  });
  return normalized;
}

function normalizeBacklog(backlog) {
  const normalized = {};
  Object.entries(backlog || {}).forEach(([subId, tasks]) => {
    normalized[subId] = (tasks || []).map(makeTask).filter(task => task.text.trim());
  });
  return normalized;
}

function normalizeAchievements(achievements, subs) {
  const normalized = {};
  Object.entries(achievements || {}).forEach(([year, projects]) => {
    normalized[year] = {};
    Object.entries(projects || {}).forEach(([subId, items]) => {
      normalized[year][subId] = (items || []).map(item => ({
        id: item.id || taskId(),
        text: item.text || '',
        date: item.date || '',
      })).filter(item => item.text.trim());
    });
  });
  return normalized;
}

function normalizeAchievementYears(achievementYears, achievements, achievementProjects) {
  const years = new Set([
    ...(Array.isArray(achievementYears) ? achievementYears : []),
    ...Object.keys(achievements || {}),
    ...Object.keys(achievementProjects || {}),
    String(new Date().getFullYear()),
  ]);

  return Array.from(years)
    .filter(year => /^\d{4}$/.test(String(year)))
    .sort((a, b) => Number(a) - Number(b));
}

function normalizeAchievementProjects(achievementProjects, groups, subs, achievements, achievementYears = []) {
  const years = new Set([
    ...(Array.isArray(achievementYears) ? achievementYears : []),
    ...Object.keys(achievements || {}),
    ...Object.keys(achievementProjects || {}),
    String(new Date().getFullYear()),
  ]);
  const normalized = {};
  years.forEach(year => {
    normalized[year] = {};
    groups.forEach(group => {
      const groupProjectIds = subs.filter(sub => sub.group === group.id).map(sub => sub.id);
      const achievementProjectIds = Object.keys(achievements?.[year] || {});
      const validProjectIds = new Set([...groupProjectIds, ...achievementProjectIds]);
      const source = Array.isArray(achievementProjects?.[year]?.[group.id])
        ? achievementProjects[year][group.id]
        : [];
      normalized[year][group.id] = source.filter(id => validProjectIds.has(id));
    });
  });
  return normalized;
}

function normalizeProfile(profile) {
  return {
    ...DEFAULT_PROFILE,
    ...(profile || {}),
  };
}

function normalizeSettings(settings) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
  };
  const validViews = new Set(['graph', 'tasks', 'wins', 'history', 'profile', 'settings']);
  if (!validViews.has(merged.defaultView)) merged.defaultView = 'graph';
  return merged;
}

function normalizeTaskProjects(taskProjects, groups, subs) {
  const normalized = {};
  groups.forEach(group => {
    const groupProjectIds = subs.filter(sub => sub.group === group.id).map(sub => sub.id);
    const source = Array.isArray(taskProjects?.[group.id]) ? taskProjects[group.id] : [];
    normalized[group.id] = source.filter(id => groupProjectIds.includes(id));
  });
  return normalized;
}

function buildInitialGroupProjectMap(groups, subs) {
  const result = {};
  groups.forEach(group => {
    result[group.id] = subs.filter(sub => sub.group === group.id).map(sub => sub.id);
  });
  return result;
}

function buildInitialAchievementProjectMap(groups, subs, achievements) {
  const years = Object.keys(achievements || {});
  if (!years.length) years.push(String(new Date().getFullYear()));
  const result = {};
  years.forEach(year => {
    result[year] = buildInitialGroupProjectMap(groups, subs);
  });
  return result;
}

function normalizeRecurring(items, subs) {
  const fallbackSubId = subs[0]?.id || DEFAULT_SUBS[0].id;
  return (items || []).map(item => ({
    id: item.id || taskId(),
    subId: subs.some(sub => sub.id === item.subId) ? item.subId : fallbackSubId,
    dayIdx: Number.isInteger(item.dayIdx) ? item.dayIdx : 0,
    text: item.text || '',
  })).filter(item => item.text.trim());
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function buildGroupIdMap(prevGroups, nextGroups) {
  const map = {};
  const nextById = new Set(nextGroups.map(group => group.id));
  const nextByLabel = new Map(nextGroups.map(group => [normalizeKey(group.label), group.id]));

  prevGroups.forEach(group => {
    if (nextById.has(group.id)) {
      map[group.id] = group.id;
      return;
    }
    const mappedId = nextByLabel.get(normalizeKey(group.label));
    if (mappedId) map[group.id] = mappedId;
  });

  return map;
}

function buildProjectIdMap(prevSubs, nextSubs, groupIdMap) {
  const map = {};
  const nextById = new Set(nextSubs.map(project => project.id));
  const nextByComposite = new Map(
    nextSubs.map(project => [`${normalizeKey(project.label)}::${project.group}`, project.id]),
  );

  prevSubs.forEach(project => {
    if (nextById.has(project.id)) {
      map[project.id] = project.id;
      return;
    }
    const targetGroupId = groupIdMap[project.group] || project.group;
    const mappedId = nextByComposite.get(`${normalizeKey(project.label)}::${targetGroupId}`);
    if (mappedId) map[project.id] = mappedId;
  });

  return map;
}

function remapRecurringByProjectId(items, projectIdMap) {
  return (items || [])
    .map(item => ({
      ...item,
      subId: projectIdMap[item.subId] || item.subId,
    }))
    .filter(item => item.subId);
}

function remapNestedTaskMap(source, projectIdMap) {
  const result = {};

  Object.entries(source || {}).forEach(([outerKey, projects]) => {
    result[outerKey] = {};
    Object.entries(projects || {}).forEach(([projectId, value]) => {
      const mappedProjectId = projectIdMap[projectId] || projectId;
      result[outerKey][mappedProjectId] = structuredClone(value);
    });
  });

  return result;
}

function remapProjectTaskMap(source, projectIdMap) {
  const result = {};

  Object.entries(source || {}).forEach(([projectId, value]) => {
    const mappedProjectId = projectIdMap[projectId] || projectId;
    result[mappedProjectId] = structuredClone(value);
  });

  return result;
}

function remapGroupProjectMap(source, groupIdMap, projectIdMap) {
  const result = {};

  Object.entries(source || {}).forEach(([groupId, projectIds]) => {
    const mappedGroupId = groupIdMap[groupId] || groupId;
    result[mappedGroupId] = (projectIds || []).map(projectId => projectIdMap[projectId] || projectId);
  });

  return result;
}

function remapAchievementProjectsMap(source, groupIdMap, projectIdMap) {
  const result = {};

  Object.entries(source || {}).forEach(([year, groups]) => {
    result[year] = {};
    Object.entries(groups || {}).forEach(([groupId, projectIds]) => {
      const mappedGroupId = groupIdMap[groupId] || groupId;
      result[year][mappedGroupId] = (projectIds || []).map(projectId => projectIdMap[projectId] || projectId);
    });
  });

  return result;
}

function remapProjectTemplates(source, groupIdMap, projectIdMap) {
  const result = {};

  Object.entries(source || {}).forEach(([groupId, days]) => {
    const mappedGroupId = groupIdMap[groupId] || groupId;
    result[mappedGroupId] = {};
    Object.entries(days || {}).forEach(([dayIdx, projectIds]) => {
      result[mappedGroupId][dayIdx] = (projectIds || []).map(projectId => projectIdMap[projectId] || projectId);
    });
  });

  return result;
}

function remapDayProjects(source, groupIdMap, projectIdMap) {
  const result = {};

  Object.entries(source || {}).forEach(([wk, groups]) => {
    result[wk] = {};
    Object.entries(groups || {}).forEach(([groupId, days]) => {
      const mappedGroupId = groupIdMap[groupId] || groupId;
      result[wk][mappedGroupId] = {};
      Object.entries(days || {}).forEach(([dayIdx, projectIds]) => {
        result[wk][mappedGroupId][dayIdx] = (projectIds || []).map(projectId => projectIdMap[projectId] || projectId);
      });
    });
  });

  return result;
}

function moveProjectBetweenGroupsInMapArray(container, fromGroupId, toGroupId, projectId) {
  if (!container[fromGroupId]) return;
  container[fromGroupId] = (container[fromGroupId] || []).filter(id => id !== projectId);
  container[toGroupId] ||= [];
  if (!container[toGroupId].includes(projectId)) {
    container[toGroupId].push(projectId);
  }
}

function reassignProjectGroupReferences(previousSubs, nextSubs, projectIdMap) {
  const nextProjectsById = new Map(nextSubs.map(project => [project.id, project]));

  previousSubs.forEach(project => {
    const mappedProjectId = projectIdMap[project.id] || project.id;
    const nextProject = nextProjectsById.get(mappedProjectId);
    if (!nextProject || nextProject.group === project.group) return;

    moveProjectBetweenGroupsInMapArray(state.taskProjects, project.group, nextProject.group, mappedProjectId);

    const templateDaysToMove = DAYS
      .map((_, dayIdx) => dayIdx)
      .filter(dayIdx => (state.projectTemplates[project.group]?.[dayIdx] || []).includes(mappedProjectId));

    templateDaysToMove.forEach(dayIdx => {
      state.projectTemplates[project.group][dayIdx] =
        (state.projectTemplates[project.group][dayIdx] || []).filter(id => id !== mappedProjectId);
      state.projectTemplates[nextProject.group] ||= {};
      state.projectTemplates[nextProject.group][dayIdx] ||= [];
      if (!state.projectTemplates[nextProject.group][dayIdx].includes(mappedProjectId)) {
        state.projectTemplates[nextProject.group][dayIdx].push(mappedProjectId);
      }
    });

    Object.keys(state.dayProjects || {}).forEach(wk => {
      DAYS.forEach((_, dayIdx) => {
        const oldDayList = state.dayProjects[wk]?.[project.group]?.[dayIdx];
        if (Array.isArray(oldDayList) && oldDayList.includes(mappedProjectId)) {
          state.dayProjects[wk][project.group][dayIdx] = oldDayList.filter(id => id !== mappedProjectId);
          state.dayProjects[wk][nextProject.group] ||= {};
          state.dayProjects[wk][nextProject.group][dayIdx] ||= [];
          if (!state.dayProjects[wk][nextProject.group][dayIdx].includes(mappedProjectId)) {
            state.dayProjects[wk][nextProject.group][dayIdx].push(mappedProjectId);
          }
        }
      });
    });

    Object.keys(state.achievementProjects || {}).forEach(year => {
      const oldList = state.achievementProjects[year]?.[project.group];
      if (Array.isArray(oldList) && oldList.includes(mappedProjectId)) {
        state.achievementProjects[year][project.group] = oldList.filter(id => id !== mappedProjectId);
        state.achievementProjects[year][nextProject.group] ||= [];
        if (!state.achievementProjects[year][nextProject.group].includes(mappedProjectId)) {
          state.achievementProjects[year][nextProject.group].push(mappedProjectId);
        }
      }
    });
  });
}

function applyCatalog(groups, subs) {
  const previousGroups = structuredClone(state.groups || []);
  const previousSubs = structuredClone(state.subs || []);
  const groupIdMap = buildGroupIdMap(previousGroups, groups);
  const projectIdMap = buildProjectIdMap(previousSubs, subs, groupIdMap);

  state.recurring = remapRecurringByProjectId(state.recurring, projectIdMap);
  state.backlog = remapProjectTaskMap(state.backlog, projectIdMap);
  state.achievements = remapNestedTaskMap(state.achievements, projectIdMap);
  state.taskProjects = remapGroupProjectMap(state.taskProjects, groupIdMap, projectIdMap);
  state.achievementProjects = remapAchievementProjectsMap(state.achievementProjects, groupIdMap, projectIdMap);
  state.data = remapNestedTaskMap(state.data, projectIdMap);
  state.projectTemplates = remapProjectTemplates(state.projectTemplates, groupIdMap, projectIdMap);
  state.dayProjects = remapDayProjects(state.dayProjects, groupIdMap, projectIdMap);

  reassignProjectGroupReferences(
    previousSubs.map(project => ({
      ...project,
      group: groupIdMap[project.group] || project.group,
      id: projectIdMap[project.id] || project.id,
    })),
    subs,
    projectIdMap,
  );

  state.groups = normalizeGroups(groups);
  state.subs = normalizeSubs(subs, state.groups);
  state.recurring = normalizeRecurring(state.recurring, state.subs);
  state.backlog = normalizeBacklog(state.backlog);
  state.achievements = normalizeAchievements(state.achievements, state.subs);
  state.taskProjects = normalizeTaskProjects(state.taskProjects, state.groups, state.subs);
  state.achievementProjects = normalizeAchievementProjects(
    state.achievementProjects,
    state.groups,
    state.subs,
    state.achievements,
    state.achievementYears,
  );
  ensureProjectTemplates(false);
  state.dayProjects = normalizeDayProjects(state.dayProjects);
}

function weekKey(offset) {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1 + offset * 7);
  return `w${monday.getFullYear()}${String(monday.getMonth() + 1).padStart(2, '0')}${String(monday.getDate()).padStart(2, '0')}`;
}

function weekLabel(offset) {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1 + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const formatDate = date => date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const weekNumber = Math.ceil((monday - new Date(monday.getFullYear(), 0, 1)) / 604800000) + 1;
  return `Неделя ${weekNumber}: ${formatDate(monday)} – ${formatDate(sunday)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getGroup(groupId) {
  return state.groups.find(group => group.id === groupId);
}

function getSub(subId) {
  return state.subs.find(sub => sub.id === subId);
}

function getAnyProject(subId) {
  return getSub(subId) || state.archivedCatalog.subs.find(sub => sub.id === subId);
}

function getCellForWeek(wk, subId, dayIdx) {
  if (!state.data[wk]) state.data[wk] = {};
  if (!state.data[wk][subId]) state.data[wk][subId] = {};
  if (!state.data[wk][subId][dayIdx]) state.data[wk][subId][dayIdx] = [];
  return state.data[wk][subId][dayIdx];
}

function getBacklogForProject(subId) {
  if (!state.backlog[subId]) state.backlog[subId] = [];
  return state.backlog[subId];
}

function getAchievementsForProject(year, subId) {
  if (!state.achievements[year]) state.achievements[year] = {};
  if (!state.achievements[year][subId]) state.achievements[year][subId] = [];
  return state.achievements[year][subId];
}

function getAchievementProjectsForGroup(year, groupId) {
  if (!state.achievementProjects[year]) {
    state.achievementProjects[year] = {};
  }
  if (!Array.isArray(state.achievementProjects[year][groupId])) {
    state.achievementProjects[year][groupId] = [];
  }
  return state.achievementProjects[year][groupId];
}

function getRecurringStatus(wk, recurringId) {
  if (!state.recurringStatus[wk]) state.recurringStatus[wk] = {};
  if (!state.recurringStatus[wk][recurringId]) state.recurringStatus[wk][recurringId] = { done: false, note: '' };
  return state.recurringStatus[wk][recurringId];
}

function recurringDomId(recurringId, wk) {
  return `recurring|${wk}|${recurringId}`;
}

function parseRecurringDomId(value) {
  if (!value?.startsWith('recurring|')) return null;
  const [, wk, recurringId] = value.split('|');
  return { wk, recurringId };
}

function getGroupProjectIds(groupId) {
  return state.subs.filter(sub => sub.group === groupId).map(sub => sub.id);
}

function getTaskProjectsForGroup(groupId) {
  if (!Array.isArray(state.taskProjects[groupId])) {
    state.taskProjects[groupId] = [];
  }
  return state.taskProjects[groupId];
}

function ensureProjectTemplates(fillMissingWithDefaults = true) {
  state.groups.forEach(group => {
    if (!state.projectTemplates[group.id]) state.projectTemplates[group.id] = {};
    DAYS.forEach((_, dayIdx) => {
      if (!Array.isArray(state.projectTemplates[group.id][dayIdx])) {
        state.projectTemplates[group.id][dayIdx] = fillMissingWithDefaults
          ? [...getGroupProjectIds(group.id)]
          : [];
      } else {
        const valid = new Set(getGroupProjectIds(group.id));
        state.projectTemplates[group.id][dayIdx] = state.projectTemplates[group.id][dayIdx].filter(id => valid.has(id));
      }
    });
  });
}

function ensureDayProjectsWeek(wk, store = state.dayProjects) {
  if (!store[wk]) store[wk] = {};
  ensureProjectTemplates(false);
  state.groups.forEach(group => {
    if (!store[wk][group.id]) store[wk][group.id] = {};
    DAYS.forEach((_, dayIdx) => {
      if (!Array.isArray(store[wk][group.id][dayIdx])) {
        store[wk][group.id][dayIdx] = [...(state.projectTemplates[group.id]?.[dayIdx] || [])];
      } else {
        const valid = new Set(getGroupProjectIds(group.id));
        store[wk][group.id][dayIdx] = store[wk][group.id][dayIdx].filter(id => valid.has(id));
      }
    });
  });
}

function normalizeDayProjects(dayProjects) {
  const normalized = dayProjects && typeof dayProjects === 'object' ? structuredClone(dayProjects) : {};
  if (!Object.keys(normalized).length) normalized[weekKey(0)] = {};
  Object.keys(normalized).forEach(wk => ensureDayProjectsWeek(wk, normalized));
  return normalized;
}

function getDayProjects(wk, groupId, dayIdx) {
  ensureDayProjectsWeek(wk);
  return state.dayProjects[wk][groupId][dayIdx];
}

function getDisplayTasksForCell(wk, subId, dayIdx) {
  const recurring = state.recurring
    .filter(item => item.subId === subId && item.dayIdx === dayIdx)
    .map(item => {
      const status = getRecurringStatus(wk, item.id);
      return {
        id: recurringDomId(item.id, wk),
        text: item.text,
        done: Boolean(status.done),
        note: status.note || '',
        recurring: true,
        recurringId: item.id,
      };
    });
  const regular = getCellForWeek(wk, subId, dayIdx).map(task => ({ ...task, recurring: false }));
  return [...recurring, ...regular];
}

function findTaskRecord(taskIdValue, wk = weekKey(state.weekOffset)) {
  const week = state.data[wk] || {};
  for (const [subId, days] of Object.entries(week)) {
    for (const [dayIdx, tasks] of Object.entries(days || {})) {
      const index = (tasks || []).findIndex(task => task.id === taskIdValue);
      if (index !== -1) {
        return { wk, subId, dayIdx: Number(dayIdx), index, task: tasks[index] };
      }
    }
  }
  return null;
}

function findBacklogTaskRecord(taskIdValue) {
  for (const [subId, tasks] of Object.entries(state.backlog || {})) {
    const index = (tasks || []).findIndex(task => task.id === taskIdValue);
    if (index !== -1) {
      return { subId, index, task: tasks[index] };
    }
  }
  return null;
}

function findAchievementRecord(achievementId) {
  for (const [year, projects] of Object.entries(state.achievements || {})) {
    for (const [subId, items] of Object.entries(projects || {})) {
      const index = (items || []).findIndex(item => item.id === achievementId);
      if (index !== -1) {
        return { year, subId, index, item: items[index] };
      }
    }
  }
  return null;
}

function removeTaskById(taskIdValue, wk = weekKey(state.weekOffset)) {
  const record = findTaskRecord(taskIdValue, wk);
  if (!record) return null;
  const list = getCellForWeek(wk, record.subId, record.dayIdx);
  const [task] = list.splice(record.index, 1);
  return { ...record, task };
}

function removeBacklogTaskById(taskIdValue) {
  const record = findBacklogTaskRecord(taskIdValue);
  if (!record) return null;
  const list = getBacklogForProject(record.subId);
  const [task] = list.splice(record.index, 1);
  return { ...record, task };
}

function insertTask(wk, subId, dayIdx, task) {
  getCellForWeek(wk, subId, dayIdx).push(task);
}

function save() {
  localStorage.setItem('wpv3', JSON.stringify({
    groups: state.groups,
    subs: state.subs,
    recurring: state.recurring,
    recurringStatus: state.recurringStatus,
    backlog: state.backlog,
    taskProjects: state.taskProjects,
    achievements: state.achievements,
    achievementProjects: state.achievementProjects,
    achievementYears: state.achievementYears,
    profile: state.profile,
    settings: state.settings,
    data: state.data,
    projectTemplates: state.projectTemplates,
    dayProjects: state.dayProjects,
    dayColumnWidths: state.dayColumnWidths,
    sidebarCollapsed: state.ui.sidebarCollapsed,
  }));
  queuePlanningSync();
  queueAchievementsSync();
}

function seedSample() {
  const wk = weekKey(0);
  ensureDayProjectsWeek(wk);
  [
    { sub: 'modulpak', day: 0, tasks: ['Материал на товары', 'Авито выкладка'] },
    { sub: 'ai', day: 0, tasks: ['Добавить функцию утро день ночь вечер'] },
    { sub: 'modulpak', day: 2, tasks: ['Добавить все столы на сайт в магазин'] },
    { sub: 'raptor', day: 2, tasks: ['Реклама Директ создание', 'Вентилятор на Авито'] },
    { sub: 'sport', day: 5, tasks: ['Тенис Ася'] },
  ].forEach(({ sub, day, tasks }) => {
    tasks.forEach(text => insertTask(wk, sub, day, makeTask({ text, done: false, note: '' })));
  });
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem('wpv3') || 'null');
    if (raw) {
      _hasPersistedLocalWorkspace = true;
      state.groups = normalizeGroups(raw.groups);
      state.subs = normalizeSubs(raw.subs, state.groups);
      state.recurring = normalizeRecurring(raw.recurring, state.subs);
      state.recurringStatus = raw.recurringStatus || {};
      state.backlog = normalizeBacklog(raw.backlog);
      state.taskProjects = normalizeTaskProjects(
        raw.taskProjects ?? buildInitialGroupProjectMap(state.groups, state.subs),
        state.groups,
        state.subs,
      );
      state.achievements = normalizeAchievements(raw.achievements, state.subs);
      state.achievementProjects = normalizeAchievementProjects(
        raw.achievementProjects ?? buildInitialAchievementProjectMap(state.groups, state.subs, state.achievements),
        state.groups,
        state.subs,
        state.achievements,
        raw.achievementYears,
      );
      state.achievementYears = normalizeAchievementYears(
        raw.achievementYears,
        state.achievements,
        state.achievementProjects,
      );
      state.profile = normalizeProfile(raw.profile);
      state.settings = normalizeSettings(raw.settings);
      state.data = normalizeData(raw.data);
      state.projectTemplates = raw.projectTemplates || {};
      ensureProjectTemplates(false);
      state.dayProjects = normalizeDayProjects(raw.dayProjects);
      state.dayColumnWidths = raw.dayColumnWidths || {};
      state.ui.sidebarCollapsed = raw.sidebarCollapsed === undefined
        ? Boolean(state.settings.sidebarCollapsedOnStart)
        : Boolean(raw.sidebarCollapsed);
      state.currentView = state.settings.defaultView || 'graph';
      if (state.settings.openCurrentYearInAchievements) {
        state.winsYearFilter = String(new Date().getFullYear());
      }
      return;
    }
  } catch (error) {
    console.warn(error);
  }

  _hasPersistedLocalWorkspace = false;

  state.groups = normalizeGroups(DEFAULT_GROUPS);
  state.subs = normalizeSubs(DEFAULT_SUBS, state.groups);
  state.recurring = [];
  state.recurringStatus = {};
  state.backlog = {};
  state.taskProjects = normalizeTaskProjects(buildInitialGroupProjectMap(state.groups, state.subs), state.groups, state.subs);
  state.achievements = {};
  state.achievementProjects = normalizeAchievementProjects(
    buildInitialAchievementProjectMap(state.groups, state.subs, state.achievements),
    state.groups,
    state.subs,
    state.achievements,
    [],
  );
  state.achievementYears = normalizeAchievementYears([], state.achievements, state.achievementProjects);
  state.profile = normalizeProfile({});
  state.settings = normalizeSettings({});
  state.data = {};
  state.projectTemplates = {};
  ensureProjectTemplates();
  state.dayProjects = normalizeDayProjects({});
  state.dayColumnWidths = {};
  seedSample();
}

async function fetchCatalogFromServer() {
  const data = await apiJson('/api/catalog', {
    method: 'GET',
    headers: {},
  });

  return {
    groups: toCatalogGroups(data.groups),
    subs: toCatalogProjects(data.projects),
  };
}

async function fetchArchivedCatalogFromServer() {
  const data = await apiJson('/api/catalog/archive', {
    method: 'GET',
    headers: {},
  });

  state.archivedCatalog = {
    groups: toCatalogGroups(data.groups),
    subs: toCatalogProjects(data.projects),
  };

  return state.archivedCatalog;
}

async function ensureDefaultCatalogOnServer() {
  const existingCatalog = await fetchCatalogFromServer();
  if (existingCatalog.groups.length || existingCatalog.subs.length) {
    applyCatalog(existingCatalog.groups, existingCatalog.subs);
    return existingCatalog;
  }

  const createdGroups = [];
  for (const group of DEFAULT_GROUPS) {
    const created = await apiJson('/api/catalog/groups', {
      method: 'POST',
      body: JSON.stringify({
        name: group.label,
        color: group.color,
      }),
    });
    createdGroups.push(created);
  }

  const groupIdByLabel = new Map(createdGroups.map(group => [normalizeKey(group.name), group.id]));

  for (const project of DEFAULT_SUBS) {
    const sourceGroup = DEFAULT_GROUPS.find(group => group.id === project.group);
    const groupId = sourceGroup ? groupIdByLabel.get(normalizeKey(sourceGroup.label)) : null;
    if (!groupId) continue;

    await apiJson('/api/catalog/projects', {
      method: 'POST',
      body: JSON.stringify({
        groupId,
        name: project.label,
        color: project.color,
      }),
    });
  }

  const catalog = await fetchCatalogFromServer();
  applyCatalog(catalog.groups, catalog.subs);
  return catalog;
}

async function syncCatalogFromServer() {
  const catalog = await ensureDefaultCatalogOnServer();
  applyCatalog(catalog.groups, catalog.subs);
  await fetchArchivedCatalogFromServer();
  save();
  return catalog;
}

function getDayColumnWidth(dayIdx) {
  return Math.max(160, Math.min(360, Number(state.dayColumnWidths[dayIdx]) || 190));
}

function countWeekStats() {
  const wk = weekKey(state.weekOffset);
  let total = 0;
  let done = 0;
  let notes = 0;
  state.groups.forEach(group => {
    DAYS.forEach((_, dayIdx) => {
      getDayProjects(wk, group.id, dayIdx).forEach(subId => {
        getDisplayTasksForCell(wk, subId, dayIdx).forEach(task => {
          total++;
          if (task.done) done++;
          if (task.note?.trim()) notes++;
        });
      });
    });
  });
  return { total, done, open: total - done, notes };
}

function renderStats() {
  const { total, done, open, notes } = countWeekStats();
  const pct = total ? Math.round(done / total * 100) : 0;
  document.getElementById('stats-bar').innerHTML =
    `<span class="stat-pill">Задач: <b>${total}</b></span>` +
    `<span class="stat-pill">Сделано: <b>${done}</b></span>` +
    `<span class="stat-pill">Открыто: <b>${open}</b></span>` +
    `<span class="stat-pill">Заметки: <b>${notes}</b></span>` +
    `<span class="stat-pill">Прогресс: <b>${pct}%</b></span>`;
}

function renderSidebarSummary() {
  const wk = weekKey(state.weekOffset);
  const { total, done, notes } = countWeekStats();
  let projectCount = 0;
  state.groups.forEach(group => {
    DAYS.forEach((_, dayIdx) => {
      projectCount += getDayProjects(wk, group.id, dayIdx).length;
    });
  });
  document.getElementById('sidebar-summary').innerHTML = `
    <div class="summary-card">
      <div class="summary-title">Текущая сводка</div>
      <div class="summary-line">${escapeHtml(weekLabel(state.weekOffset))}</div>
      <div class="summary-line">Проектов в днях: ${projectCount}</div>
      <div class="summary-line">Задач: ${total}</div>
      <div class="summary-line">Сделано: ${done}</div>
      <div class="summary-line">Заметки: ${notes}</div>
    </div>
  `;
}

function renderSidebarLists() {
  document.getElementById('app').classList.toggle('sidebar-collapsed', state.ui.sidebarCollapsed);
  document.querySelector('.sidebar-title').textContent = state.settings.workspaceName || DEFAULT_SETTINGS.workspaceName;
  document.getElementById('sidebar-workspace-name').textContent = state.settings.workspaceName || DEFAULT_SETTINGS.workspaceName;
  const collapseButton = document.querySelector('.sidebar-collapse-btn');
  const collapseGlyph = document.querySelector('.sidebar-collapse-glyph');
  const mobileMode = isMobileViewport();
  collapseButton.classList.toggle('collapsed', state.ui.sidebarCollapsed);
  collapseButton.title = mobileMode
    ? 'Закрыть меню'
    : (state.ui.sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню');
  if (collapseGlyph) {
    collapseGlyph.textContent = mobileMode ? '×' : '‹';
  }
  document.querySelectorAll('[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === state.currentView);
  });
  const groupsWrap = document.getElementById('sidebar-groups');
  const groupToggle = document.querySelector('.sidebar-action[onclick="toggleSidebarSection(\'groups\')"]');
  groupsWrap.classList.toggle('open', state.ui.groupsOpen);
  groupToggle?.classList.toggle('open', state.ui.groupsOpen);
  groupsWrap.innerHTML = `
    <button class="sidebar-inline-add" type="button" onclick="openGroupManage()">+ Добавить группу</button>
    ${state.groups.map(group => `
    <div
      class="sidebar-item-row"
      draggable="true"
      ondragstart="dragSidebarItem(event, 'group', '${group.id}')"
      ondragover="allowSidebarItemDrop(event)"
      ondrop="dropSidebarItem(event, 'group', '${group.id}')"
    >
      <button class="sidebar-item-main" type="button" onclick="openGroupManage('${group.id}')">
        <span class="sidebar-project-dot" style="background:${group.color}"></span>
        <span>${escapeHtml(group.label)}</span>
      </button>
    </div>
  `).join('')}`;

  const projectsWrap = document.getElementById('sidebar-projects');
  const projectToggle = document.querySelector('.sidebar-action[onclick="toggleSidebarSection(\'projects\')"]');
  projectsWrap.classList.toggle('open', state.ui.projectsOpen);
  projectToggle?.classList.toggle('open', state.ui.projectsOpen);
  projectsWrap.innerHTML = `
    <button class="sidebar-inline-add" type="button" onclick="openManage()">+ Добавить проект</button>
    ${state.subs.map(project => `
    <div
      class="sidebar-item-row"
      draggable="true"
      ondragstart="dragSidebarItem(event, 'project', '${project.id}')"
      ondragover="allowSidebarItemDrop(event)"
      ondrop="dropSidebarItem(event, 'project', '${project.id}')"
    >
      <button class="sidebar-item-main" type="button" onclick="openManage('${project.id}')">
        <span class="sidebar-project-dot" style="background:${project.color}"></span>
        <span>${escapeHtml(project.label)}</span>
      </button>
    </div>
  `).join('')}`;
}

function renderCurrentView() {
  const graphView = document.getElementById('graph-view');
  const tasksView = document.getElementById('tasks-view');
  const winsView = document.getElementById('wins-view');
  const historyView = document.getElementById('history-view');
  const profileView = document.getElementById('profile-view');
  const settingsView = document.getElementById('settings-view');
  const statsBar = document.getElementById('stats-bar');
  const weekNav = document.getElementById('week-nav');
  const pageTitle = document.getElementById('page-title');
  const createBtn = document.getElementById('top-create-task-btn');
  const addProjectBtn = document.getElementById('top-add-project-btn');
  const carryBtn = document.getElementById('top-carry-btn');

  graphView.style.display = state.currentView === 'graph' ? 'block' : 'none';
  tasksView.style.display = state.currentView === 'tasks' ? 'block' : 'none';
  winsView.style.display = state.currentView === 'wins' ? 'block' : 'none';
  historyView.style.display = state.currentView === 'history' ? 'block' : 'none';
  profileView.style.display = state.currentView === 'profile' ? 'block' : 'none';
  settingsView.style.display = state.currentView === 'settings' ? 'block' : 'none';
  document.getElementById('ai-section').style.display = 'none';

  if (state.currentView === 'graph') {
    weekNav.style.display = 'flex';
    pageTitle.style.display = 'none';
    statsBar.style.display = 'flex';
    createBtn.style.display = 'inline-flex';
    createBtn.textContent = '+ задача';
    createBtn.onclick = () => openCreateTaskModal('week');
    addProjectBtn.style.display = 'inline-flex';
    addProjectBtn.textContent = '+ проект';
    addProjectBtn.onclick = () => openDayProjectModal();
    carryBtn.style.display = 'inline-flex';
    carryBtn.textContent = 'перенос';
    carryBtn.onclick = () => carryOverUnfinished();
    renderBoard();
    return;
  }

  weekNav.style.display = 'none';
  pageTitle.style.display = 'block';
  statsBar.style.display = 'none';

  if (state.currentView === 'tasks') {
    pageTitle.textContent = 'Задачи';
    createBtn.style.display = 'inline-flex';
    createBtn.textContent = '+ задача';
    createBtn.onclick = () => openCreateTaskModal('backlog');
    addProjectBtn.style.display = 'inline-flex';
    addProjectBtn.textContent = '+ проект';
    addProjectBtn.onclick = () => openDayProjectModal('backlog');
    carryBtn.style.display = 'none';
    renderTasksView();
    return;
  }

  if (state.currentView === 'wins') {
    pageTitle.textContent = 'Достижения';
    createBtn.style.display = 'inline-flex';
    createBtn.textContent = '+ достижение';
    createBtn.onclick = () => openAchievementModal();
    addProjectBtn.style.display = 'inline-flex';
    addProjectBtn.textContent = '+ год';
    addProjectBtn.onclick = () => openAchievementYearPrompt();
    carryBtn.style.display = 'inline-flex';
    carryBtn.textContent = '+ проект';
    carryBtn.onclick = () => openDayProjectModal('wins');
    renderWinsView();
    return;
  }

  if (state.currentView === 'profile') {
    pageTitle.textContent = 'Профиль';
    createBtn.style.display = 'none';
    addProjectBtn.style.display = 'none';
    carryBtn.style.display = 'none';
    renderProfileView();
    return;
  }

  if (state.currentView === 'settings') {
    pageTitle.textContent = 'Настройки';
    createBtn.style.display = 'none';
    addProjectBtn.style.display = 'none';
    carryBtn.style.display = 'none';
    renderSettingsView();
    return;
  }

  createBtn.style.display = 'none';
  addProjectBtn.style.display = 'none';
  carryBtn.style.display = 'none';

  pageTitle.textContent = 'История и аналитика';
  historyView.innerHTML = '<div class="empty-note">Экран истории и аналитики пока пустой. Дальше сюда можно вынести прошлые недели, статистику и ИИ-разбор.</div>';
}

function switchView(view) {
  state.currentView = view;
  renderSidebarLists();
  renderCurrentView();
  closeSidebar();
}

function renderBoard() {
  const wk = weekKey(state.weekOffset);
  ensureDayProjectsWeek(wk);
  document.getElementById('week-label').textContent = weekLabel(state.weekOffset);
  renderStats();
  renderSidebarSummary();
  renderSidebarLists();

  let html = '<tr><th class="group-head"></th>';
  DAYS.forEach((day, dayIdx) => {
    const width = getDayColumnWidth(dayIdx);
    html += `<th class="day-head" style="width:${width}px;min-width:${width}px;max-width:${width}px">
      <span class="day-head-label">${day}</span>
      <button class="day-resize-handle" type="button" onpointerdown="startDayResize(event, ${dayIdx})" aria-label="Изменить ширину столбца ${day}"></button>
    </th>`;
  });
  html += '</tr>';

  state.groups.forEach(group => {
    html += `<tr><td class="group-name"><div class="group-name-inner" style="color:${group.color}">${escapeHtml(group.label)}</div></td>`;
    DAYS.forEach((day, dayIdx) => {
      const projectIds = getDayProjects(wk, group.id, dayIdx);
      const width = getDayColumnWidth(dayIdx);
      html += `<td class="day-cell" style="width:${width}px;min-width:${width}px;max-width:${width}px" ondragover="allowProjectDrop(event)" ondrop="dropProject(event, '${group.id}', ${dayIdx})"><div class="day-stack">`;

      projectIds.forEach(subId => {
        const project = getSub(subId);
        if (!project) return;
        const tasks = getDisplayTasksForCell(wk, subId, dayIdx);
        html += `<div class="project-card" style="--project-line:${project.color}" draggable="true" ondragstart="dragProject(event, '${group.id}', ${dayIdx}, '${subId}')" ondragover="allowProjectDrop(event)" ondrop="dropProjectOnCard(event, '${group.id}', ${dayIdx}, '${subId}')">
          <div class="project-card-head">
            <div class="project-title">${escapeHtml(project.label)}</div>
            <button class="project-remove-btn" type="button" onclick="removeProjectFromDay('${group.id}', ${dayIdx}, '${subId}')">×</button>
          </div>
          <div class="task-list" ondragover="allowDrop(event)" ondrop="dropTask(event, '${subId}', ${dayIdx})">`;

        tasks.forEach(task => {
          const noteBadge = task.note?.trim()
            ? `<button class="note-badge" type="button" onclick="openTaskDetailsById(event, '${task.id}')">📝</button>`
            : '';
          const action = task.recurring
            ? '<span class="task-icon" title="Постоянная задача">∞</span>'
            : '';
          html += `<div class="task-item${task.done ? ' done' : ''}" ${task.recurring ? '' : `draggable="true" ondragstart="dragTask(event, '${task.id}')"`}>
            <input type="checkbox" ${task.done ? 'checked' : ''} onchange="toggleById('${task.id}')">
            <button class="task-text" type="button" onclick="openTaskDetailsById(event, '${task.id}')">${escapeHtml(task.text)}</button>
            ${noteBadge || action ? `<div class="task-tools">${noteBadge}${action}</div>` : ''}
          </div>`;
        });

        if (_inlineTaskMeta && _inlineTaskMeta.subId === subId && _inlineTaskMeta.dayIdx === dayIdx) {
          html += `<div class="task-inline task-inline-quiet">
            <input
              id="inline-task-input"
              value="${escapeHtml(_inlineTaskMeta.text || '')}"
              placeholder="Введите задачу..."
              oninput="updateInlineTaskValue(this.value)"
              onkeydown="handleInlineTaskKey(event)"
              onblur="handleInlineTaskBlur()"
            >
            <span class="task-inline-arrow">↵</span>
          </div>`;
        } else {
          html += `<button class="task-entry-trigger" type="button" onclick="openInlineTask('${subId}', ${dayIdx})"></button>`;
        }

        html += `</div></div>`;
      });

      html += '</div></td>';
    });
    html += '</tr>';
  });

  document.getElementById('board-table').innerHTML = html;
}

function renderTasksView() {
  const html = state.groups.map(group => {
    const visibleProjectIds = getTaskProjectsForGroup(group.id);
    const projects = visibleProjectIds.map(getSub).filter(Boolean);
    return `
      <section class="tasks-group-section">
        <div class="tasks-group-head">
          <div class="tasks-group-title" style="color:${group.color}">${escapeHtml(group.label)}</div>
        </div>
        <div class="tasks-project-grid">
          ${projects.map(project => {
            const tasks = getBacklogForProject(project.id);
            return `
              <article class="tasks-project-card" style="--project-line:${project.color}">
                <div class="tasks-project-head">
                  <div class="tasks-project-title">${escapeHtml(project.label)}</div>
                  <button class="tasks-project-remove" type="button" onclick="removeProjectFromTasks('${group.id}', '${project.id}')" title="Убрать проект из страницы задач">×</button>
                </div>
                <div class="tasks-project-list">
                  ${tasks.length ? tasks.map(task => `
                    <div class="task-item task-item-backlog${task.done ? ' done' : ''}">
                      <input type="checkbox" ${task.done ? 'checked' : ''} onchange="toggleById('${task.id}')">
                      <button class="task-text" type="button" onclick="openTaskDetailsById(event, '${task.id}')">${escapeHtml(task.text)}</button>
                      ${task.note?.trim() ? `<div class="task-tools"><button class="note-badge" type="button" onclick="openTaskDetailsById(event, '${task.id}')">📝</button></div>` : ''}
                    </div>
                  `).join('') : ''}
                  ${_inlineBacklogMeta && _inlineBacklogMeta.subId === project.id ? `
                    <div class="task-inline task-inline-quiet">
                      <input
                        id="inline-backlog-input"
                        value="${escapeHtml(_inlineBacklogMeta.text || '')}"
                        placeholder="Введите задачу..."
                        oninput="updateInlineBacklogValue(this.value)"
                        onkeydown="handleInlineBacklogKey(event)"
                        onblur="handleInlineBacklogBlur()"
                      >
                    </div>
                  ` : `<button class="task-entry-trigger" type="button" onclick="openInlineBacklogTask('${project.id}')"></button>`}
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }).join('');

  document.getElementById('tasks-view').innerHTML = html || '<div class="empty-note">Пока нет проектов для страницы задач.</div>';

  if (_inlineBacklogMeta) {
    setTimeout(() => document.getElementById('inline-backlog-input')?.focus(), 20);
  }
}

function getAchievementYears() {
  return normalizeAchievementYears(
    state.achievementYears,
    state.achievements,
    state.achievementProjects,
  );
}

function formatAchievementDate(dateString) {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  if (!year || !month || !day) return dateString;
  return `${day}.${month}.${year}`;
}

function renderWinsView() {
  const years = getAchievementYears();
  const filterBar = `
    <div class="wins-toolbar">
      <button class="wins-filter-btn${state.winsYearFilter === 'all' ? ' active' : ''}" type="button" onclick="setWinsYearFilter('all')">Все</button>
      ${years.map(year => `
        <button class="wins-filter-btn${state.winsYearFilter === year ? ' active' : ''}" type="button" onclick="setWinsYearFilter('${year}')">${year}</button>
      `).join('')}
    </div>
  `;

  const displayYears = state.winsYearFilter === 'all' ? years : years.filter(year => year === state.winsYearFilter);
  const body = displayYears.map(year => {
    const isOpen = state.winsYearFilter !== 'all' || state.ui.achievementYearsOpen[year] !== false;
    return `
      <section class="wins-year-section">
        <button class="wins-year-head" type="button" onclick="toggleAchievementYear('${year}')">
          <span class="wins-year-title">${year}</span>
          <span class="wins-year-arrow">${isOpen ? '▾' : '▸'}</span>
        </button>
        <div class="wins-year-body"${isOpen ? '' : ' style="display:none"'}">
          ${state.groups.map(group => {
            const projects = getAchievementProjectsForGroup(year, group.id).map(getAnyProject).filter(Boolean);
            return `
              <section class="wins-group-section">
                <div class="wins-group-title" style="color:${group.color}">${escapeHtml(group.label)}</div>
                <div class="wins-project-grid">
                  ${projects.map(project => {
                    const items = getAchievementsForProject(year, project.id)
                      .slice()
                      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                    return `
                      <article class="wins-project-card" style="--project-line:${project.color}">
                        <div class="wins-project-head">
                          <div class="wins-project-title">${escapeHtml(project.label)}</div>
                          <button class="wins-project-remove" type="button" onclick="removeProjectFromWins('${year}', '${group.id}', '${project.id}')" title="Убрать проект из достижений">×</button>
                        </div>
                        <div class="wins-project-list">
                          ${items.map(item => `
                            <button class="wins-item" type="button" onclick="openAchievementModal('${item.id}')">
                              <span class="wins-item-text">${escapeHtml(item.text)}</span>
                              <span class="wins-item-date">${escapeHtml(formatAchievementDate(item.date))}</span>
                            </button>
                          `).join('')}
                          <button class="task-entry-trigger wins-add-trigger" type="button" onclick="openAchievementModalForProject('${year}', '${project.id}')"></button>
                        </div>
                      </article>
                    `;
                  }).join('')}
                </div>
              </section>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }).join('');

  document.getElementById('wins-view').innerHTML = `
    ${filterBar}
    ${body || '<div class="empty-note">Добавь первое достижение.</div>'}
  `;
}

function getProfileInitials() {
  const parts = (state.profile.name || '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || 'SV';
}

function renderProfileView() {
  const archivedGroups = state.archivedCatalog.groups || [];
  const archivedProjects = state.archivedCatalog.subs || [];

  document.getElementById('profile-view').innerHTML = `
    <div class="account-shell">
      <section class="settings-card account-hero">
        <div class="profile-avatar">${escapeHtml(getProfileInitials())}</div>
        <div class="account-hero-copy">
          <div class="profile-name">${escapeHtml(state.profile.name || 'Без имени')}</div>
          <div class="profile-meta">${escapeHtml(state.profile.role || 'Роль не указана')}</div>
          <div class="profile-meta">${escapeHtml(state.profile.city || 'Город не указан')}</div>
          <div class="profile-meta">${escapeHtml(currentUser?.email || state.profile.email || 'Локальный профиль')}</div>
        </div>
      </section>

      <div class="account-grid">
        <section class="settings-card account-main">
          <div class="settings-card-title">Личные данные</div>
          <div class="settings-form settings-form-grid">
            <label class="field-group">
              <span class="form-label">Имя</span>
              <input id="profile-name" value="${escapeHtml(state.profile.name)}" />
            </label>
            <label class="field-group">
              <span class="form-label">Email</span>
              <input id="profile-email" value="${escapeHtml(state.profile.email)}" placeholder="name@email.com" />
            </label>
            <label class="field-group">
              <span class="form-label">Роль</span>
              <input id="profile-role" value="${escapeHtml(state.profile.role)}" placeholder="Основатель, менеджер..." />
            </label>
            <label class="field-group">
              <span class="form-label">Город</span>
              <input id="profile-city" value="${escapeHtml(state.profile.city)}" />
            </label>
            <label class="field-group field-group-wide">
              <span class="form-label">О себе</span>
              <textarea id="profile-about" placeholder="Короткое описание профиля для будущего кабинета и сервиса.">${escapeHtml(state.profile.about)}</textarea>
            </label>
            <div class="modal-actions modal-actions-right field-group-wide">
              <button class="primary" type="button" onclick="saveProfile()">Сохранить профиль</button>
            </div>
          </div>
        </section>

        <div class="account-side">
          <section class="settings-card">
            <div class="settings-card-title">Статус аккаунта</div>
            <div class="settings-info-row">
              <span>Хранение данных</span>
              <b>Локально + backend foundation</b>
            </div>
            <div class="settings-info-row">
              <span>Авторизация</span>
              <b>${currentUser ? 'Подключена' : 'Не активна'}</b>
            </div>
            <div class="settings-info-row">
              <span>Синхронизация</span>
              <b>Следующий этап после CRUD API</b>
            </div>
            <div class="settings-info-row">
              <span>Аккаунт</span>
              <b>${escapeHtml(currentUser?.email || state.profile.email || 'Локальный профиль')}</b>
            </div>
            <div class="modal-actions modal-actions-right">
              <button type="button" onclick="logoutUser()">Выйти из аккаунта</button>
            </div>
          </section>

          <section class="settings-card">
            <div class="settings-card-title">Архив</div>
            <div class="settings-copy">
              Удалённые группы и проекты хранятся 30 дней. Здесь их можно вернуть обратно.
            </div>
            <div class="archive-block">
              <div class="archive-subtitle">Группы</div>
              ${archivedGroups.length ? archivedGroups.map(group => `
                <div class="archive-row">
                  <div class="archive-text">
                    <span class="archive-name">${escapeHtml(group.label)}</span>
                  </div>
                  <button type="button" onclick="restoreArchivedGroup('${group.id}')">Восстановить</button>
                </div>
              `).join('') : '<div class="empty-note compact">Архивных групп пока нет.</div>'}
            </div>
            <div class="archive-block">
              <div class="archive-subtitle">Проекты</div>
              ${archivedProjects.length ? archivedProjects.map(project => `
                <div class="archive-row">
                  <div class="archive-text">
                    <span class="archive-name">${escapeHtml(project.label)}</span>
                  </div>
                  <button type="button" onclick="restoreArchivedProject('${project.id}')">Восстановить</button>
                </div>
              `).join('') : '<div class="empty-note compact">Архивных проектов пока нет.</div>'}
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function renderSettingsView() {
  document.getElementById('settings-view').innerHTML = `
    <div class="account-shell">
      <section class="settings-card account-hero account-hero-settings">
        <div class="account-hero-copy">
          <div class="profile-name">Настройки сервиса</div>
          <div class="profile-meta">Рабочее пространство, поведение интерфейса и резервные копии.</div>
        </div>
      </section>

      <div class="account-grid">
        <section class="settings-card account-main">
          <div class="settings-card-title">Сервис</div>
          <div class="settings-form settings-form-grid">
            <label class="field-group field-group-wide">
              <span class="form-label">Название пространства</span>
              <input id="settings-workspace-name" value="${escapeHtml(state.settings.workspaceName)}" />
            </label>
            <label class="field-group field-group-wide">
              <span class="form-label">Стартовая страница</span>
              <select id="settings-default-view">
                <option value="graph"${state.settings.defaultView === 'graph' ? ' selected' : ''}>График</option>
                <option value="tasks"${state.settings.defaultView === 'tasks' ? ' selected' : ''}>Задачи</option>
                <option value="wins"${state.settings.defaultView === 'wins' ? ' selected' : ''}>Достижения</option>
                <option value="history"${state.settings.defaultView === 'history' ? ' selected' : ''}>История и аналитика</option>
                <option value="profile"${state.settings.defaultView === 'profile' ? ' selected' : ''}>Профиль</option>
                <option value="settings"${state.settings.defaultView === 'settings' ? ' selected' : ''}>Настройки</option>
              </select>
            </label>
            <label class="settings-check field-group-wide">
              <input id="settings-sidebar-collapsed" type="checkbox" ${state.settings.sidebarCollapsedOnStart ? 'checked' : ''} />
              <span>Сворачивать sidebar при старте</span>
            </label>
            <label class="settings-check field-group-wide">
              <input id="settings-open-current-year" type="checkbox" ${state.settings.openCurrentYearInAchievements ? 'checked' : ''} />
              <span>Открывать достижения сразу на текущем году</span>
            </label>
            <div class="modal-actions modal-actions-right field-group-wide">
              <button class="primary" type="button" onclick="saveSettings()">Сохранить настройки</button>
            </div>
          </div>
        </section>

        <div class="account-side">
          <section class="settings-card">
            <div class="settings-card-title">Данные</div>
            <div class="settings-copy">
              Здесь можно сохранить полную резервную копию сервиса или загрузить её обратно.
            </div>
            <div class="settings-actions-row">
              <button type="button" onclick="exportAllData()">Экспорт JSON</button>
              <button type="button" onclick="triggerImportData()">Импорт JSON</button>
            </div>
            <input id="settings-import-input" type="file" accept="application/json,.json" style="display:none" onchange="importAllDataFromFile(event)" />
          </section>

          <section class="settings-card">
            <div class="settings-card-title">Подготовка к серверной версии</div>
            <div class="settings-info-row">
              <span>Личный кабинет</span>
              <b>Каркас готов</b>
            </div>
            <div class="settings-info-row">
              <span>База данных</span>
              <b>Следующий этап</b>
            </div>
            <div class="settings-info-row">
              <span>Вход / авторизация</span>
              <b>Нужно подключить</b>
            </div>
            <div class="settings-info-row">
              <span>Профиль пользователя</span>
              <b>Локальная версия уже есть</b>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

async function saveProfile() {
  const button = document.querySelector('#profile-view .modal-actions .primary');
  const originalText = button?.textContent || 'Сохранить профиль';

  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Сохраняем...';
    }

    const account = await apiJson('/api/account/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        name: document.getElementById('profile-name').value.trim(),
        email: document.getElementById('profile-email').value.trim(),
        role: document.getElementById('profile-role').value.trim(),
        city: document.getElementById('profile-city').value.trim(),
        about: document.getElementById('profile-about').value.trim(),
      }),
    });

    applyAccountPayload(account);
    save();
    renderProfileView();
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UPDATE_PROFILE_FAILED';
    const message = code === 'EMAIL_ALREADY_IN_USE'
      ? 'Эта почта уже занята другим аккаунтом.'
      : 'Не удалось сохранить профиль.';
    alert(message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

async function saveSettings() {
  const button = document.querySelector('#settings-view .modal-actions .primary');
  const originalText = button?.textContent || 'Сохранить настройки';

  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Сохраняем...';
    }

    const account = await apiJson('/api/account/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        workspaceName: document.getElementById('settings-workspace-name').value.trim() || DEFAULT_SETTINGS.workspaceName,
        defaultView: document.getElementById('settings-default-view').value,
        sidebarCollapsedOnStart: document.getElementById('settings-sidebar-collapsed').checked,
        openCurrentYearInAchievements: document.getElementById('settings-open-current-year').checked,
      }),
    });

    applyAccountPayload(account);
    save();
    renderSettingsView();
  } catch (error) {
    console.error(error);
    alert('Не удалось сохранить настройки.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function buildExportPayload() {
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    app: 'Task Vasilich V3',
    groups: state.groups,
    subs: state.subs,
    recurring: state.recurring,
    recurringStatus: state.recurringStatus,
    backlog: state.backlog,
    taskProjects: state.taskProjects,
    achievements: state.achievements,
    achievementProjects: state.achievementProjects,
    achievementYears: state.achievementYears,
    profile: state.profile,
    settings: state.settings,
    data: state.data,
    projectTemplates: state.projectTemplates,
    dayProjects: state.dayProjects,
    dayColumnWidths: state.dayColumnWidths,
    sidebarCollapsed: state.ui.sidebarCollapsed,
  };
}

function exportAllData() {
  const payload = buildExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `task-vasilich-v2-backup-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function triggerImportData() {
  document.getElementById('settings-import-input')?.click();
}

async function importAllDataFromFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object') {
      throw new Error('invalid_json');
    }

    state.groups = normalizeGroups(raw.groups);
    state.subs = normalizeSubs(raw.subs, state.groups);
    state.recurring = normalizeRecurring(raw.recurring, state.subs);
    state.recurringStatus = raw.recurringStatus || {};
    state.backlog = normalizeBacklog(raw.backlog);
    state.achievements = normalizeAchievements(raw.achievements, state.subs);
    state.taskProjects = normalizeTaskProjects(
      raw.taskProjects ?? buildInitialGroupProjectMap(state.groups, state.subs),
      state.groups,
      state.subs,
    );
    state.achievementProjects = normalizeAchievementProjects(
      raw.achievementProjects ?? buildInitialAchievementProjectMap(state.groups, state.subs, state.achievements),
      state.groups,
      state.subs,
      state.achievements,
      raw.achievementYears,
    );
    state.achievementYears = normalizeAchievementYears(
      raw.achievementYears,
      state.achievements,
      state.achievementProjects,
    );
    state.profile = normalizeProfile(raw.profile);
    state.settings = normalizeSettings(raw.settings);
    state.data = normalizeData(raw.data);
    state.projectTemplates = raw.projectTemplates || {};
    ensureProjectTemplates(false);
    state.dayProjects = normalizeDayProjects(raw.dayProjects);
    state.dayColumnWidths = raw.dayColumnWidths || {};
    state.ui.sidebarCollapsed = raw.sidebarCollapsed === undefined
      ? Boolean(state.settings.sidebarCollapsedOnStart)
      : Boolean(raw.sidebarCollapsed);
    state.currentView = 'settings';
    state.winsYearFilter = state.settings.openCurrentYearInAchievements ? String(new Date().getFullYear()) : 'all';
    save();
    renderSidebarLists();
    renderCurrentView();
    alert('Данные успешно импортированы.');
  } catch (error) {
    console.error(error);
    alert('Не удалось импортировать JSON. Проверь файл.');
  }
}

function setWinsYearFilter(year) {
  state.winsYearFilter = year;
  renderWinsView();
}

function toggleAchievementYear(year) {
  state.ui.achievementYearsOpen[year] = state.ui.achievementYearsOpen[year] === false;
  renderWinsView();
}

function removeProjectFromWins(year, groupId, subId) {
  const project = getAnyProject(subId);
  openConfirmModal({
    title: 'Убрать проект',
    message: `Убрать проект${project?.label ? ` «${project.label}»` : ''} со страницы достижений за ${year}?`,
    confirmText: 'Убрать',
    danger: true,
    onConfirm: async () => {
      state.achievementProjects[year][groupId] = getAchievementProjectsForGroup(year, groupId).filter(id => id !== subId);
      save();
      renderWinsView();
    },
  });
}

function openAchievementYearPrompt() {
  const currentYear = String(new Date().getFullYear());
  const value = window.prompt('Добавить год для архива достижений', currentYear);
  if (value === null) return;
  const year = value.trim();
  if (!/^\d{4}$/.test(year)) {
    alert('Год должен быть в формате 2024.');
    return;
  }
  if (!state.achievements[year]) {
    state.achievements[year] = {};
  }
  if (!state.achievementProjects[year]) {
    state.achievementProjects[year] = {};
  }
  state.achievementYears = normalizeAchievementYears(
    [...state.achievementYears, year],
    state.achievements,
    state.achievementProjects,
  );
  state.winsYearFilter = year;
  state.ui.achievementYearsOpen[year] = true;
  save();
  renderWinsView();
}

function removeProjectFromTasks(groupId, subId) {
  state.taskProjects[groupId] = getTaskProjectsForGroup(groupId).filter(id => id !== subId);
  save();
  renderTasksView();
}

function renderAchievementProjectOptions() {
  const groupId = document.getElementById('achievement-group-select').value;
  const projects = state.subs.filter(sub => sub.group === groupId);
  const select = document.getElementById('achievement-project-select');
  select.innerHTML = projects.map(project => `<option value="${project.id}">${escapeHtml(project.label)}</option>`).join('');
}

function openAchievementModalForProject(year, subId) {
  openAchievementModal(null, year, subId);
}

function openAchievementModal(achievementId = null, presetYear = null, presetSubId = null) {
  manageAchievementId = achievementId;
  const record = achievementId ? findAchievementRecord(achievementId) : null;
  const currentYear = String(new Date().getFullYear());
  const years = Array.from(new Set([...getAchievementYears(), currentYear])).sort((a, b) => Number(b) - Number(a));
  document.getElementById('achievement-year-select').innerHTML = years.map(year => `<option value="${year}">${year}</option>`).join('');
  document.getElementById('achievement-group-select').innerHTML = state.groups.map(group =>
    `<option value="${group.id}">${escapeHtml(group.label)}</option>`
  ).join('');

  const project = record ? getSub(record.subId) : (presetSubId ? getSub(presetSubId) : state.subs[0]);
  const year = record?.year || presetYear || currentYear;
  const groupId = project?.group || state.groups[0]?.id || '';

  document.getElementById('achievement-year-select').value = year;
  document.getElementById('achievement-group-select').value = groupId;
  renderAchievementProjectOptions();
  document.getElementById('achievement-project-select').value = record?.subId || presetSubId || project?.id || '';
  document.getElementById('achievement-date-input').value = record?.item.date || '';
  document.getElementById('achievement-text-input').value = record?.item.text || '';
  document.getElementById('achievement-modal-title').textContent = record ? 'Редактировать достижение' : 'Добавить достижение';
  document.getElementById('achievement-save-btn').textContent = record ? 'Сохранить' : 'Добавить';
  document.getElementById('achievement-delete-btn').style.display = record ? 'inline-flex' : 'none';
  document.getElementById('achievement-modal').classList.add('open');
}

function closeAchievementModal() {
  document.getElementById('achievement-modal').classList.remove('open');
  manageAchievementId = null;
}

function openConfirmModal({ title = 'Подтверждение', message = '', confirmText = 'Удалить', danger = true, onConfirm = null }) {
  _confirmMeta = { onConfirm };
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-copy').textContent = message;
  const submitButton = document.getElementById('confirm-modal-submit');
  submitButton.textContent = confirmText;
  submitButton.classList.toggle('danger', Boolean(danger));
  submitButton.classList.toggle('primary', !danger);
  document.getElementById('confirm-modal').classList.add('open');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.remove('open');
  _confirmMeta = null;
}

async function submitConfirmModal() {
  const action = _confirmMeta?.onConfirm;
  closeConfirmModal();
  if (typeof action === 'function') {
    await action();
  }
}

function saveAchievement() {
  const year = document.getElementById('achievement-year-select').value;
  const subId = document.getElementById('achievement-project-select').value;
  const text = document.getElementById('achievement-text-input').value.trim();
  const date = document.getElementById('achievement-date-input').value;
  if (!year || !subId || !text) return;

  if (manageAchievementId) {
    const record = findAchievementRecord(manageAchievementId);
    if (!record) return;
    if (record.year !== year || record.subId !== subId) {
      state.achievements[record.year][record.subId] = getAchievementsForProject(record.year, record.subId).filter(item => item.id !== manageAchievementId);
      getAchievementsForProject(year, subId).push({ id: manageAchievementId, text, date });
    } else {
      record.item.text = text;
      record.item.date = date;
    }
  } else {
    getAchievementsForProject(year, subId).push({ id: taskId(), text, date });
  }

  save();
  closeAchievementModal();
  renderWinsView();
}

function deleteAchievement() {
  if (!manageAchievementId) return;
  const record = findAchievementRecord(manageAchievementId);
  if (!record) return;
  openConfirmModal({
    title: 'Удалить достижение',
    message: 'Удалить это достижение?',
    confirmText: 'Удалить',
    danger: true,
    onConfirm: async () => {
      state.achievements[record.year][record.subId] = getAchievementsForProject(record.year, record.subId).filter(item => item.id !== manageAchievementId);
      save();
      closeAchievementModal();
      renderWinsView();
    },
  });
}

function changeWeek(delta) {
  state.weekOffset += delta;
  document.getElementById('ai-section').style.display = 'none';
  renderBoard();
}

function toggleById(taskIdValue) {
  const recurringMeta = parseRecurringDomId(taskIdValue);
  if (recurringMeta) {
    const status = getRecurringStatus(recurringMeta.wk, recurringMeta.recurringId);
    status.done = !status.done;
    save();
    renderBoard();
    return;
  }

  const record = findTaskRecord(taskIdValue);
  if (record) {
    record.task.done = !record.task.done;
    save();
    renderCurrentView();
    return;
  }

  const backlogRecord = findBacklogTaskRecord(taskIdValue);
  if (!backlogRecord) return;
  backlogRecord.task.done = !backlogRecord.task.done;
  save();
  renderCurrentView();
}

function openInlineTask(subId, dayIdx) {
  _inlineTaskMeta = { subId, dayIdx, text: '' };
  renderBoard();
  setTimeout(() => document.getElementById('inline-task-input')?.focus(), 20);
}

function updateInlineTaskValue(value) {
  if (_inlineTaskMeta) _inlineTaskMeta.text = value;
}

function handleInlineTaskKey(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveInlineTask();
  }
  if (event.key === 'Escape') {
    closeInlineTask();
  }
}

function handleInlineTaskBlur() {
  if (!_inlineTaskMeta) return;
  const text = (_inlineTaskMeta.text || '').trim();
  if (text) {
    saveInlineTask();
    return;
  }
  closeInlineTask();
}

function saveInlineTask() {
  if (!_inlineTaskMeta) return;
  const text = (_inlineTaskMeta.text || '').trim();
  if (!text) return;
  insertTask(weekKey(state.weekOffset), _inlineTaskMeta.subId, _inlineTaskMeta.dayIdx, makeTask({ text, done: false, note: '' }));
  _inlineTaskMeta = null;
  save();
  renderBoard();
}

function closeInlineTask() {
  _inlineTaskMeta = null;
  renderBoard();
}

function openInlineBacklogTask(subId) {
  _inlineBacklogMeta = { subId, text: '' };
  renderTasksView();
}

function updateInlineBacklogValue(value) {
  if (_inlineBacklogMeta) _inlineBacklogMeta.text = value;
}

function handleInlineBacklogKey(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveInlineBacklogTask();
  }
  if (event.key === 'Escape') {
    closeInlineBacklogTask();
  }
}

function handleInlineBacklogBlur() {
  if (!_inlineBacklogMeta) return;
  const text = (_inlineBacklogMeta.text || '').trim();
  if (text) {
    saveInlineBacklogTask();
    return;
  }
  closeInlineBacklogTask();
}

function saveInlineBacklogTask() {
  if (!_inlineBacklogMeta) return;
  const text = (_inlineBacklogMeta.text || '').trim();
  if (!text) return;
  getBacklogForProject(_inlineBacklogMeta.subId).push(makeTask({ text, done: false, note: '' }));
  _inlineBacklogMeta = null;
  save();
  renderTasksView();
}

function closeInlineBacklogTask() {
  _inlineBacklogMeta = null;
  renderTasksView();
}

function openTaskDetailsById(event, taskIdValue) {
  if (event) event.stopPropagation();
  const recurringMeta = parseRecurringDomId(taskIdValue);
  if (recurringMeta) {
    const recurring = state.recurring.find(item => item.id === recurringMeta.recurringId);
    if (!recurring) return;
    const sub = getSub(recurring.subId);
    const status = getRecurringStatus(recurringMeta.wk, recurring.id);
    _taskMeta = {
      mode: 'recurring',
      taskId: taskIdValue,
      recurringId: recurring.id,
      wk: recurringMeta.wk,
      dayIdx: recurring.dayIdx,
      label: sub?.label || 'Постоянная задача',
    };
    document.getElementById('task-input').value = recurring.text;
    document.getElementById('task-input').disabled = true;
    document.getElementById('task-day-select').value = String(recurring.dayIdx);
    document.getElementById('task-day-select').disabled = true;
    document.getElementById('task-note').value = status.note || '';
    document.getElementById('task-done-btn').style.display = 'inline-flex';
    document.getElementById('task-done-btn').textContent = status.done ? 'Не выполнено' : 'Выполнено';
    document.getElementById('task-delete-btn').style.display = 'none';
    document.getElementById('task-save-btn').textContent = 'Сохранить заметку';
    document.getElementById('task-modal-title').textContent = `${_taskMeta.label} — ${DAYS[recurring.dayIdx]}`;
    document.getElementById('task-modal').classList.add('open');
    return;
  }

  const record = findTaskRecord(taskIdValue);
  if (record) {
    const sub = getSub(record.subId);
    _taskMeta = {
      mode: 'regular',
      taskId: taskIdValue,
      wk: record.wk,
      dayIdx: record.dayIdx,
      subId: record.subId,
      label: sub?.label || 'Задача',
    };
    document.getElementById('task-input').value = record.task.text;
    document.getElementById('task-input').disabled = false;
    document.getElementById('task-day-select').value = String(record.dayIdx);
    document.getElementById('task-day-select').disabled = false;
    document.getElementById('task-note').value = record.task.note || '';
    document.getElementById('task-done-btn').style.display = 'inline-flex';
    document.getElementById('task-done-btn').textContent = record.task.done ? 'Не выполнено' : 'Выполнено';
    document.getElementById('task-delete-btn').style.display = 'inline-flex';
    document.getElementById('task-send-btn').style.display = 'none';
    document.getElementById('task-save-btn').textContent = 'Сохранить';
    document.getElementById('task-modal-title').textContent = `${_taskMeta.label} — ${DAYS[record.dayIdx]}`;
    document.getElementById('task-modal').classList.add('open');
    return;
  }

  const backlogRecord = findBacklogTaskRecord(taskIdValue);
  if (!backlogRecord) return;
  const sub = getSub(backlogRecord.subId);
  _taskMeta = {
    mode: 'backlog',
    taskId: taskIdValue,
    subId: backlogRecord.subId,
    label: sub?.label || 'Задача',
  };
  document.getElementById('task-input').value = backlogRecord.task.text;
  document.getElementById('task-input').disabled = false;
  document.getElementById('task-day-select').value = '0';
  document.getElementById('task-day-select').disabled = false;
  document.getElementById('task-note').value = backlogRecord.task.note || '';
  document.getElementById('task-done-btn').style.display = 'inline-flex';
  document.getElementById('task-done-btn').textContent = backlogRecord.task.done ? 'Не выполнено' : 'Выполнено';
  document.getElementById('task-delete-btn').style.display = 'inline-flex';
  document.getElementById('task-send-btn').style.display = 'inline-flex';
  document.getElementById('task-save-btn').textContent = 'Сохранить';
  document.getElementById('task-modal-title').textContent = `${_taskMeta.label} — задачи`;
  document.getElementById('task-modal').classList.add('open');
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.remove('open');
  document.getElementById('task-input').disabled = false;
  document.getElementById('task-day-select').disabled = false;
  _taskMeta = null;
}

function saveTask() {
  if (!_taskMeta) return;
  const note = document.getElementById('task-note').value.trim();
  if (_taskMeta.mode === 'recurring') {
    getRecurringStatus(_taskMeta.wk, _taskMeta.recurringId).note = note;
    save();
    closeTaskModal();
    renderBoard();
    return;
  }

  if (_taskMeta.mode === 'backlog') {
    const text = document.getElementById('task-input').value.trim();
    if (!text) return;
    const record = findBacklogTaskRecord(_taskMeta.taskId);
    if (!record) return;
    record.task.text = text;
    record.task.note = note;
    save();
    closeTaskModal();
    renderTasksView();
    return;
  }

  const text = document.getElementById('task-input').value.trim();
  const nextDay = Number(document.getElementById('task-day-select').value);
  if (!text) return;
  const record = findTaskRecord(_taskMeta.taskId, _taskMeta.wk);
  if (!record) return;
  record.task.text = text;
  record.task.note = note;
  if (record.dayIdx !== nextDay) {
    removeTaskById(_taskMeta.taskId, _taskMeta.wk);
    insertTask(_taskMeta.wk, record.subId, nextDay, record.task);
    const sub = getSub(record.subId);
    if (sub && !getDayProjects(_taskMeta.wk, sub.group, nextDay).includes(record.subId)) {
      getDayProjects(_taskMeta.wk, sub.group, nextDay).push(record.subId);
    }
  }
  save();
  closeTaskModal();
  renderBoard();
}

function deleteTask() {
  if (!_taskMeta?.taskId) return;
  if (_taskMeta.mode === 'regular') {
    removeTaskById(_taskMeta.taskId, _taskMeta.wk);
  } else if (_taskMeta.mode === 'backlog') {
    removeBacklogTaskById(_taskMeta.taskId);
  } else {
    return;
  }
  save();
  closeTaskModal();
  renderCurrentView();
}

function deleteTaskById(event, taskIdValue) {
  if (event) event.stopPropagation();
  removeTaskById(taskIdValue);
  save();
  renderBoard();
}

function toggleTaskDoneFromModal() {
  if (!_taskMeta?.taskId) return;
  if (_taskMeta.mode === 'recurring') {
    const status = getRecurringStatus(_taskMeta.wk, _taskMeta.recurringId);
    status.done = !status.done;
    document.getElementById('task-done-btn').textContent = status.done ? 'Не выполнено' : 'Выполнено';
  } else {
    const record = findTaskRecord(_taskMeta.taskId, _taskMeta.wk);
    if (record) {
      record.task.done = !record.task.done;
      document.getElementById('task-done-btn').textContent = record.task.done ? 'Не выполнено' : 'Выполнено';
    } else {
      const backlogRecord = findBacklogTaskRecord(_taskMeta.taskId);
      if (!backlogRecord) return;
      backlogRecord.task.done = !backlogRecord.task.done;
      document.getElementById('task-done-btn').textContent = backlogRecord.task.done ? 'Не выполнено' : 'Выполнено';
    }
  }
  save();
  renderCurrentView();
  document.getElementById('task-modal').classList.add('open');
}

function sendTaskToGraph() {
  if (_taskMeta?.mode !== 'backlog') return;
  const dayIdx = Number(document.getElementById('task-day-select').value);
  const record = removeBacklogTaskById(_taskMeta.taskId);
  if (!record) return;
  const wk = weekKey(state.weekOffset);
  const task = { ...record.task, done: false };
  insertTask(wk, record.subId, dayIdx, task);
  const sub = getSub(record.subId);
  if (sub && !getDayProjects(wk, sub.group, dayIdx).includes(record.subId)) {
    getDayProjects(wk, sub.group, dayIdx).push(record.subId);
  }
  save();
  closeTaskModal();
  renderCurrentView();
}

function removeProjectFromDay(groupId, dayIdx, subId) {
  const list = getDayProjects(weekKey(state.weekOffset), groupId, dayIdx);
  state.dayProjects[weekKey(state.weekOffset)][groupId][dayIdx] = list.filter(id => id !== subId);
  save();
  renderBoard();
}

function renderCreateTaskOptions() {
  if (!_createTaskMeta) return;
  const groupId = document.getElementById('create-task-group-select').value;
  const dayIdx = Number(document.getElementById('create-task-day-select').value);
  _createTaskMeta.groupId = groupId;
  _createTaskMeta.dayIdx = dayIdx;
  const projects = state.subs.filter(sub => sub.group === groupId);
  const projectSelect = document.getElementById('create-task-project-select');
  projectSelect.innerHTML = projects.map(project =>
    `<option value="${project.id}">${escapeHtml(project.label)}</option>`
  ).join('');
  if (projects.length) {
    projectSelect.value = projects.some(project => project.id === _createTaskMeta.subId) ? _createTaskMeta.subId : projects[0].id;
    _createTaskMeta.subId = projectSelect.value;
  } else {
    _createTaskMeta.subId = '';
  }
}

function openCreateTaskModal(mode = 'week', groupId = null, dayIdx = null, subId = null) {
  _createTaskMeta = {
    mode,
    wk: weekKey(state.weekOffset),
    groupId: groupId || state.groups[0]?.id || '',
    dayIdx: Number.isInteger(dayIdx) ? dayIdx : 0,
    subId: subId || '',
  };
  document.getElementById('create-task-group-select').innerHTML = state.groups.map(group =>
    `<option value="${group.id}">${escapeHtml(group.label)}</option>`
  ).join('');
  document.getElementById('create-task-group-select').value = _createTaskMeta.groupId;
  document.getElementById('create-task-day-select').innerHTML = DAYS.map((day, index) =>
    `<option value="${index}">${day}</option>`
  ).join('');
  document.getElementById('create-task-day-select').value = String(_createTaskMeta.dayIdx);
  document.getElementById('create-task-title').textContent = mode === 'backlog' ? 'Добавить задачу в список' : 'Добавить задачу';
  document.getElementById('create-task-day-group').style.display = mode === 'backlog' ? 'none' : 'flex';
  document.getElementById('create-task-input').value = '';
  renderCreateTaskOptions();
  document.getElementById('create-task-modal').classList.add('open');
  setTimeout(() => document.getElementById('create-task-input')?.focus(), 20);
}

function closeCreateTaskModal() {
  document.getElementById('create-task-modal').classList.remove('open');
  _createTaskMeta = null;
}

function saveCreatedTask() {
  if (!_createTaskMeta) return;
  const text = document.getElementById('create-task-input').value.trim();
  const subId = document.getElementById('create-task-project-select').value;
  const groupId = document.getElementById('create-task-group-select').value;
  const dayIdx = Number(document.getElementById('create-task-day-select').value);
  if (!text || !subId) return;
  if (_createTaskMeta.mode === 'backlog') {
    getBacklogForProject(subId).push(makeTask({ text, done: false, note: '' }));
    save();
    closeCreateTaskModal();
    renderTasksView();
    return;
  }
  insertTask(_createTaskMeta.wk, subId, dayIdx, makeTask({ text, done: false, note: '' }));
  if (!getDayProjects(_createTaskMeta.wk, groupId, dayIdx).includes(subId)) {
    getDayProjects(_createTaskMeta.wk, groupId, dayIdx).push(subId);
  }
  save();
  closeCreateTaskModal();
  renderBoard();
}

function renderDayProjectOptions() {
  if (!_dayProjectMeta) return;
  const wk = _dayProjectMeta.wk;
  const groupId = document.getElementById('day-project-group-select').value;
  const daySelect = document.getElementById('day-project-day-select');
  const yearSelect = document.getElementById('day-project-year-select');
  const dayIdx = Number(daySelect.value);
  _dayProjectMeta.groupId = groupId;
  _dayProjectMeta.dayIdx = dayIdx;
  if (_dayProjectMeta.mode === 'wins') {
    _dayProjectMeta.year = yearSelect.value;
  }

  const current = _dayProjectMeta.mode === 'backlog'
    ? getTaskProjectsForGroup(groupId)
    : _dayProjectMeta.mode === 'wins'
      ? getAchievementProjectsForGroup(_dayProjectMeta.year, groupId)
    : getDayProjects(wk, groupId, dayIdx);
  const available = state.subs.filter(sub => sub.group === groupId && !current.includes(sub.id));
  const group = getGroup(groupId);

  document.getElementById('day-project-title').textContent = _dayProjectMeta.mode === 'backlog'
    ? 'Добавить проект в задачи'
    : _dayProjectMeta.mode === 'wins'
      ? 'Добавить проект в достижения'
    : `Добавить проект — ${DAYS[dayIdx]}`;
  document.getElementById('day-project-copy').textContent = _dayProjectMeta.mode === 'backlog'
    ? `Выбери скрытый проект из группы ${group?.label || 'Без группы'}, чтобы вернуть его на страницу задач.`
    : _dayProjectMeta.mode === 'wins'
      ? `Выбери скрытый проект из группы ${group?.label || 'Без группы'} для года ${_dayProjectMeta.year}.`
    : `Группа: ${group?.label || 'Без группы'}`;
  const dayGroup = document.getElementById('day-project-day-select').closest('.field-group');
  dayGroup.style.display = _dayProjectMeta.mode === 'week' ? 'flex' : 'none';
  document.getElementById('day-project-year-group').style.display = _dayProjectMeta.mode === 'wins' ? 'flex' : 'none';
  document.getElementById('day-project-select').innerHTML = available.map(project =>
    `<option value="${project.id}">${escapeHtml(project.label)}</option>`
  ).join('');
  document.getElementById('day-project-empty').style.display = available.length ? 'none' : 'block';
  document.getElementById('day-project-select').style.display = available.length ? 'block' : 'none';
  document.getElementById('day-project-save-btn').style.display = available.length ? 'inline-flex' : 'none';
}

function openDayProjectModal(modeOrGroupId = null, dayIdx = null) {
  const wk = weekKey(state.weekOffset);
  const mode = modeOrGroupId === 'backlog' || modeOrGroupId === 'wins' ? modeOrGroupId : 'week';
  const initialGroupId = mode === 'backlog'
    ? state.groups[0]?.id || ''
    : modeOrGroupId || state.groups[0]?.id || '';
  const initialDayIdx = Number.isInteger(dayIdx) ? dayIdx : 0;
  _dayProjectMeta = { mode, groupId: initialGroupId, dayIdx: initialDayIdx, wk, year: state.winsYearFilter === 'all' ? String(new Date().getFullYear()) : state.winsYearFilter };

  document.getElementById('day-project-group-select').innerHTML = state.groups.map(group =>
    `<option value="${group.id}">${escapeHtml(group.label)}</option>`
  ).join('');
  document.getElementById('day-project-group-select').value = initialGroupId;
  document.getElementById('day-project-year-select').innerHTML = getAchievementYears().map(year =>
    `<option value="${year}">${year}</option>`
  ).join('');
  document.getElementById('day-project-year-select').value = _dayProjectMeta.year;
  document.getElementById('day-project-day-select').innerHTML = DAYS.map((day, index) =>
    `<option value="${index}">${day}</option>`
  ).join('');
  document.getElementById('day-project-day-select').value = String(initialDayIdx);
  renderDayProjectOptions();
  document.getElementById('day-project-modal').classList.add('open');
}

function closeDayProjectModal() {
  document.getElementById('day-project-modal').classList.remove('open');
  _dayProjectMeta = null;
}

function saveDayProject() {
  if (!_dayProjectMeta) return;
  const projectId = document.getElementById('day-project-select').value;
  if (!projectId) return;
  if (_dayProjectMeta.mode === 'backlog') {
    const list = getTaskProjectsForGroup(_dayProjectMeta.groupId);
    if (!list.includes(projectId)) list.push(projectId);
    save();
    closeDayProjectModal();
    renderTasksView();
    return;
  }
  if (_dayProjectMeta.mode === 'wins') {
    const list = getAchievementProjectsForGroup(_dayProjectMeta.year, _dayProjectMeta.groupId);
    if (!list.includes(projectId)) list.push(projectId);
    save();
    closeDayProjectModal();
    renderWinsView();
    return;
  }
  const list = getDayProjects(_dayProjectMeta.wk, _dayProjectMeta.groupId, _dayProjectMeta.dayIdx);
  if (!list.includes(projectId)) list.push(projectId);
  save();
  closeDayProjectModal();
  renderBoard();
}

function carryOverUnfinished() {
  const fromWeek = weekKey(state.weekOffset);
  const toWeek = weekKey(state.weekOffset + 1);
  ensureDayProjectsWeek(fromWeek);
  ensureDayProjectsWeek(toWeek);
  Object.entries(state.data[fromWeek] || {}).forEach(([subId, days]) => {
    Object.entries(days || {}).forEach(([dayIdxValue, tasks]) => {
      const dayIdx = Number(dayIdxValue);
      const remaining = [];
      tasks.forEach(task => {
        if (task.done) {
          remaining.push(task);
          return;
        }
        insertTask(toWeek, subId, dayIdx, makeTask({ text: task.text, done: false, note: task.note || '' }));
        const sub = getSub(subId);
        if (sub && !getDayProjects(toWeek, sub.group, dayIdx).includes(subId)) {
          getDayProjects(toWeek, sub.group, dayIdx).push(subId);
        }
      });
      state.data[fromWeek][subId][dayIdx] = remaining;
    });
  });
  save();
  renderBoard();
}

function renderProjectTemplateBoard() {
  ensureProjectTemplates(false);
  const html = state.groups.map(group => `
    <div class="project-template-group">
      <div class="project-template-group-title">
        <div class="project-template-group-name" style="color:${group.color}">${escapeHtml(group.label)}</div>
        <div class="project-template-actions">
          <button class="project-template-action" type="button" onclick="setGroupProjectTemplate('${group.id}', true)">Добавить всё</button>
          <button class="project-template-action" type="button" onclick="setGroupProjectTemplate('${group.id}', false)">Убрать всё</button>
        </div>
      </div>
      <div class="project-template-grid">
        <div class="project-template-head">Проект</div>
        ${DAYS.map(day => `<div class="project-template-head">${day}</div>`).join('')}
        ${state.subs.filter(sub => sub.group === group.id).map(sub => `
          <div class="project-template-name">
            <div class="project-template-name-main">
              <span class="sidebar-project-dot" style="background:${sub.color}"></span>
              <span>${escapeHtml(sub.label)}</span>
            </div>
            <div class="project-template-row-actions">
              <button class="project-template-row-btn" type="button" onclick="setProjectTemplateDays('${group.id}', '${sub.id}', true)">Всё</button>
              <button class="project-template-row-btn" type="button" onclick="setProjectTemplateDays('${group.id}', '${sub.id}', false)">Снять</button>
            </div>
          </div>
          ${DAYS.map((_, dayIdx) => `
            <label class="project-template-cell">
              <input
                type="checkbox"
                ${state.projectTemplates[group.id][dayIdx].includes(sub.id) ? 'checked' : ''}
                onchange="toggleProjectTemplate('${group.id}', ${dayIdx}, '${sub.id}', this.checked)"
              >
            </label>
          `).join('')}
        `).join('')}
      </div>
    </div>
  `).join('');
  document.getElementById('project-template-board').innerHTML = html;
}

function openProjectTemplateManage() {
  renderProjectTemplateBoard();
  document.getElementById('project-template-modal').classList.add('open');
}

function closeProjectTemplateManage() {
  document.getElementById('project-template-modal').classList.remove('open');
}

function toggleProjectTemplate(groupId, dayIdx, subId, checked) {
  ensureProjectTemplates(false);
  const list = state.projectTemplates[groupId][dayIdx];
  if (checked && !list.includes(subId)) list.push(subId);
  if (!checked) state.projectTemplates[groupId][dayIdx] = list.filter(id => id !== subId);
  save();
  renderProjectTemplateBoard();
}

function setProjectTemplateDays(groupId, subId, enabled) {
  ensureProjectTemplates(false);
  DAYS.forEach((_, dayIdx) => {
    const list = state.projectTemplates[groupId][dayIdx];
    if (enabled) {
      if (!list.includes(subId)) list.push(subId);
    } else {
      state.projectTemplates[groupId][dayIdx] = list.filter(id => id !== subId);
    }
  });
  save();
  renderProjectTemplateBoard();
}

function setGroupProjectTemplate(groupId, enabled) {
  ensureProjectTemplates(false);
  const projectIds = state.subs.filter(sub => sub.group === groupId).map(sub => sub.id);
  DAYS.forEach((_, dayIdx) => {
    state.projectTemplates[groupId][dayIdx] = enabled ? [...projectIds] : [];
  });
  save();
  renderProjectTemplateBoard();
}

function openRecurringManage(recurringId = null) {
  manageRecurringId = recurringId;
  renderRecurringProjectOptions();
  renderRecurringFilters();
  document.getElementById('recurring-day-select').innerHTML = DAYS.map((day, index) =>
    `<option value="${index}">${day}</option>`
  ).join('');
  renderRecurringList();
  startRecurringEdit(recurringId);
  document.getElementById('recurring-modal').classList.add('open');
}

function closeRecurringManage() {
  document.getElementById('recurring-modal').classList.remove('open');
  manageRecurringId = null;
}

function renderRecurringProjectOptions() {
  document.getElementById('recurring-project-select').innerHTML = state.subs.map(project =>
    `<option value="${project.id}">${escapeHtml(project.label)}</option>`
  ).join('');
}

function renderRecurringFilters() {
  const groupSelect = document.getElementById('recurring-filter-group');
  const projectSelect = document.getElementById('recurring-filter-project');
  groupSelect.innerHTML = ['<option value="all">Все группы</option>', ...state.groups.map(group =>
    `<option value="${group.id}">${escapeHtml(group.label)}</option>`
  )].join('');
  groupSelect.value = state.recurringFilterGroup;

  const projects = state.recurringFilterGroup === 'all'
    ? state.subs
    : state.subs.filter(sub => sub.group === state.recurringFilterGroup);
  if (state.recurringFilterProject !== 'all' && !projects.some(project => project.id === state.recurringFilterProject)) {
    state.recurringFilterProject = 'all';
  }
  projectSelect.innerHTML = ['<option value="all">Все проекты</option>', ...projects.map(project =>
    `<option value="${project.id}">${escapeHtml(project.label)}</option>`
  )].join('');
  projectSelect.value = state.recurringFilterProject;
}

function renderRecurringList() {
  const filtered = state.recurring.filter(item => {
    const project = getSub(item.subId);
    if (state.recurringFilterGroup !== 'all' && project?.group !== state.recurringFilterGroup) return false;
    if (state.recurringFilterProject !== 'all' && item.subId !== state.recurringFilterProject) return false;
    return true;
  });
  document.getElementById('recurring-list').innerHTML = filtered.length
    ? filtered.map(item => {
      const project = getSub(item.subId);
      const group = getGroup(project?.group);
      return `<button class="recurring-row${manageRecurringId === item.id ? ' active' : ''}" type="button" onclick="startRecurringEdit('${item.id}')">
        <span class="recurring-row-title">${escapeHtml(item.text)}</span>
        <span class="recurring-row-meta">${DAYS[item.dayIdx]} · ${escapeHtml(project?.label || 'Проект')} · ${escapeHtml(group?.label || 'Группа')}</span>
      </button>`;
    }).join('')
    : '<div class="empty-note">По текущему фильтру постоянных задач нет.</div>';
}

function startRecurringEdit(recurringId = null) {
  manageRecurringId = recurringId;
  const item = state.recurring.find(recurring => recurring.id === recurringId);
  document.getElementById('recurring-text').value = item?.text || '';
  document.getElementById('recurring-project-select').value = item?.subId || state.subs[0]?.id || '';
  document.getElementById('recurring-day-select').value = String(item?.dayIdx ?? 0);
  document.getElementById('recurring-delete-btn').style.display = item ? 'inline-flex' : 'inline-flex';
  document.getElementById('recurring-delete-btn').style.visibility = item ? 'visible' : 'hidden';
  document.getElementById('recurring-save-btn').textContent = item ? 'Сохранить' : 'Создать';
  renderRecurringList();
}

function saveRecurring() {
  const text = document.getElementById('recurring-text').value.trim();
  const subId = document.getElementById('recurring-project-select').value;
  const dayIdx = Number(document.getElementById('recurring-day-select').value);
  if (!text || !subId) return;
  if (manageRecurringId) {
    const item = state.recurring.find(recurring => recurring.id === manageRecurringId);
    if (!item) return;
    item.text = text;
    item.subId = subId;
    item.dayIdx = dayIdx;
  } else {
    const id = taskId();
    state.recurring.push({ id, text, subId, dayIdx });
    manageRecurringId = id;
  }
  save();
  renderCurrentView();
  renderRecurringList();
  manageRecurringId = null;
  startRecurringEdit();
}

function deleteRecurring() {
  if (!manageRecurringId) return;
  state.recurring = state.recurring.filter(item => item.id !== manageRecurringId);
  Object.keys(state.recurringStatus).forEach(wk => {
    if (state.recurringStatus[wk]?.[manageRecurringId]) delete state.recurringStatus[wk][manageRecurringId];
  });
  manageRecurringId = null;
  save();
  renderCurrentView();
  renderRecurringList();
  startRecurringEdit();
}

function toggleSidebar() {
  state.ui.sidebarOpen = !state.ui.sidebarOpen;
  document.getElementById('sidebar').classList.toggle('open', state.ui.sidebarOpen);
  document.getElementById('sidebar-overlay').classList.toggle('open', state.ui.sidebarOpen);
}

function closeSidebar() {
  state.ui.sidebarOpen = false;
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

function toggleSidebarSection(section) {
  const key = section === 'groups' ? 'groupsOpen' : 'projectsOpen';
  if (state.ui.sidebarCollapsed) {
    state.ui.sidebarCollapsed = false;
    state.ui[key] = true;
    save();
    renderSidebarLists();
    return;
  }
  state.ui[key] = !state.ui[key];
  renderSidebarLists();
}

function toggleSidebarCollapsed() {
  if (isMobileViewport()) {
    closeSidebar();
    return;
  }
  state.ui.sidebarCollapsed = !state.ui.sidebarCollapsed;
  save();
  renderSidebarLists();
}

function handleSidebarPrimaryButton() {
  if (isMobileViewport()) {
    closeSidebar();
    return;
  }
  toggleSidebarCollapsed();
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function dragSidebarItem(event, type, id) {
  _sidebarDragMeta = { type, id };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-sidebar-item', JSON.stringify({ type, id }));
}

function allowSidebarItemDrop(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

function reorderCollectionById(collection, sourceId, targetId) {
  const next = [...collection];
  const sourceIndex = next.findIndex(item => item.id === sourceId);
  const targetIndex = next.findIndex(item => item.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return null;
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

async function persistGroupSortOrder() {
  await Promise.all(
    state.groups.map((group, index) =>
      apiJson(`/api/catalog/groups/${group.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sortOrder: index }),
      }),
    ),
  );
}

async function persistProjectSortOrder() {
  await Promise.all(
    state.subs.map((project, index) =>
      apiJson(`/api/catalog/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sortOrder: index }),
      }),
    ),
  );
}

async function dropSidebarItem(event, type, targetId) {
  event.preventDefault();
  let payload = _sidebarDragMeta;
  const raw = event.dataTransfer.getData('application/x-sidebar-item');
  if (!payload && raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }
  _sidebarDragMeta = null;
  if (!payload || payload.type !== type || payload.id === targetId) return;

  try {
    if (type === 'group') {
      const nextGroups = reorderCollectionById(state.groups, payload.id, targetId);
      if (!nextGroups) return;
      state.groups = nextGroups;
      renderSidebarLists();
      await persistGroupSortOrder();
      await syncCatalogFromServer();
      renderCurrentView();
      return;
    }

    const nextProjects = reorderCollectionById(state.subs, payload.id, targetId);
    if (!nextProjects) return;
    state.subs = nextProjects;
    renderSidebarLists();
    await persistProjectSortOrder();
    await syncCatalogFromServer();
    renderCurrentView();
  } catch (error) {
    console.error(error);
    alert(type === 'group' ? 'Не удалось изменить порядок групп.' : 'Не удалось изменить порядок проектов.');
    await syncCatalogFromServer();
    renderCurrentView();
  }
}

function openManage(projectId = null) {
  manageProjectId = projectId;
  const project = state.subs.find(item => item.id === projectId);
  newProjGroup = project?.group || state.groups[0]?.id || DEFAULT_GROUPS[0].id;
  newProjColor = project?.color || COLORS[0];
  document.getElementById('proj-name').value = project?.label || '';
  document.getElementById('manage-modal-title').textContent = project ? 'Редактировать проект' : 'Добавить проект';
  document.getElementById('manage-save-btn').textContent = project ? 'Сохранить' : 'Создать';
  document.getElementById('manage-delete-btn').style.display = project ? 'inline-flex' : 'none';
  renderProjectGroupOptions();
  renderColorPicker('color-picker', newProjColor, 'pickColor');
  document.getElementById('manage-modal').classList.add('open');
}

function closeManage() {
  document.getElementById('manage-modal').classList.remove('open');
  manageProjectId = null;
}

function renderProjectGroupOptions() {
  const select = document.getElementById('proj-group-select');
  select.innerHTML = state.groups.map(group => `<option value="${group.id}">${escapeHtml(group.label)}</option>`).join('');
  select.value = newProjGroup;
}

function renderColorPicker(rootId, selectedColor, pickFn) {
  document.getElementById(rootId).innerHTML = COLORS.map(color =>
    `<div class="color-swatch" onclick="${pickFn}('${color}', this)" style="background:${color};border-color:${color === selectedColor ? '#1a1a18' : 'transparent'}"></div>`
  ).join('');
}

function pickColor(color, el) {
  newProjColor = color;
  document.querySelectorAll('#color-picker .color-swatch').forEach(node => { node.style.borderColor = 'transparent'; });
  el.style.borderColor = '#1a1a18';
}

function removeProjectFromLocalState(projectId) {
  const removedRecurringIds = state.recurring.filter(item => item.subId === projectId).map(item => item.id);
  state.recurring = state.recurring.filter(item => item.subId !== projectId);
  Object.keys(state.recurringStatus).forEach(wk => {
    removedRecurringIds.forEach(id => {
      if (state.recurringStatus[wk]?.[id]) delete state.recurringStatus[wk][id];
    });
  });
  Object.keys(state.data).forEach(wk => {
    delete state.data[wk][projectId];
  });
  delete state.backlog[projectId];
  Object.keys(state.dayProjects).forEach(wk => {
    state.groups.forEach(group => {
      DAYS.forEach((_, dayIdx) => {
        state.dayProjects[wk][group.id][dayIdx] = getDayProjects(wk, group.id, dayIdx).filter(id => id !== projectId);
      });
    });
  });
  state.subs = state.subs.filter(item => item.id !== projectId);
  Object.keys(state.taskProjects).forEach(groupId => {
    state.taskProjects[groupId] = getTaskProjectsForGroup(groupId).filter(id => id !== projectId);
  });
  Object.keys(state.projectTemplates).forEach(groupId => {
    DAYS.forEach((_, dayIdx) => {
      state.projectTemplates[groupId][dayIdx] = (state.projectTemplates[groupId][dayIdx] || []).filter(id => id !== projectId);
    });
  });
}

async function saveProject() {
  const name = document.getElementById('proj-name').value.trim();
  newProjGroup = document.getElementById('proj-group-select').value;
  if (!name) return;

  try {
    if (manageProjectId) {
      await apiJson(`/api/catalog/projects/${manageProjectId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          groupId: newProjGroup,
          name,
          color: newProjColor,
        }),
      });
    } else {
      await apiJson('/api/catalog/projects', {
        method: 'POST',
        body: JSON.stringify({
          groupId: newProjGroup,
          name,
          color: newProjColor,
        }),
      });
    }

    await syncCatalogFromServer();
    closeManage();
    renderCurrentView();
  } catch (error) {
    console.error(error);
    alert('Не удалось сохранить проект.');
  }
}

async function deleteProject() {
  if (!manageProjectId) return;
  const project = getSub(manageProjectId);
  openConfirmModal({
    title: 'Удалить проект',
    message: `Удалить проект${project?.label ? ` «${project.label}»` : ''}? Он уйдёт в архив на 30 дней.`,
    confirmText: 'Удалить',
    danger: true,
    onConfirm: async () => {
      try {
        await apiJson(`/api/catalog/projects/${manageProjectId}`, {
          method: 'DELETE',
          headers: {},
        });

        removeProjectFromLocalState(manageProjectId);
        await syncCatalogFromServer();
        closeManage();
        renderCurrentView();
      } catch (error) {
        console.error(error);
        alert('Не удалось удалить проект.');
      }
    },
  });
}

async function restoreArchivedGroup(groupId) {
  try {
    await apiJson(`/api/catalog/groups/${groupId}/restore`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    await syncCatalogFromServer();
    renderCurrentView();
  } catch (error) {
    console.error(error);
    alert('Не удалось восстановить группу.');
  }
}

async function restoreArchivedProject(projectId) {
  try {
    await apiJson(`/api/catalog/projects/${projectId}/restore`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    await syncCatalogFromServer();
    renderCurrentView();
  } catch (error) {
    console.error(error);
    alert('Не удалось восстановить проект.');
  }
}

function openGroupManage(groupId = null) {
  manageGroupId = groupId;
  const group = getGroup(groupId);
  newGroupColor = group?.color || COLORS[0];
  document.getElementById('group-name').value = group?.label || '';
  document.getElementById('group-modal-title').textContent = group ? 'Редактировать группу' : 'Добавить группу';
  document.getElementById('group-save-btn').textContent = group ? 'Сохранить' : 'Создать';
  document.getElementById('group-delete-btn').style.display = group ? 'inline-flex' : 'none';
  renderColorPicker('group-color-picker', newGroupColor, 'pickGroupColor');
  document.getElementById('group-modal').classList.add('open');
}

function closeGroupManage() {
  document.getElementById('group-modal').classList.remove('open');
  manageGroupId = null;
}

function pickGroupColor(color, el) {
  newGroupColor = color;
  document.querySelectorAll('#group-color-picker .color-swatch').forEach(node => { node.style.borderColor = 'transparent'; });
  el.style.borderColor = '#1a1a18';
}

async function saveGroup() {
  const name = document.getElementById('group-name').value.trim();
  if (!name) return;

  try {
    if (manageGroupId) {
      await apiJson(`/api/catalog/groups/${manageGroupId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          color: newGroupColor,
        }),
      });
    } else {
      await apiJson('/api/catalog/groups', {
        method: 'POST',
        body: JSON.stringify({
          name,
          color: newGroupColor,
        }),
      });
    }

    await syncCatalogFromServer();
    closeGroupManage();
    renderCurrentView();
  } catch (error) {
    console.error(error);
    alert('Не удалось сохранить группу.');
  }
}

async function deleteGroup() {
  if (!manageGroupId) return;
  const group = getGroup(manageGroupId);
  openConfirmModal({
    title: 'Удалить группу',
    message: `Удалить группу${group?.label ? ` «${group.label}»` : ''}? Она уйдёт в архив на 30 дней, а проекты попадут в «Без группы».`,
    confirmText: 'Удалить',
    danger: true,
    onConfirm: async () => {
      try {
        await apiJson(`/api/catalog/groups/${manageGroupId}`, {
          method: 'DELETE',
          headers: {},
        });

        await syncCatalogFromServer();
        closeGroupManage();
        renderCurrentView();
      } catch (error) {
        console.error(error);
        alert('Не удалось удалить группу.');
      }
    },
  });
}

function startDayResize(event, dayIdx) {
  event.preventDefault();
  _dayResize = {
    dayIdx,
    startX: event.clientX,
    startWidth: getDayColumnWidth(dayIdx),
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', handleDayResizeMove);
  window.addEventListener('pointerup', stopDayResize);
}

function handleDayResizeMove(event) {
  if (!_dayResize) return;
  const delta = event.clientX - _dayResize.startX;
  state.dayColumnWidths[_dayResize.dayIdx] = Math.max(160, Math.min(360, _dayResize.startWidth + delta));
  renderBoard();
}

function stopDayResize() {
  if (!_dayResize) return;
  _dayResize = null;
  window.removeEventListener('pointermove', handleDayResizeMove);
  window.removeEventListener('pointerup', stopDayResize);
  save();
}

function dragTask(event, taskIdValue) {
  event.dataTransfer.setData('text/plain', taskIdValue);
}

function dragProject(event, groupId, dayIdx, subId) {
  event.dataTransfer.setData('application/x-project-card', JSON.stringify({ groupId, dayIdx, subId }));
}

function allowDrop(event) {
  event.preventDefault();
}

function allowProjectDrop(event) {
  event.preventDefault();
}

function moveProjectWithTasks(wk, sourceGroupId, sourceDayIdx, sourceSubId, targetGroupId, targetDayIdx, targetIndex = null) {
  const project = getSub(sourceSubId);
  if (!project || project.group !== targetGroupId) return false;

  const sourceList = getDayProjects(wk, sourceGroupId, sourceDayIdx);
  const sourceIndex = sourceList.indexOf(sourceSubId);
  if (sourceIndex === -1) return false;

  sourceList.splice(sourceIndex, 1);

  const targetList = getDayProjects(wk, targetGroupId, targetDayIdx);
  const sanitizedTarget = targetList.filter(id => id !== sourceSubId);
  state.dayProjects[wk][targetGroupId][targetDayIdx] = sanitizedTarget;
  const finalTargetList = getDayProjects(wk, targetGroupId, targetDayIdx);

  let insertAt = targetIndex === null ? finalTargetList.length : targetIndex;
  insertAt = Math.max(0, Math.min(finalTargetList.length, insertAt));
  finalTargetList.splice(insertAt, 0, sourceSubId);

  if (sourceDayIdx !== targetDayIdx) {
    const sourceTasks = getCellForWeek(wk, sourceSubId, sourceDayIdx);
    const movedTasks = [...sourceTasks];
    state.data[wk][sourceSubId][sourceDayIdx] = [];
    state.data[wk][sourceSubId][targetDayIdx] = movedTasks;
  }

  return true;
}

function dropTask(event, targetSubId, targetDayIdx) {
  event.preventDefault();
  const taskIdValue = event.dataTransfer.getData('text/plain');
  if (!taskIdValue || taskIdValue.startsWith('recurring|')) return;
  const record = removeTaskById(taskIdValue);
  if (!record) return;
  insertTask(record.wk, targetSubId, targetDayIdx, record.task);
  const targetSub = getSub(targetSubId);
  if (targetSub && !getDayProjects(record.wk, targetSub.group, targetDayIdx).includes(targetSubId)) {
    getDayProjects(record.wk, targetSub.group, targetDayIdx).push(targetSubId);
  }
  save();
  renderBoard();
}

function dropProject(event, targetGroupId, targetDayIdx) {
  event.preventDefault();
  const raw = event.dataTransfer.getData('application/x-project-card');
  if (!raw) return;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const { groupId: sourceGroupId, dayIdx: sourceDayIdx, subId } = payload || {};
  if (!sourceGroupId || !subId || sourceDayIdx === undefined) return;
  const wk = weekKey(state.weekOffset);
  const project = getSub(subId);
  if (!project || project.group !== targetGroupId) return;
  if (sourceGroupId === targetGroupId && Number(sourceDayIdx) === targetDayIdx) return;
  if (!moveProjectWithTasks(wk, sourceGroupId, Number(sourceDayIdx), subId, targetGroupId, targetDayIdx)) return;
  save();
  renderBoard();
}

function dropProjectOnCard(event, targetGroupId, targetDayIdx, targetSubId) {
  event.preventDefault();
  const raw = event.dataTransfer.getData('application/x-project-card');
  if (!raw) return;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const { groupId: sourceGroupId, dayIdx: sourceDayIdx, subId } = payload || {};
  if (!sourceGroupId || !subId || sourceDayIdx === undefined || !targetSubId) return;
  const wk = weekKey(state.weekOffset);
  const project = getSub(subId);
  const targetProject = getSub(targetSubId);
  if (!project || !targetProject || project.group !== targetGroupId || targetProject.group !== targetGroupId) return;

  const targetList = getDayProjects(wk, targetGroupId, targetDayIdx);
  const targetIndex = targetList.indexOf(targetSubId);
  if (targetIndex === -1) return;
  if (sourceGroupId === targetGroupId && Number(sourceDayIdx) === targetDayIdx) {
    const sameDayList = getDayProjects(wk, targetGroupId, targetDayIdx).filter(id => id !== subId);
    const insertAt = Math.max(0, Math.min(sameDayList.length, targetIndex));
    sameDayList.splice(insertAt, 0, subId);
    state.dayProjects[wk][targetGroupId][targetDayIdx] = sameDayList;
    save();
    renderBoard();
    return;
  }

  if (!moveProjectWithTasks(wk, sourceGroupId, Number(sourceDayIdx), subId, targetGroupId, targetDayIdx, targetIndex)) return;
  save();
  renderBoard();
}

function handleModalBackdrop(event, type) {
  if (event.target !== event.currentTarget) return;
  if (type === 'task') closeTaskModal();
  if (type === 'create-task') closeCreateTaskModal();
  if (type === 'day-project') closeDayProjectModal();
  if (type === 'project-template') closeProjectTemplateManage();
  if (type === 'manage') closeManage();
  if (type === 'group') closeGroupManage();
  if (type === 'recurring') closeRecurringManage();
  if (type === 'achievement') closeAchievementModal();
  if (type === 'confirm') closeConfirmModal();
}

async function analyzeAI() {
  const section = document.getElementById('ai-section');
  const text = document.getElementById('ai-text');
  section.style.display = 'block';
  text.className = 'ai-loading';
  text.textContent = 'Анализирую неделю...';

  const wk = weekKey(state.weekOffset);
  let summary = `${weekLabel(state.weekOffset)}\n\n`;
  state.groups.forEach(group => {
    DAYS.forEach((day, dayIdx) => {
      const rows = getDayProjects(wk, group.id, dayIdx).map(subId => {
        const sub = getSub(subId);
        const tasks = getDisplayTasksForCell(wk, subId, dayIdx);
        if (!tasks.length) return '';
        return `${sub?.label}: ${tasks.map(task => `${task.done ? '[x]' : '[ ]'} ${task.text}`).join(', ')}`;
      }).filter(Boolean);
      if (rows.length) summary += `${group.label} / ${day}:\n${rows.join('\n')}\n\n`;
    });
  });

  const headers = { 'Content-Type': 'application/json' };
  if (ANTHROPIC_API_KEY) headers['x-api-key'] = ANTHROPIC_API_KEY;

  try {
    const response = await fetch(
      ANTHROPIC_API_KEY ? 'https://api.anthropic.com/v1/messages' : '/api/analyze',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Ты помощник по продуктивности. Проанализируй мою неделю дружелюбно и коротко на русском языке. Что сделано, что зависло и 1-2 совета на следующую неделю. Без markdown.\n\n${summary}`
          }]
        })
      }
    );
    const data = await response.json();
    text.className = 'ai-text';
    text.textContent = data.content?.[0]?.text || 'Нет ответа.';
  } catch (error) {
    text.className = 'ai-text';
    text.textContent = 'Ошибка подключения к ИИ.';
    console.error(error);
  }
}

function bindStaticUI() {
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.addEventListener('wheel', handleGraphPageWheel, { passive: false });
    mainContent.addEventListener('touchstart', handleGraphTouchStart, { passive: true });
    mainContent.addEventListener('touchmove', handleGraphTouchMove, { passive: false });
    mainContent.addEventListener('touchend', handleGraphTouchEnd, { passive: true });
    mainContent.addEventListener('touchcancel', handleGraphTouchEnd, { passive: true });
  }

  document.getElementById('task-day-select').innerHTML = DAYS.map((day, index) => `<option value="${index}">${day}</option>`).join('');
  document.getElementById('create-task-group-select').addEventListener('change', renderCreateTaskOptions);
  document.getElementById('create-task-day-select').addEventListener('change', renderCreateTaskOptions);
  document.getElementById('create-task-project-select').addEventListener('change', event => {
    if (_createTaskMeta) _createTaskMeta.subId = event.target.value;
  });
  document.getElementById('day-project-group-select').addEventListener('change', renderDayProjectOptions);
  document.getElementById('day-project-day-select').addEventListener('change', renderDayProjectOptions);
  document.getElementById('recurring-filter-group').addEventListener('change', event => {
    state.recurringFilterGroup = event.target.value;
    state.recurringFilterProject = 'all';
    renderRecurringFilters();
    renderRecurringList();
  });
  document.getElementById('recurring-filter-project').addEventListener('change', event => {
    state.recurringFilterProject = event.target.value;
    renderRecurringList();
  });
  document.getElementById('achievement-group-select').addEventListener('change', renderAchievementProjectOptions);
}

async function initApp() {
  load();
  bindStaticUI();
  switchAuthMode('login');

  try {
    const user = await fetchCurrentUserSession();
    if (!user) {
      showAuthShell();
      return;
    }

    applyCurrentUser(user);
    await syncCatalogFromServer();
    await syncAccountFromServer();
    await syncPlanningFromServer();
    state.currentView = state.settings.defaultView || state.currentView;
    renderSidebarLists();
    renderCurrentView();
    showAppShell();
  } catch (error) {
    console.error(error);
    showAuthShell();
  }
}

initApp();
