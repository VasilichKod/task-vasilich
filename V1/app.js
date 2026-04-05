// ===== CONFIG =====
// Замени на свой ключ когда будешь деплоить на сервер
// НЕ коммить ключ в git — выноси в .env
const ANTHROPIC_API_KEY = '';  // <-- вставь сюда для локального теста

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
  { id: '4stanka',  label: '4Станка',    group: 'work', color: '#185FA5' },
  { id: 'shmel',    label: 'SHMEL',      group: 'work', color: '#1D9E75' },
  { id: 'modulpak', label: 'МОДУЛЬПАК',  group: 'work', color: '#7F77DD' },
  { id: 'raptor',   label: 'РАПТОР',     group: 'work', color: '#BA7517' },
  { id: 'ai',       label: 'ИИ',         group: 'work', color: '#533489' },
  { id: 'sport',    label: 'Спорт',      group: 'life', color: '#1D9E75' },
  { id: 'family',   label: 'Семья',      group: 'life', color: '#D4537E' },
  { id: 'home',     label: 'Дом',        group: 'life', color: '#BA7517' },
  { id: 'study',    label: 'Изучение',   group: 'life', color: '#7F77DD' },
  { id: 'friends',  label: 'Друзья',     group: 'life', color: '#D85A30' },
  { id: 'culture',  label: 'Культура',   group: 'life', color: '#888780' },
];

// ===== STATE =====
let state = {
  groups: [],
  subs: [],
  recurring: [],
  recurringStatus: {},
  data: {},
  filter: 'all',
  weekOffset: 0,
  sidebarView: 'overview',
  mobileSidebarOpen: false,
  projectsExpanded: false,
  groupsExpanded: false,
  recurringFilterGroup: 'all',
  recurringFilterProject: 'all',
  projectColumnWidth: 140
};
let _taskMeta = null;
let _inlineTaskMeta = null;
let newProjGroup = 'work';
let newProjColor = COLORS[0];
let manageProjectId = null;
let newGroupColor = COLORS[0];
let manageGroupId = null;
let manageRecurringId = null;
let _projectResize = null;

function taskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeTask(task) {
  if (typeof task === 'string') {
    return { id: taskId(), text: task, done: false, note: '' };
  }

  return {
    id: task.id || taskId(),
    text: task.text || '',
    done: Boolean(task.done),
    note: task.note || '',
  };
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
  return (subs || DEFAULT_SUBS).map(sub => ({
    ...sub,
    group: groups.some(group => group.id === sub.group) ? sub.group : fallbackGroupId,
  }));
}

function getGroup(groupId) {
  return state.groups.find(group => group.id === groupId);
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

function normalizeRecurringStatus(status) {
  return status && typeof status === 'object' ? status : {};
}

function recurringDomId(recurringId, wk) {
  return `recurring|${wk}|${recurringId}`;
}

function parseRecurringDomId(value) {
  if (!value?.startsWith('recurring|')) return null;
  const [, wk, recurringId] = value.split('|');
  return { wk, recurringId };
}

function getRecurringStatus(wk, recurringId) {
  if (!state.recurringStatus[wk]) state.recurringStatus[wk] = {};
  if (!state.recurringStatus[wk][recurringId]) state.recurringStatus[wk][recurringId] = { done: false, note: '' };
  return state.recurringStatus[wk][recurringId];
}

function getRecurringTasksForCell(wk, subId, dayIdx) {
  return state.recurring
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
}

function getDisplayTasksForCell(wk, subId, dayIdx) {
  const recurring = getRecurringTasksForCell(wk, subId, dayIdx);
  const regular = getCellForWeek(wk, subId, dayIdx).map(task => ({ ...task, recurring: false }));
  return [...recurring, ...regular];
}

// ===== STORAGE =====
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('wpv2') || 'null');
    if (s) {
      state.groups = normalizeGroups(s.groups);
      state.subs = normalizeSubs(s.subs, state.groups);
      state.recurring = normalizeRecurring(s.recurring, state.subs);
      state.recurringStatus = normalizeRecurringStatus(s.recurringStatus);
      state.data = normalizeData(s.data);
      state.projectColumnWidth = Math.max(120, Math.min(200, Number(s.projectColumnWidth) || 140));
    } else {
      state.groups = normalizeGroups(DEFAULT_GROUPS);
      state.subs = normalizeSubs(DEFAULT_SUBS, state.groups);
      state.recurring = [];
      state.recurringStatus = {};
      state.data = {};
      state.projectColumnWidth = 140;
      seedSample();
    }
  } catch (e) {
    state.groups = normalizeGroups(DEFAULT_GROUPS);
    state.subs = normalizeSubs(DEFAULT_SUBS, state.groups);
    state.recurring = [];
    state.recurringStatus = {};
    state.data = {};
    state.projectColumnWidth = 140;
    seedSample();
  }
}

function save() {
  try {
    localStorage.setItem('wpv2', JSON.stringify({
      groups: state.groups,
      subs: state.subs,
      recurring: state.recurring,
      recurringStatus: state.recurringStatus,
      data: state.data,
      projectColumnWidth: state.projectColumnWidth
    }));
  } catch (e) {
    console.warn('localStorage save failed', e);
  }
}

