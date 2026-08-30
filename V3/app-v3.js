const ANTHROPIC_API_KEY = '';
const API_BASE = window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:3000';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const COLORS = [
  '#185FA5', '#1D9E75', '#D4537E', '#BA7517',
  '#7F77DD', '#D85A30', '#E24B4A', '#0F6E56',
  '#533489', '#888780'
];
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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
  wishlist: {
    lists: [],
    items: [],
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
let adminStats = null;
let adminStatsError = '';
let settingsSection = 'service';
let _confirmMeta = null;
let _toastTimer = null;
let activeProjectId = null;
let activeGroupId = null;
let sidebarGroupFlyoutId = null;
let _sidebarGroupFlyoutCloseTimer = null;
let groupProjectQuery = '';
let projectNotesByProject = {};
let projectNoteSectionsByProject = {};
let projectNotesLoadingProjectId = null;
let projectNotesError = '';
let manageProjectNoteId = null;
let manageProjectNoteSectionId = null;
let _projectBoardDrag = null;
let _projectBoardDropPosition = 'before';
let _projectBoardOrderRevision = 0;
let _projectBoardSaveQueue = Promise.resolve();
let _projectBoardSuppressClickUntil = 0;
let manageWishItemId = null;
let manageWishListId = null;
let newWishListColor = COLORS[0];
let wishlistLoading = false;
let wishlistError = '';
let wishlistStatusFilter = 'ACTIVE';
let balancePeriod = 'week';
let balanceOffset = 0;
let balanceGroupFilter = 'all';
let balanceProjectFilter = 'all';
let _sidebarDragMeta = null;
let _planningSyncTimer = null;
let _lastPlanningSyncSignature = '';
let _isApplyingServerPlanning = false;
let _serverPlanningBase = null;
let _planningVersion = 0;
let _achievementsSyncTimer = null;
let _lastAchievementsSyncSignature = '';
let _isApplyingServerAchievements = false;
let _hasPersistedLocalWorkspace = false;
let _graphTouchPan = null;
let asanaImportState = {
  exportData: null,
  preview: null,
  fileName: '',
  targetValue: '__new__',
  groupId: '',
  projectName: '',
  color: COLORS[4],
  includeCompleted: true,
  includeSourceLinks: true,
  conflictMode: 'skip',
  loading: false,
  error: '',
  result: null,
};

const LEGACY_STORAGE_KEY = 'wpv3';
const NAVIGABLE_VIEWS = new Set([
  'graph',
  'tasks',
  'wins',
  'project',
  'group',
  'archive',
  'history',
  'profile',
  'settings',
  'wishlist',
]);

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

function getWorkspaceStorageKey() {
  if (!currentUser?.id || !currentUser?.workspace?.id) return null;
  return `${LEGACY_STORAGE_KEY}:${currentUser.id}:${currentUser.workspace.id}`;
}

function getWorkspaceNavigationStorageKey() {
  const workspaceKey = getWorkspaceStorageKey();
  return workspaceKey ? `${workspaceKey}:navigation` : null;
}

function persistNavigationState() {
  const storageKey = getWorkspaceNavigationStorageKey();
  if (!storageKey) return;

  try {
    localStorage.setItem(storageKey, JSON.stringify({
      view: state.currentView,
      projectId: state.currentView === 'project' ? activeProjectId : null,
      groupId: state.currentView === 'group' ? activeGroupId : null,
      weekOffset: state.weekOffset,
    }));
  } catch (error) {
    console.warn('NAVIGATION_CACHE_SAVE_FAILED', error);
  }
}

function restoreNavigationStateForCurrentUser() {
  const storageKey = getWorkspaceNavigationStorageKey();
  if (!storageKey) return false;

  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!raw || !NAVIGABLE_VIEWS.has(raw.view)) return false;

    const savedWeekOffset = Number(raw.weekOffset);
    if (Number.isInteger(savedWeekOffset) && Math.abs(savedWeekOffset) <= 5200) {
      state.weekOffset = savedWeekOffset;
    }

    activeProjectId = null;
    activeGroupId = null;

    if (raw.view === 'project') {
      if (!getSub(raw.projectId)) {
        state.currentView = 'graph';
        return true;
      }
      activeProjectId = raw.projectId;
    }

    if (raw.view === 'group') {
      if (!getGroup(raw.groupId)) {
        state.currentView = 'graph';
        return true;
      }
      activeGroupId = raw.groupId;
    }

    state.currentView = raw.view;
    return true;
  } catch (error) {
    console.warn('NAVIGATION_CACHE_RESTORE_FAILED', error);
    return false;
  }
}

function buildLocalWorkspaceSnapshot() {
  return {
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

function applyLocalWorkspaceSnapshot(raw) {
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
}

function loadWorkspaceCacheForCurrentUser() {
  const storageKey = getWorkspaceStorageKey();
  if (!storageKey) {
    _hasPersistedLocalWorkspace = false;
    return false;
  }

  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!raw) {
      _hasPersistedLocalWorkspace = false;
      return false;
    }

    applyLocalWorkspaceSnapshot(raw);
    _hasPersistedLocalWorkspace = true;
    return true;
  } catch (error) {
    console.warn(error);
    _hasPersistedLocalWorkspace = false;
    return false;
  }
}

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
    color: normalizeColor(group.color, COLORS[0]),
    archivedAt: group.archivedAt || '',
  }));
}

function toCatalogProjects(projects) {
  return (projects || []).map(project => ({
    id: project.id,
    label: project.name,
    group: project.groupId,
    color: normalizeColor(project.color, COLORS[0]),
    sortOrder: Number(project.sortOrder || 0),
    activityScore: Number(project.activityScore || 0),
    lastActivityAt: project.lastActivityAt || '',
    updatedAt: project.updatedAt || '',
    archivedAt: project.archivedAt || '',
    balanceEnabled: project.balanceEnabled !== false,
  }));
}

function normalizeWishlistPayload(payload) {
  return {
    lists: (payload?.lists || []).map((list, index) => ({
      id: list.id,
      name: list.name || `Список ${index + 1}`,
      color: normalizeColor(list.color, COLORS[index % COLORS.length]),
      sortOrder: Number(list.sortOrder || 0),
      createdAt: list.createdAt || '',
      updatedAt: list.updatedAt || '',
    })),
    items: (payload?.items || []).map(item => ({
      id: item.id,
      listId: item.listId,
      title: item.title || '',
      note: item.note || '',
      url: item.url || '',
      priceText: item.priceText || '',
      status: ['IDEA', 'PLANNED', 'FULFILLED'].includes(item.status) ? item.status : 'IDEA',
      sortOrder: Number(item.sortOrder || 0),
      fulfilledAt: item.fulfilledAt || '',
      createdAt: item.createdAt || '',
      updatedAt: item.updatedAt || '',
    })).filter(item => item.title.trim()),
  };
}

async function fetchWishlistFromServer() {
  return apiJson('/api/wishlist', { method: 'GET', headers: {} });
}

async function syncWishlistFromServer() {
  wishlistLoading = true;
  wishlistError = '';
  try {
    let payload = await fetchWishlistFromServer();
    if (!(payload?.lists || []).length) {
      await apiJson('/api/wishlist/lists', {
        method: 'POST',
        body: JSON.stringify({ name: 'Для себя', color: COLORS[0] }),
      });
      payload = await fetchWishlistFromServer();
    }
    state.wishlist = normalizeWishlistPayload(payload);
    return state.wishlist;
  } catch (error) {
    console.error('WISHLIST_SYNC_FAILED', error);
    wishlistError = 'Не удалось загрузить вишлист.';
    return state.wishlist;
  } finally {
    wishlistLoading = false;
  }
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
  resetAuthPasswordVisibility();
  setAuthError('');
}

function togglePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input || !button) return;

  const nextType = input.type === 'password' ? 'text' : 'password';
  const isVisible = nextType === 'text';
  input.type = nextType;
  button.textContent = isVisible ? 'Скрыть' : 'Показать';
  button.classList.toggle('active', isVisible);
  button.setAttribute('aria-pressed', String(isVisible));
  button.setAttribute('aria-label', isVisible ? 'Скрыть пароль' : 'Показать пароль');
}

function resetAuthPasswordVisibility() {
  [
    ['login-password', 'auth-login-form'],
    ['register-password', 'auth-register-form'],
  ].forEach(([inputId, formId]) => {
    const input = document.getElementById(inputId);
    const button = document.querySelector(`#${formId} .password-toggle`);
    if (!input || !button) return;
    input.type = 'password';
    button.textContent = 'Показать';
    button.classList.remove('active');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Показать пароль');
  });
}

