import { requireWorkspaceAccess, requireWorkspaceMutationAccess } from '../../auth/workspace-access.js';
import { prisma } from '../../db/client.js';
import type { CreateProjectNoteInput, UpdateProjectNoteInput } from './schema.js';

async function requireProject(workspaceId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspaceId,
      archivedAt: null,
    },
    select: { id: true },
  });

  if (!project) {
    throw new Error('PROJECT_NOT_FOUND');
  }

  return project;
}

export async function getProjectNotes(userId: string, workspaceId: string, projectId: string) {
  await requireWorkspaceAccess(userId, workspaceId);
  await requireProject(workspaceId, projectId);

  return prisma.projectNote.findMany({
    where: { workspaceId, projectId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function createProjectNote(
  userId: string,
  workspaceId: string,
  projectId: string,
  input: CreateProjectNoteInput,
) {
  await requireWorkspaceMutationAccess(userId, workspaceId);
  await requireProject(workspaceId, projectId);

  const lastNote = await prisma.projectNote.findFirst({
    where: { workspaceId, projectId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return prisma.projectNote.create({
    data: {
      workspaceId,
      projectId,
      title: input.title,
      body: input.body,
      sortOrder: (lastNote?.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateProjectNote(
  userId: string,
  workspaceId: string,
  noteId: string,
  input: UpdateProjectNoteInput,
) {
  await requireWorkspaceMutationAccess(userId, workspaceId);

  const note = await prisma.projectNote.findFirst({
    where: {
      id: noteId,
      workspaceId,
      project: { archivedAt: null },
    },
    select: { id: true },
  });

  if (!note) {
    throw new Error('PROJECT_NOTE_NOT_FOUND');
  }

  return prisma.projectNote.update({
    where: { id: noteId },
    data: {
      title: input.title,
      body: input.body,
    },
  });
}

export async function deleteProjectNote(userId: string, workspaceId: string, noteId: string) {
  await requireWorkspaceMutationAccess(userId, workspaceId);

  const note = await prisma.projectNote.findFirst({
    where: {
      id: noteId,
      workspaceId,
      project: { archivedAt: null },
    },
    select: { id: true },
  });

  if (!note) {
    throw new Error('PROJECT_NOTE_NOT_FOUND');
  }

  await prisma.projectNote.delete({ where: { id: noteId } });
  return { id: noteId };
}