// ===== WEEK HELPERS =====
function weekKey(off) {
  const now = new Date();
  const day = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day + 1 + off * 7);
  return `w${mon.getFullYear()}${String(mon.getMonth() + 1).padStart(2, '0')}${String(mon.getDate()).padStart(2, '0')}`;
}

function weekLabel(off) {
  const now = new Date();
  const day = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day + 1 + off * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const wn = Math.ceil((mon - new Date(mon.getFullYear(), 0, 1)) / 604800000) + 1;
  return `Неделя ${wn}:  ${fmt(mon)} – ${fmt(sun)}`;
}

function getCell(subId, dayIdx) {
  const wk = weekKey(state.weekOffset);
  return getCellForWeek(wk, subId, dayIdx);
}

function getCellForWeek(wk, subId, dayIdx) {
  if (!state.data[wk]) state.data[wk] = {};
  if (!state.data[wk][subId]) state.data[wk][subId] = {};
  if (!state.data[wk][subId][dayIdx]) state.data[wk][subId][dayIdx] = [];
  return state.data[wk][subId][dayIdx];
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

function removeTaskById(taskIdValue, wk = weekKey(state.weekOffset)) {
  const record = findTaskRecord(taskIdValue, wk);
  if (!record) return null;
  const list = getCellForWeek(wk, record.subId, record.dayIdx);
  const [task] = list.splice(record.index, 1);
  return { ...record, task };
}

function insertTask(wk, subId, dayIdx, task, index = null) {
  const list = getCellForWeek(wk, subId, dayIdx);
  if (index === null || index < 0 || index > list.length) {
    list.push(task);
    return;
  }
  list.splice(index, 0, task);
}

function countWeekStats(off = state.weekOffset) {
  const wk = weekKey(off);
  let total = 0;
  let done = 0;
  let notes = 0;

  state.subs.forEach(sub => {
    DAYS.forEach((_, di) => {
      getDisplayTasksForCell(wk, sub.id, di).forEach(task => {
        total++;
        if (task.done) done++;
        if (task.note?.trim()) notes++;
      });
    });
  });

  return { total, done, notes, open: total - done };
}

// ===== SAMPLE DATA =====
function seedSample() {
  const wk = weekKey(0);
  state.data[wk] = {};
  const samples = [
    { sub: '4stanka',  day: 0, tasks: ['Флешку в бухгалтерию', 'Договор на ПЭК'] },
    { sub: 'shmel',    day: 0, tasks: ['Запуск станка для шлифовки', 'Счёт на печать'] },
    { sub: 'shmel',    day: 2, tasks: ['Сменить цены на Киты'] },
    { sub: 'modulpak', day: 0, tasks: ['План продвижения', 'Предложение для партнёров'] },
    { sub: 'raptor',   day: 2, tasks: ['Реклама Директ', 'Подготовить картинки'] },
    { sub: 'sport',    day: 1, tasks: ['Теннис Ася'] },
    { sub: 'sport',    day: 3, tasks: ['Теннис Ася'] },
    { sub: 'family',   day: 0, tasks: ['Документы на строительство'] },
    { sub: 'study',    day: 0, tasks: ['Инфо для обучения электронике'] },
  ];
  samples.forEach(({ sub, day, tasks }) =>
    tasks.forEach(text => getCell(sub, day).push(makeTask({ text, done: false, note: '' })))
  );
}

// ===== FILTER =====
function setFilter(f) {
  state.filter = f;
  document.querySelectorAll('.chip[data-filter]').forEach(c => c.classList.remove('active'));
  const el = document.querySelector(`.chip[data-filter="${f}"]`);
  if (el) el.classList.add('active');
  if (window.innerWidth <= 600) closeSidebar();
  render();
}

function visibleSubs() {
  if (state.filter === 'all')  return state.subs;
  if (state.groups.some(group => group.id === state.filter)) return state.subs.filter(s => s.group === state.filter);
  return state.subs.filter(s => s.id === state.filter);
}

// ===== RENDER =====
function render() {
  document.getElementById('week-label').textContent = weekLabel(state.weekOffset);
  document.documentElement.style.setProperty('--project-col-width', `${state.projectColumnWidth}px`);

  // Stats
  const { total, done, notes, open } = countWeekStats();
  const pct = total ? Math.round(done / total * 100) : 0;
  document.getElementById('stats-bar').innerHTML =
    `<span class="stat-pill">Задач: <b>${total}</b></span>` +
    `<span class="stat-pill">Сделано: <b>${done}</b></span>` +
    `<span class="stat-pill">Открыто: <b>${open}</b></span>` +
    `<span class="stat-pill">Заметки: <b>${notes}</b></span>` +
    `<span class="stat-pill">Прогресс: <b>${pct}%</b></span>`;

  renderSidebarSummary({ total, done, notes, open, pct });
  renderSidebarGroups();
  renderSidebarProjects();
  syncSidebarState();

  // Table
  const t = document.getElementById('main-table');
  let html = '<tr><th style="width:28px"></th><th class="project-head"><span>Проект</span><button class="col-resize-handle" type="button" onpointerdown="startProjectResize(event)" aria-label="Изменить ширину столбца проекта"></button></th>';
  DAYS.forEach(d => { html += `<th>${d}</th>`; });
  html += '</tr>';

  state.groups.forEach(grp => {
    const grpSubs = visibleSubs().filter(s => s.group === grp.id);
    if (!grpSubs.length) return;

    grpSubs.forEach((sub, si) => {
      html += '<tr>';

      if (si === 0) {
        html += `<td class="group-cell" rowspan="${grpSubs.length}" style="color:${grp.color}">${escapeHtml(grp.label.toUpperCase())}</td>`;
      }

      html += `<td class="sub-cell"><span class="sub-dot" style="background:${sub.color}"></span>${sub.label}</td>`;

      DAYS.forEach((_, di) => {
        const wk = weekKey(state.weekOffset);
        const tasks = getDisplayTasksForCell(wk, sub.id, di);
        html += `<td class="day-cell" ondragover="allowDrop(event)" ondrop="dropTask(event,'${sub.id}',${di})"><div class="task-list">`;
        tasks.forEach((task) => {
          const safeText = escapeHtml(task.text);
          const noteBadge = task.note?.trim()
            ? '<button class="note-badge" type="button" onclick="openTaskDetailsById(event,\'' + task.id + '\')">📝</button>'
            : '';
          html += `<div class="task-item${task.done ? ' done' : ''}" ${task.recurring ? '' : 'draggable="true" ondragstart="dragTask(event,\'' + task.id + '\')"'}">
            <input type="checkbox" ${task.done ? 'checked' : ''} onchange="toggleById('${task.id}')">
            <button class="task-text" type="button" onclick="openTaskDetailsById(event,'${task.id}')">${safeText}</button>
            <div class="task-tools">
              ${noteBadge}
              ${task.recurring ? '<span class="task-icon recurring" title="Постоянная задача">∞</span>' : `<button class="task-icon delete" type="button" onclick="deleteTaskById(event,'${task.id}')" title="Удалить">×</button>`}
            </div>
          </div>`;
        });
        if (_inlineTaskMeta && _inlineTaskMeta.subId === sub.id && _inlineTaskMeta.di === di) {
          const safeValue = escapeHtml(_inlineTaskMeta.text || '');
          html += `<div class="task-inline">
            <input
              id="inline-task-input"
              value="${safeValue}"
              placeholder="Новая задача..."
              oninput="updateInlineTaskValue(this.value)"
              onkeydown="handleInlineTaskKey(event)"
            />
            <div class="task-inline-actions">
              <button type="button" class="inline-action save" onclick="saveInlineTask()">OK</button>
              <button type="button" class="inline-action" onclick="closeInlineTask()">×</button>
            </div>
          </div>`;
        }
        html += `</div>`;
        html += `<button class="add-btn" onclick="openInlineTask('${sub.id}',${di})">+</button>`;
        html += `</td>`;
      });

      html += '</tr>';
    });
  });

  t.innerHTML = html;

  const groupChips = document.getElementById('group-chips');
  groupChips.innerHTML = state.groups.map(group => {
    const active = state.filter === group.id;
    const style = active ? `background:${group.color}22;color:${group.color};border-color:${group.color}` : '';
    return `<span class="chip${active ? ' active' : ''}" onclick="setFilter('${group.id}')" style="${style}">${escapeHtml(group.label)}</span>`;
  }).join('');

  // Sub-filter chips
  const subChips = document.getElementById('sub-chips');
  const f = state.filter;
  const showSubs = state.groups.some(group => group.id === f)
                 ? state.subs.filter(s => s.group === f)
                 : [];
  if (showSubs.length) {
    subChips.innerHTML = showSubs.map(s => {
      const active = state.filter === s.id;
      const style = active ? `background:${s.color}22;color:${s.color};border-color:${s.color}` : '';
      return `<span class="chip${active ? ' active' : ''}" onclick="setFilter('${s.id}')" style="${style}">${s.label}</span>`;
    }).join('');
  } else {
    subChips.innerHTML = '';
  }
}

// ===== TASK ACTIONS =====
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toggleById(taskIdValue) {
  const recurringMeta = parseRecurringDomId(taskIdValue);
  if (recurringMeta) {
    const status = getRecurringStatus(recurringMeta.wk, recurringMeta.recurringId);
    status.done = !status.done;
    save();
    render();
    return;
  }
  const record = findTaskRecord(taskIdValue);
  if (!record) return;
  record.task.done = !record.task.done;
  save();
  render();
}

function openInlineTask(subId, di) {
  _inlineTaskMeta = { subId, di, text: '' };
  render();
  setTimeout(() => document.getElementById('inline-task-input')?.focus(), 30);
}

function updateInlineTaskValue(value) {
  if (!_inlineTaskMeta) return;
  _inlineTaskMeta.text = value;
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

function saveInlineTask() {
  if (!_inlineTaskMeta) return;
  const text = (_inlineTaskMeta.text || '').trim();
  if (!text) return;
  getCell(_inlineTaskMeta.subId, _inlineTaskMeta.di).push(makeTask({ text, done: false, note: '' }));
  _inlineTaskMeta = null;
  save();
  render();
}

function closeInlineTask() {
  _inlineTaskMeta = null;
  render();
}

function openTaskDetailsById(event, taskIdValue) {
  if (event) event.stopPropagation();
  const recurringMeta = parseRecurringDomId(taskIdValue);
  if (recurringMeta) {
    const recurring = state.recurring.find(item => item.id === recurringMeta.recurringId);
    if (!recurring) return;
    const status = getRecurringStatus(recurringMeta.wk, recurring.id);
    const sub = state.subs.find(item => item.id === recurring.subId);
    _taskMeta = {
      mode: 'recurring',
      taskId: taskIdValue,
      recurringId: recurring.id,
      wk: recurringMeta.wk,
      subId: recurring.subId,
      di: recurring.dayIdx,
      label: sub?.label || 'Постоянная задача',
    };
    document.getElementById('task-modal-title').textContent = `${_taskMeta.label} — ${DAYS[recurring.dayIdx]}`;
    document.getElementById('task-input').value = recurring.text;
    document.getElementById('task-note').value = status.note || '';
    document.getElementById('task-day-select').value = String(recurring.dayIdx);
    document.getElementById('task-input').disabled = true;
    document.getElementById('task-day-select').disabled = true;
    document.getElementById('task-save-btn').textContent = 'Сохранить заметку';
    document.getElementById('task-delete-btn').style.display = 'none';
    document.getElementById('task-done-btn').style.display = 'inline-flex';
    document.getElementById('task-done-btn').textContent = status.done ? 'Не выполнено' : 'Выполнено';
    document.getElementById('task-modal').classList.add('open');
    setTimeout(() => document.getElementById('task-note').focus(), 50);
    return;
  }

  const record = findTaskRecord(taskIdValue);
  if (!record) return;
  const sub = state.subs.find(item => item.id === record.subId);
  _taskMeta = {
    mode: 'edit',
    taskId: taskIdValue,
    subId: record.subId,
    di: record.dayIdx,
    wk: record.wk,
    label: sub?.label || 'Задача',
  };
  document.getElementById('task-modal-title').textContent = `${_taskMeta.label} — ${DAYS[record.dayIdx]}`;
  document.getElementById('task-input').value = record.task.text;
  document.getElementById('task-note').value = record.task.note || '';
  document.getElementById('task-day-select').value = String(record.dayIdx);
  document.getElementById('task-input').disabled = false;
  document.getElementById('task-day-select').disabled = false;
  document.getElementById('task-save-btn').textContent = 'Сохранить';
  document.getElementById('task-delete-btn').style.display = 'inline-flex';
  document.getElementById('task-done-btn').style.display = 'inline-flex';
  document.getElementById('task-done-btn').textContent = record.task.done ? 'Не выполнено' : 'Выполнено';
  document.getElementById('task-modal').classList.add('open');
  setTimeout(() => document.getElementById('task-input').focus(), 50);
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.remove('open');
  document.getElementById('task-input').disabled = false;
  document.getElementById('task-day-select').disabled = false;
  _taskMeta = null;
}

function saveTask() {
  const text = document.getElementById('task-input').value.trim();
  const note = document.getElementById('task-note').value.trim();
  const nextDay = Number(document.getElementById('task-day-select').value);
  if (!text || !_taskMeta) return;

  if (_taskMeta.mode === 'recurring') {
    const status = getRecurringStatus(_taskMeta.wk, _taskMeta.recurringId);
    status.note = note;
    save();
    closeTaskModal();
    render();
    return;
  }

  const record = findTaskRecord(_taskMeta.taskId, _taskMeta.wk);
  if (!record) return;
  record.task.text = text;
  record.task.note = note;
  if (record.dayIdx !== nextDay) {
    removeTaskById(_taskMeta.taskId, _taskMeta.wk);
    insertTask(_taskMeta.wk, record.subId, nextDay, record.task);
  }

  save();
  closeTaskModal();
  render();
}

function deleteTask() {
  if (!_taskMeta?.taskId) return;
  removeTaskById(_taskMeta.taskId, _taskMeta.wk);
  save();
  closeTaskModal();
  render();
}

function toggleTaskDoneFromModal() {
  if (!_taskMeta?.taskId) return;
  if (_taskMeta.mode === 'recurring') {
    const status = getRecurringStatus(_taskMeta.wk, _taskMeta.recurringId);
    status.done = !status.done;
    document.getElementById('task-done-btn').textContent = status.done ? 'Не выполнено' : 'Выполнено';
    save();
    render();
    document.getElementById('task-modal').classList.add('open');
    return;
  }
  const record = findTaskRecord(_taskMeta.taskId, _taskMeta.wk);
  if (!record) return;
  record.task.done = !record.task.done;
  document.getElementById('task-done-btn').textContent = record.task.done ? 'Не выполнено' : 'Выполнено';
  save();
  render();
  document.getElementById('task-modal').classList.add('open');
}

function deleteTaskById(event, taskIdValue) {
  if (event) event.stopPropagation();
  removeTaskById(taskIdValue);
  save();
  render();
}

function carryOverUnfinished() {
  const currentWeekKey = weekKey(state.weekOffset);
  const nextWeekKey = weekKey(state.weekOffset + 1);
  let moved = 0;

  state.subs.forEach(sub => {
    DAYS.forEach((_, di) => {
      const source = getCellForWeek(currentWeekKey, sub.id, di);
      const keep = [];
      source.forEach(task => {
        if (task.done) {
          keep.push(task);
          return;
        }
        insertTask(nextWeekKey, sub.id, di, task);
        moved++;
      });
      state.data[currentWeekKey][sub.id][di] = keep;
    });
  });

  if (!moved) {
    alert('Незавершённых задач для переноса нет.');
    return;
  }

  save();
  render();
  alert(`Перенесено задач: ${moved}`);
}

document.getElementById('task-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveTask();
  if (e.key === 'Escape') closeTaskModal();
});

document.getElementById('task-note').addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveTask();
  if (e.key === 'Escape') closeTaskModal();
});