function showAuthShell() {
  adminStats = null;
  adminStatsError = '';
  resetAuthPasswordVisibility();
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

async function fetchAdminStatsFromServer() {
  return apiJson('/api/admin/stats', {
    method: 'GET',
    headers: {},
  });
}

async function fetchBootstrapFromServer() {
  if (!currentUser?.workspace?.id) {
    throw new Error('BOOTSTRAP_SESSION_MISSING');
  }

  return apiJson('/api/bootstrap', {
    method: 'GET',
    headers: {},
  });
}

async function syncAccountFromServer() {
  const account = await fetchAccountFromServer();
  applyAccountPayload(account);
  save();
  return account;
}

async function loadAdminStats(options = {}) {
  const { silent = false } = options;

  if (!currentUser) {
    adminStats = null;
    adminStatsError = '';
    return null;
  }

  try {
    adminStats = await fetchAdminStatsFromServer();
    adminStatsError = '';
    return adminStats;
  } catch (error) {
    const code = error instanceof Error ? error.message : 'GET_ADMIN_STATS_FAILED';

    if (code === 'FORBIDDEN_ADMIN_ACCESS' || code === 'UNAUTHORIZED') {
      adminStats = null;
      adminStatsError = '';
      return null;
    }

    adminStats = null;
    adminStatsError = 'Не удалось обновить статистику.';

    if (!silent) {
      console.error(error);
    }

    return null;
  }
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyCollection(value) {
  if (!value) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function isJsonEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function buildNormalizedPlanningSnapshot(payload = {}) {
  return {
    backlog: normalizeBacklog(payload.backlog),
    taskProjects: normalizeTaskProjects(
      payload.taskProjects ?? buildInitialGroupProjectMap(state.groups, state.subs),
      state.groups,
      state.subs,
    ),
    recurring: normalizeRecurring(payload.recurring, state.subs),
    recurringStatus: payload.recurringStatus || {},
    data: normalizeData(payload.data),
    projectTemplates: payload.projectTemplates || {},
    dayProjects: normalizeDayProjects(payload.dayProjects),
  };
}

function mergeLeafRecord(base = {}, local = {}, latest = {}) {
  const result = {};
  const localKeys = new Set(Object.keys(local || {}));
  const keys = new Set([
    ...Object.keys(base || {}),
    ...localKeys,
    ...Object.keys(latest || {}),
  ]);

  for (const key of keys) {
    const baseValue = base?.[key];
    const localValue = local?.[key];
    const latestValue = latest?.[key];

    if (isJsonEqual(localValue, baseValue)) {
      // Локально не менялось — берём серверное значение
      if (latestValue !== undefined) {
        result[key] = cloneJson(latestValue);
      }
    } else {
      // Локально изменилось — берём локальное (включая пустые массивы = удаление)
      if (localValue !== undefined) {
        result[key] = cloneJson(localValue);
      }
    }
  }

  return result;
}

function mergeNestedRecord(base = {}, local = {}, latest = {}, depth = 1) {
  if (depth <= 1) {
    return mergeLeafRecord(base, local, latest);
  }

  const result = {};
  const localKeys = new Set(Object.keys(local || {}));
  const keys = new Set([
    ...Object.keys(base || {}),
    ...localKeys,
    ...Object.keys(latest || {}),
  ]);

  for (const key of keys) {
    const baseValue = base?.[key];
    const localValue = local?.[key];
    const latestValue = latest?.[key];

    if (isJsonEqual(localValue, baseValue)) {
      // Локально не менялось — берём серверное
      if (latestValue !== undefined) {
        result[key] = cloneJson(latestValue);
      }
      continue;
    }

    // Локально изменилось: если пустой объект/массив — это явное удаление
    if (isEmptyCollection(localValue) && localKeys.has(key)) {
      result[key] = cloneJson(localValue);
      continue;
    }

    if (localValue === undefined) {
      continue;
    }

    const mergedValue = mergeNestedRecord(baseValue || {}, localValue || {}, latestValue || {}, depth - 1);
    result[key] = mergedValue;
  }

  return result;
}

function mergeRecurringArrays(base = [], local = [], latest = []) {
  return isJsonEqual(local, base) ? cloneJson(latest || []) || [] : cloneJson(local || []) || [];
}

function mergePlanningPayload(localPayload, latestPayload) {
  const basePayload = _serverPlanningBase || buildNormalizedPlanningSnapshot();

  return {
    backlog: mergeLeafRecord(basePayload.backlog, localPayload.backlog, latestPayload.backlog),
    taskProjects: mergeLeafRecord(basePayload.taskProjects, localPayload.taskProjects, latestPayload.taskProjects),
    recurring: mergeRecurringArrays(basePayload.recurring, localPayload.recurring, latestPayload.recurring),
    recurringStatus: mergeNestedRecord(basePayload.recurringStatus, localPayload.recurringStatus, latestPayload.recurringStatus, 2),
    data: mergeNestedRecord(basePayload.data, localPayload.data, latestPayload.data, 3),
    projectTemplates: mergeNestedRecord(basePayload.projectTemplates, localPayload.projectTemplates, latestPayload.projectTemplates, 2),
    dayProjects: mergeNestedRecord(basePayload.dayProjects, localPayload.dayProjects, latestPayload.dayProjects, 3),
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

function applyPlanningPayload(payload, version) {
  const normalizedPayload = buildNormalizedPlanningSnapshot(payload);
  _isApplyingServerPlanning = true;
  try {
    state.recurring = normalizedPayload.recurring;
    state.recurringStatus = normalizedPayload.recurringStatus;
    state.backlog = normalizedPayload.backlog;
    state.taskProjects = normalizedPayload.taskProjects;
    state.data = normalizedPayload.data;
    state.projectTemplates = normalizedPayload.projectTemplates;
    ensureProjectTemplates(false);
    state.dayProjects = normalizedPayload.dayProjects;
    _serverPlanningBase = cloneJson(normalizedPayload);
    _lastPlanningSyncSignature = getPlanningSyncSignature();
    if (version !== undefined) {
      _planningVersion = version;
    }
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
    applyPlanningPayload(payload, payload?.workspace?.planningVersion ?? 0);
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

  const payload = buildPlanningPayload();
  payload.expectedVersion = _planningVersion;

  const result = await apiJson('/api/planning-state', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  if (result?.version !== undefined) {
    _planningVersion = result.version;
  }

  _serverPlanningBase = cloneJson(buildNormalizedPlanningSnapshot(payload));
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
      if (error?.message === 'PLANNING_VERSION_CONFLICT') {
        // Version conflict: reload fresh state from server and retry
        try {
          await syncPlanningFromServer();
          await syncPlanningStateToServer();
        } catch (retryError) {
          console.error('PLANNING_CONFLICT_RECOVERY_FAILED', retryError);
        }
      } else {
        // Retry once after 2 seconds for other errors
        setTimeout(async () => {
          try {
            await syncPlanningStateToServer();
          } catch (retryError) {
            console.error('PLANNING_SYNC_RETRY_FAILED', retryError);
          }
        }, 2000);
      }
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
      // Retry once after 2 seconds
      setTimeout(async () => {
        try {
          await syncAchievementsStateToServer();
        } catch (retryError) {
          console.error('ACHIEVEMENTS_SYNC_RETRY_FAILED', retryError);
        }
      }, 2000);
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
    loadWorkspaceCacheForCurrentUser();
    await syncCatalogFromServer();
    await syncAccountFromServer();
    await syncPlanningFromServer();
    await syncWishlistFromServer();
    await loadAdminStats({ silent: true });
    if (!restoreNavigationStateForCurrentUser()) {
      state.currentView = state.settings.defaultView || 'graph';
      activeProjectId = null;
      activeGroupId = null;
    }
    save();
    renderSidebarLists();
    if (state.currentView === 'project' && activeProjectId) {
      void openProjectWorkspace(activeProjectId, { trackActivity: false });
    } else {
      renderCurrentView();
    }
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
    loadWorkspaceCacheForCurrentUser();
    await syncCatalogFromServer();
    await syncAccountFromServer();
    await syncPlanningFromServer();
    await syncWishlistFromServer();
    await loadAdminStats({ silent: true });
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
  _hasPersistedLocalWorkspace = false;
  activeProjectId = null;
  activeGroupId = null;
  cancelGroupFlyoutClose();
  sidebarGroupFlyoutId = null;
  groupProjectQuery = '';
  projectNotesByProject = {};
  projectNoteSectionsByProject = {};
  projectNotesLoadingProjectId = null;
  projectNotesError = '';
  manageProjectNoteId = null;
  manageProjectNoteSectionId = null;
  manageWishItemId = null;
  manageWishListId = null;
  state.wishlist = { lists: [], items: [] };
  wishlistError = '';
  wishlistLoading = false;
  showAuthShell();
}

function taskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeColor(value, fallback) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return HEX_COLOR_RE.test(candidate) ? candidate : fallback;
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
    color: normalizeColor(group.color, COLORS[index % COLORS.length]),
  }));
}

function normalizeSubs(subs, groups) {
  const fallbackGroupId = groups[0]?.id || DEFAULT_GROUPS[0].id;
  return (subs || DEFAULT_SUBS).map((sub, index) => ({
    id: sub.id || `sub_${index}_${Date.now()}`,
    label: sub.label || `Проект ${index + 1}`,
    group: groups.some(group => group.id === sub.group) ? sub.group : fallbackGroupId,
    color: normalizeColor(sub.color, COLORS[index % COLORS.length]),
    sortOrder: Number(sub.sortOrder ?? index),
    activityScore: Number(sub.activityScore || 0),
    lastActivityAt: sub.lastActivityAt || '',
    updatedAt: sub.updatedAt || '',
    balanceEnabled: sub.balanceEnabled !== false,
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

function todayDayIndex() {
  return (new Date().getDay() + 6) % 7;
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

function weekLabelShort(offset) {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1 + offset * 7);
  const weekNumber = Math.ceil((monday - new Date(monday.getFullYear(), 0, 1)) / 604800000) + 1;
  return `${weekNumber}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pluralizeRu(value, one, few, many) {
  const amount = Math.abs(Number(value) || 0) % 100;
  const lastDigit = amount % 10;
  if (amount > 10 && amount < 20) return many;
  if (lastDigit === 1) return one;
  if (lastDigit >= 2 && lastDigit <= 4) return few;
  return many;
}

function inlineToken(value) {
  return encodeURIComponent(String(value ?? ''));
}

function decodeInlineToken(value) {
  return decodeURIComponent(String(value ?? ''));
}

function formatAdminDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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
  const all = [...recurring, ...regular];
  return [...all.filter(t => !t.done), ...all.filter(t => t.done)];
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
  const storageKey = getWorkspaceStorageKey();
  if (storageKey) {
    localStorage.setItem(storageKey, JSON.stringify(buildLocalWorkspaceSnapshot()));
    _hasPersistedLocalWorkspace = true;
  }
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
  _hasPersistedLocalWorkspace = false;
  activeProjectId = null;
  activeGroupId = null;
  cancelGroupFlyoutClose();
  sidebarGroupFlyoutId = null;
  groupProjectQuery = '';
  projectNotesByProject = {};
  projectNoteSectionsByProject = {};
  projectNotesLoadingProjectId = null;
  projectNotesError = '';
  manageProjectNoteId = null;
  manageProjectNoteSectionId = null;

  state.groups = normalizeGroups(DEFAULT_GROUPS);
  state.subs = normalizeSubs([], state.groups);
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
  state.wishlist = { lists: [], items: [] };
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

  // Создать один дефолтный проект в первой группе
  if (createdGroups.length) {
    await apiJson('/api/catalog/projects', {
      method: 'POST',
      body: JSON.stringify({
        groupId: createdGroups[0].id,
        name: 'Проект',
        color: COLORS[0],
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

function getProjectEffectiveActivity(project) {
  const activityDate = new Date(project.lastActivityAt || project.updatedAt || 0);
  const elapsedDays = Number.isNaN(activityDate.getTime())
    ? 365
    : Math.max(0, (Date.now() - activityDate.getTime()) / 86_400_000);
  const decayedScore = Number(project.activityScore || 0) * Math.pow(0.5, elapsedDays / 21);
  const currentWeekTasks = Object.values(state.data[weekKey(0)]?.[project.id] || {}).flat().length;
  const backlogTasks = (state.backlog[project.id] || []).length;
  return decayedScore + Math.min(currentWeekTasks, 12) * 0.35 + Math.min(backlogTasks, 8) * 0.1;
}

function getTopSidebarProjects(limit = 10) {
  return [...state.subs]
    .sort((left, right) => {
      const scoreDifference = getProjectEffectiveActivity(right) - getProjectEffectiveActivity(left);
      if (Math.abs(scoreDifference) > 0.001) return scoreDifference;
      const rightActivity = new Date(right.lastActivityAt || right.updatedAt || 0).getTime() || 0;
      const leftActivity = new Date(left.lastActivityAt || left.updatedAt || 0).getTime() || 0;
      if (rightActivity !== leftActivity) return rightActivity - leftActivity;
      return Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
    })
    .slice(0, limit);
}

async function markProjectActivity(projectId, kind = 'OPEN') {
  if (!projectId || !getSub(projectId)) return;
  try {
    const saved = await apiJson(`/api/catalog/projects/${encodeURIComponent(projectId)}/activity`, {
      method: 'POST',
      body: JSON.stringify({ kind }),
    });
    const project = getSub(projectId);
    if (project) {
      project.activityScore = Number(saved.activityScore || project.activityScore || 0);
      project.lastActivityAt = saved.lastActivityAt || project.lastActivityAt || '';
      renderSidebarLists();
    }
  } catch (error) {
    console.error('Не удалось обновить активность проекта', error);
  }
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
  const groupToggle = document.getElementById('sidebar-groups-toggle');
  groupsWrap.classList.toggle('open', state.ui.groupsOpen);
  groupToggle?.classList.toggle('open', state.ui.groupsOpen);
  groupToggle?.setAttribute('aria-expanded', String(state.ui.groupsOpen));
  groupsWrap.innerHTML = `
    ${state.groups.map(group => {
      const groupProjects = state.subs.filter(project => project.group === group.id);
      const groupToken = inlineToken(group.id);
      return `
    <div
      class="sidebar-item-row sidebar-group-row${state.currentView === 'group' && activeGroupId === group.id ? ' active' : ''}${sidebarGroupFlyoutId === group.id ? ' flyout-open' : ''}"
      data-group-id="${escapeHtml(group.id)}"
      draggable="true"
      onmouseenter="openGroupFlyoutOnHover(decodeInlineToken('${groupToken}'))"
      onmouseleave="scheduleGroupFlyoutClose()"
      ondragstart="dragSidebarItem(event, 'group', decodeInlineToken('${groupToken}'))"
      ondragover="allowSidebarItemDrop(event)"
      ondrop="dropSidebarItem(event, 'group', decodeInlineToken('${groupToken}'))"
    >
      <div class="sidebar-group-trigger">
        <button class="sidebar-item-main" type="button" onclick="openGroupWorkspace(decodeInlineToken('${groupToken}'))">
          <span class="sidebar-group-avatar" style="--group-color:${group.color}">${escapeHtml(group.label.slice(0, 1).toUpperCase())}</span>
          <span>${escapeHtml(group.label)}</span>
        </button>
        <button class="sidebar-group-arrow" type="button" onclick="toggleGroupFlyout(event, decodeInlineToken('${groupToken}'))" aria-label="Проекты группы ${escapeHtml(group.label)}" aria-expanded="${sidebarGroupFlyoutId === group.id ? 'true' : 'false'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div class="sidebar-group-flyout" onclick="event.stopPropagation()" onmouseenter="cancelGroupFlyoutClose()" onmouseleave="scheduleGroupFlyoutClose()">
        <div class="sidebar-group-flyout-header">
          <div>
            <span class="sidebar-group-flyout-kicker">Группа</span>
            <strong>${escapeHtml(group.label)}</strong>
          </div>
          <button type="button" onclick="openGroupManage(decodeInlineToken('${groupToken}'))" aria-label="Настройки группы">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V20.3h-3v-.09a1.7 1.7 0 0 0-1.03-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.55-1.03h-.09v-3h.09A1.7 1.7 0 0 0 7 9.94a1.7 1.7 0 0 0-.34-1.88L6.6 8l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.7 4.7v-.09h3v.09a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 8l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.03h.09v3h-.09A1.7 1.7 0 0 0 19.4 15z"/></svg>
          </button>
        </div>
        <button class="sidebar-group-create-project" type="button" onclick="openManage(null, decodeInlineToken('${groupToken}'))">+ Создать проект</button>
        <div class="sidebar-group-flyout-list">
          ${groupProjects.length ? groupProjects.map(project => `
            <button type="button" onclick="openProjectWorkspace(decodeInlineToken('${inlineToken(project.id)}'))">
              <span class="sidebar-project-icon" style="--project-color:${project.color}" aria-hidden="true"><i></i><i></i><i></i></span>
              <span>${escapeHtml(project.label)}</span>
            </button>
          `).join('') : '<div class="sidebar-group-flyout-empty">В группе пока нет проектов</div>'}
        </div>
        <button class="sidebar-group-open-page" type="button" onclick="openGroupWorkspace(decodeInlineToken('${groupToken}'))">Открыть страницу группы</button>
      </div>
    </div>
  `}).join('')}`;

  const projectsWrap = document.getElementById('sidebar-projects');
  const projectToggle = document.getElementById('sidebar-projects-toggle');
  projectsWrap.classList.toggle('open', state.ui.projectsOpen);
  projectToggle?.classList.toggle('open', state.ui.projectsOpen);
  projectToggle?.setAttribute('aria-expanded', String(state.ui.projectsOpen));
  const topProjects = getTopSidebarProjects(10);
  projectsWrap.innerHTML = `
    ${topProjects.map(project => `
    <div
      class="sidebar-item-row${state.currentView === 'project' && activeProjectId === project.id ? ' active' : ''}"
      draggable="true"
      ondragstart="dragSidebarItem(event, 'project', decodeInlineToken('${inlineToken(project.id)}'))"
      ondragover="allowSidebarItemDrop(event)"
      ondrop="dropSidebarItem(event, 'project', decodeInlineToken('${inlineToken(project.id)}'))"
    >
      <button class="sidebar-item-main" type="button" onclick="openProjectWorkspace(decodeInlineToken('${inlineToken(project.id)}'))">
        <span class="sidebar-project-dot" style="background:${project.color}"></span>
        <span>${escapeHtml(project.label)}</span>
      </button>
    </div>
  `).join('')}
    ${state.subs.length > 10 ? '<div class="sidebar-projects-hint">Остальные проекты — внутри групп</div>' : ''}
  `;
}

function cancelGroupFlyoutClose() {
  if (_sidebarGroupFlyoutCloseTimer) {
    clearTimeout(_sidebarGroupFlyoutCloseTimer);
    _sidebarGroupFlyoutCloseTimer = null;
  }
}

function scheduleGroupFlyoutClose() {
  if (isMobileViewport()) return;
  cancelGroupFlyoutClose();
  _sidebarGroupFlyoutCloseTimer = setTimeout(() => {
    _sidebarGroupFlyoutCloseTimer = null;
    if (!sidebarGroupFlyoutId) return;
    sidebarGroupFlyoutId = null;
    renderSidebarLists();
  }, 420);
}

function openGroupFlyoutOnHover(groupId) {
  if (isMobileViewport()) return;
  cancelGroupFlyoutClose();
  if (sidebarGroupFlyoutId === groupId) {
    const currentRow = [...document.querySelectorAll('.sidebar-group-row')]
      .find(item => item.dataset.groupId === groupId);
    positionGroupFlyout(currentRow);
    return;
  }
  sidebarGroupFlyoutId = groupId;
  renderSidebarLists();
  requestAnimationFrame(() => {
    const row = [...document.querySelectorAll('.sidebar-group-row')]
      .find(item => item.dataset.groupId === groupId);
    positionGroupFlyout(row);
  });
}

function toggleGroupFlyout(event, groupId) {
  event?.preventDefault();
  event?.stopPropagation();
  cancelGroupFlyoutClose();
  sidebarGroupFlyoutId = sidebarGroupFlyoutId === groupId ? null : groupId;
  renderSidebarLists();
  if (sidebarGroupFlyoutId) {
    requestAnimationFrame(() => {
      const row = [...document.querySelectorAll('.sidebar-group-row')]
        .find(item => item.dataset.groupId === groupId);
      positionGroupFlyout(row);
    });
  }
}

function positionGroupFlyout(row) {
  if (!row || isMobileViewport()) return;
  const flyout = row.querySelector('.sidebar-group-flyout');
  const sidebar = document.getElementById('sidebar');
  if (!flyout || !sidebar) return;
  const rowRect = row.getBoundingClientRect();
  const sidebarRect = sidebar.getBoundingClientRect();
  const maxTop = Math.max(12, window.innerHeight - Math.min(560, window.innerHeight - 24));
  flyout.style.left = `${Math.round(sidebarRect.right)}px`;
  flyout.style.top = `${Math.round(Math.min(Math.max(rowRect.top, 12), maxTop))}px`;
}

function renderCurrentView() {
  persistNavigationState();
  const graphView = document.getElementById('graph-view');
  const tasksView = document.getElementById('tasks-view');
  const winsView = document.getElementById('wins-view');
  const projectView = document.getElementById('project-view');
  const groupView = document.getElementById('group-view');
  const archiveView = document.getElementById('archive-view');
  const historyView = document.getElementById('history-view');
  const wishlistView = document.getElementById('wishlist-view');
  const profileView = document.getElementById('profile-view');
  const settingsView = document.getElementById('settings-view');
  const statsBar = document.getElementById('stats-bar');
  const weekNav = document.getElementById('week-nav');
  const pageTitle = document.getElementById('page-title');
  const createBtn = document.getElementById('top-create-task-btn');
  const addProjectBtn = document.getElementById('top-add-project-btn');
  const carryBtn = document.getElementById('top-carry-btn');
  const graphTools = document.getElementById('graph-tools');

  graphView.style.display = state.currentView === 'graph' ? 'block' : 'none';
  tasksView.style.display = state.currentView === 'tasks' ? 'block' : 'none';
  winsView.style.display = state.currentView === 'wins' ? 'block' : 'none';
  projectView.style.display = state.currentView === 'project' ? 'block' : 'none';
  groupView.style.display = state.currentView === 'group' ? 'block' : 'none';
  archiveView.style.display = state.currentView === 'archive' ? 'block' : 'none';
  historyView.style.display = state.currentView === 'history' ? 'block' : 'none';
  wishlistView.style.display = state.currentView === 'wishlist' ? 'block' : 'none';
  profileView.style.display = state.currentView === 'profile' ? 'block' : 'none';
  settingsView.style.display = state.currentView === 'settings' ? 'block' : 'none';
  document.getElementById('ai-section').style.display = 'none';

  // Заголовок проекта/группы использует display: inline-flex !important.
  // Снимаем его до раннего выхода для графика, иначе он остаётся видимым
  // рядом с навигацией по неделе после перехода из страницы группы.
  pageTitle.classList.remove('page-title-with-tabs');
  pageTitle.classList.remove('project-page-title');

  if (state.currentView === 'graph') {
    weekNav.style.display = 'flex';
    pageTitle.style.display = 'none';
    pageTitle.textContent = '';
    statsBar.style.display = 'flex';
    createBtn.style.display = 'none';
    addProjectBtn.style.display = 'inline-flex';
    addProjectBtn.textContent = '+ проект';
    addProjectBtn.onclick = () => openDayProjectModal();
    carryBtn.style.display = 'inline-flex';
    carryBtn.textContent = 'перенос';
    carryBtn.onclick = () => carryOverUnfinished();
    graphTools.style.display = 'inline-flex';
    renderBoard();
    return;
  }

  closeGraphToolsMenu();
  graphTools.style.display = 'none';
  weekNav.style.display = 'none';
  pageTitle.style.display = 'block';
  statsBar.style.display = 'none';

  if (state.currentView === 'group') {
    const group = getGroup(activeGroupId);
    if (!group) {
      state.currentView = 'graph';
      activeGroupId = null;
      renderCurrentView();
      return;
    }
    pageTitle.classList.add('project-page-title');
    pageTitle.innerHTML = `<span class="project-topbar-name"><span class="project-page-title-dot" style="background:${group.color}"></span><span>${escapeHtml(group.label)}</span></span>`;
    createBtn.style.display = 'inline-flex';
    createBtn.textContent = '+ проект';
    createBtn.onclick = () => openManage(null, activeGroupId);
    addProjectBtn.style.display = 'inline-flex';
    addProjectBtn.textContent = 'настройки';
    addProjectBtn.onclick = () => openGroupManage(activeGroupId);
    carryBtn.style.display = 'none';
    renderGroupWorkspaceView();
    return;
  }

  if (state.currentView === 'project') {
    const project = getSub(activeProjectId);
    if (!project) {
      state.currentView = 'graph';
      activeProjectId = null;
      renderCurrentView();
      return;
    }
    pageTitle.classList.add('project-page-title');
    renderProjectTopBarTitle(project);
    createBtn.style.display = 'inline-flex';
    createBtn.textContent = '+ заметка';
    createBtn.onclick = () => openProjectNoteModal();
    addProjectBtn.style.display = 'inline-flex';
    addProjectBtn.textContent = '+ раздел';
    addProjectBtn.onclick = () => openProjectNoteSectionModal();
    carryBtn.style.display = 'inline-flex';
    carryBtn.textContent = 'настройки';
    carryBtn.onclick = () => openManage(activeProjectId);
    renderProjectWorkspaceView();
    return;
  }

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

  if (state.currentView === 'archive') {
    pageTitle.textContent = 'Архив';
    createBtn.style.display = 'none';
    addProjectBtn.style.display = 'none';
    carryBtn.style.display = 'none';
    renderArchiveView();
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

  if (state.currentView === 'history') {
    pageTitle.textContent = 'Баланс';
    createBtn.style.display = 'none';
    addProjectBtn.style.display = 'none';
    carryBtn.style.display = 'none';
    renderBalanceView();
    return;
  }

  if (state.currentView === 'wishlist') {
    pageTitle.textContent = 'Вишлист';
    createBtn.style.display = 'inline-flex';
    createBtn.textContent = '+ покупка';
    createBtn.onclick = () => openWishItemModal();
    addProjectBtn.style.display = 'inline-flex';
    addProjectBtn.textContent = '+ список';
    addProjectBtn.onclick = () => openWishListModal();
    carryBtn.style.display = 'none';
    renderWishlistView();
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
    renderSettingsPageTitle();
    createBtn.style.display = 'none';
    addProjectBtn.style.display = 'none';
    carryBtn.style.display = 'none';
    renderSettingsView();
    return;
  }

  createBtn.style.display = 'none';
  addProjectBtn.style.display = 'none';
  carryBtn.style.display = 'none';

  pageTitle.textContent = 'График';
}

function parseWeekKeyDate(wk) {
  const match = /^w(\d{4})(\d{2})(\d{2})$/.exec(String(wk || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getBalancePeriodBounds() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let start;
  let end;

  if (balancePeriod === 'month') {
    start = new Date(today.getFullYear(), today.getMonth() + balanceOffset, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  } else if (balancePeriod === 'year') {
    start = new Date(today.getFullYear() + balanceOffset, 0, 1);
    end = new Date(start.getFullYear() + 1, 0, 1);
  } else {
    const day = today.getDay() || 7;
    start = new Date(today);
    start.setDate(today.getDate() - day + 1 + balanceOffset * 7);
    end = new Date(start);
    end.setDate(start.getDate() + 7);
  }

  const short = date => date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const label = balancePeriod === 'year'
    ? String(start.getFullYear())
    : balancePeriod === 'month'
      ? start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
      : `${short(start)} — ${short(new Date(end.getTime() - 86_400_000))}`;

  return { start, end, label };
}

function getBalanceCompletedCounts(start, end) {
  const counts = Object.fromEntries(state.subs.map(project => [project.id, 0]));
  const inRange = date => date && date >= start && date < end;

  Object.entries(state.data || {}).forEach(([wk, projectMap]) => {
    const monday = parseWeekKeyDate(wk);
    if (!monday) return;
    Object.entries(projectMap || {}).forEach(([projectId, dayMap]) => {
      Object.entries(dayMap || {}).forEach(([dayIdx, tasks]) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + Number(dayIdx));
        if (!inRange(date)) return;
        const doneCount = (tasks || []).filter(task => task.done).length;
        counts[projectId] = (counts[projectId] || 0) + doneCount;
      });
    });
  });

  const recurringById = new Map((state.recurring || []).map(task => [task.id, task]));
  Object.entries(state.recurringStatus || {}).forEach(([wk, statusMap]) => {
    const monday = parseWeekKeyDate(wk);
    if (!monday) return;
    Object.entries(statusMap || {}).forEach(([recurringId, status]) => {
      if (!status?.done) return;
      const recurring = recurringById.get(recurringId);
      if (!recurring) return;
      const date = new Date(monday);
      date.setDate(monday.getDate() + Number(recurring.dayIdx || 0));
      if (!inRange(date)) return;
      counts[recurring.subId] = (counts[recurring.subId] || 0) + 1;
    });
  });

  return counts;
}

function getBalanceReport() {
  const bounds = getBalancePeriodBounds();
  const completedCounts = getBalanceCompletedCounts(bounds.start, bounds.end);
  const scopedProjects = state.subs.filter(project => {
    if (balanceGroupFilter !== 'all' && project.group !== balanceGroupFilter) return false;
    if (balanceProjectFilter !== 'all' && project.id !== balanceProjectFilter) return false;
    return true;
  });
  const includedProjects = scopedProjects.filter(project => project.balanceEnabled !== false);
  const touchedProjects = includedProjects.filter(project => (completedCounts[project.id] || 0) > 0);
  const overallScore = includedProjects.length
    ? Math.round(touchedProjects.length / includedProjects.length * 100)
    : 0;
  const groupStats = state.groups
    .filter(group => balanceGroupFilter === 'all' || group.id === balanceGroupFilter)
    .map(group => {
      const projects = includedProjects.filter(project => project.group === group.id);
      const touched = projects.filter(project => (completedCounts[project.id] || 0) > 0);
      return {
        ...group,
        projects,
        touched,
        completed: projects.reduce((sum, project) => sum + (completedCounts[project.id] || 0), 0),
        score: projects.length ? Math.round(touched.length / projects.length * 100) : 0,
      };
    });

  return {
    ...bounds,
    completedCounts,
    scopedProjects,
    includedProjects,
    touchedProjects,
    overallScore,
    groupStats,
  };
}

function polarPoint(cx, cy, radius, angle) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function balanceSectorPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
  if (outerRadius <= innerRadius + 0.5) return '';
  const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
  const outerEnd = polarPoint(cx, cy, outerRadius, endAngle);
  const innerEnd = polarPoint(cx, cy, innerRadius, endAngle);
  const innerStart = polarPoint(cx, cy, innerRadius, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function buildBalanceWheel(groupStats, overallScore) {
  const visible = groupStats.filter(group => group.projects.length);
  if (!visible.length) {
    return '<div class="balance-wheel-empty">Выбери проекты, которые нужно учитывать</div>';
  }

  const cx = 160;
  const cy = 160;
  const innerRadius = 48;
  const maxRadius = 130;
  const step = Math.PI * 2 / visible.length;
  const gap = Math.min(0.08, step * 0.12);
  const paths = visible.map((group, index) => {
    const start = -Math.PI / 2 + index * step + gap;
    const end = -Math.PI / 2 + (index + 1) * step - gap;
    const outer = innerRadius + (maxRadius - innerRadius) * group.score / 100;
    const backgroundPath = balanceSectorPath(cx, cy, innerRadius, maxRadius, start, end);
    const valuePath = balanceSectorPath(cx, cy, innerRadius, outer, start, end);
    return `
      <path d="${backgroundPath}" fill="${group.color}" opacity="0.09"></path>
      ${valuePath ? `<path d="${valuePath}" fill="${group.color}" opacity="0.82"></path>` : ''}
    `;
  }).join('');

  return `
    <svg class="balance-wheel-svg" viewBox="0 0 320 320" role="img" aria-label="Баланс по группам ${overallScore}%">
      ${paths}
      <circle cx="160" cy="160" r="43" fill="#ffffff" stroke="rgba(0,0,0,.08)"></circle>
      <text x="160" y="155" text-anchor="middle" class="balance-wheel-value">${overallScore}%</text>
      <text x="160" y="177" text-anchor="middle" class="balance-wheel-label">охват</text>
    </svg>
  `;
}

function setBalancePeriod(period) {
  if (!['week', 'month', 'year'].includes(period)) return;
  balancePeriod = period;
  balanceOffset = 0;
  renderBalanceView();
}

function shiftBalancePeriod(delta) {
  balanceOffset += Number(delta) || 0;
  renderBalanceView();
}

function setBalanceGroupFilter(groupId) {
  balanceGroupFilter = groupId || 'all';
  const project = getSub(balanceProjectFilter);
  if (balanceProjectFilter !== 'all' && (!project || (balanceGroupFilter !== 'all' && project.group !== balanceGroupFilter))) {
    balanceProjectFilter = 'all';
  }
  renderBalanceView();
}

function setBalanceProjectFilter(projectId) {
  balanceProjectFilter = projectId || 'all';
  renderBalanceView();
}

async function toggleProjectBalance(projectId) {
  const project = getSub(projectId);
  if (!project) return;
  const nextValue = project.balanceEnabled === false;
  project.balanceEnabled = nextValue;
  renderBalanceView();
  try {
    const saved = await apiJson(`/api/catalog/projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ balanceEnabled: nextValue }),
    });
    project.balanceEnabled = saved.balanceEnabled !== false;
  } catch (error) {
    project.balanceEnabled = !nextValue;
    renderBalanceView();
    showToast('Не удалось изменить баланс проекта');
  }
}

function renderBalanceView() {
  const root = document.getElementById('history-view');
  if (!root) return;
  const report = getBalanceReport();
  const filterProjects = state.subs.filter(project => balanceGroupFilter === 'all' || project.group === balanceGroupFilter);
  const completedTotal = report.includedProjects.reduce(
    (sum, project) => sum + (report.completedCounts[project.id] || 0),
    0,
  );

  root.innerHTML = `
    <div class="balance-shell">
      <section class="balance-toolbar">
        <div class="balance-period-tabs" role="tablist" aria-label="Период баланса">
          ${[
            ['week', 'Неделя'],
            ['month', 'Месяц'],
            ['year', 'Год'],
          ].map(([id, label]) => `<button type="button" class="${balancePeriod === id ? 'active' : ''}" onclick="setBalancePeriod('${id}')">${label}</button>`).join('')}
        </div>
        <div class="balance-period-nav">
          <button type="button" onclick="shiftBalancePeriod(-1)" aria-label="Предыдущий период">‹</button>
          <strong>${escapeHtml(report.label)}</strong>
          <button type="button" onclick="shiftBalancePeriod(1)" aria-label="Следующий период">›</button>
        </div>
        <div class="balance-filters">
          <select aria-label="Фильтр по группе" onchange="setBalanceGroupFilter(this.value)">
            <option value="all">Все группы</option>
            ${state.groups.map(group => `<option value="${escapeHtml(group.id)}" ${balanceGroupFilter === group.id ? 'selected' : ''}>${escapeHtml(group.label)}</option>`).join('')}
          </select>
          <select aria-label="Фильтр по проекту" onchange="setBalanceProjectFilter(this.value)">
            <option value="all">Все проекты</option>
            ${filterProjects.map(project => `<option value="${escapeHtml(project.id)}" ${balanceProjectFilter === project.id ? 'selected' : ''}>${escapeHtml(project.label)}</option>`).join('')}
          </select>
        </div>
      </section>

      <section class="balance-overview">
        <div class="balance-wheel-panel">
          <div class="balance-section-heading">
            <div>
              <span class="balance-kicker">Сводка</span>
              <h2>Охват активных проектов</h2>
            </div>
            <span class="balance-method-note">1 проект = 1 голос</span>
          </div>
          <div class="balance-wheel-wrap">${buildBalanceWheel(report.groupStats, report.overallScore)}</div>
          <div class="balance-summary-numbers">
            <div><strong>${report.touchedProjects.length}</strong><span>проектов затронуто</span></div>
            <div><strong>${report.includedProjects.length}</strong><span>учитывается</span></div>
            <div><strong>${completedTotal}</strong><span>дел выполнено</span></div>
          </div>
        </div>

        <div class="balance-groups-panel">
          <div class="balance-section-heading">
            <div>
              <span class="balance-kicker">Группы</span>
              <h2>Где есть движение</h2>
            </div>
          </div>
          <div class="balance-group-list">
            ${report.groupStats.map(group => `
              <div class="balance-group-row">
                <div class="balance-group-row-head">
                  <span><i style="background:${group.color}"></i>${escapeHtml(group.label)}</span>
                  <strong>${group.projects.length ? `${group.score}%` : '—'}</strong>
                </div>
                <div class="balance-progress"><span style="width:${group.score}%;background:${group.color}"></span></div>
                <div class="balance-group-meta">${group.touched.length} из ${group.projects.length} проектов · ${group.completed} дел</div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <section class="balance-projects-panel">
        <div class="balance-section-heading">
          <div>
            <span class="balance-kicker">Детали</span>
            <h2>Проекты в балансе</h2>
          </div>
          <span class="balance-method-note">Отключай проекты на паузе</span>
        </div>
        <div class="balance-project-list">
          ${report.scopedProjects.length ? report.scopedProjects.map(project => {
            const group = getGroup(project.group);
            const count = report.completedCounts[project.id] || 0;
            const enabled = project.balanceEnabled !== false;
            return `
              <div class="balance-project-row${enabled ? '' : ' excluded'}">
                <button class="balance-project-toggle${enabled ? ' on' : ''}" type="button" onclick="toggleProjectBalance(decodeInlineToken('${inlineToken(project.id)}'))" aria-label="${enabled ? 'Исключить' : 'Учитывать'} ${escapeHtml(project.label)}"><span></span></button>
                <span class="sidebar-project-icon" style="--project-color:${project.color}" aria-hidden="true"><i></i><i></i><i></i></span>
                <div class="balance-project-copy">
                  <strong>${escapeHtml(project.label)}</strong>
                  <span>${escapeHtml(group?.label || 'Без группы')}</span>
                </div>
                <div class="balance-project-result ${count > 0 ? 'touched' : ''}">
                  <strong>${enabled ? count : '—'}</strong>
                  <span>${enabled ? (count > 0 ? 'выполнено' : 'не затронут') : 'на паузе'}</span>
                </div>
              </div>
            `;
          }).join('') : '<div class="balance-empty">По этому фильтру проектов нет.</div>'}
        </div>
      </section>
    </div>
  `;
}

function getWishStatusLabel(status) {
  if (status === 'PLANNED') return 'Запланировано';
  if (status === 'FULFILLED') return 'Куплено';
  return 'Идея';
}

function getSafeWishUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function setWishlistStatusFilter(filter) {
  wishlistStatusFilter = ['ACTIVE', 'FULFILLED', 'ALL'].includes(filter) ? filter : 'ACTIVE';
  renderWishlistView();
}

function wishMatchesStatus(item) {
  if (wishlistStatusFilter === 'FULFILLED') return item.status === 'FULFILLED';
  if (wishlistStatusFilter === 'ALL') return true;
  return item.status !== 'FULFILLED';
}

function renderWishlistView() {
  const root = document.getElementById('wishlist-view');
  if (!root) return;
  if (wishlistLoading) {
    root.innerHTML = '<div class="wishlist-loading"><span></span><span></span><span></span></div>';
    return;
  }
  if (wishlistError) {
    root.innerHTML = `<div class="wishlist-error"><span>${escapeHtml(wishlistError)}</span><button type="button" onclick="retryWishlist()">Повторить</button></div>`;
    return;
  }

  const lists = state.wishlist.lists;
  const activeCount = state.wishlist.items.filter(item => item.status !== 'FULFILLED').length;
  const fulfilledCount = state.wishlist.items.filter(item => item.status === 'FULFILLED').length;

  root.innerHTML = `
    <div class="wishlist-shell">
      <section class="wishlist-toolbar">
        <div>
          <span class="wishlist-kicker">Покупки на потом</span>
          <h2>Всё, что хочется не забыть</h2>
        </div>
        <div class="wishlist-status-tabs" role="tablist" aria-label="Статус покупок">
          <button type="button" class="${wishlistStatusFilter === 'ACTIVE' ? 'active' : ''}" onclick="setWishlistStatusFilter('ACTIVE')">Активные <span>${activeCount}</span></button>
          <button type="button" class="${wishlistStatusFilter === 'FULFILLED' ? 'active' : ''}" onclick="setWishlistStatusFilter('FULFILLED')">Куплено <span>${fulfilledCount}</span></button>
          <button type="button" class="${wishlistStatusFilter === 'ALL' ? 'active' : ''}" onclick="setWishlistStatusFilter('ALL')">Все</button>
        </div>
      </section>

      ${lists.length ? `
        <div class="wishlist-board">
          ${lists.map(list => {
            const items = state.wishlist.items.filter(item => item.listId === list.id && wishMatchesStatus(item));
            return `
              <section class="wishlist-column" style="--wish-list-color:${list.color}">
                <header class="wishlist-column-head">
                  <div>
                    <i></i>
                    <strong>${escapeHtml(list.name)}</strong>
                    <span>${items.length}</span>
                  </div>
                  <button type="button" onclick="openWishListModal(decodeInlineToken('${inlineToken(list.id)}'))" aria-label="Настройки ${escapeHtml(list.name)}">···</button>
                </header>
                <div class="wishlist-column-items">
                  ${items.length ? items.map(item => {
                    const safeUrl = getSafeWishUrl(item.url);
                    return `
                      <article class="wish-card${item.status === 'FULFILLED' ? ' fulfilled' : ''}" onclick="openWishItemModal(decodeInlineToken('${inlineToken(item.id)}'))">
                        <div class="wish-card-topline">
                          <span class="wish-status ${item.status.toLowerCase()}">${getWishStatusLabel(item.status)}</span>
                          ${item.priceText ? `<strong>${escapeHtml(item.priceText)}</strong>` : ''}
                        </div>
                        <h3>${escapeHtml(item.title)}</h3>
                        ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ''}
                        <footer>
                          ${safeUrl ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">Открыть ссылку</a>` : '<span></span>'}
                          <button type="button" onclick="event.stopPropagation();toggleWishFulfilled(decodeInlineToken('${inlineToken(item.id)}'))">${item.status === 'FULFILLED' ? 'Вернуть' : 'Куплено'}</button>
                        </footer>
                      </article>
                    `;
                  }).join('') : '<div class="wishlist-column-empty">В этом списке пока пусто</div>'}
                </div>
                <button class="wishlist-add-card" type="button" onclick="openWishItemModal(null, decodeInlineToken('${inlineToken(list.id)}'))">+ Добавить покупку</button>
              </section>
            `;
          }).join('')}
          <button class="wishlist-add-list" type="button" onclick="openWishListModal()">+ Новый список</button>
        </div>
      ` : `
        <div class="wishlist-first-list">
          <span class="wishlist-first-mark">◇</span>
          <h2>Создай первый список</h2>
          <p>Например, «Для себя», «Для Аси» или «Дом».</p>
          <button class="primary" type="button" onclick="openWishListModal()">+ Создать список</button>
        </div>
      `}
    </div>
  `;
}

async function retryWishlist() {
  wishlistLoading = true;
  wishlistError = '';
  renderWishlistView();
  await syncWishlistFromServer();
  renderWishlistView();
}

function openWishItemModal(itemId = null, preferredListId = null) {
  if (!state.wishlist.lists.length) {
    openWishListModal();
    showToast('Сначала создай список');
    return;
  }
  manageWishItemId = itemId;
  const item = state.wishlist.items.find(candidate => candidate.id === itemId);
  const listId = item?.listId || preferredListId || state.wishlist.lists[0].id;
  document.getElementById('wish-item-modal-title').textContent = item ? 'Покупка' : 'Добавить покупку';
  document.getElementById('wish-item-title').value = item?.title || '';
  document.getElementById('wish-item-url').value = item?.url || '';
  document.getElementById('wish-item-price').value = item?.priceText || '';
  document.getElementById('wish-item-note').value = item?.note || '';
  document.getElementById('wish-item-status').value = item?.status || 'IDEA';
  const select = document.getElementById('wish-item-list-select');
  select.innerHTML = state.wishlist.lists.map(list => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name)}</option>`).join('');
  select.value = listId;
  document.getElementById('wish-item-delete-btn').style.display = item ? 'inline-flex' : 'none';
  document.getElementById('wish-item-save-btn').textContent = item ? 'Сохранить' : 'Добавить';
  document.getElementById('wish-item-modal').classList.add('open');
  setTimeout(() => document.getElementById('wish-item-title').focus(), 0);
}

function closeWishItemModal() {
  document.getElementById('wish-item-modal').classList.remove('open');
  manageWishItemId = null;
}

async function saveWishItem() {
  const title = document.getElementById('wish-item-title').value.trim();
  const listId = document.getElementById('wish-item-list-select').value;
  if (!title || !listId) return;
  const button = document.getElementById('wish-item-save-btn');
  const editingItemId = manageWishItemId;
  button.disabled = true;
  try {
    const payload = {
      listId,
      title,
      url: document.getElementById('wish-item-url').value.trim(),
      priceText: document.getElementById('wish-item-price').value.trim(),
      note: document.getElementById('wish-item-note').value.trim(),
      status: document.getElementById('wish-item-status').value,
    };
    await apiJson(editingItemId
      ? `/api/wishlist/items/${encodeURIComponent(editingItemId)}`
      : '/api/wishlist/items', {
      method: editingItemId ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    });
    await syncWishlistFromServer();
    closeWishItemModal();
    renderWishlistView();
    showToast(editingItemId ? 'Покупка сохранена' : 'Покупка добавлена');
  } catch (error) {
    console.error(error);
    showToast('Не удалось сохранить покупку');
  } finally {
    button.disabled = false;
  }
}

function deleteWishItem() {
  if (!manageWishItemId) return;
  const itemId = manageWishItemId;
  openConfirmModal({
    title: 'Удалить покупку',
    message: 'Карточка будет удалена из вишлиста.',
    confirmText: 'Удалить',
    danger: true,
    onConfirm: async () => {
      await apiJson(`/api/wishlist/items/${encodeURIComponent(itemId)}`, { method: 'DELETE', headers: {} });
      await syncWishlistFromServer();
      closeWishItemModal();
      renderWishlistView();
    },
  });
}

async function toggleWishFulfilled(itemId) {
  const item = state.wishlist.items.find(candidate => candidate.id === itemId);
  if (!item) return;
  const nextStatus = item.status === 'FULFILLED' ? 'IDEA' : 'FULFILLED';
  item.status = nextStatus;
  renderWishlistView();
  try {
    await apiJson(`/api/wishlist/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    await syncWishlistFromServer();
    renderWishlistView();
  } catch (error) {
    console.error(error);
    await syncWishlistFromServer();
    renderWishlistView();
  }
}

