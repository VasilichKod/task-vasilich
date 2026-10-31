import assert from 'node:assert/strict';
import { prisma } from '../src/server/db/client.js';
import { createProject, updateProject } from '../src/server/api/catalog/service.js';
import { getWorkspaceBootstrap } from '../src/server/api/bootstrap/get-workspace-bootstrap.js';
import { planningStateSchema } from '../src/server/api/planning/schema.js';
import { resolveCompletionDate } from '../src/server/api/planning/focus.js';
import { savePlanningState } from '../src/server/api/planning/service.js';

// Integration checks only run against the explicitly named disposable database.
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55439');
assert.equal(url.pathname, '/nedplan_focus_test');

const completion = '2026-10-31T09:30:00.000Z';
const week = 'w20261026';
const suffix = Date.now();

try {
  assert.equal(resolveCompletionDate({ done: false, completedAt: completion }), null);
  assert.equal(resolveCompletionDate({ done: true }), null);
  assert.equal(resolveCompletionDate({ done: true }, { isDone: true, completedAt: null }), null);

  const user = await prisma.user.create({ data: { email: `focus-${suffix}@example.test` } });
  const workspace = await prisma.workspace.create({ data: { name: 'Focus integration', slug: `focus-${suffix}`, ownerUserId: user.id } });
  await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: 'OWNER' } });
  const group = await prisma.group.create({ data: { workspaceId: workspace.id, name: 'Test', color: '#185FA5' } });
  const project = await createProject(user.id, workspace.id, { groupId: group.id, name: 'Income', color: '#185FA5', focusArea: 'income' });
  assert.equal(project.focusArea, 'income');
  await updateProject(user.id, workspace.id, project.id, { focusArea: 'growth' });
  const taskId = `focus-task-${suffix}`;
  const legacyId = `legacy-task-${suffix}`;
  const backlogId = `backlog-${suffix}`;
  const recurringId = `recurring-${suffix}`;
  const input = planningStateSchema.parse({
    expectedVersion: 0,
    backlog: { [project.id]: [{ id: backlogId, text: 'Completed off the board', done: true, focusArea: 'family', important: true, completedAt: completion }] },
    taskProjects: { [group.id]: [project.id] },
    recurring: [{ id: recurringId, subId: project.id, dayIdx: 1, text: 'Health', focusArea: 'health', important: true }],
    recurringStatus: { [week]: { [recurringId]: { done: true, note: 'Recorded', completedAt: completion } } },
    data: { [week]: { [project.id]: { 0: [
      { id: taskId, text: 'Monday task completed on Saturday', done: true, focusArea: 'income', important: true, completedAt: completion },
      { id: legacyId, text: 'Historical completion', done: true },
    ] } } },
    projectTemplates: {},
    dayProjects: { [week]: { [group.id]: { 0: [project.id], 1: [project.id] } } },
  });
  await savePlanningState(user.id, workspace.id, input);
  let bootstrap = await getWorkspaceBootstrap({ userId: user.id, workspaceId: workspace.id });
  assert.equal(bootstrap.subs[0].focusArea, 'growth');
  assert.equal(bootstrap.data[week][project.id][0][0].completedAt, completion);
  assert.equal(bootstrap.data[week][project.id][0][0].important, true);
  assert.equal(bootstrap.data[week][project.id][0][1].completedAt, null);
  assert.equal(bootstrap.backlog[project.id][0].focusArea, 'family');
  assert.equal(bootstrap.recurring[0].focusArea, 'health');
  assert.equal(bootstrap.recurringStatus[week][recurringId].completedAt, completion);

  const oldClient = JSON.parse(JSON.stringify(input));
  const strip = (task: Record<string, unknown>) => { delete task.focusArea; delete task.important; delete task.completedAt; };
  oldClient.data[week][project.id][0].forEach(strip);
  oldClient.backlog[project.id].forEach(strip);
  oldClient.recurring.forEach(strip);
  strip(oldClient.recurringStatus[week][recurringId]);
  oldClient.expectedVersion = 1;
  await savePlanningState(user.id, workspace.id, planningStateSchema.parse(oldClient));
  bootstrap = await getWorkspaceBootstrap({ userId: user.id, workspaceId: workspace.id });
  assert.equal(bootstrap.data[week][project.id][0][0].focusArea, 'income');
  assert.equal(bootstrap.data[week][project.id][0][0].important, true);
  assert.equal(bootstrap.data[week][project.id][0][0].completedAt, completion);
  assert.equal(bootstrap.data[week][project.id][0][1].completedAt, null);
  assert.equal(bootstrap.backlog[project.id][0].important, true);
  assert.equal(bootstrap.recurring[0].important, true);
  assert.equal(bootstrap.recurringStatus[week][recurringId].completedAt, completion);

  const task = input.data[week][project.id][0][0];
  task.done = false;
  task.completedAt = null;
  task.focusArea = null;
  task.important = false;
  input.expectedVersion = 2;
  await savePlanningState(user.id, workspace.id, input);
  bootstrap = await getWorkspaceBootstrap({ userId: user.id, workspaceId: workspace.id });
  assert.equal(bootstrap.data[week][project.id][0][0].completedAt, null);
  assert.equal(bootstrap.data[week][project.id][0][0].focusArea, null);
  assert.equal(bootstrap.data[week][project.id][0][0].important, false);
  await assert.rejects(savePlanningState(user.id, workspace.id, input), /PLANNING_VERSION_CONFLICT/);

  // Compatibility: an older client can complete a known open task, and the
  // server supplies the timestamp rather than recording its planned Monday.
  oldClient.expectedVersion = 3;
  await savePlanningState(user.id, workspace.id, planningStateSchema.parse(oldClient));
  bootstrap = await getWorkspaceBootstrap({ userId: user.id, workspaceId: workspace.id });
  assert.ok(bootstrap.data[week][project.id][0][0].completedAt);
  assert.equal(bootstrap.data[week][project.id][0][1].completedAt, null);

  assert.equal(planningStateSchema.safeParse({ ...input, backlog: { [project.id]: [{ id: 'bad', text: 'Bad category', done: false, focusArea: 'made_up' }] } }).success, false);
  console.log('Focus integration passed: migration, project defaults, task overrides, completion dates, recurring/backlog, old-client compatibility and version conflicts.');
} finally {
  await prisma.$disconnect();
}
