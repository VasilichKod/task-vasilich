import { requireWorkspaceAccess, requireWorkspaceMutationAccess } from '../../../auth/workspace-access.js';
import { prisma } from '../../../db/client.js';
import {
  buildAsanaPreview,
  parseAsanaExport,
  type AsanaComment,
  type AsanaTask,
} from './parser.js';
import { enrichAsanaTasksWithComments } from './comments.js';
import type { AsanaImportInput } from './schema.js';

const SOURCE_SYSTEM = 'asana';
const MAX_NOTE_BODY_LENGTH = 50000;

function clampText(value: string, maxLength: number) {
  const clean = value.trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 24)).trimEnd()}\n\n[Текст сокращён при импорте]`;
}

function formatCommentDate(value: string | null) {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return value;
  const [, year, month, day, hour, minute] = match;
  return `${day}.${month}.${year}${hour && minute ? ` ${hour}:${minute}` : ''}`;
}

function formatComments(comments: AsanaComment[], indent = '') {
  if (!comments.length) return [];
  const lines = [`${indent}Комментарии`];
  for (const comment of comments) {
    const signature = [formatCommentDate(comment.createdAt), comment.authorName]
      .filter(Boolean)
      .join(' · ');
    lines.push(`${indent}${signature ? `[${signature}]` : '—'}`);
    for (const line of comment.text.split(/\r?\n/)) {
      lines.push(`${indent}${line}`.trimEnd());
    }
  }
  return lines;
}

function formatSubtask(task: AsanaTask, depth: number): string[] {
  const indent = '  '.repeat(depth);
  const lines = [`${indent}${task.completed ? '☑' : '☐'} ${task.name}`];
  const details = task.notes.trim();
  if (details) {
    for (const line of details.split(/\r?\n/)) {
      lines.push(`${indent}  ${line}`.trimEnd());
    }
  }
  if (task.comments.length) {
    lines.push(...formatComments(task.comments, `${indent}  `));
  }
  const dueDate = task.dueOn || task.dueAt;
  if (dueDate) lines.push(`${indent}  Срок: ${dueDate}`);
  for (const subtask of task.subtasks) {
    lines.push(...formatSubtask(subtask, depth + 1));
  }
  return lines;
}

export function buildAsanaTaskBody(task: AsanaTask) {
  const blocks: string[] = [];
  if (task.notes.trim()) blocks.push(task.notes.trim());
  if (task.comments.length) blocks.push(formatComments(task.comments).join('\n'));

  const meta: string[] = [];
  if (task.completed) meta.push('Статус в Asana: выполнено');
  const dueDate = task.dueOn || task.dueAt;
  if (dueDate) meta.push(`Срок в Asana: ${dueDate}`);
  if (meta.length) blocks.push(meta.join('\n'));

  if (task.subtasks.length) {
    blocks.push(`Подзадачи\n${task.subtasks.flatMap(item => formatSubtask(item, 0)).join('\n')}`);
  }

  return clampText(blocks.join('\n\n'), MAX_NOTE_BODY_LENGTH);
}

function parseOptionalDate(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function countNestedTasks(tasks: AsanaTask[]): number {
  return tasks.reduce(
    (total, task) => total + 1 + countNestedTasks(task.subtasks),
    0,
  );
}

export async function previewAsanaImport(userId: string, workspaceId: string, exportData: unknown) {
  await requireWorkspaceAccess(userId, workspaceId);
  return buildAsanaPreview(exportData);
}

export async function importAsanaProject(
  userId: string,
  workspaceId: string,
  input: AsanaImportInput,
) {
  await requireWorkspaceMutationAccess(userId, workspaceId);
  const parsed = parseAsanaExport(input.exportData);
  const importedTasks = input.includeCompleted
    ? parsed.tasks
    : parsed.tasks.filter(task => !task.completed);
  if (input.asanaAccessToken) {
    await enrichAsanaTasksWithComments(importedTasks, input.asanaAccessToken);
  }
  const importedSectionIds = new Set(importedTasks.map(task => task.sectionSourceId));
  const importedSections = parsed.sections.filter(section => importedSectionIds.has(section.sourceId));

  return prisma.$transaction(async tx => {
    let project;
    if (input.target.mode === 'existing') {
      project = await tx.project.findFirst({
        where: { id: input.target.projectId, workspaceId, archivedAt: null },
      });
      if (!project) throw new Error('PROJECT_NOT_FOUND');
    } else {
      const group = await tx.group.findFirst({
        where: { id: input.target.groupId, workspaceId, archivedAt: null },
      });
      if (!group) throw new Error('GROUP_NOT_FOUND');
      const lastProject = await tx.project.findFirst({
        where: { workspaceId, groupId: input.target.groupId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      project = await tx.project.create({
        data: {
          workspaceId,
          groupId: input.target.groupId,
          name: input.target.name,
          color: input.target.color,
          sortOrder: (lastProject?.sortOrder ?? -1) + 1,
        },
      });
    }

    const existingSections = await tx.projectNoteSection.findMany({
      where: { workspaceId, projectId: project.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const sectionBySourceId = new Map(
      existingSections
        .filter(section => section.sourceSystem === SOURCE_SYSTEM && section.sourceId)
        .map(section => [section.sourceId as string, section]),
    );
    const unclaimedSectionsByName = new Map(
      existingSections
        .filter(section => !section.sourceSystem)
        .map(section => [section.name.trim().toLocaleLowerCase('ru-RU'), section]),
    );
    let nextSectionOrder = (existingSections.at(-1)?.sortOrder ?? -1) + 1;
    let createdSectionCount = 0;

    for (const sourceSection of importedSections) {
      let section = sectionBySourceId.get(sourceSection.sourceId);
      if (!section) {
        section = unclaimedSectionsByName.get(sourceSection.name.trim().toLocaleLowerCase('ru-RU'));
        if (section) {
          section = await tx.projectNoteSection.update({
            where: { id: section.id },
            data: { sourceSystem: SOURCE_SYSTEM, sourceId: sourceSection.sourceId },
          });
        }
      }
      if (!section) {
        section = await tx.projectNoteSection.create({
          data: {
            workspaceId,
            projectId: project.id,
            sourceSystem: SOURCE_SYSTEM,
            sourceId: sourceSection.sourceId,
            name: clampText(sourceSection.name, 120),
            sortOrder: nextSectionOrder++,
          },
        });
        createdSectionCount += 1;
      } else if (input.conflictMode === 'update' && section.name !== sourceSection.name) {
        section = await tx.projectNoteSection.update({
          where: { id: section.id },
          data: { name: clampText(sourceSection.name, 120) },
        });
      }
      sectionBySourceId.set(sourceSection.sourceId, section);
    }

    const sourceTaskIds = importedTasks.map(task => task.gid);
    const existingImportedNotes = sourceTaskIds.length
      ? await tx.projectNote.findMany({
        where: {
          workspaceId,
          projectId: project.id,
          sourceSystem: SOURCE_SYSTEM,
          sourceId: { in: sourceTaskIds },
        },
      })
      : [];
    const noteBySourceId = new Map(
      existingImportedNotes
        .filter(note => note.sourceId)
        .map(note => [note.sourceId as string, note]),
    );
    const existingNotes = await tx.projectNote.findMany({
      where: { workspaceId, projectId: project.id },
      select: { sectionId: true, sortOrder: true },
    });
    const nextOrderBySection = new Map<string, number>();
    for (const note of existingNotes) {
      if (!note.sectionId) continue;
      nextOrderBySection.set(
        note.sectionId,
        Math.max(nextOrderBySection.get(note.sectionId) ?? 0, note.sortOrder + 1),
      );
    }

    let createdTaskCount = 0;
    let updatedTaskCount = 0;
    let skippedTaskCount = 0;
    for (const task of importedTasks) {
      const section = sectionBySourceId.get(task.sectionSourceId);
      if (!section) continue;
      const existingNote = noteBySourceId.get(task.gid);
      if (existingNote && input.conflictMode === 'skip') {
        skippedTaskCount += 1;
        continue;
      }

      const title = clampText(task.name, 240);
      const body = buildAsanaTaskBody(task);
      if (existingNote) {
        const sectionChanged = existingNote.sectionId !== section.id;
        const sortOrder = sectionChanged
          ? (nextOrderBySection.get(section.id) ?? 0)
          : existingNote.sortOrder;
        if (sectionChanged) nextOrderBySection.set(section.id, sortOrder + 1);
        const updated = await tx.projectNote.update({
          where: { id: existingNote.id },
          data: {
            sectionId: section.id,
            title,
            body,
            sortOrder,
            updatedAt: parseOptionalDate(task.modifiedAt),
          },
        });
        noteBySourceId.set(task.gid, updated);
        updatedTaskCount += 1;
      } else {
        const sortOrder = nextOrderBySection.get(section.id) ?? 0;
        nextOrderBySection.set(section.id, sortOrder + 1);
        const created = await tx.projectNote.create({
          data: {
            workspaceId,
            projectId: project.id,
            sectionId: section.id,
            sourceSystem: SOURCE_SYSTEM,
            sourceId: task.gid,
            title,
            body,
            sortOrder,
            createdAt: parseOptionalDate(task.createdAt),
            updatedAt: parseOptionalDate(task.modifiedAt),
          },
        });
        noteBySourceId.set(task.gid, created);
        createdTaskCount += 1;
      }
    }

    await tx.project.update({
      where: { id: project.id },
      data: {
        lastActivityAt: new Date(),
        activityScore: { increment: createdTaskCount + updatedTaskCount > 0 ? 1 : 0 },
      },
    });

    return {
      project: {
        id: project.id,
        name: project.name,
        groupId: project.groupId,
        color: project.color,
      },
      source: {
        projectGid: parsed.project.gid,
        projectName: parsed.project.name,
      },
      createdSectionCount,
      createdTaskCount,
      updatedTaskCount,
      skippedTaskCount,
      excludedCompletedTaskCount: input.includeCompleted ? 0 : parsed.completedTaskCount,
      importedSubtaskCount: importedTasks.reduce(
        (total, task) => total + countNestedTasks(task.subtasks),
        0,
      ),
      importedCommentCount: importedTasks.reduce(
        (total, task) => total + task.comments.length + countComments(task.subtasks),
        0,
      ),
    };
  }, { timeout: 30000 });
}

function countComments(tasks: AsanaTask[]): number {
  return tasks.reduce(
    (total, task) => total + task.comments.length + countComments(task.subtasks),
    0,
  );
}