function openWishListModal(listId = null) {
  manageWishListId = listId;
  const list = state.wishlist.lists.find(candidate => candidate.id === listId);
  newWishListColor = list?.color || COLORS[state.wishlist.lists.length % COLORS.length];
  document.getElementById('wish-list-modal-title').textContent = list ? 'Настройки списка' : 'Новый список';
  document.getElementById('wish-list-name').value = list?.name || '';
  document.getElementById('wish-list-delete-btn').style.display = list ? 'inline-flex' : 'none';
  document.getElementById('wish-list-save-btn').textContent = list ? 'Сохранить' : 'Создать';
  renderColorPicker('wish-list-color-picker', newWishListColor, 'pickWishListColor');
  document.getElementById('wish-list-modal').classList.add('open');
  setTimeout(() => document.getElementById('wish-list-name').focus(), 0);
}

function pickWishListColor(color, element) {
  newWishListColor = color;
  document.querySelectorAll('#wish-list-color-picker .color-swatch').forEach(node => {
    node.style.borderColor = 'transparent';
  });
  element.style.borderColor = '#1a1a18';
}

function closeWishListModal() {
  document.getElementById('wish-list-modal').classList.remove('open');
  manageWishListId = null;
}

async function saveWishList() {
  const name = document.getElementById('wish-list-name').value.trim();
  if (!name) return;
  const button = document.getElementById('wish-list-save-btn');
  button.disabled = true;
  try {
    await apiJson(manageWishListId
      ? `/api/wishlist/lists/${encodeURIComponent(manageWishListId)}`
      : '/api/wishlist/lists', {
      method: manageWishListId ? 'PATCH' : 'POST',
      body: JSON.stringify({ name, color: newWishListColor }),
    });
    await syncWishlistFromServer();
    closeWishListModal();
    renderWishlistView();
  } catch (error) {
    console.error(error);
    showToast('Не удалось сохранить список');
  } finally {
    button.disabled = false;
  }
}