function dragTask(event, taskIdValue) {
  event.dataTransfer.setData('text/plain', taskIdValue);
}

function startProjectResize(event) {
  event.preventDefault();
  _projectResize = {
    startX: event.clientX,
    startWidth: state.projectColumnWidth,
    pointerId: event.pointerId,
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', handleProjectResizeMove);
  window.addEventListener('pointerup', stopProjectResize);
}

function handleProjectResizeMove(event) {
  if (!_projectResize) return;
  const delta = event.clientX - _projectResize.startX;
  state.projectColumnWidth = Math.max(120, Math.min(200, _projectResize.startWidth + delta));
  document.documentElement.style.setProperty('--project-col-width', `${state.projectColumnWidth}px`);
}

function stopProjectResize() {
  if (!_projectResize) return;
  _projectResize = null;
  window.removeEventListener('pointermove', handleProjectResizeMove);
  window.removeEventListener('pointerup', stopProjectResize);
  save();
  render();
}

function allowDrop(event) {
  event.preventDefault();
}

function dropTask(event, targetSubId, targetDayIdx) {
  event.preventDefault();
  const taskIdValue = event.dataTransfer.getData('text/plain');
  if (!taskIdValue) return;
  const record = removeTaskById(taskIdValue);
  if (!record) return;
  insertTask(record.wk, targetSubId, targetDayIdx, record.task);
  save();
  render();
}

// ===== WEEK NAV =====
function changeWeek(d) {
  state.weekOffset += d;
  document.getElementById('ai-section').style.display = 'none';
  render();
}

// ===== PROJECT MODAL =====
function openManage(projectId = null) {
  manageProjectId = projectId;
  const project = state.subs.find(item => item.id === projectId);
  newProjGroup = state.groups[0]?.id || DEFAULT_GROUPS[0].id;
  newProjColor = COLORS[0];
  document.getElementById('proj-name').value = project?.label || '';

  if (project) {
    newProjGroup = project.group;
    newProjColor = project.color;
  }

  document.getElementById('manage-modal-title').textContent = project ? 'Редактировать проект' : 'Добавить проект / категорию';
  document.getElementById('manage-save-btn').textContent = project ? 'Сохранить' : 'Создать';
  document.getElementById('manage-delete-btn').style.display = project ? 'inline-flex' : 'none';
  renderProjectGroupOptions();

  const cp = document.getElementById('color-picker');
  cp.innerHTML = COLORS.map((c, i) =>
    `<div onclick="pickColor('${c}',this)" style="width:20px;height:20px;border-radius:50%;background:${c};cursor:pointer;border:${c === newProjColor ? '2px solid #1a1a18' : '2px solid transparent'}"></div>`
  ).join('');

  document.getElementById('manage-modal').classList.add('open');
  setTimeout(() => document.getElementById('proj-name').focus(), 50);
}

function closeManage() {
  document.getElementById('manage-modal').classList.remove('open');
  manageProjectId = null;
}

function handleModalBackdrop(event, modalType) {
  if (event.target !== event.currentTarget) return;
  if (modalType === 'task') closeTaskModal();
  if (modalType === 'manage') closeManage();
  if (modalType === 'group') closeGroupManage();
  if (modalType === 'recurring') closeRecurringManage();
}

function renderProjectGroupOptions() {
  const select = document.getElementById('proj-group-select');
  select.innerHTML = state.groups.map(group =>
    `<option value="${group.id}">${escapeHtml(group.label)}</option>`
  ).join('');
  select.value = newProjGroup;
}

function pickColor(c, el) {
  newProjColor = c;
  document.querySelectorAll('#color-picker div').forEach(d => d.style.border = '2px solid transparent');
  el.style.border = '2px solid #1a1a18';
}

function saveProject() {
  const name = document.getElementById('proj-name').value.trim();
  if (!name) return;

  if (manageProjectId) {
    const project = state.subs.find(item => item.id === manageProjectId);
    if (!project) return;
    project.label = name;
    project.group = newProjGroup;
    project.color = newProjColor;
  } else {
    const id = name.toLowerCase().replace(/[^a-zа-я0-9]/gi, '_') + '_' + Date.now();
    state.subs.push({ id, label: name, group: newProjGroup, color: newProjColor });
  }

  save();
  closeManage();
  render();
}

function openGroupManage(groupId = null) {
  manageGroupId = groupId;
  const group = getGroup(groupId);
  newGroupColor = group?.color || COLORS[0];
  document.getElementById('group-name').value = group?.label || '';
  document.getElementById('group-modal-title').textContent = group ? 'Редактировать группу' : 'Добавить группу';
  document.getElementById('group-save-btn').textContent = group ? 'Сохранить' : 'Создать';
  document.getElementById('group-delete-btn').style.display = group ? 'inline-flex' : 'none';

  const cp = document.getElementById('group-color-picker');
  cp.innerHTML = COLORS.map(c =>
    `<div onclick="pickGroupColor('${c}',this)" style="width:20px;height:20px;border-radius:50%;background:${c};cursor:pointer;border:${c === newGroupColor ? '2px solid #1a1a18' : '2px solid transparent'}"></div>`
  ).join('');

  document.getElementById('group-modal').classList.add('open');
  setTimeout(() => document.getElementById('group-name').focus(), 50);
}

function closeGroupManage() {
  document.getElementById('group-modal').classList.remove('open');
  manageGroupId = null;
}

function pickGroupColor(color, el) {
  newGroupColor = color;
  document.querySelectorAll('#group-color-picker div').forEach(d => d.style.border = '2px solid transparent');
  el.style.border = '2px solid #1a1a18';
}

function saveGroup() {
  const name = document.getElementById('group-name').value.trim();
  if (!name) return;

  if (manageGroupId) {
    const group = getGroup(manageGroupId);
    if (!group) return;
    group.label = name;
    group.color = newGroupColor;
  } else {
    const id = name.toLowerCase().replace(/[^a-zа-я0-9]/gi, '_') + '_' + Date.now();
    state.groups.push({ id, label: name, color: newGroupColor });
  }

  save();
  closeGroupManage();
  render();
}

function deleteGroup() {
  if (!manageGroupId) return;
  if (state.groups.length <= 1) {
    alert('Нужна хотя бы одна группа.');
    return;
  }
  if (state.subs.some(project => project.group === manageGroupId)) {
    alert('Сначала перенеси или отредактируй проекты из этой группы.');
    return;
  }
  state.groups = state.groups.filter(group => group.id !== manageGroupId);
  if (state.filter === manageGroupId) state.filter = 'all';
  save();
  closeGroupManage();
  render();
}

function deleteProject() {
  if (!manageProjectId) return;
  const removedRecurringIds = state.recurring.filter(item => item.subId === manageProjectId).map(item => item.id);
  state.recurring = state.recurring.filter(item => item.subId !== manageProjectId);
  Object.keys(state.recurringStatus).forEach(wk => {
    removedRecurringIds.forEach(id => {
      if (state.recurringStatus[wk]?.[id]) delete state.recurringStatus[wk][id];
    });
  });
  state.subs = state.subs.filter(item => item.id !== manageProjectId);
  Object.keys(state.data).forEach(wk => {
    if (state.data[wk][manageProjectId]) delete state.data[wk][manageProjectId];
  });
  if (state.filter === manageProjectId) state.filter = 'all';
  save();
  closeManage();
  render();
}

function renderSidebarProjects() {
  const root = document.getElementById('sidebar-projects');
  if (!root) return;
  const toggle = document.getElementById('projects-toggle');
  const arrow = document.getElementById('projects-toggle-arrow');
  if (toggle) toggle.classList.toggle('open', state.projectsExpanded);
  if (arrow) arrow.textContent = state.projectsExpanded ? '▴' : '▾';

  if (!state.projectsExpanded) {
    root.innerHTML = '';
    root.classList.remove('open');
    return;
  }

  root.classList.add('open');
  root.innerHTML = `
    <button class="sidebar-inline-add" type="button" onclick="openManage()">+ Добавить проект</button>
    ${state.subs.map(project => `
    <div class="sidebar-project-row">
      <button class="sidebar-project-main" type="button" onclick="setFilter('${project.id}')">
        <span class="sidebar-project-dot" style="background:${project.color}"></span>
        <span>${escapeHtml(project.label)}</span>
      </button>
      <button class="sidebar-project-edit" type="button" onclick="openManage('${project.id}')" title="Редактировать">✎</button>
    </div>
  `).join('')}`;
}

function toggleProjectsPanel() {
  state.projectsExpanded = !state.projectsExpanded;
  renderSidebarProjects();
}

function renderSidebarGroups() {
  const root = document.getElementById('sidebar-groups');
  if (!root) return;
  const toggle = document.getElementById('groups-toggle');
  const arrow = document.getElementById('groups-toggle-arrow');
  if (toggle) toggle.classList.toggle('open', state.groupsExpanded);
  if (arrow) arrow.textContent = state.groupsExpanded ? '▴' : '▾';

  if (!state.groupsExpanded) {
    root.innerHTML = '';
    root.classList.remove('open');
    return;
  }

  root.classList.add('open');
  root.innerHTML = `
    <button class="sidebar-inline-add" type="button" onclick="openGroupManage()">+ Добавить группу</button>
    ${state.groups.map(group => `
    <div class="sidebar-project-row">
      <button class="sidebar-project-main" type="button" onclick="setFilter('${group.id}')">
        <span class="sidebar-project-dot" style="background:${group.color}"></span>
        <span>${escapeHtml(group.label)}</span>
      </button>
      <button class="sidebar-project-edit" type="button" onclick="openGroupManage('${group.id}')" title="Редактировать">✎</button>
    </div>
  `).join('')}`;
}

function toggleGroupsPanel() {
  state.groupsExpanded = !state.groupsExpanded;
  renderSidebarGroups();
}

function openRecurringManage(recurringId = null) {
  manageRecurringId = recurringId;
  renderRecurringProjectOptions();
  renderRecurringFilters();
  document.getElementById('recurring-day-select').innerHTML = DAYS.map((day, index) =>
    `<option value="${index}">${day}</option>`
  ).join('');
  renderRecurringList();
  startRecurringCreate(recurringId);
  document.getElementById('recurring-modal').classList.add('open');
}

function closeRecurringManage() {
  document.getElementById('recurring-modal').classList.remove('open');
  manageRecurringId = null;
}

function renderRecurringProjectOptions() {
  const select = document.getElementById('recurring-project-select');
  select.innerHTML = state.subs.map(project =>
    `<option value="${project.id}">${escapeHtml(project.label)}</option>`
  ).join('');
}

function renderRecurringList() {
  const root = document.getElementById('recurring-list');
  const filtered = state.recurring.filter(item => {
    if (state.recurringFilterGroup !== 'all') {
      const project = state.subs.find(projectItem => projectItem.id === item.subId);
      if (!project || project.group !== state.recurringFilterGroup) return false;
    }
    if (state.recurringFilterProject !== 'all' && item.subId !== state.recurringFilterProject) return false;
    return true;
  });

  root.innerHTML = filtered.length
    ? filtered.map(item => {
        const project = state.subs.find(projectItem => projectItem.id === item.subId);
        const group = getGroup(project?.group);
        return `
          <button class="recurring-row${manageRecurringId === item.id ? ' active' : ''}" type="button" onclick="startRecurringCreate('${item.id}')">
            <span class="recurring-row-title">${escapeHtml(item.text)}</span>
            <span class="recurring-row-meta">${DAYS[item.dayIdx]} · ${escapeHtml(project?.label || 'Проект')} · ${escapeHtml(group?.label || 'Группа')}</span>
          </button>
        `;
      }).join('')
    : '<div class="empty-note">По текущему фильтру постоянных задач нет.</div>';
}

function renderRecurringFilters() {
  const groupSelect = document.getElementById('recurring-filter-group');
  const projectSelect = document.getElementById('recurring-filter-project');
  if (!groupSelect || !projectSelect) return;

  groupSelect.innerHTML = [
    '<option value="all">Все группы</option>',
    ...state.groups.map(group => `<option value="${group.id}">${escapeHtml(group.label)}</option>`)
  ].join('');
  groupSelect.value = state.recurringFilterGroup;

  const filteredProjects = state.recurringFilterGroup === 'all'
    ? state.subs
    : state.subs.filter(project => project.group === state.recurringFilterGroup);

  if (state.recurringFilterProject !== 'all' && !filteredProjects.some(project => project.id === state.recurringFilterProject)) {
    state.recurringFilterProject = 'all';
  }

  projectSelect.innerHTML = [
    '<option value="all">Все проекты</option>',
    ...filteredProjects.map(project => `<option value="${project.id}">${escapeHtml(project.label)}</option>`)
  ].join('');
  projectSelect.value = state.recurringFilterProject;
}

function startRecurringCreate(recurringId = null) {
  manageRecurringId = recurringId;
  const item = state.recurring.find(recurringItem => recurringItem.id === recurringId);
  document.getElementById('recurring-text').value = item?.text || '';
  document.getElementById('recurring-project-select').value = item?.subId || state.subs[0]?.id || '';
  document.getElementById('recurring-day-select').value = String(item?.dayIdx ?? 0);
  document.getElementById('recurring-delete-btn').style.display = item ? 'inline-flex' : 'none';
  document.getElementById('recurring-save-btn').textContent = item ? 'Сохранить' : 'Создать';
  renderRecurringList();
}

function saveRecurring() {
  const text = document.getElementById('recurring-text').value.trim();
  const subId = document.getElementById('recurring-project-select').value;
  const dayIdx = Number(document.getElementById('recurring-day-select').value);
  if (!text || !subId) return;

  if (manageRecurringId) {
    const item = state.recurring.find(recurringItem => recurringItem.id === manageRecurringId);
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
  render();
  renderRecurringList();
  startRecurringCreate(manageRecurringId);
}

function deleteRecurring() {
  if (!manageRecurringId) return;
  state.recurring = state.recurring.filter(item => item.id !== manageRecurringId);
  Object.keys(state.recurringStatus).forEach(wk => {
    if (state.recurringStatus[wk]?.[manageRecurringId]) delete state.recurringStatus[wk][manageRecurringId];
  });
  save();
  render();
  manageRecurringId = null;
  renderRecurringList();
  startRecurringCreate();
}

function toggleSidebar() {
  state.mobileSidebarOpen = !state.mobileSidebarOpen;
  syncSidebarState();
}

function closeSidebar() {
  state.mobileSidebarOpen = false;
  syncSidebarState();
}

function syncSidebarState() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar || !overlay) return;
  sidebar.classList.toggle('open', state.mobileSidebarOpen);
  overlay.classList.toggle('open', state.mobileSidebarOpen);
}

