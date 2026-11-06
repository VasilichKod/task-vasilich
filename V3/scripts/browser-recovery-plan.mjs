import { createHash } from 'node:crypto';

export const MODELS = ['group', 'project', 'backlogTask', 'weeklyTask', 'recurringTask',
  'projectTemplate', 'dayProject', 'taskPageProject', 'achievementYear',
  'achievementPageProject', 'achievement', 'profile', 'userSetting'];

const composites = {
  projectTemplate: ['workspaceId', 'groupId', 'dayIndex', 'projectId'],
  dayProject: ['workspaceId', 'weekStartDate', 'groupId', 'dayIndex', 'projectId'],
  taskPageProject: ['workspaceId', 'groupId', 'projectId'],
  achievementYear: ['workspaceId', 'achievementYear'],
  achievementPageProject: ['workspaceId', 'achievementYear', 'groupId', 'projectId'],
  userSetting: ['userId', 'workspaceId'],
};

export const plain = value => JSON.parse(JSON.stringify(value));
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const identity = (model, row) => JSON.stringify((composites[model] || ['id']).map(key => row[key] ?? null));
const nullableText = value => value || null;

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${label}`);
  return value;
}

function date(value) {
  if (!value) return null;
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error('Invalid date');
  return result.toISOString();
}

function week(value) {
  if (!/^w\d{8}$/.test(value)) throw new Error('Invalid week');
  const iso = date(`${value.slice(1,5)}-${value.slice(5,7)}-${value.slice(7,9)}T00:00:00Z`);
  if (new Date(iso).getUTCDay() !== 1) throw new Error('Week must start on Monday');
  return iso;
}

function day(value) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0 || result > 6) throw new Error('Invalid day');
  return result;
}

export function toDesired(raw, workspaceId, userId, existingProfile) {
  const s = raw.snapshot || raw;
  if (!Array.isArray(s.groups) || !Array.isArray(s.subs) || !s.data || !s.backlog) throw new Error('Invalid recovery snapshot');
  const result = Object.fromEntries(MODELS.map(model => [model, []]));
  result.group = s.groups.map((g, sortOrder) => ({id: requiredText(g.id,'group id'), workspaceId,
    name: requiredText(g.label,'group name'), color: g.color, sortOrder, archivedAt: null, deleteAfterAt: null}));
  const groups = new Set(result.group.map(g => g.id));
  result.project = s.subs.map((p, index) => {
    if (!groups.has(p.group)) throw new Error('Unknown group in source project');
    return {id: requiredText(p.id,'project id'), workspaceId, groupId: p.group,
      name: requiredText(p.label,'project name'), color:p.color, sortOrder:p.sortOrder ?? index,
      activityScore:p.activityScore ?? 0, lastActivityAt:date(p.lastActivityAt),
      balanceEnabled:p.balanceEnabled ?? true, focusArea:p.focusArea ?? 'unassigned',
      archivedAt:null, deleteAfterAt:null};
  });
  const projects = new Map(result.project.map(p => [p.id,p]));
  const checkProject = id => { if (!projects.has(id)) throw new Error('Unknown source project reference'); };
  const task = (t, projectId, sortOrder) => {
    checkProject(projectId);
    if (typeof t.done !== 'boolean') throw new Error('Invalid completion status');
    return {id:requiredText(t.id,'task id'),workspaceId,projectId,title:requiredText(t.text,'task title'),
      note:nullableText(t.note), isDone:t.done,focusArea:t.focusArea || null,important:t.important ?? false,
      completedAt:t.done ? date(t.completedAt) : null,sortOrder};
  };
  for (const [projectId, tasks] of Object.entries(s.backlog)) {
    tasks.forEach((t, index) => result.backlogTask.push({...task(t,projectId,index),archivedAt:null}));
  }
  for (const [key, rows] of Object.entries(s.data)) for (const [projectId, days] of Object.entries(rows)) {
    for (const [dayIndex,tasks] of Object.entries(days)) tasks.forEach((t,index) => result.weeklyTask.push({
      ...task(t,projectId,index),weekStartDate:week(key),dayIndex:day(dayIndex)}));
  }
  for (const t of s.recurring || []) {
    checkProject(t.subId);
    result.recurringTask.push({id:t.id,workspaceId,projectId:t.subId,dayIndex:day(t.dayIdx),
      title:requiredText(t.text,'recurring title'),focusArea:t.focusArea || null,important:t.important ?? false});
  }
  // This recovery file contains no recurring statuses. Never clear current ones.
  if (Object.keys(s.recurringStatus || {}).length) throw new Error('Recurring statuses require explicit recovery mapping');
  for (const [groupId, days] of Object.entries(s.projectTemplates || {})) for (const [d,ids] of Object.entries(days)) {
    ids.forEach(projectId => { checkProject(projectId); result.projectTemplate.push({workspaceId,groupId,
      projectId,dayIndex:day(d),isEnabled:true}); });
  }
  for (const [key, groups] of Object.entries(s.dayProjects || {})) for (const [groupId,days] of Object.entries(groups)) {
    for (const [d,ids] of Object.entries(days)) ids.forEach((projectId,sortOrder) => {
      checkProject(projectId); result.dayProject.push({workspaceId,groupId,projectId,
        weekStartDate:week(key),dayIndex:day(d),sortOrder});
    });
  }
  for (const [groupId,ids] of Object.entries(s.taskProjects || {})) ids.forEach((projectId,sortOrder) => {
    checkProject(projectId); result.taskPageProject.push({workspaceId,groupId,projectId,sortOrder});
  });
  for (const [y,projectsById] of Object.entries(s.achievements || {})) for (const [projectId,items] of Object.entries(projectsById)) {
    checkProject(projectId);
    const p = projects.get(projectId),g=result.group.find(g => g.id===p.groupId);
    items.forEach((item,sortOrder) => result.achievement.push({id:item.id,workspaceId,projectId,
      achievementYear:Number(y),achievementDate:date(item.date),title:requiredText(item.text,'achievement'),
      projectNameSnapshot:p.name,groupNameSnapshot:g.name,sortOrder}));
  }
  for (const [y,groupRows] of Object.entries(s.achievementProjects || {})) for (const [groupId,ids] of Object.entries(groupRows)) {
    ids.forEach((projectId,sortOrder) => { checkProject(projectId); const p=projects.get(projectId);
      result.achievementPageProject.push({workspaceId,groupId,projectId,achievementYear:Number(y),sortOrder,
        projectNameSnapshot:p.name,groupNameSnapshot:result.group.find(g=>g.id===groupId)?.name || ''});
    });
  }
  (s.achievementYears || []).forEach((y,sortOrder) => result.achievementYear.push({workspaceId,achievementYear:Number(y),sortOrder}));
  if (existingProfile && s.profile) result.profile.push({id:existingProfile.id,userId,
    ...Object.fromEntries(['name','role','city','about','avatarUrl'].filter(k=>k in s.profile).map(k=>[k,nullableText(s.profile[k])]))});
  if (s.settings) result.userSetting.push({userId,workspaceId,
    defaultView:String(s.settings.defaultView || 'graph').toUpperCase(),
    sidebarCollapsedOnStart:!!s.settings.sidebarCollapsedOnStart,
    openCurrentYearInAchievements:s.settings.openCurrentYearInAchievements !== false,
    workspaceNameOverride:nullableText(s.settings.workspaceName)});
  return plain(result);
}

export function makePlan(desired, baseline, current) {
  const operations=[], conflicts=[], preservedDeletions=[], skippedReferences=[];
  const stats={}, effective={};
  for (const model of MODELS) {
    const baseMap=new Map((baseline[model]||[]).map(row=>[identity(model,row),row]));
    const currentMap=new Map((current[model]||[]).map(row=>[identity(model,row),row]));
    effective[model]=new Map(currentMap);
    const seen=new Set();
    stats[model]={source:desired[model]?.length||0,created:0,updated:0,unchanged:0,keptAdditional:0};
    for (const original of desired[model] || []) {
      const row={...original};
      if (row.projectId && model !== 'project') {
        const p=[...effective.project.values()].find(p=>p.id===row.projectId);
        if (!p) { skippedReferences.push({model,id:row.id,projectId:row.projectId}); continue; }
        if ('groupId' in row) row.groupId=p.groupId;
      }
      if (model==='project' && ![...effective.group.values()].some(g=>g.id===row.groupId)) {
        skippedReferences.push({model,id:row.id,groupId:row.groupId}); continue;
      }
      const key=identity(model,row);
      if (seen.has(key)) throw new Error(`Duplicate source identity: ${model}`);
      seen.add(key);
      const b=baseMap.get(key),c=currentMap.get(key);
      if (!c) {
        if (b) {preservedDeletions.push({model,key});continue;}
        // IDs are authoritative; no fuzzy title-based merge of different records.
        operations.push({model,action:'create',data:row});
        effective[model].set(key,row);stats[model].created++;
        continue;
      }
      const patch={};
      for (const [field,incoming] of Object.entries(row)) {
        if (['id','workspaceId','userId'].includes(field) || equal(c[field],incoming)) continue;
        if (b && equal(c[field],b[field])) patch[field]=incoming;
        else if (!b || !equal(incoming,b[field])) conflicts.push({model,id:c.id,field,
          current:c[field],browser:incoming,baseline:b?.[field] ?? null});
        // A deliberate post-migration edit wins over the browser snapshot.
      }
      if (Object.keys(patch).length) {
        operations.push({model,action:'update',where:{id:c.id},data:patch});
        effective[model].set(key,{...c,...patch});stats[model].updated++;
      } else stats[model].unchanged++;
    }
    stats[model].keptAdditional=[...currentMap.keys()].filter(key=>!seen.has(key)).length;
  }
  return {operations,stats,conflicts,preservedDeletions,skippedReferences};
}

export function reuseNewGroups(desired, baseline, current) {
  const aliases={};
  for (const group of desired.group) {
    if(current.group.some(g=>g.id===group.id)) continue;
    const matches=current.group.filter(g=>!g.archivedAt &&
      !baseline.group.some(b=>b.id===g.id) && g.name.trim().toLowerCase()===group.name.trim().toLowerCase());
    if(matches.length>1) throw new Error('Ambiguous manually recreated group');
    if(matches.length===1) aliases[group.id]=matches[0].id;
  }
  const mapped=plain(desired);
  for (const model of MODELS) for (const row of mapped[model]) {
    if(model==='group' && aliases[row.id]) row.id=aliases[row.id];
    if(row.groupId && aliases[row.groupId]) row.groupId=aliases[row.groupId];
  }
  return {desired:mapped,aliases};
}