function deleteWishList() {
  if (!manageWishListId) return;
  const listId = manageWishListId;
  const itemCount = state.wishlist.items.filter(item => item.listId === listId).length;
  openConfirmModal({
    title: 'Удалить список',
    message: itemCount
      ? `Вместе со списком удалятся покупки: ${itemCount}.`
      : 'Пустой список будет удалён.',
    confirmText: 'Удалить',
    danger: true,
    onConfirm: async () => {
      await apiJson(`/api/wishlist/lists/${encodeURIComponent(listId)}`, { method: 'DELETE', headers: {} });
      await syncWishlistFromServer();
      closeWishListModal();
      renderWishlistView();
    },
  });
}

function renderSettingsPageTitle() {
  const pageTitle = document.getElementById('page-title');
  if (!pageTitle) return;

  const canViewStats = Boolean(adminStats?.summary || adminStatsError);
  const tabs = [
    { id: 'service', label: 'Сервис' },
    ...(canViewStats ? [{ id: 'stats', label: 'Статистика' }] : []),
  ];

  if (!tabs.some(tab => tab.id === settingsSection)) {
    settingsSection = 'service';
  }

  pageTitle.classList.add('page-title-with-tabs');
  pageTitle.innerHTML = `
    <span class="page-title-label">Настройки</span>
    <span class="page-title-tabs" role="tablist" aria-label="Разделы настроек">
      ${tabs.map(tab => `
        <button
          type="button"
          class="page-title-tab${settingsSection === tab.id ? ' is-active' : ''}"
          role="tab"
          aria-selected="${settingsSection === tab.id ? 'true' : 'false'}"
          onclick="setSettingsSection('${tab.id}')"
        >${tab.label}</button>
      `).join('')}
    </span>
  `;
}

function switchView(view) {
  state.currentView = view;
  renderSidebarLists();
  renderCurrentView();
  closeSidebar();
}

function closeGraphToolsMenu() {
  const tools = document.getElementById('graph-tools');
  const trigger = document.getElementById('top-graph-tools-btn');
  if (!tools || !trigger) return;
  tools.classList.remove('open');
  trigger.setAttribute('aria-expanded', 'false');
}

function toggleGraphToolsMenu(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const tools = document.getElementById('graph-tools');
  const trigger = document.getElementById('top-graph-tools-btn');
  if (!tools || !trigger) return;
  const willOpen = !tools.classList.contains('open');
  tools.classList.toggle('open', willOpen);
  trigger.setAttribute('aria-expanded', String(willOpen));
}

function openGraphTemplates() {
  closeGraphToolsMenu();
  openProjectTemplateManage();
}

function openGraphRecurring() {
  closeGraphToolsMenu();
  openRecurringManage();
}