function setSidebarView(view) {
  state.sidebarView = view;
  document.querySelectorAll('.sidebar-link').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  if (window.innerWidth <= 600) closeSidebar();
  render();
}

function renderSidebarSummary(stats) {
  const summary = document.getElementById('sidebar-summary');
  const view = state.sidebarView;
  const weekTitle = weekLabel(state.weekOffset);
  const historyHint = state.weekOffset === 0 ? 'Сейчас открыта текущая неделя.' : `Сейчас открыт сдвиг: ${state.weekOffset > 0 ? '+' : ''}${state.weekOffset} нед.`;
  const copy = {
    overview: `
      <div class="summary-card">
        <div class="summary-title">Текущая сводка</div>
        <div class="summary-line">${weekTitle}</div>
        <div class="summary-line">Открыто: <b>${stats.open}</b></div>
        <div class="summary-line">Сделано: <b>${stats.done}</b></div>
        <div class="summary-line">Заметки: <b>${stats.notes}</b></div>
      </div>
    `,
    week: `
      <div class="summary-card">
        <div class="summary-title">Фокус недели</div>
        <div class="summary-line">Прогресс: <b>${stats.pct}%</b></div>
        <div class="summary-line">Всего задач: <b>${stats.total}</b></div>
        <div class="summary-line">Незавершённых: <b>${stats.open}</b></div>
      </div>
    `,
    history: `
      <div class="summary-card">
        <div class="summary-title">История</div>
        <div class="summary-line">${historyHint}</div>
        <div class="summary-line">Листай недели стрелками сверху.</div>
      </div>
    `,
    analytics: `
      <div class="summary-card">
        <div class="summary-title">Аналитика</div>
        <div class="summary-line">Самая полезная метрика сейчас:</div>
        <div class="summary-line">процент завершения и остаток по неделе.</div>
      </div>
    `,
  };
  summary.innerHTML = copy[view] || copy.overview;
}

