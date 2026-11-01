const FOCUS_AREAS = [
  { id: 'income', label: 'Доход сейчас', short: 'Доход', color: '#168260', description: 'Дела для текущего заработка' },
  { id: 'growth', label: 'Развитие / будущий доход', short: 'Развитие', color: '#6655ae', description: 'Проекты с отложенным результатом' },
  { id: 'health', label: 'Здоровье и спорт', short: 'Здоровье', color: '#2e8391', description: 'Движение, восстановление и здоровье' },
  { id: 'family', label: 'Семья и дети', short: 'Семья', color: '#bd597b', description: 'Общие дела и время с близкими' },
  { id: 'personal', label: 'Личное и отдых', short: 'Личное', color: '#bc841e', description: 'Отдых, увлечения и личные дела' },
  { id: 'life', label: 'Быт и организация', short: 'Быт', color: '#6e7b88', description: 'Дом, документы и повседневные дела' },
  { id: 'unassigned', label: 'Без отметки', short: 'Без отметки', color: '#9b9b95', description: 'Смысл пока не выбран' },
];

let focusJournalOpen = false;
let focusScope = 'available';
let focusAreaFilter = 'all';
let focusSort = 'importance';
let focusShowDone = false;
let focusReturnElement = null;
const focusSavingProjects = new Set();

function normalizeFocusArea(value) {
  return FOCUS_AREAS.some(area => area.id === value) ? value : 'unassigned';
}

function normalizeTaskFocusArea(value) {
  return value == null || value === '' || value === 'inherit' ? null : normalizeFocusArea(value);
}