function renderBoard() {
  const wk = weekKey(state.weekOffset);
  ensureDayProjectsWeek(wk);
  document.getElementById('week-label').textContent = weekLabel(state.weekOffset);
  document.getElementById('week-label-mobile').textContent = weekLabelShort(state.weekOffset);
  renderStats();
  renderSidebarSummary();
  renderSidebarLists();

  const todayDayIdx = state.weekOffset === 0 ? todayDayIndex() : -1;
  let html = '<tr><th class="group-head"></th>';
  DAYS.forEach((day, dayIdx) => {
    const width = getDayColumnWidth(dayIdx);
    const isToday = dayIdx === todayDayIdx;
    html += `<th class="day-head${isToday ? ' today' : ''}" style="width:${width}px;min-width:${width}px;max-width:${width}px">
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
      html += `<td class="day-cell" style="width:${width}px;min-width:${width}px;max-width:${width}px" ondragover="allowProjectDrop(event)" ondragleave="leaveDayCell(event)" ondrop="dropProject(event, decodeInlineToken('${inlineToken(group.id)}'), ${dayIdx})"><div class="day-stack">`;

      projectIds.forEach(subId => {
        const project = getSub(subId);
        if (!project) return;
        const tasks = getDisplayTasksForCell(wk, subId, dayIdx);
        html += `<div class="project-card" style="--project-line:${project.color}" draggable="true" ondragstart="dragProject(event, decodeInlineToken('${inlineToken(group.id)}'), ${dayIdx}, decodeInlineToken('${inlineToken(subId)}'))" ondragover="allowProjectDrop(event)" ondrop="dropProjectOnCard(event, decodeInlineToken('${inlineToken(group.id)}'), ${dayIdx}, decodeInlineToken('${inlineToken(subId)}'))">
          <div class="project-card-head">
            <div class="project-title">${escapeHtml(project.label)}</div>
            <button class="project-remove-btn" type="button" onclick="removeProjectFromDay(decodeInlineToken('${inlineToken(group.id)}'), ${dayIdx}, decodeInlineToken('${inlineToken(subId)}'))">×</button>
          </div>
          <div class="task-list" ondragover="allowDrop(event)" ondrop="dropTask(event, decodeInlineToken('${inlineToken(subId)}'), ${dayIdx})">`;

        tasks.forEach(task => {
          const noteBadge = task.note?.trim()
            ? `<button class="note-badge" type="button" onclick="openTaskDetailsById(event, decodeInlineToken('${inlineToken(task.id)}'))">📝</button>`
            : '';
          const action = task.recurring
            ? '<span class="task-icon" title="Постоянная задача">∞</span>'
            : '';
          html += `<div class="task-item${task.done ? ' done' : ''}" ${task.recurring ? '' : `draggable="true" ondragstart="dragTask(event, decodeInlineToken('${inlineToken(task.id)}'))"`}>
            <input type="checkbox" ${task.done ? 'checked' : ''} onchange="toggleById(decodeInlineToken('${inlineToken(task.id)}'))">
            <button class="task-text" type="button" onclick="openTaskDetailsById(event, decodeInlineToken('${inlineToken(task.id)}'))">${escapeHtml(task.text)}</button>
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
          html += `<button class="task-entry-trigger" type="button" onclick="openInlineTask(decodeInlineToken('${inlineToken(subId)}'), ${dayIdx})"></button>`;
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
        <div class="tasks-project-grid" ondragover="allowTasksGridDrop(event)" ondrop="dropProjectOnTasksGrid(event, decodeInlineToken('${inlineToken(group.id)}'))" ondragleave="leaveTasksGrid(event)">
          ${projects.map(project => {
            const rawTasks = getBacklogForProject(project.id);
            const tasks = [...rawTasks.filter(t => !t.done), ...rawTasks.filter(t => t.done)];
            return `
              <article class="tasks-project-card" style="--project-line:${project.color}" draggable="true" ondragstart="dragTasksCard(event, decodeInlineToken('${inlineToken(group.id)}'), decodeInlineToken('${inlineToken(project.id)}'))" ondragover="allowTasksCardDrop(event)" ondrop="dropProjectOnTasksCard(event, decodeInlineToken('${inlineToken(group.id)}'), decodeInlineToken('${inlineToken(project.id)}'))" ondragleave="leaveTasksCard(event)">
                <div class="tasks-project-head">
                  <div class="tasks-project-title">${escapeHtml(project.label)}</div>
                  <button class="tasks-project-remove" type="button" onclick="removeProjectFromTasks(decodeInlineToken('${inlineToken(group.id)}'), decodeInlineToken('${inlineToken(project.id)}'))" title="Убрать проект из страницы задач">×</button>
                </div>
                <div class="tasks-project-list">
                  ${tasks.length ? tasks.map(task => `
                    <div class="task-item task-item-backlog${task.done ? ' done' : ''}">
                      <input type="checkbox" ${task.done ? 'checked' : ''} onchange="toggleById(decodeInlineToken('${inlineToken(task.id)}'))">
                      <button class="task-text" type="button" onclick="openTaskDetailsById(event, decodeInlineToken('${inlineToken(task.id)}'))">${escapeHtml(task.text)}</button>
                      ${task.note?.trim() ? `<div class="task-tools"><button class="note-badge" type="button" onclick="openTaskDetailsById(event, decodeInlineToken('${inlineToken(task.id)}'))">📝</button></div>` : ''}
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
                  ` : `<button class="task-entry-trigger" type="button" onclick="openInlineBacklogTask(decodeInlineToken('${inlineToken(project.id)}'))"></button>`}
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

function normalizeProjectNote(note) {
  return {
    id: String(note?.id || ''),
    projectId: String(note?.projectId || ''),
    sectionId: String(note?.sectionId || ''),
    title: String(note?.title || ''),
    body: String(note?.body || ''),
    sortOrder: Number(note?.sortOrder || 0),
    createdAt: note?.createdAt || '',
    updatedAt: note?.updatedAt || '',
  };
}

function normalizeProjectNoteSection(section) {
  return {
    id: String(section?.id || ''),
    projectId: String(section?.projectId || ''),
    name: String(section?.name || ''),
    sortOrder: Number(section?.sortOrder || 0),
    createdAt: section?.createdAt || '',
    updatedAt: section?.updatedAt || '',
  };
}

function formatProjectNoteDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function getProjectWorkspaceStats(projectId) {
  const weeklyTasks = Object.values(state.data[weekKey(0)]?.[projectId] || {}).flat();
  const backlogTasks = state.backlog[projectId] || [];
  return {
    openWeeklyTasks: weeklyTasks.filter(task => !task.done).length,
    backlogTasks: backlogTasks.filter(task => !task.done).length,
  };
}

function renderProjectTopBarTitle(project) {
  const pageTitle = document.getElementById('page-title');
  if (!pageTitle || !project) return;
  const notes = projectNotesByProject[project.id] || [];
  const stats = getProjectWorkspaceStats(project.id);

  pageTitle.innerHTML = `
    <span class="project-topbar-name">
      <span class="project-page-title-dot" style="background:${project.color}"></span>
      <span>${escapeHtml(project.label)}</span>
    </span>
    <span class="project-topbar-metrics" aria-label="Сводка проекта">
      <span><strong>${notes.length}</strong> заметок</span>
      <span><strong>${stats.openWeeklyTasks}</strong> в неделе</span>
      <span><strong>${stats.backlogTasks}</strong> в списке</span>
    </span>
  `;
}

function renderProjectNoteCards(project, sections, notes) {
  if (projectNotesError) {
    return `
      <div class="project-notes-state project-notes-error-state">
        <div class="project-notes-state-title">Не удалось загрузить заметки</div>
        <div class="project-notes-state-copy">${escapeHtml(projectNotesError)}</div>
        <button type="button" onclick="retryProjectNotes()">Повторить</button>
      </div>
    `;
  }

  if (projectNotesLoadingProjectId === project.id && !sections.length) {
    return `<div class="project-board-scroll" aria-label="Загрузка разделов">
      <div class="project-board project-board-loading">
        ${[0, 1, 2].map(index => `
          <div class="project-note-column project-note-skeleton-column" style="--note-delay:${index * 55}ms">
            <span></span><span></span><span></span>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  if (!sections.length) {
    return `
      <button class="project-notes-empty" type="button" onclick="openProjectNoteSectionModal()">
        <span class="project-notes-empty-mark" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="18" rx="1.5"/><line x1="6.5" y1="7" x2="6.5" y2="13"/><line x1="17.5" y1="7" x2="17.5" y2="10"/></svg>
        </span>
        <span class="project-notes-state-title">Добавить первый раздел</span>
        <span class="project-notes-state-copy">Например: «Идеи», «Доступы», «Материалы» или «Решения».</span>
      </button>
    `;
  }

  return `<div class="project-board-scroll">
    <div class="project-board">
      ${sections.map((section, sectionIndex) => {
        const sectionNotes = notes.filter(note => note.sectionId === section.id);
        const sectionToken = inlineToken(section.id);
        return `
          <section
            class="project-note-column"
            data-project-note-section-id="${escapeHtml(section.id)}"
            style="--column-delay:${Math.min(sectionIndex, 8) * 45}ms"
            ondragover="allowProjectSectionDrop(event, decodeInlineToken('${sectionToken}'))"
            ondragleave="leaveProjectBoardDrop(event)"
            ondrop="dropProjectSection(event, decodeInlineToken('${sectionToken}'))"
          >
            <header
              class="project-note-column-header"
              draggable="true"
              ondragstart="startProjectSectionDrag(event, decodeInlineToken('${sectionToken}'))"
              ondragend="endProjectBoardDrag(event)"
            >
              <span class="project-note-column-drag" aria-hidden="true" title="Перетащить раздел">
                <i></i><i></i><i></i><i></i><i></i><i></i>
              </span>
              <button class="project-note-column-title" type="button" onclick="openProjectNoteSectionModal(decodeInlineToken('${sectionToken}'))">
                <span>${escapeHtml(section.name)}</span>
                <span class="project-note-column-count">${sectionNotes.length}</span>
              </button>
              <button class="project-note-column-settings" type="button" onclick="openProjectNoteSectionModal(decodeInlineToken('${sectionToken}'))" aria-label="Настройки раздела ${escapeHtml(section.name)}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
              </button>
            </header>
            <div
              class="project-note-column-list"
              ondragover="allowProjectNoteListDrop(event, decodeInlineToken('${sectionToken}'))"
              ondragleave="leaveProjectBoardDrop(event)"
              ondrop="dropProjectNote(event, decodeInlineToken('${sectionToken}'))"
            >
              ${sectionNotes.map((note, noteIndex) => {
                const preview = note.body.trim().replace(/\s+/g, ' ').slice(0, 220);
                return `
                  <button
                    class="project-note-card"
                    type="button"
                    draggable="true"
                    data-project-note-id="${escapeHtml(note.id)}"
                    style="--project-note-color:${project.color};--note-delay:${Math.min(noteIndex, 8) * 35}ms"
                    onclick="openProjectNoteFromBoard(decodeInlineToken('${inlineToken(note.id)}'))"
                    ondragstart="startProjectNoteDrag(event, decodeInlineToken('${inlineToken(note.id)}'), decodeInlineToken('${sectionToken}'))"
                    ondragover="allowProjectNoteCardDrop(event, decodeInlineToken('${inlineToken(note.id)}'), decodeInlineToken('${sectionToken}'))"
                    ondragleave="leaveProjectBoardDrop(event)"
                    ondrop="dropProjectNote(event, decodeInlineToken('${sectionToken}'), decodeInlineToken('${inlineToken(note.id)}'))"
                    ondragend="endProjectBoardDrag(event)"
                  >
                    <span class="project-note-card-drag" aria-hidden="true" title="Перетащить заметку">
                      <i></i><i></i><i></i><i></i><i></i><i></i>
                    </span>
                    <span class="project-note-card-title">${escapeHtml(note.title)}</span>
                    ${preview ? `<span class="project-note-card-preview">${escapeHtml(preview)}</span>` : ''}
                    <span class="project-note-card-footer">
                      <span>${escapeHtml(formatProjectNoteDate(note.updatedAt || note.createdAt))}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </span>
                  </button>
                `;
              }).join('')}
            </div>
            <button class="project-note-column-add" type="button" onclick="openProjectNoteModal(null, decodeInlineToken('${sectionToken}'))">
              <span aria-hidden="true">+</span> Добавить заметку
            </button>
          </section>
        `;
      }).join('')}
      <button class="project-note-add-column" type="button" onclick="openProjectNoteSectionModal()">
        <span aria-hidden="true">+</span>
        <span>Добавить раздел</span>
      </button>
    </div>
  </div>`;
}

function openProjectNoteFromBoard(noteId) {
  if (Date.now() < _projectBoardSuppressClickUntil) return;
  openProjectNoteModal(noteId);
}

function clearProjectBoardDropState() {
  document.querySelectorAll(
    '.project-note-column.is-drop-before, .project-note-column.is-drop-after, .project-note-column.is-note-drop-target, .project-note-card.is-drop-before, .project-note-card.is-drop-after',
  ).forEach(node => node.classList.remove(
    'is-drop-before',
    'is-drop-after',
    'is-note-drop-target',
  ));
}

function startProjectSectionDrag(event, sectionId) {
  if (event.target.closest('button')) {
    event.preventDefault();
    return;
  }
  _projectBoardDrag = { type: 'section', id: sectionId };
  _projectBoardSuppressClickUntil = Date.now() + 350;
  event.currentTarget.closest('.project-note-column')?.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', `project-section:${sectionId}`);
}

function startProjectNoteDrag(event, noteId, sectionId) {
  event.stopPropagation();
  _projectBoardDrag = { type: 'note', id: noteId, sectionId };
  _projectBoardSuppressClickUntil = Date.now() + 350;
  event.currentTarget.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', `project-note:${noteId}`);
}

function endProjectBoardDrag(event) {
  event?.currentTarget?.classList.remove('is-dragging');
  document.querySelectorAll('.project-note-column.is-dragging, .project-note-card.is-dragging')
    .forEach(node => node.classList.remove('is-dragging'));
  clearProjectBoardDropState();
  _projectBoardDrag = null;
  _projectBoardSuppressClickUntil = Date.now() + 250;
}

function allowProjectSectionDrop(event, sectionId) {
  if (_projectBoardDrag?.type !== 'section' || _projectBoardDrag.id === sectionId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  clearProjectBoardDropState();
  const column = event.currentTarget;
  const position = event.clientX >= column.getBoundingClientRect().left + column.offsetWidth / 2
    ? 'after'
    : 'before';
  _projectBoardDropPosition = position;
  column.classList.add(position === 'after' ? 'is-drop-after' : 'is-drop-before');
}

function allowProjectNoteListDrop(event, sectionId) {
  if (_projectBoardDrag?.type !== 'note') return;
  if (event.target.closest('.project-note-card')) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = 'move';
  clearProjectBoardDropState();
  event.currentTarget.closest('.project-note-column')?.classList.add('is-note-drop-target');
  _projectBoardDropPosition = 'after';
}

function allowProjectNoteCardDrop(event, noteId, sectionId) {
  if (_projectBoardDrag?.type !== 'note' || _projectBoardDrag.id === noteId) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = 'move';
  clearProjectBoardDropState();
  const card = event.currentTarget;
  const position = event.clientY >= card.getBoundingClientRect().top + card.offsetHeight / 2
    ? 'after'
    : 'before';
  _projectBoardDropPosition = position;
  card.classList.add(position === 'after' ? 'is-drop-after' : 'is-drop-before');
  card.closest('.project-note-column')?.classList.add('is-note-drop-target');
}

function leaveProjectBoardDrop(event) {
  if (event.currentTarget.contains(event.relatedTarget)) return;
  event.currentTarget.classList.remove('is-drop-before', 'is-drop-after', 'is-note-drop-target');
}

function buildProjectBoardOrderPayload(projectId) {
  const sections = projectNoteSectionsByProject[projectId] || [];
  const notes = projectNotesByProject[projectId] || [];
  return {
    sectionIds: sections.map(section => section.id),
    notes: sections.flatMap(section => notes
      .filter(note => note.sectionId === section.id)
      .map(note => ({ id: note.id, sectionId: section.id }))),
  };
}

function commitProjectBoardOrder(projectId) {
  const revision = ++_projectBoardOrderRevision;
  const payload = buildProjectBoardOrderPayload(projectId);
  document.querySelector('.project-board')?.classList.add('is-saving-order');

  _projectBoardSaveQueue = _projectBoardSaveQueue
    .catch(() => undefined)
    .then(async () => {
      const board = await apiJson(`/api/projects/${encodeURIComponent(projectId)}/notes/reorder`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (revision !== _projectBoardOrderRevision) return;
      projectNoteSectionsByProject[projectId] = (board?.sections || []).map(normalizeProjectNoteSection);
      projectNotesByProject[projectId] = (board?.notes || []).map(normalizeProjectNote);
      if (state.currentView === 'project' && activeProjectId === projectId) {
        renderProjectWorkspaceView();
      }
      void markProjectActivity(projectId, 'WORK');
    })
    .catch(async error => {
      console.error(error);
      if (revision !== _projectBoardOrderRevision) return;
      try {
        const board = await apiJson(`/api/projects/${encodeURIComponent(projectId)}/notes`, {
          method: 'GET',
          headers: {},
        });
        projectNoteSectionsByProject[projectId] = (board?.sections || []).map(normalizeProjectNoteSection);
        projectNotesByProject[projectId] = (board?.notes || []).map(normalizeProjectNote);
      } catch (reloadError) {
        console.error(reloadError);
      }
      if (state.currentView === 'project' && activeProjectId === projectId) {
        renderProjectWorkspaceView();
      }
      showToast('Не удалось сохранить порядок');
    });
}

function dropProjectSection(event, targetSectionId) {
  if (_projectBoardDrag?.type !== 'section') return;
  event.preventDefault();
  event.stopPropagation();
  const projectId = activeProjectId;
  const movingSectionId = _projectBoardDrag.id;
  const sections = [...(projectNoteSectionsByProject[projectId] || [])];
  if (!projectId || movingSectionId === targetSectionId) {
    endProjectBoardDrag(event);
    return;
  }
  const moving = sections.find(section => section.id === movingSectionId);
  const nextSections = sections.filter(section => section.id !== movingSectionId);
  let targetIndex = nextSections.findIndex(section => section.id === targetSectionId);
  if (!moving || targetIndex < 0) {
    endProjectBoardDrag(event);
    return;
  }
  if (_projectBoardDropPosition === 'after') targetIndex += 1;
  nextSections.splice(targetIndex, 0, moving);
  projectNoteSectionsByProject[projectId] = nextSections.map((section, sortOrder) => ({ ...section, sortOrder }));
  endProjectBoardDrag(event);
  renderProjectWorkspaceView();
  commitProjectBoardOrder(projectId);
}

function dropProjectNote(event, targetSectionId, targetNoteId = null) {
  if (_projectBoardDrag?.type !== 'note') return;
  event.preventDefault();
  event.stopPropagation();
  const projectId = activeProjectId;
  const movingNoteId = _projectBoardDrag.id;
  if (targetNoteId === movingNoteId) {
    endProjectBoardDrag(event);
    return;
  }
  const sections = projectNoteSectionsByProject[projectId] || [];
  const notes = projectNotesByProject[projectId] || [];
  const moving = notes.find(note => note.id === movingNoteId);
  if (!projectId || !moving || !sections.some(section => section.id === targetSectionId)) {
    endProjectBoardDrag(event);
    return;
  }

  const notesBySection = new Map(sections.map(section => [
    section.id,
    notes.filter(note => note.sectionId === section.id && note.id !== movingNoteId),
  ]));
  const targetNotes = notesBySection.get(targetSectionId) || [];
  let targetIndex = targetNoteId ? targetNotes.findIndex(note => note.id === targetNoteId) : targetNotes.length;
  if (targetIndex < 0) targetIndex = targetNotes.length;
  if (targetNoteId && _projectBoardDropPosition === 'after') targetIndex += 1;
  targetNotes.splice(targetIndex, 0, { ...moving, sectionId: targetSectionId });
  notesBySection.set(targetSectionId, targetNotes);

  const orderedNoteIds = new Set();
  const orderedNotes = sections.flatMap(section => (notesBySection.get(section.id) || []).map((note, sortOrder) => {
    orderedNoteIds.add(note.id);
    return { ...note, sectionId: section.id, sortOrder };
  }));
  const orphanNotes = notes.filter(note => !orderedNoteIds.has(note.id));
  projectNotesByProject[projectId] = [...orderedNotes, ...orphanNotes];

  endProjectBoardDrag(event);
  renderProjectWorkspaceView();
  commitProjectBoardOrder(projectId);
}

function renderProjectWorkspaceView() {
  const root = document.getElementById('project-view');
  const project = getSub(activeProjectId);
  if (!root || !project) return;
  const notes = projectNotesByProject[project.id] || [];
  const sections = projectNoteSectionsByProject[project.id] || [];
  renderProjectTopBarTitle(project);

  root.innerHTML = `
    <div class="project-workspace-shell">
      <div class="project-workspace-label">Рабочее пространство</div>

      <section class="project-notes-section">
        ${renderProjectNoteCards(project, sections, notes)}
      </section>
    </div>
  `;
}

function formatProjectActivityLabel(project) {
  if (!project.lastActivityAt) return 'Активность ещё не записана';
  const date = new Date(project.lastActivityAt);
  if (Number.isNaN(date.getTime())) return 'Активность ещё не записана';
  const elapsedDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (elapsedDays <= 0) return 'Сегодня';
  if (elapsedDays === 1) return 'Вчера';
  if (elapsedDays < 7) return `${elapsedDays} дн. назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function renderGroupWorkspaceView() {
  const root = document.getElementById('group-view');
  const group = getGroup(activeGroupId);
  if (!root || !group) return;
  const projects = state.subs.filter(project => project.group === group.id);

  root.innerHTML = `
    <div class="group-workspace-shell">
      <header class="group-workspace-header">
        <div>
          <div class="group-workspace-kicker">Рабочее пространство группы</div>
          <h1>${escapeHtml(group.label)}</h1>
          <p>Все активные проекты этой группы в одном месте.</p>
        </div>
        <div class="group-workspace-count"><strong>${projects.length}</strong><span>проектов</span></div>
      </header>

      <section class="group-projects-panel">
        <div class="group-projects-toolbar">
          <div>
            <strong>Проекты</strong>
            <span id="group-projects-result-count">${projects.length}</span>
          </div>
          <label class="group-project-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></svg>
            <input type="search" value="${escapeHtml(groupProjectQuery)}" placeholder="Найти проект" oninput="filterGroupProjects(this.value)" />
          </label>
        </div>
        <div class="group-project-list" id="group-project-list">
          ${projects.length ? projects.map(project => {
            const stats = getProjectWorkspaceStats(project.id);
            return `
              <article class="group-project-row" data-project-search="${escapeHtml(project.label.toLocaleLowerCase('ru-RU'))}">
                <button class="group-project-main" type="button" onclick="openProjectWorkspace(decodeInlineToken('${inlineToken(project.id)}'))">
                  <span class="group-project-icon" style="--project-color:${project.color}" aria-hidden="true"><i></i><i></i><i></i></span>
                  <span class="group-project-copy">
                    <strong>${escapeHtml(project.label)}</strong>
                    <small>${escapeHtml(formatProjectActivityLabel(project))}</small>
                  </span>
                </button>
                <div class="group-project-stats">
                  <span><b>${stats.openWeeklyTasks}</b> в неделе</span>
                  <span><b>${stats.backlogTasks}</b> в списке</span>
                </div>
                <button class="group-project-settings" type="button" onclick="openManage(decodeInlineToken('${inlineToken(project.id)}'))" aria-label="Настройки проекта ${escapeHtml(project.label)}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
                </button>
              </article>
            `;
          }).join('') : `
            <button class="group-projects-empty" type="button" onclick="openManage(null, decodeInlineToken('${inlineToken(group.id)}'))">
              <span>В этой группе пока нет проектов</span>
              <small>Создать первый проект</small>
            </button>
          `}
        </div>
        <div class="group-projects-no-results" id="group-projects-no-results" style="display:none">Проекты не найдены.</div>
      </section>
    </div>
  `;
  if (groupProjectQuery) filterGroupProjects(groupProjectQuery);
}

function filterGroupProjects(value) {
  groupProjectQuery = String(value || '').trim().toLocaleLowerCase('ru-RU');
  const rows = [...document.querySelectorAll('#group-project-list .group-project-row')];
  let visibleCount = 0;
  rows.forEach(row => {
    const visible = !groupProjectQuery || row.dataset.projectSearch.includes(groupProjectQuery);
    row.style.display = visible ? 'grid' : 'none';
    if (visible) visibleCount++;
  });
  const count = document.getElementById('group-projects-result-count');
  if (count) count.textContent = String(visibleCount);
  const empty = document.getElementById('group-projects-no-results');
  if (empty) empty.style.display = rows.length && visibleCount === 0 ? 'block' : 'none';
}

function openGroupWorkspace(groupId) {
  if (!getGroup(groupId)) return;
  activeGroupId = groupId;
  activeProjectId = null;
  cancelGroupFlyoutClose();
  sidebarGroupFlyoutId = null;
  groupProjectQuery = '';
  state.currentView = 'group';
  state.ui.groupsOpen = true;
  renderSidebarLists();
  renderCurrentView();
  closeSidebar();
}

async function openProjectWorkspace(projectId, options = {}) {
  const project = getSub(projectId);
  if (!project) return;

  activeProjectId = projectId;
  activeGroupId = null;
  state.currentView = 'project';
  state.ui.projectsOpen = true;
  projectNotesError = '';
  projectNotesLoadingProjectId = projectId;
  renderSidebarLists();
  renderCurrentView();
  closeSidebar();
  if (options.trackActivity !== false) {
    void markProjectActivity(projectId, 'OPEN');
  }

  try {
    const board = await apiJson(`/api/projects/${encodeURIComponent(projectId)}/notes`, {
      method: 'GET',
      headers: {},
    });
    projectNoteSectionsByProject[projectId] = (board?.sections || []).map(normalizeProjectNoteSection);
    projectNotesByProject[projectId] = (board?.notes || []).map(normalizeProjectNote);
  } catch (error) {
    console.error(error);
    if (activeProjectId === projectId) {
      projectNotesError = 'Проверь соединение и попробуй ещё раз.';
    }
  } finally {
    if (projectNotesLoadingProjectId === projectId) {
      projectNotesLoadingProjectId = null;
    }
    if (state.currentView === 'project' && activeProjectId === projectId) {
      renderSidebarLists();
      renderCurrentView();
    }
  }
}

function retryProjectNotes() {
  if (activeProjectId) openProjectWorkspace(activeProjectId);
}

function setProjectNoteError(message = '') {
  const node = document.getElementById('project-note-error');
  node.textContent = message;
  node.style.display = message ? 'block' : 'none';
}

function openProjectNoteModal(noteId = null, sectionId = null) {
  if (!activeProjectId) return;
  const sections = projectNoteSectionsByProject[activeProjectId] || [];
  if (!sections.length) {
    openProjectNoteSectionModal();
    return;
  }
  const note = noteId
    ? (projectNotesByProject[activeProjectId] || []).find(item => item.id === noteId)
    : null;
  if (noteId && !note) return;
  const selectedSectionId = note?.sectionId || sectionId || sections[0].id;

  manageProjectNoteId = note?.id || null;
  document.getElementById('project-note-modal-title').textContent = note ? 'Редактировать заметку' : 'Новая заметка';
  document.getElementById('project-note-title').value = note?.title || '';
  document.getElementById('project-note-section-select').innerHTML = sections.map(section => `
    <option value="${escapeHtml(section.id)}"${section.id === selectedSectionId ? ' selected' : ''}>${escapeHtml(section.name)}</option>
  `).join('');
  document.getElementById('project-note-body').value = note?.body || '';
  document.getElementById('project-note-delete-btn').style.display = note ? 'inline-flex' : 'none';
  document.getElementById('project-note-save-btn').textContent = note ? 'Сохранить' : 'Создать';
  setProjectNoteError('');
  document.getElementById('project-note-modal').classList.add('open');
  setTimeout(() => document.getElementById('project-note-title')?.focus(), 20);
}

function closeProjectNoteModal() {
  document.getElementById('project-note-modal').classList.remove('open');
  manageProjectNoteId = null;
  setProjectNoteError('');
}

async function saveProjectNote() {
  if (!activeProjectId) return;
  const projectId = activeProjectId;
  const noteId = manageProjectNoteId;
  const title = document.getElementById('project-note-title').value.trim();
  const sectionId = document.getElementById('project-note-section-select').value;
  const body = document.getElementById('project-note-body').value.trim();
  if (!title) {
    setProjectNoteError('Добавь название заметки.');
    return;
  }
  if (!sectionId) {
    setProjectNoteError('Выбери раздел для заметки.');
    return;
  }

  const saveButton = document.getElementById('project-note-save-btn');
  saveButton.disabled = true;
  saveButton.textContent = 'Сохраняем...';
  setProjectNoteError('');

  try {
    const saved = await apiJson(
      noteId ? `/api/project-notes/${encodeURIComponent(noteId)}` : `/api/projects/${encodeURIComponent(projectId)}/notes`,
      {
        method: noteId ? 'PATCH' : 'POST',
        body: JSON.stringify({ sectionId, title, body }),
      },
    );
    const normalized = normalizeProjectNote(saved);
    const notes = projectNotesByProject[projectId] || [];
    projectNotesByProject[projectId] = noteId
      ? notes.map(note => note.id === noteId ? normalized : note)
      : [...notes, normalized];
    closeProjectNoteModal();
    void markProjectActivity(projectId, 'WORK');
    if (state.currentView === 'project' && activeProjectId === projectId) {
      renderProjectWorkspaceView();
    }
    showToast(noteId ? 'Заметка сохранена' : 'Заметка создана');
  } catch (error) {
    console.error(error);
    setProjectNoteError('Не удалось сохранить заметку. Попробуй ещё раз.');
  } finally {
    saveButton.disabled = false;
    if (document.getElementById('project-note-modal').classList.contains('open')) {
      saveButton.textContent = noteId ? 'Сохранить' : 'Создать';
    }
  }
}

function deleteProjectNote() {
  if (!activeProjectId || !manageProjectNoteId) return;
  const projectId = activeProjectId;
  const noteId = manageProjectNoteId;
  const note = (projectNotesByProject[projectId] || []).find(item => item.id === noteId);

  openConfirmModal({
    title: 'Удалить заметку',
    message: `Удалить заметку${note?.title ? ` «${note.title}»` : ''}? Это действие нельзя отменить.`,
    confirmText: 'Удалить',
    danger: true,
    onConfirm: async () => {
      try {
        await apiJson(`/api/project-notes/${encodeURIComponent(noteId)}`, {
          method: 'DELETE',
          headers: {},
        });
        projectNotesByProject[projectId] = (projectNotesByProject[projectId] || []).filter(item => item.id !== noteId);
        closeProjectNoteModal();
        if (state.currentView === 'project' && activeProjectId === projectId) {
          renderProjectWorkspaceView();
        }
        showToast('Заметка удалена');
      } catch (error) {
        console.error(error);
        setProjectNoteError('Не удалось удалить заметку.');
      }
    },
  });
}

function setProjectNoteSectionError(message = '') {
  const node = document.getElementById('project-note-section-error');
  node.textContent = message;
  node.style.display = message ? 'block' : 'none';
}

function openProjectNoteSectionModal(sectionId = null) {
  if (!activeProjectId) return;
  const section = sectionId
    ? (projectNoteSectionsByProject[activeProjectId] || []).find(item => item.id === sectionId)
    : null;
  if (sectionId && !section) return;

  manageProjectNoteSectionId = section?.id || null;
  document.getElementById('project-note-section-modal-title').textContent = section ? 'Настройки раздела' : 'Новый раздел';
  document.getElementById('project-note-section-name').value = section?.name || '';
  document.getElementById('project-note-section-delete-btn').style.display = section ? 'inline-flex' : 'none';
  document.getElementById('project-note-section-save-btn').textContent = section ? 'Сохранить' : 'Создать';
  setProjectNoteSectionError('');
  document.getElementById('project-note-section-modal').classList.add('open');
  setTimeout(() => document.getElementById('project-note-section-name')?.focus(), 20);
}

function closeProjectNoteSectionModal() {
  document.getElementById('project-note-section-modal').classList.remove('open');
  manageProjectNoteSectionId = null;
  setProjectNoteSectionError('');
}

async function saveProjectNoteSection() {
  if (!activeProjectId) return;
  const projectId = activeProjectId;
  const sectionId = manageProjectNoteSectionId;
  const name = document.getElementById('project-note-section-name').value.trim();
  if (!name) {
    setProjectNoteSectionError('Добавь название раздела.');
    return;
  }

  const saveButton = document.getElementById('project-note-section-save-btn');
  saveButton.disabled = true;
  saveButton.textContent = 'Сохраняем...';
  setProjectNoteSectionError('');

  try {
    const saved = await apiJson(
      sectionId
        ? `/api/project-note-sections/${encodeURIComponent(sectionId)}`
        : `/api/projects/${encodeURIComponent(projectId)}/note-sections`,
      {
        method: sectionId ? 'PATCH' : 'POST',
        body: JSON.stringify({ name }),
      },
    );
    const normalized = normalizeProjectNoteSection(saved);
    const sections = projectNoteSectionsByProject[projectId] || [];
    projectNoteSectionsByProject[projectId] = sectionId
      ? sections.map(item => item.id === sectionId ? normalized : item)
      : [...sections, normalized];
    closeProjectNoteSectionModal();
    void markProjectActivity(projectId, 'WORK');
    if (state.currentView === 'project' && activeProjectId === projectId) {
      renderProjectWorkspaceView();
    }
    showToast(sectionId ? 'Раздел сохранён' : 'Раздел создан');
  } catch (error) {
    console.error(error);
    setProjectNoteSectionError('Не удалось сохранить раздел. Попробуй ещё раз.');
  } finally {
    saveButton.disabled = false;
    if (document.getElementById('project-note-section-modal').classList.contains('open')) {
      saveButton.textContent = sectionId ? 'Сохранить' : 'Создать';
    }
  }
}

function deleteProjectNoteSection() {
  if (!activeProjectId || !manageProjectNoteSectionId) return;
  const projectId = activeProjectId;
  const sectionId = manageProjectNoteSectionId;
  const section = (projectNoteSectionsByProject[projectId] || []).find(item => item.id === sectionId);
  const noteCount = (projectNotesByProject[projectId] || []).filter(note => note.sectionId === sectionId).length;

  if (noteCount > 0) {
    setProjectNoteSectionError('Сначала перенеси или удали заметки из этого раздела.');
    return;
  }

  openConfirmModal({
    title: 'Удалить раздел',
    message: `Удалить раздел${section?.name ? ` «${section.name}»` : ''}? Это действие нельзя отменить.`,
    confirmText: 'Удалить',
    danger: true,
    onConfirm: async () => {
      try {
        await apiJson(`/api/project-note-sections/${encodeURIComponent(sectionId)}`, {
          method: 'DELETE',
          headers: {},
        });
        projectNoteSectionsByProject[projectId] = (projectNoteSectionsByProject[projectId] || [])
          .filter(item => item.id !== sectionId);
        closeProjectNoteSectionModal();
        if (state.currentView === 'project' && activeProjectId === projectId) {
          renderProjectWorkspaceView();
        }
        showToast('Раздел удалён');
      } catch (error) {
        console.error(error);
        setProjectNoteSectionError(
          error instanceof Error && error.message === 'PROJECT_NOTE_SECTION_NOT_EMPTY'
            ? 'Сначала перенеси или удали заметки из этого раздела.'
            : 'Не удалось удалить раздел.',
        );
      }
    },
  });
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
                          <button class="wins-project-remove" type="button" onclick="removeProjectFromWins('${year}', decodeInlineToken('${inlineToken(group.id)}'), decodeInlineToken('${inlineToken(project.id)}'))" title="Убрать проект из достижений">×</button>
                        </div>
                        <div class="wins-project-list">
                          ${items.map(item => `
                            <button class="wins-item" type="button" onclick="openAchievementModal(decodeInlineToken('${inlineToken(item.id)}'))">
                              <span class="wins-item-text">${escapeHtml(item.text)}</span>
                              <span class="wins-item-date">${escapeHtml(formatAchievementDate(item.date))}</span>
                            </button>
                          `).join('')}
                          <button class="task-entry-trigger wins-add-trigger" type="button" onclick="openAchievementModalForProject('${year}', decodeInlineToken('${inlineToken(project.id)}'))"></button>
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

function renderArchiveView() {
  const archivedGroups = state.archivedCatalog.groups || [];
  const archivedProjects = state.archivedCatalog.subs || [];
  const root = document.getElementById('archive-view');
  if (!root) return;

  root.innerHTML = `
    <div class="archive-workspace-shell">
      <header class="archive-workspace-header">
        <div>
          <div class="archive-workspace-kicker">Хранилище</div>
          <h1>Архив проектов</h1>
          <p>Проекты здесь не мешают работе, но сохраняют свои задачи, заметки и разделы.</p>
        </div>
        <div class="archive-workspace-count"><strong>${archivedProjects.length}</strong><span>в архиве</span></div>
      </header>

      <section class="archive-projects-panel">
        <div class="archive-projects-title">Проекты</div>
        ${archivedProjects.length ? archivedProjects.map(project => {
          const group = state.groups.find(item => item.id === project.group)
            || archivedGroups.find(item => item.id === project.group);
          return `
            <article class="archive-project-row">
              <span class="group-project-icon" style="--project-color:${project.color}" aria-hidden="true"><i></i><i></i><i></i></span>
              <div class="archive-project-copy">
                <strong>${escapeHtml(project.label)}</strong>
                <small>${escapeHtml(group?.label || 'Без группы')} · сохранён целиком</small>
              </div>
              <button type="button" onclick="restoreArchivedProject(decodeInlineToken('${inlineToken(project.id)}'))">Восстановить</button>
            </article>
          `;
        }).join('') : '<div class="archive-projects-empty">В архиве пока нет проектов.</div>'}
      </section>

      ${archivedGroups.length ? `
        <section class="archive-groups-panel">
          <div class="archive-projects-title">Архивные группы</div>
          ${archivedGroups.map(group => `
            <div class="archive-project-row">
              <span class="sidebar-group-avatar" style="--group-color:${group.color}">${escapeHtml(group.label.slice(0, 1).toUpperCase())}</span>
              <div class="archive-project-copy"><strong>${escapeHtml(group.label)}</strong><small>Группа</small></div>
              <button type="button" onclick="restoreArchivedGroup(decodeInlineToken('${inlineToken(group.id)}'))">Восстановить</button>
            </div>
          `).join('')}
        </section>
      ` : ''}
    </div>
  `;
}

function renderProfileView() {
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

        </div>
      </div>
    </div>
  `;
}

function renderSettingsView() {
  const summary = adminStats?.summary || null;
  const recentUsers = adminStats?.recentUsers || [];
  const canViewStats = Boolean(summary || adminStatsError);
  const tabs = [
    { id: 'service', label: 'Сервис' },
    ...(canViewStats ? [{ id: 'stats', label: 'Статистика' }] : []),
  ];

  if (!tabs.some(tab => tab.id === settingsSection)) {
    settingsSection = 'service';
  }

  const metrics = summary ? [
    { label: 'Всего регистраций', value: summary.totalUsers, note: 'Все созданные аккаунты' },
    { label: 'Активных аккаунтов', value: summary.activeUsers, note: 'Не отключены вручную' },
    { label: 'Логинились', value: summary.usersLoggedInEver, note: 'Хотя бы один вход' },
    { label: 'Заходили 7 дней', value: summary.usersSeen7d, note: 'Последняя активность' },
    { label: 'Заходили 30 дней', value: summary.usersSeen30d, note: 'Более широкий срез' },
    { label: 'Новых 30 дней', value: summary.newUsers30d, note: 'Недавний прирост' },
  ] : [];

  const statsRows = summary ? [
    ['С workspace', summary.usersWithWorkspace],
    ['Новых за 7 дней', summary.newUsers7d],
    ['Новых за 30 дней', summary.newUsers30d],
    ['Логинились хотя бы раз', summary.usersLoggedInEver],
  ] : [];

  const servicePane = `
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
        <section class="settings-card settings-recurring-card">
          <div class="settings-recurring-heading">
            <span class="settings-recurring-icon" aria-hidden="true">∞</span>
            <div>
              <div class="settings-card-title">Постоянные задачи</div>
              <div class="settings-recurring-count">${state.recurring.length} ${pluralizeRu(state.recurring.length, 'правило', 'правила', 'правил')}</div>
            </div>
          </div>
          <div class="settings-copy">Задачи, которые автоматически появляются в выбранный день каждую неделю.</div>
          <div class="settings-actions-row">
            <button type="button" onclick="openRecurringManage()">Управлять</button>
          </div>
        </section>

        <section class="settings-card">
          <div class="settings-card-title">Данные</div>
          <div class="settings-copy">
            Здесь можно сохранить полную резервную копию сервиса или загрузить её обратно.
          </div>
          <div class="settings-actions-row">
            <button type="button" onclick="exportAllData()">Экспорт JSON</button>
            <button type="button" onclick="triggerImportData()">Импорт копии</button>
            <button class="settings-asana-button" type="button" onclick="openAsanaImport()">Asana → НеПлан</button>
          </div>
          <input id="settings-import-input" type="file" accept="application/json,.json" style="display:none" onchange="importAllDataFromFile(event)" />
        </section>
      </div>
    </div>
  `;

  const statsPane = `
    <div class="settings-stats-shell">
      <section class="settings-card settings-pane-intro">
        <div class="settings-pane-copy">
          <div class="settings-pane-kicker">Статистика</div>
          <div class="settings-pane-title">Пользователи и активность</div>
          <div class="settings-copy">Отдельная вкладка для регистраций, логинов и последней активности без смешивания с сервисными настройками.</div>
        </div>
        <div class="settings-pane-actions">
          <button id="admin-stats-refresh-btn" type="button" onclick="refreshAdminStats()">Обновить статистику</button>
        </div>
      </section>

      ${adminStatsError ? `
        <section class="settings-card">
          <div class="settings-copy">${escapeHtml(adminStatsError)}</div>
        </section>
      ` : ''}

      ${summary ? `
        <div class="stats-overview-grid">
          ${metrics.map(metric => `
            <section class="settings-card stats-metric-card">
              <div class="stats-metric-label">${metric.label}</div>
              <div class="stats-metric-value">${metric.value}</div>
              <div class="stats-metric-note">${metric.note}</div>
            </section>
          `).join('')}
        </div>

        <div class="stats-content-grid">
          <section class="settings-card">
            <div class="settings-card-title">Сводка</div>
            ${statsRows.map(([label, value]) => `
              <div class="settings-info-row">
                <span>${label}</span>
                <b>${value}</b>
              </div>
            `).join('')}
          </section>

          <section class="settings-card">
            <div class="settings-card-title">Как читать цифры</div>
            <div class="settings-copy">"Логинились" показывает факт входа хотя бы один раз. "Заходили" считается по последней активности, которую приложение обновляет при живой сессии.</div>
            <div class="settings-copy">Если пользователь зарегистрировался, но ни разу не дошёл до рабочей сессии, он попадёт в регистрации, но не в активность.</div>
          </section>
        </div>

        <section class="settings-card">
          <div class="settings-card-title">Последние регистрации</div>
          ${recentUsers.length ? `
            <div class="stats-user-list">
              ${recentUsers.map(user => `
                <div class="stats-user-row">
                  <div class="stats-user-main">
                    <span class="stats-user-email">${escapeHtml(user.email)}</span>
                    <div class="stats-user-meta">
                      <span class="stats-user-badge">Регистрация: ${escapeHtml(formatAdminDate(user.createdAt))}</span>
                      <span class="stats-user-badge">Логин: ${escapeHtml(formatAdminDate(user.lastLoginAt))}</span>
                      <span class="stats-user-badge">Активность: ${escapeHtml(formatAdminDate(user.lastSeenAt))}</span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : '<div class="empty-note compact">Пользователей пока нет.</div>'}
        </section>
      ` : !adminStatsError ? `
        <section class="settings-card">
          <div class="settings-copy">Статистика появится после первого успешного ответа сервера.</div>
        </section>
      ` : ''}
    </div>
  `;

  document.getElementById('settings-view').innerHTML = `
    <div class="account-shell">
      <section class="settings-card account-hero account-hero-settings">
        <div class="account-hero-copy settings-hero-copy">
          <div class="profile-name">Настройки сервиса</div>
          <div class="profile-meta">Рабочее пространство, поведение интерфейса и резервные копии.</div>
        </div>
      </section>

      ${settingsSection === 'service' ? servicePane : statsPane}
    </div>
  `;
}

function setSettingsSection(section) {
  const normalizedSection = section === 'stats' ? 'stats' : 'service';
  const canViewStats = Boolean(adminStats?.summary || adminStatsError);
  settingsSection = normalizedSection === 'stats' && !canViewStats ? 'service' : normalizedSection;

  if (state.currentView === 'settings') {
    renderSettingsPageTitle();
    renderSettingsView();
  }
}

async function refreshAdminStats() {
  const button = document.getElementById('admin-stats-refresh-btn');
  const originalText = button?.textContent || 'Обновить статистику';

  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Обновляем...';
    }

    await loadAdminStats();
    renderSettingsView();
  } catch (error) {
    console.error(error);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
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

function resetAsanaImportState() {
  asanaImportState = {
    exportData: null,
    preview: null,
    fileName: '',
    targetValue: '__new__',
    groupId: state.groups[0]?.id || '',
    projectName: '',
    color: COLORS[4],
    includeCompleted: true,
    includeSourceLinks: true,
    conflictMode: 'skip',
    loading: false,
    error: '',
    result: null,
  };
}

function openAsanaImport() {
  resetAsanaImportState();
  renderAsanaImportModal();
  document.getElementById('asana-import-modal')?.classList.add('open');
}

function closeAsanaImport() {
  if (asanaImportState.loading) return;
  document.getElementById('asana-import-modal')?.classList.remove('open');
}

function getAsanaImportErrorMessage(code) {
  const messages = {
    INVALID_ASANA_JSON: 'Файл не является корректным JSON.',
    INVALID_ASANA_EXPORT: 'В JSON не найден экспорт задач Asana.',
    ASANA_PROJECT_NOT_FOUND: 'Не удалось определить проект Asana.',
    ASANA_EXPORT_TOO_LARGE: 'В этом файле слишком много задач для одного импорта.',
    PROJECT_NOT_FOUND: 'Выбранный проект больше недоступен.',
    GROUP_NOT_FOUND: 'Выбранная группа больше недоступна.',
  };
  return messages[code] || 'Не удалось обработать экспорт Asana.';
}

function triggerAsanaImportFile() {
  if (asanaImportState.loading) return;
  document.getElementById('asana-import-file')?.click();
}

function allowAsanaFileDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.add('is-dragover');
}

function leaveAsanaFileDrop(event) {
  if (event.currentTarget.contains(event.relatedTarget)) return;
  event.currentTarget.classList.remove('is-dragover');
}

function dropAsanaImportFile(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('is-dragover');
  const file = event.dataTransfer?.files?.[0];
  if (file) void loadAsanaImportFile(file);
}

async function handleAsanaImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (file) await loadAsanaImportFile(file);
}

async function loadAsanaImportFile(file) {
  if (asanaImportState.loading) return;
  if (file.size > 15 * 1024 * 1024) {
    asanaImportState.error = 'Файл больше 15 МБ. Раздели экспорт на несколько файлов.';
    renderAsanaImportModal();
    return;
  }

  asanaImportState.loading = true;
  asanaImportState.error = '';
  asanaImportState.result = null;
  asanaImportState.fileName = file.name;
  renderAsanaImportModal();

  try {
    const exportData = JSON.parse(await file.text());
    const preview = await apiJson('/api/imports/asana/preview', {
      method: 'POST',
      body: JSON.stringify({ exportData }),
    });
    const matchingProject = state.subs.find(project =>
      project.label.trim().toLocaleLowerCase('ru-RU') === preview.projectName.trim().toLocaleLowerCase('ru-RU')
    );
    asanaImportState.exportData = exportData;
    asanaImportState.preview = preview;
    asanaImportState.projectName = preview.projectName;
    asanaImportState.targetValue = matchingProject?.id || '__new__';
    asanaImportState.groupId = matchingProject?.group || state.groups[0]?.id || '';
    asanaImportState.color = matchingProject?.color || COLORS[4];
  } catch (error) {
    console.error(error);
    const code = error instanceof SyntaxError
      ? 'INVALID_ASANA_JSON'
      : (error instanceof Error ? error.message : 'ASANA_PREVIEW_FAILED');
    asanaImportState.exportData = null;
    asanaImportState.preview = null;
    asanaImportState.error = getAsanaImportErrorMessage(code);
  } finally {
    asanaImportState.loading = false;
    renderAsanaImportModal();
  }
}

function updateAsanaImportOption(key, value) {
  if (!(key in asanaImportState)) return;
  asanaImportState[key] = value;
  if (key === 'targetValue' || key === 'includeCompleted') renderAsanaImportModal();
}

function renderAsanaImportModal() {
  const root = document.getElementById('asana-import-content');
  if (!root) return;

  if (asanaImportState.result) {
    const result = asanaImportState.result;
    root.innerHTML = `
      <div class="asana-import-success">
        <span class="asana-import-success-mark" aria-hidden="true">✓</span>
        <div class="asana-import-kicker">Импорт завершён</div>
        <h3>${escapeHtml(result.project.name)}</h3>
        <p>Секции Asana стали столбиками, задачи — карточками, а подзадачи и описания сохранены внутри карточек.</p>
        <div class="asana-import-result-grid">
          <span><strong>${result.createdSectionCount}</strong><small>новых столбиков</small></span>
          <span><strong>${result.createdTaskCount}</strong><small>новых карточек</small></span>
          <span><strong>${result.updatedTaskCount}</strong><small>обновлено</small></span>
          <span><strong>${result.skippedTaskCount}</strong><small>дублей пропущено</small></span>
        </div>
        <div class="modal-actions modal-actions-right">
          <button type="button" onclick="closeAsanaImport()">Закрыть</button>
          <button class="primary" type="button" onclick="openImportedAsanaProject()">Открыть проект</button>
        </div>
      </div>`;
    return;
  }

  if (!asanaImportState.preview) {
    root.innerHTML = `
      <button
        class="asana-import-dropzone${asanaImportState.loading ? ' is-loading' : ''}"
        type="button"
        onclick="triggerAsanaImportFile()"
        ondragover="allowAsanaFileDrop(event)"
        ondragleave="leaveAsanaFileDrop(event)"
        ondrop="dropAsanaImportFile(event)"
        ${asanaImportState.loading ? 'disabled' : ''}
      >
        <span class="asana-import-logo" aria-hidden="true"><i></i><i></i><i></i></span>
        <strong>${asanaImportState.loading ? 'Разбираю файл…' : 'Выбрать JSON из Asana'}</strong>
        <span>${asanaImportState.fileName ? escapeHtml(asanaImportState.fileName) : 'Или перетащи файл сюда'}</span>
      </button>
      ${asanaImportState.error ? `<div class="asana-import-error">${escapeHtml(asanaImportState.error)}</div>` : ''}
      <div class="asana-import-privacy">
        <strong>Важно</strong>
        <span>Описания и подзадачи перенесутся целиком. Если в Asana хранятся пароли или доступы, они тоже попадут в твой аккаунт «НеПлана».</span>
      </div>`;
    return;
  }

  const preview = asanaImportState.preview;
  const isNewProject = asanaImportState.targetValue === '__new__';
  root.innerHTML = `
    <div class="asana-import-layout">
      <section class="asana-import-preview">
        <div class="asana-import-fileline">
          <span class="asana-import-logo compact" aria-hidden="true"><i></i><i></i><i></i></span>
          <div><strong>${escapeHtml(preview.projectName)}</strong><small>${escapeHtml(asanaImportState.fileName)}</small></div>
          <button type="button" onclick="triggerAsanaImportFile()">Заменить</button>
        </div>
        <div class="asana-import-metrics">
          <span><strong>${preview.sectionCount}</strong><small>секций</small></span>
          <span><strong>${preview.taskCount}</strong><small>задач</small></span>
          <span><strong>${preview.subtaskCount}</strong><small>подзадач</small></span>
          <span><strong>${preview.completedTaskCount}</strong><small>выполнено</small></span>
        </div>
        <div class="asana-import-section-list">
          ${preview.sections.map(section => `
            <div><span>${escapeHtml(section.name)}</span><b>${section.taskCount}</b></div>
          `).join('')}
        </div>
      </section>

      <section class="asana-import-options">
        <div class="asana-import-kicker">Куда перенести</div>
        <label class="field-group">
          <span class="form-label">Проект в «НеПлане»</span>
          <select onchange="updateAsanaImportOption('targetValue', this.value)">
            <option value="__new__"${isNewProject ? ' selected' : ''}>+ Создать новый проект</option>
            ${state.subs.map(project => `<option value="${escapeHtml(project.id)}"${asanaImportState.targetValue === project.id ? ' selected' : ''}>${escapeHtml(project.label)} · ${escapeHtml(getGroup(project.group)?.label || 'Без группы')}</option>`).join('')}
          </select>
        </label>
        ${isNewProject ? `
          <div class="asana-import-new-project">
            <label class="field-group">
              <span class="form-label">Название</span>
              <input maxlength="120" value="${escapeHtml(asanaImportState.projectName)}" oninput="updateAsanaImportOption('projectName', this.value)" />
            </label>
            <label class="field-group">
              <span class="form-label">Группа</span>
              <select onchange="updateAsanaImportOption('groupId', this.value)">
                ${state.groups.map(group => `<option value="${escapeHtml(group.id)}"${asanaImportState.groupId === group.id ? ' selected' : ''}>${escapeHtml(group.label)}</option>`).join('')}
              </select>
            </label>
            <label class="field-group asana-import-color-field">
              <span class="form-label">Цвет</span>
              <input type="color" value="${escapeHtml(asanaImportState.color)}" oninput="updateAsanaImportOption('color', this.value)" />
            </label>
          </div>` : ''}
        <div class="asana-import-kicker asana-import-options-title">Что сохранить</div>
        <label class="settings-check">
          <span><strong>Выполненные задачи</strong><small>${preview.completedTaskCount} шт. будут помечены в описании</small></span>
          <input type="checkbox" ${asanaImportState.includeCompleted ? 'checked' : ''} onchange="updateAsanaImportOption('includeCompleted', this.checked)" />
        </label>
        <label class="settings-check">
          <span><strong>Ссылки на Asana</strong><small>Добавить исходную ссылку в каждую карточку</small></span>
          <input type="checkbox" ${asanaImportState.includeSourceLinks ? 'checked' : ''} onchange="updateAsanaImportOption('includeSourceLinks', this.checked)" />
        </label>
        <label class="field-group asana-import-conflicts">
          <span class="form-label">Если файл импортировали раньше</span>
          <select onchange="updateAsanaImportOption('conflictMode', this.value)">
            <option value="skip"${asanaImportState.conflictMode === 'skip' ? ' selected' : ''}>Не трогать уже перенесённые</option>
            <option value="update"${asanaImportState.conflictMode === 'update' ? ' selected' : ''}>Обновить их из файла Asana</option>
          </select>
        </label>
        ${asanaImportState.error ? `<div class="asana-import-error">${escapeHtml(asanaImportState.error)}</div>` : ''}
        <div class="modal-actions modal-actions-right">
          <button type="button" onclick="closeAsanaImport()">Отмена</button>
          <button class="primary" id="asana-import-submit" type="button" onclick="runAsanaImport()" ${asanaImportState.loading ? 'disabled' : ''}>${asanaImportState.loading ? 'Переносим…' : `Перенести ${asanaImportState.includeCompleted ? preview.taskCount : preview.openTaskCount} задач`}</button>
        </div>
      </section>
    </div>`;
}

async function runAsanaImport() {
  if (!asanaImportState.exportData || !asanaImportState.preview || asanaImportState.loading) return;
  const isNewProject = asanaImportState.targetValue === '__new__';
  const projectName = asanaImportState.projectName.trim();
  if (isNewProject && (!projectName || !asanaImportState.groupId)) {
    asanaImportState.error = 'Укажи название и группу нового проекта.';
    renderAsanaImportModal();
    return;
  }

  asanaImportState.loading = true;
  asanaImportState.error = '';
  renderAsanaImportModal();
  try {
    const target = isNewProject
      ? {
        mode: 'new',
        groupId: asanaImportState.groupId,
        name: projectName,
        color: asanaImportState.color,
      }
      : { mode: 'existing', projectId: asanaImportState.targetValue };
    const result = await apiJson('/api/imports/asana', {
      method: 'POST',
      body: JSON.stringify({
        exportData: asanaImportState.exportData,
        target,
        includeCompleted: asanaImportState.includeCompleted,
        includeSourceLinks: asanaImportState.includeSourceLinks,
        conflictMode: asanaImportState.conflictMode,
      }),
    });
    await syncCatalogFromServer();
    delete projectNotesByProject[result.project.id];
    delete projectNoteSectionsByProject[result.project.id];
    asanaImportState.result = result;
    renderSidebarLists();
    renderSettingsView();
  } catch (error) {
    console.error(error);
    asanaImportState.error = getAsanaImportErrorMessage(error instanceof Error ? error.message : 'ASANA_IMPORT_FAILED');
  } finally {
    asanaImportState.loading = false;
    renderAsanaImportModal();
  }
}

function openImportedAsanaProject() {
  const projectId = asanaImportState.result?.project?.id;
  if (!projectId) return;
  asanaImportState.loading = false;
  closeAsanaImport();
  openProjectWorkspace(projectId);
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
  select.innerHTML = projects.map(project => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.label)}</option>`).join('');
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
    `<option value="${escapeHtml(group.id)}">${escapeHtml(group.label)}</option>`
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

function showToast(message) {
  const toast = document.getElementById('app-toast');
  if (!toast) return;
  if (_toastTimer) clearTimeout(_toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  _toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
    _toastTimer = null;
  }, 4200);
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
  void markProjectActivity(subId, 'WORK');
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
  persistNavigationState();
  document.getElementById('ai-section').style.display = 'none';
  renderBoard();
}

function toggleById(taskIdValue) {
  const recurringMeta = parseRecurringDomId(taskIdValue);
  if (recurringMeta) {
    const recurring = state.recurring.find(item => item.id === recurringMeta.recurringId);
    const status = getRecurringStatus(recurringMeta.wk, recurringMeta.recurringId);
    status.done = !status.done;
    save();
    if (recurring) void markProjectActivity(recurring.subId, 'WORK');
    renderBoard();
    return;
  }

  const record = findTaskRecord(taskIdValue);
  if (record) {
    record.task.done = !record.task.done;
    save();
    void markProjectActivity(record.subId, 'WORK');
    renderCurrentView();
    return;
  }

  const backlogRecord = findBacklogTaskRecord(taskIdValue);
  if (!backlogRecord) return;
  backlogRecord.task.done = !backlogRecord.task.done;
  save();
  void markProjectActivity(backlogRecord.subId, 'WORK');
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
  const projectId = _inlineTaskMeta.subId;
  insertTask(weekKey(state.weekOffset), projectId, _inlineTaskMeta.dayIdx, makeTask({ text, done: false, note: '' }));
  _inlineTaskMeta = null;
  save();
  void markProjectActivity(projectId, 'WORK');
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
  const projectId = _inlineBacklogMeta.subId;
  getBacklogForProject(projectId).push(makeTask({ text, done: false, note: '' }));
  _inlineBacklogMeta = null;
  save();
  void markProjectActivity(projectId, 'WORK');
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
    document.getElementById('task-send-btn').style.display = 'none';
    document.getElementById('task-next-week-btn').style.display = 'none';
    document.getElementById('task-save-btn').textContent = 'Сохранить заметку';
    document.getElementById('task-modal-title').textContent = `${_taskMeta.label} — ${DAYS[recurring.dayIdx]}`;
    document.getElementById('task-modal').classList.add('open');
    void markProjectActivity(recurring.subId, 'WORK');
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
      weekOffset: state.weekOffset,
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
    document.getElementById('task-next-week-btn').style.display = 'inline-flex';
    document.getElementById('task-save-btn').textContent = 'Сохранить';
    document.getElementById('task-modal-title').textContent = `${_taskMeta.label} — ${DAYS[record.dayIdx]}`;
    document.getElementById('task-modal').classList.add('open');
    void markProjectActivity(record.subId, 'WORK');
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
  document.getElementById('task-next-week-btn').style.display = 'none';
  document.getElementById('task-save-btn').textContent = 'Сохранить';
  document.getElementById('task-modal-title').textContent = `${_taskMeta.label} — задачи`;
  document.getElementById('task-modal').classList.add('open');
  void markProjectActivity(backlogRecord.subId, 'WORK');
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

function requestMoveTaskToNextWeek() {
  if (_taskMeta?.mode !== 'regular') return;
  const taskIdValue = _taskMeta.taskId;
  const fromWeek = _taskMeta.wk;
  const record = findTaskRecord(taskIdValue, fromWeek);
  if (!record) return;
  const sourceWeekOffset = Number.isInteger(_taskMeta.weekOffset) ? _taskMeta.weekOffset : state.weekOffset;
  const taskText = record.task.text;
  const targetWeekLabel = weekLabel(sourceWeekOffset + 1);

  openConfirmModal({
    title: 'Перенести задачу',
    message: `«${taskText}» будет перенесена на ${targetWeekLabel}, в ${DAYS[record.dayIdx]}. На новой неделе она будет невыполненной.`,
    confirmText: 'Перенести',
    danger: false,
    onConfirm: () => moveTaskToNextWeek(taskIdValue, fromWeek, sourceWeekOffset),
  });
}

function moveTaskToNextWeek(taskIdValue, fromWeek, sourceWeekOffset) {
  const removed = removeTaskById(taskIdValue, fromWeek);
  if (!removed) return;

  const toWeek = weekKey(sourceWeekOffset + 1);
  const movedTask = { ...removed.task, done: false };
  ensureDayProjectsWeek(toWeek);
  insertTask(toWeek, removed.subId, removed.dayIdx, movedTask);

  const sub = getSub(removed.subId);
  if (sub && !getDayProjects(toWeek, sub.group, removed.dayIdx).includes(removed.subId)) {
    getDayProjects(toWeek, sub.group, removed.dayIdx).push(removed.subId);
  }

  const targetWeekLabel = weekLabel(sourceWeekOffset + 1);
  save();
  closeTaskModal();
  renderBoard();
  showToast(`Перенесено: «${movedTask.text}» · ${DAYS[removed.dayIdx]} · ${targetWeekLabel}`);
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
    `<option value="${escapeHtml(project.id)}">${escapeHtml(project.label)}</option>`
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
    `<option value="${escapeHtml(group.id)}">${escapeHtml(group.label)}</option>`
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
    void markProjectActivity(subId, 'WORK');
    closeCreateTaskModal();
    renderTasksView();
    return;
  }
  insertTask(_createTaskMeta.wk, subId, dayIdx, makeTask({ text, done: false, note: '' }));
  if (!getDayProjects(_createTaskMeta.wk, groupId, dayIdx).includes(subId)) {
    getDayProjects(_createTaskMeta.wk, groupId, dayIdx).push(subId);
  }
  save();
  void markProjectActivity(subId, 'WORK');
  closeCreateTaskModal();
  renderBoard();
}

function renderDayProjectOptions() {
  if (!_dayProjectMeta) return;
  const wk = _dayProjectMeta.wk;
  const groupId = document.getElementById('day-project-group-select').value;
  const daySelect = document.getElementById('day-project-day-select');
  const yearSelect = document.getElementById('day-project-year-select');
  const projectSelect = document.getElementById('day-project-select');
  const selectedProjectId = projectSelect.value || _dayProjectMeta.projectId || '';
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
  projectSelect.innerHTML = available.map(project =>
    `<option value="${escapeHtml(project.id)}">${escapeHtml(project.label)}</option>`
  ).join('');
  if (available.length) {
    const nextProjectId = available.some(project => project.id === selectedProjectId)
      ? selectedProjectId
      : available[0].id;
    projectSelect.value = nextProjectId;
    _dayProjectMeta.projectId = nextProjectId;
  } else {
    _dayProjectMeta.projectId = '';
  }
  document.getElementById('day-project-empty').style.display = available.length ? 'none' : 'block';
  projectSelect.style.display = available.length ? 'block' : 'none';
  document.getElementById('day-project-save-btn').style.display = available.length ? 'inline-flex' : 'none';
}

function openDayProjectModal(modeOrGroupId = null, dayIdx = null) {
  const wk = weekKey(state.weekOffset);
  const mode = modeOrGroupId === 'backlog' || modeOrGroupId === 'wins' ? modeOrGroupId : 'week';
  const initialGroupId = mode === 'backlog'
    ? state.groups[0]?.id || ''
    : modeOrGroupId || state.groups[0]?.id || '';
  const initialDayIdx = Number.isInteger(dayIdx) ? dayIdx : mode === 'week' ? todayDayIndex() : 0;
  _dayProjectMeta = { mode, groupId: initialGroupId, dayIdx: initialDayIdx, projectId: '', wk, year: state.winsYearFilter === 'all' ? String(new Date().getFullYear()) : state.winsYearFilter };

  document.getElementById('day-project-group-select').innerHTML = state.groups.map(group =>
    `<option value="${escapeHtml(group.id)}">${escapeHtml(group.label)}</option>`
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
  document.getElementById('day-project-select').innerHTML = '';
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
          <button class="project-template-action" type="button" onclick="setGroupProjectTemplate(decodeInlineToken('${inlineToken(group.id)}'), true)">Добавить всё</button>
          <button class="project-template-action" type="button" onclick="setGroupProjectTemplate(decodeInlineToken('${inlineToken(group.id)}'), false)">Убрать всё</button>
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
              <button class="project-template-row-btn" type="button" onclick="setProjectTemplateDays(decodeInlineToken('${inlineToken(group.id)}'), decodeInlineToken('${inlineToken(sub.id)}'), true)">Всё</button>
              <button class="project-template-row-btn" type="button" onclick="setProjectTemplateDays(decodeInlineToken('${inlineToken(group.id)}'), decodeInlineToken('${inlineToken(sub.id)}'), false)">Снять</button>
            </div>
          </div>
          ${DAYS.map((_, dayIdx) => `
            <label class="project-template-cell">
              <input
                type="checkbox"
                ${state.projectTemplates[group.id][dayIdx].includes(sub.id) ? 'checked' : ''}
                onchange="toggleProjectTemplate(decodeInlineToken('${inlineToken(group.id)}'), ${dayIdx}, decodeInlineToken('${inlineToken(sub.id)}'), this.checked)"
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
  closeSidebar();
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
    `<option value="${escapeHtml(project.id)}">${escapeHtml(project.label)}</option>`
  ).join('');
}

function renderRecurringFilters() {
  const groupSelect = document.getElementById('recurring-filter-group');
  const projectSelect = document.getElementById('recurring-filter-project');
  groupSelect.innerHTML = ['<option value="all">Все группы</option>', ...state.groups.map(group =>
    `<option value="${escapeHtml(group.id)}">${escapeHtml(group.label)}</option>`
  )].join('');
  groupSelect.value = state.recurringFilterGroup;

  const projects = state.recurringFilterGroup === 'all'
    ? state.subs
    : state.subs.filter(sub => sub.group === state.recurringFilterGroup);
  if (state.recurringFilterProject !== 'all' && !projects.some(project => project.id === state.recurringFilterProject)) {
    state.recurringFilterProject = 'all';
  }
  projectSelect.innerHTML = ['<option value="all">Все проекты</option>', ...projects.map(project =>
    `<option value="${escapeHtml(project.id)}">${escapeHtml(project.label)}</option>`
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
      return `<button class="recurring-row${manageRecurringId === item.id ? ' active' : ''}" type="button" onclick="startRecurringEdit(decodeInlineToken('${inlineToken(item.id)}'))">
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

function openManage(projectId = null, preferredGroupId = null) {
  manageProjectId = projectId;
  const project = state.subs.find(item => item.id === projectId);
  newProjGroup = project?.group || preferredGroupId || state.groups[0]?.id || DEFAULT_GROUPS[0].id;
  newProjColor = project?.color || COLORS[0];
  document.getElementById('proj-name').value = project?.label || '';
  document.getElementById('manage-modal-title').textContent = project ? 'Редактировать проект' : 'Добавить проект';
  document.getElementById('manage-save-btn').textContent = project ? 'Сохранить' : 'Создать';
  document.getElementById('manage-delete-btn').style.display = project ? 'inline-flex' : 'none';
  document.getElementById('manage-delete-btn').textContent = 'В архив';
  document.getElementById('proj-balance-enabled').checked = project?.balanceEnabled !== false;
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
  select.innerHTML = state.groups.map(group => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.label)}</option>`).join('');
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
  Object.keys(state.achievements).forEach(year => {
    delete state.achievements[year][projectId];
  });
  Object.keys(state.achievementProjects).forEach(year => {
    Object.keys(state.achievementProjects[year] || {}).forEach(groupId => {
      state.achievementProjects[year][groupId] = (state.achievementProjects[year][groupId] || [])
        .filter(id => id !== projectId);
    });
  });
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
  const balanceEnabled = document.getElementById('proj-balance-enabled').checked;
  if (!name) return;

  try {
    if (manageProjectId) {
      await apiJson(`/api/catalog/projects/${manageProjectId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          groupId: newProjGroup,
          name,
          color: newProjColor,
          balanceEnabled,
        }),
      });
    } else {
      await apiJson('/api/catalog/projects', {
        method: 'POST',
        body: JSON.stringify({
          groupId: newProjGroup,
          name,
          color: newProjColor,
          balanceEnabled,
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
  const projectId = manageProjectId;
  const project = getSub(projectId);
  openConfirmModal({
    title: 'Архивировать проект',
    message: `Переместить проект${project?.label ? ` «${project.label}»` : ''} в архив? Все задачи, заметки и разделы сохранятся.`,
    confirmText: 'В архив',
    danger: false,
    onConfirm: async () => {
      try {
        await apiJson(`/api/catalog/projects/${projectId}`, {
          method: 'DELETE',
          headers: {},
        });

        removeProjectFromLocalState(projectId);
        delete projectNotesByProject[projectId];
        delete projectNoteSectionsByProject[projectId];
        if (activeProjectId === projectId) {
          activeProjectId = null;
          state.currentView = 'graph';
        }
        await syncCatalogFromServer();
        closeManage();
        renderCurrentView();
        showToast('Проект перемещён в архив');
      } catch (error) {
        console.error(error);
        alert('Не удалось переместить проект в архив.');
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
    await syncPlanningFromServer();
    renderCurrentView();
    showToast('Проект восстановлен');
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
  event.stopPropagation();
  event.dataTransfer.setData('text/plain', taskIdValue);
  event.dataTransfer.setData('application/x-task-drag', 'true');
}

function dragProject(event, groupId, dayIdx, subId) {
  event.dataTransfer.setData('application/x-project-card', JSON.stringify({ groupId, dayIdx, subId }));
}

function allowDrop(event) {
  event.preventDefault();
}

function allowProjectDrop(event) {
  event.preventDefault();
  const cell = event.currentTarget;
  if (cell && cell.classList.contains('day-cell')) {
    cell.classList.add('drop-target-cell');
  }
}

function leaveDayCell(event) {
  const cell = event.currentTarget;
  if (cell) cell.classList.remove('drop-target-cell');
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
    const existingTarget = getCellForWeek(wk, sourceSubId, targetDayIdx);
    existingTarget.push(...movedTasks);
  }

  return true;
}

function allowTasksGridDrop(event) {
  event.preventDefault();
  if (event.dataTransfer.getData('application/x-sidebar-item') || event.currentTarget === event.target) {
    event.currentTarget.classList.add('drop-target-cell');
  }
}

function leaveTasksGrid(event) {
  event.currentTarget.classList.remove('drop-target-cell');
}

function allowTasksCardDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.add('drop-target-cell');
}

function leaveTasksCard(event) {
  event.currentTarget.classList.remove('drop-target-cell');
}

function dragTasksCard(event, groupId, projectId) {
  event.stopPropagation();
  event.dataTransfer.setData('application/x-tasks-card', JSON.stringify({ groupId, projectId }));
}

function dropProjectOnTasksGrid(event, targetGroupId) {
  event.currentTarget.classList.remove('drop-target-cell');
  const sidebarRaw = event.dataTransfer.getData('application/x-sidebar-item');
  if (sidebarRaw) {
    let payload;
    try { payload = JSON.parse(sidebarRaw); } catch { return; }
    if (payload?.type !== 'project') return;
    const project = getSub(payload.id);
    if (!project || project.group !== targetGroupId) return;
    const list = getTaskProjectsForGroup(targetGroupId);
    if (!list.includes(project.id)) {
      list.push(project.id);
      save();
      renderTasksView();
    }
  }
}

function dropProjectOnTasksCard(event, targetGroupId, targetProjectId) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('drop-target-cell');

  const cardRaw = event.dataTransfer.getData('application/x-tasks-card');
  if (cardRaw) {
    let payload;
    try { payload = JSON.parse(cardRaw); } catch { return; }
    if (!payload || payload.groupId !== targetGroupId || payload.projectId === targetProjectId) return;
    const list = getTaskProjectsForGroup(targetGroupId);
    const sourceIdx = list.indexOf(payload.projectId);
    const targetIdx = list.indexOf(targetProjectId);
    if (sourceIdx === -1 || targetIdx === -1) return;
    list.splice(sourceIdx, 1);
    list.splice(targetIdx, 0, payload.projectId);
    save();
    renderTasksView();
    return;
  }

  const sidebarRaw = event.dataTransfer.getData('application/x-sidebar-item');
  if (sidebarRaw) {
    let payload;
    try { payload = JSON.parse(sidebarRaw); } catch { return; }
    if (payload?.type !== 'project') return;
    const project = getSub(payload.id);
    if (!project || project.group !== targetGroupId) return;
    const list = getTaskProjectsForGroup(targetGroupId);
    const targetIdx = list.indexOf(targetProjectId);
    if (!list.includes(project.id)) {
      list.splice(targetIdx, 0, project.id);
    } else {
      const sourceIdx = list.indexOf(project.id);
      list.splice(sourceIdx, 1);
      list.splice(targetIdx, 0, project.id);
    }
    save();
    renderTasksView();
  }
}

function dropTaskOnDay(event, targetGroupId, targetDayIdx) {
  const taskIdValue = event.dataTransfer.getData('text/plain');
  if (!taskIdValue || taskIdValue.startsWith('recurring|')) return;
  const wk = weekKey(state.weekOffset);
  const record = findTaskRecord(taskIdValue, wk);
  if (!record) return;
  const sourceProject = getSub(record.subId);
  if (!sourceProject || sourceProject.group !== targetGroupId) return;
  const removed = removeTaskById(taskIdValue, wk);
  if (!removed) return;
  insertTask(wk, removed.subId, targetDayIdx, removed.task);
  if (!getDayProjects(wk, targetGroupId, targetDayIdx).includes(removed.subId)) {
    getDayProjects(wk, targetGroupId, targetDayIdx).push(removed.subId);
  }
  save();
  renderBoard();
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
  const cell = event.currentTarget;
  if (cell) cell.classList.remove('drop-target-cell');

  if (event.dataTransfer.getData('application/x-task-drag')) {
    dropTaskOnDay(event, targetGroupId, targetDayIdx);
    return;
  }

  const sidebarRaw = event.dataTransfer.getData('application/x-sidebar-item');
  if (sidebarRaw) {
    let sidebarPayload;
    try { sidebarPayload = JSON.parse(sidebarRaw); } catch { return; }
    if (sidebarPayload?.type === 'project') {
      const project = getSub(sidebarPayload.id);
      if (!project || project.group !== targetGroupId) return;
      const wk = weekKey(state.weekOffset);
      const dayList = getDayProjects(wk, targetGroupId, targetDayIdx);
      if (!dayList.includes(project.id)) {
        dayList.push(project.id);
        save();
        renderBoard();
      }
    }
    return;
  }

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
  if (event.dataTransfer.getData('application/x-task-drag')) {
    dropTask(event, targetSubId, targetDayIdx);
    return;
  }
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
  if (type === 'project-note') closeProjectNoteModal();
  if (type === 'project-note-section') closeProjectNoteSectionModal();
  if (type === 'create-task') closeCreateTaskModal();
  if (type === 'day-project') closeDayProjectModal();
  if (type === 'project-template') closeProjectTemplateManage();
  if (type === 'manage') closeManage();
  if (type === 'group') closeGroupManage();
  if (type === 'asana-import') closeAsanaImport();
  if (type === 'recurring') closeRecurringManage();
  if (type === 'achievement') closeAchievementModal();
  if (type === 'wish-item') closeWishItemModal();
  if (type === 'wish-list') closeWishListModal();
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

  document.addEventListener('click', event => {
    if (!event.target.closest('#graph-tools')) closeGraphToolsMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeGraphToolsMenu();
  });

  document.getElementById('task-day-select').innerHTML = DAYS.map((day, index) => `<option value="${index}">${day}</option>`).join('');
  document.getElementById('create-task-group-select').addEventListener('change', renderCreateTaskOptions);
  document.getElementById('create-task-day-select').addEventListener('change', renderCreateTaskOptions);
  document.getElementById('create-task-project-select').addEventListener('change', event => {
    if (_createTaskMeta) _createTaskMeta.subId = event.target.value;
  });
  document.getElementById('day-project-group-select').addEventListener('change', renderDayProjectOptions);
  document.getElementById('day-project-day-select').addEventListener('change', renderDayProjectOptions);
  document.getElementById('day-project-select').addEventListener('change', event => {
    if (_dayProjectMeta) _dayProjectMeta.projectId = event.target.value;
  });
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
      hideSplash();
      return;
    }

    applyCurrentUser(user);
    loadWorkspaceCacheForCurrentUser();
    await syncCatalogFromServer();
    await syncAccountFromServer();
    await syncPlanningFromServer();
    await syncWishlistFromServer();
    await loadAdminStats({ silent: true });
    if (!restoreNavigationStateForCurrentUser()) {
      state.currentView = state.settings.defaultView || 'graph';
      activeProjectId = null;
      activeGroupId = null;
    }
    renderSidebarLists();
    if (state.currentView === 'project' && activeProjectId) {
      void openProjectWorkspace(activeProjectId, { trackActivity: false });
    } else {
      renderCurrentView();
    }
    showAppShell();
    hideSplash();
  } catch (error) {
    console.error(error);
    showAuthShell();
    hideSplash();
  }
}

function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('hidden');
  setTimeout(() => splash.remove(), 450);
}

initApp();