// ===== AI ANALYSIS =====
async function analyzeAI() {
  const sec = document.getElementById('ai-section');
  const txt = document.getElementById('ai-text');
  sec.style.display = 'block';
  txt.className = 'ai-loading';
  txt.textContent = 'Анализирую неделю...';

  let summary = `${weekLabel(state.weekOffset)}\n\n`;
  state.subs.forEach(sub => {
    let rows = [];
    DAYS.forEach((day, di) => {
      const tasks = getDisplayTasksForCell(weekKey(state.weekOffset), sub.id, di);
      if (tasks.length) {
        rows.push(`  ${day}: ${tasks.map(t => (t.done ? '[x]' : '[ ]') + ' ' + t.text).join(', ')}`);
      }
    });
    const group = getGroup(sub.group);
    if (rows.length) summary += `${sub.label} (${group?.label || 'Группа'}):\n${rows.join('\n')}\n\n`;
  });

  // Для локального теста — ключ хардкодится выше
  // На сервере ключ должен быть только на бэкенде (см. README)
  const headers = { 'Content-Type': 'application/json' };
  if (ANTHROPIC_API_KEY) headers['x-api-key'] = ANTHROPIC_API_KEY;

  try {
    const res = await fetch(
      ANTHROPIC_API_KEY ? 'https://api.anthropic.com/v1/messages' : '/api/analyze',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Ты помощник по продуктивности. Проанализируй мою неделю дружелюбно и коротко (6-8 предложений) на русском языке. Что хорошо сделано, что зависло, 1-2 совета на следующую неделю. Без markdown.\n\n${summary}`
          }]
        })
      }
    );
    const d = await res.json();
    txt.className = 'ai-text';
    txt.textContent = d.content?.[0]?.text || 'Нет ответа.';
  } catch (e) {
    txt.className = 'ai-text';
    txt.textContent = 'Ошибка подключения к ИИ.';
    console.error(e);
  }
}

// ===== INIT =====
load();
document.getElementById('proj-group-select').addEventListener('change', e => {
  newProjGroup = e.target.value;
});
document.getElementById('recurring-filter-group').addEventListener('change', e => {
  state.recurringFilterGroup = e.target.value;
  state.recurringFilterProject = 'all';
  renderRecurringFilters();
  renderRecurringList();
});
document.getElementById('recurring-filter-project').addEventListener('change', e => {
  state.recurringFilterProject = e.target.value;
  renderRecurringList();
});
document.getElementById('task-day-select').innerHTML = DAYS.map((day, index) =>
  `<option value="${index}">${day}</option>`
).join('');
render();