function normalizeCompletedAt(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function getTaskFocusArea(task, projectId) {
  return normalizeFocusArea(task.focusArea ?? getSub(projectId)?.focusArea);
}

function focusAreaOptions(selected, projectId = null) {
  const inherited = FOCUS_AREAS.find(area => area.id === normalizeFocusArea(getSub(projectId)?.focusArea));
  const inheritOption = projectId === null ? '' : `<option value="inherit"${selected == null ? ' selected' : ''}>Как у проекта · ${escapeHtml(inherited.short)}</option>`;
  return inheritOption + FOCUS_AREAS.map(area => `<option value="${area.id}"${selected === area.id ? ' selected' : ''}>${escapeHtml(area.label)}</option>`).join('');
}

function fillTaskFocusFields(prefix, task, projectId) {
  const select = document.getElementById(`${prefix}-focus-area`);
  if (!select) return;
  select.innerHTML = focusAreaOptions(normalizeTaskFocusArea(task.focusArea), projectId || '');
  document.getElementById(`${prefix}-important`).checked = Boolean(task.important);
}

function refreshTaskFocusInheritance(prefix, projectId) {
  const select = document.getElementById(`${prefix}-focus-area`);
  if (select) select.innerHTML = focusAreaOptions(normalizeTaskFocusArea(select.value), projectId || '');
}

function readTaskFocusFields(prefix) {
  return {
    focusArea: normalizeTaskFocusArea(document.getElementById(`${prefix}-focus-area`).value),
    important: document.getElementById(`${prefix}-important`).checked,
  };
}

function toggleTaskCompletion(task) {
  task.done = !task.done;
  task.completedAt = task.done ? new Date().toISOString() : null;
}

function renderTaskFocusMark(task, projectId) {
  const area = FOCUS_AREAS.find(item => item.id === getTaskFocusArea(task, projectId));
  const label = `${task.important ? 'Важное · ' : ''}${area.label}`;
  if (!task.important && area.id === 'unassigned') return '';
  return `<span class="task-focus-mark" style="--focus-color:${area.color}" title="${escapeHtml(label)}" aria-hidden="true">${task.important ? '★' : '<i></i>'}</span>`;
}

// A journal is a view of the selected week, never a second copy of its tasks.
function collectFocusWeek(wk = weekKey(state.weekOffset)) {
  ensureDayProjectsWeek(wk);
  const monday = parseWeekKeyDate(wk);
  const result = [];
  if (!monday) return result;
  state.groups.forEach(group => DAYS.forEach((_, dayIdx) => {
    (state.dayProjects[wk]?.[group.id]?.[dayIdx] || []).forEach(projectId => {
      const project = getSub(projectId);
      if (!project) return;
      const date = new Date(monday);
      date.setDate(date.getDate() + dayIdx);
      getDisplayTasksForCell(wk, projectId, dayIdx).forEach(task => result.push({
        ...task, projectId, project, group, dayIdx, date, wk,
        area: getTaskFocusArea(task, projectId),
        order: result.length,
      }));
    });
  }));
  return result;
}

function getFocusCutoff() {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today;
}

function getFocusRows() {
  return collectFocusWeek().filter(row => focusScope === 'week' || row.date <= getFocusCutoff());
}

function sortFocusRows(rows) {
  return [...rows].sort((a, b) => {
    if (focusSort === 'importance') {
      const important = Number(b.important) - Number(a.important);
      if (important) return important;
      const income = Number(b.area === 'income') - Number(a.area === 'income');
      if (income) return income;
    }
    return a.date - b.date || a.order - b.order;
  });
}

function openFocusJournal() {
  if (state.currentView !== 'graph') return;
  focusReturnElement = document.activeElement;
  focusJournalOpen = true;
  document.getElementById('focus-journal').hidden = false;
  document.getElementById('focus-backdrop').hidden = false;
  document.getElementById('focus-launcher').setAttribute('aria-expanded', 'true');
  document.body.classList.add('focus-journal-open');
  renderFocusJournal();
  document.querySelector('#focus-journal .focus-close').focus();
}

function closeFocusJournal() {
  const wasOpen = focusJournalOpen;
  focusJournalOpen = false;
  document.getElementById('focus-journal')?.setAttribute('hidden', '');
  document.getElementById('focus-backdrop')?.setAttribute('hidden', '');
  document.getElementById('focus-launcher')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('focus-journal-open');
  if (wasOpen && focusReturnElement?.isConnected) focusReturnElement.focus();
}

function refreshFocusJournal() {
  const launcher = document.getElementById('focus-launcher');
  if (!launcher) return;
  launcher.hidden = state.currentView !== 'graph';
  if (launcher.hidden) {
    if (focusJournalOpen) closeFocusJournal();
    return;
  }
  if (focusJournalOpen) renderFocusJournal();
}

function setFocusControl(control, value) {
  if (control === 'scope' && ['available', 'week'].includes(value)) focusScope = value;
  if (control === 'area') focusAreaFilter = value === 'all' ? value : normalizeFocusArea(value);
  if (control === 'sort' && ['importance', 'date'].includes(value)) focusSort = value;
  if (control === 'done') focusShowDone = Boolean(value);
  document.getElementById('focus-journal-body').scrollTop = 0;
  refreshFocusJournal();
}

function resolveFocusTask(id) {
  const recurring = parseRecurringDomId(id);
  if (recurring) return state.recurring.find(task => task.id === recurring.recurringId);
  return findTaskRecord(id)?.task || findBacklogTaskRecord(id)?.task;
}

function updateFocusTask(id, field, value) {
  const task = resolveFocusTask(id);
  if (!task) return;
  if (field === 'area') task.focusArea = normalizeTaskFocusArea(value);
  if (field === 'important') task.important = !task.important;
  save();
  renderCurrentView();
}

async function setProjectFocusArea(projectId, value) {
  const project = getSub(projectId);
  if (!project || focusSavingProjects.has(projectId)) return;
  focusSavingProjects.add(projectId);
  const before = project.focusArea;
  project.focusArea = normalizeFocusArea(value);
  const requestValue = project.focusArea;
  renderCurrentView();
  try {
    await apiJson(`/api/catalog/projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH', body: JSON.stringify({ focusArea: requestValue }),
    });
    save();
  } catch (error) {
    project.focusArea = before;
    showToast('Не удалось сохранить смысл проекта. Попробуй ещё раз.');
  } finally {
    focusSavingProjects.delete(projectId);
    renderCurrentView();
  }
}

function renderFocusTaskRow(row) {
  const token = inlineToken(row.id);
  const area = FOCUS_AREAS.find(item => item.id === row.area);
  const date = row.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return `<article class="focus-task-row${row.done ? ' is-done' : ''}${row.important ? ' is-important' : ''}" style="--focus-color:${area.color}">
    <div class="focus-task-main">
      <input class="focus-task-check" type="checkbox"${row.done ? ' checked' : ''} aria-label="${row.done ? 'Вернуть в работу' : 'Выполнить'}: ${escapeHtml(row.text)}" onchange="toggleById(decodeInlineToken('${token}'))" />
      <div class="focus-task-copy">
        <button class="focus-task-title" type="button" onclick="openTaskDetailsById(event, decodeInlineToken('${token}'))">${escapeHtml(row.text)}</button>
        <span class="focus-task-meta"><i style="background:${row.project.color}"></i>${escapeHtml(row.project.label)}<span>· ${DAYS[row.dayIdx]}, ${date}${row.recurring ? ' · повторяется' : ''}</span></span>
      </div>
      <button class="focus-star${row.important ? ' active' : ''}" type="button" aria-label="${row.important ? 'Снять важность' : 'Отметить важным'}: ${escapeHtml(row.text)}" aria-pressed="${Boolean(row.important)}" onclick="updateFocusTask(decodeInlineToken('${token}'), 'important')">${row.important ? '★' : '☆'}</button>
    </div>
    <div class="focus-task-bottom"><span class="focus-area-dot" style="background:${area.color}"></span><select aria-label="Смысл задачи: ${escapeHtml(row.text)}" onchange="updateFocusTask(decodeInlineToken('${token}'), 'area', this.value)">${focusAreaOptions(normalizeTaskFocusArea(row.focusArea), row.projectId)}</select></div>
  </article>`;
}

function renderFocusJournal() {
  const body = document.getElementById('focus-journal-body');
  if (!body) return;
  const scrollTop = body.scrollTop;
  const settingsOpen = body.querySelector('.focus-project-settings')?.open;
  const activeControl = body.contains(document.activeElement) ? {
    label: document.activeElement.getAttribute('aria-label'),
    tag: document.activeElement.tagName,
  } : null;
  const rows = getFocusRows();
  const open = rows.filter(row => !row.done);
  const income = open.filter(row => row.area === 'income');
  const unknown = open.filter(row => row.area === 'unassigned').length;
  const filtered = sortFocusRows(rows.filter(row => (focusShowDone || !row.done) && (focusAreaFilter === 'all' || row.area === focusAreaFilter)));
  const remaining = filtered.filter(row => !row.done);
  const done = filtered.filter(row => row.done);
  const first = remaining[0];
  const weekRows = collectFocusWeek();
  const projects = [...new Map(weekRows.map(row => [row.projectId, row.project])).values()];
  document.getElementById('focus-journal-period').textContent = weekLabel(state.weekOffset);
  body.innerHTML = `
    <div class="focus-scope-tabs" role="group" aria-label="Дела в журнале">
      <button type="button" aria-pressed="${focusScope === 'available'}" class="${focusScope === 'available' ? 'active' : ''}" onclick="setFocusControl('scope', 'available')">К этому дню</button>
      <button type="button" aria-pressed="${focusScope === 'week'}" class="${focusScope === 'week' ? 'active' : ''}" onclick="setFocusControl('scope', 'week')">Вся неделя</button>
    </div>
    <p class="focus-scope-note">${focusScope === 'week' ? 'Все дела выбранной недели, включая будущие дни.' : 'С начала выбранной недели по сегодня. Ничего переносить для этого не нужно.'}</p>
    <section class="focus-insight">
      <span class="focus-eyebrow">На что опереться</span>
      <p>${income.length ? `<strong>${income.length}</strong> ${pluralizeRu(income.length, 'дело на текущий доход', 'дела на текущий доход', 'дел на текущий доход')}. Можно начать с них.` : 'Какие дела поддерживают твой текущий заработок? Отметь их, чтобы быстро находить здесь.'}</p>
      ${unknown ? `<button type="button" class="focus-text-link" onclick="setFocusControl('area', 'unassigned')">Без отметки: ${unknown} · разобрать</button>` : ''}
    </section>
    <div class="focus-list-toolbar">
      <label><span>Направление</span><select aria-label="Направление в журнале" onchange="setFocusControl('area', this.value)"><option value="all"${focusAreaFilter === 'all' ? ' selected' : ''}>Все направления</option>${focusAreaOptions(focusAreaFilter)}</select></label>
      <label><span>Порядок</span><select aria-label="Порядок в журнале" onchange="setFocusControl('sort', this.value)"><option value="importance"${focusSort === 'importance' ? ' selected' : ''}>Важное → доход → дата</option><option value="date"${focusSort === 'date' ? ' selected' : ''}>По дням недели</option></select></label>
    </div>
    ${first ? `<div class="focus-start"><span>Можно начать с этого</span><button type="button" onclick="openTaskDetailsById(event, decodeInlineToken('${inlineToken(first.id)}'))">${escapeHtml(first.text)} <span aria-hidden="true">↗</span></button><small>${escapeHtml(first.project.label)} · ${first.important ? 'отмечено важным' : FOCUS_AREAS.find(area => area.id === first.area).short}</small></div>` : ''}
    <div class="focus-list-heading"><h3>Незавершённое <span>${remaining.length}</span></h3><label><input type="checkbox"${focusShowDone ? ' checked' : ''} onchange="setFocusControl('done', this.checked)" /> Сделанное</label></div>
    <div class="focus-task-list">${remaining.length ? remaining.map(renderFocusTaskRow).join('') : `<div class="focus-empty">${!rows.length ? 'В этой части недели пока нет задач. Добавь проект и запиши первое дело в графике.' : open.length && focusAreaFilter !== 'all' ? 'В этом направлении нет незавершённых дел. Можно выбрать другое.' : 'Все дела в этом списке отмечены. Можно отдохнуть или посмотреть всю неделю.'}</div>`}</div>
    ${done.length ? `<h3 class="focus-done-heading">Сделано <span>${done.length}</span></h3><div class="focus-task-list">${done.map(renderFocusTaskRow).join('')}</div>` : ''}
    ${projects.length ? `<details class="focus-project-settings"${settingsOpen ? ' open' : ''}><summary>Настроить смысл проектов <span>${projects.length}</span></summary><p>Выбери один раз — задачи без собственной отметки унаследуют направление. «Доход» здесь — твоя оценка, а не финансовый расчёт.</p>${projects.map(project => `<label class="focus-project-setting"><span>${escapeHtml(project.label)}</span><select${focusSavingProjects.has(project.id) ? ' disabled' : ''} aria-label="Смысл проекта: ${escapeHtml(project.label)}" onchange="setProjectFocusArea(decodeInlineToken('${inlineToken(project.id)}'), this.value)">${focusAreaOptions(normalizeFocusArea(project.focusArea))}</select></label>`).join('')}</details>` : ''}
  `;
  if (activeControl?.label) {
    const replacement = [...body.querySelectorAll('[aria-label]')].find(node => node.tagName === activeControl.tag && node.getAttribute('aria-label') === activeControl.label);
    replacement?.focus({ preventScroll: true });
  }
  body.scrollTop = scrollTop;
}

// Completion activity is counted by its actual date. Legacy entries use the plan
// date and are explicitly labelled approximate in the balance report.
function collectCompletedFocusActivities() {
  const activities = [];
  const seen = new Set();
  const add = (task, projectId, plannedDate, key) => {
    if (!task.done || seen.has(key) || !getSub(projectId)) return;
    seen.add(key);
    const completedAt = normalizeCompletedAt(task.completedAt);
    const date = completedAt ? new Date(completedAt) : plannedDate;
    activities.push({ task, projectId, date, approximate: !completedAt, area: getTaskFocusArea(task, projectId) });
  };
  Object.entries(state.data || {}).forEach(([wk, projectMap]) => {
    const monday = parseWeekKeyDate(wk);
    if (!monday) return;
    Object.entries(projectMap || {}).forEach(([projectId, dayMap]) => Object.entries(dayMap || {}).forEach(([dayIdx, tasks]) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + Number(dayIdx));
      (tasks || []).forEach(task => add(task, projectId, date, task.id));
    }));
  });
  Object.entries(state.backlog || {}).forEach(([projectId, tasks]) => (tasks || []).forEach(task => add(task, projectId, null, task.id)));
  const recurringById = new Map(state.recurring.map(task => [task.id, task]));
  Object.entries(state.recurringStatus || {}).forEach(([wk, statuses]) => {
    const monday = parseWeekKeyDate(wk);
    if (!monday) return;
    Object.entries(statuses || {}).forEach(([id, status]) => {
      const recurring = recurringById.get(id);
      if (!recurring) return;
      const date = new Date(monday);
      date.setDate(date.getDate() + recurring.dayIdx);
      add({ ...recurring, ...status }, recurring.subId, date, recurringDomId(id, wk));
    });
  });
  return activities;
}

function getFocusBalanceReport(start, end, projectIds) {
  const included = new Set(projectIds);
  const activities = collectCompletedFocusActivities().filter(row => included.has(row.projectId));
  const inPeriod = activities.filter(row => row.date && row.date >= start && row.date < end);
  return {
    total: inPeriod.length,
    approximate: inPeriod.filter(row => row.approximate).length,
    undated: activities.filter(row => !row.date).length,
    areas: FOCUS_AREAS.map(area => ({ ...area, count: inPeriod.filter(row => row.area === area.id).length })),
  };
}

function renderFocusBalance(report) {
  const focus = getFocusBalanceReport(report.start, report.end, report.includedProjects.map(project => project.id));
  const areasWithoutActivity = focus.areas.filter(area => area.id !== 'unassigned' && !area.count);
  return `<section class="focus-balance-panel">
    <div class="balance-section-heading"><div><span class="balance-kicker">Смысл выполненных дел</span><h2>Каким направлениям досталось внимание</h2></div><span class="balance-method-note">${focus.total} ${pluralizeRu(focus.total, 'дело', 'дела', 'дел')}</span></div>
    <p class="focus-balance-note">Доли по количеству выполненных задач, а не по времени или доходу. Короткое дело и большой проект здесь не равны по усилиям.</p>
    <div class="focus-balance-areas">${focus.areas.map(area => `<div class="focus-balance-area"><div><span><i style="background:${area.color}"></i>${area.label}</span><strong>${area.count}<small>${focus.total ? ` · ${Math.round(area.count / focus.total * 100)}%` : ''}</small></strong></div><div class="focus-balance-track"><span style="width:${focus.total ? area.count / focus.total * 100 : 0}%;background:${area.color}"></span></div></div>`).join('')}</div>
    ${areasWithoutActivity.length ? `<div class="focus-balance-reflection"><strong>Повод вспомнить</strong><p>Нет записанных выполненных дел: ${areasWithoutActivity.map(area => area.short.toLowerCase()).join(', ')}. Возможно, они были вне списка — это не оценка твоей жизни.</p><button type="button" onclick="openCompletedFocusActivity()">Записать сделанное сегодня</button></div>` : ''}
    ${focus.approximate || focus.undated ? `<p class="focus-balance-note">${focus.approximate ? `У ${focus.approximate} старых выполненных дел точная дата неизвестна: учтены по плановым дням. ` : ''}${focus.undated ? `Ещё ${focus.undated} выполненных дел из списка без даты не распределены по периодам.` : ''}</p>` : ''}
  </section>`;
}

function openCompletedFocusActivity() {
  openCreateTaskModal('backlog');
  document.getElementById('create-task-completed').checked = true;
  document.getElementById('create-task-title').textContent = 'Записать сделанное сегодня';
}

document.addEventListener('keydown', event => {
  if (!focusJournalOpen || document.querySelector('.modal-bg.open')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeFocusJournal();
  }
  if (event.key !== 'Tab') return;
  const controls = [...document.querySelectorAll('#focus-journal button, #focus-journal input, #focus-journal select, #focus-journal summary')].filter(node => !node.disabled && node.getClientRects().length);
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && (document.activeElement === first || !document.getElementById('focus-journal').contains(document.activeElement))) {
    event.preventDefault(); last?.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !document.getElementById('focus-journal').contains(document.activeElement))) {
    event.preventDefault(); first?.focus();
  }
});
