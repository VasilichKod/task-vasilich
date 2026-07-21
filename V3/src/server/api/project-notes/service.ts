import { requireWorkspaceAccess, requireWorkspaceMutationAccess } from '../../auth/workspace-access.js';
import { prisma } from '../../db/client.js';
import type {
  CreateProjectNoteInput,
  CreateProjectNoteSectionInput,
  UpdateProjectNoteInput,
  UpdateProjectNoteSectionInput,
} from './schema.js';

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

async function requireProjectNoteSection(workspaceId: string, projectId: string, sectionId: string) {
  const section = await prisma.projectNoteSection.findFirst({
    where: { id: sectionId, workspaceId, projectId },
    select: { id: true },
  });

  if (!section) {
    throw new Error('PROJECT_NOTE_SECTION_NOT_FOUND');
  }

  return section;
}

export async function getProjectNotes(userId: string, workspaceId: string, projectId: string) {
  await requireWorkspaceAccess(userId, workspaceId);
  await requireProject(workspaceId, projectId);

  const [sections, notes] = await Promise.all([
    prisma.projectNoteSection.findMany({
      where: { workspaceId, projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.projectNote.findMany({
      where: { workspaceId, projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  return { sections, notes };
}

export async function createProjectNoteSection(
  userId: string,
  workspaceId: string,
  projectId: string,
  input: CreateProjectNoteSectionInput,
) {
  await requireWorkspaceMutationAccess(userId, workspaceId);
  await requireProject(workspaceId, projectId);

  const lastSection = await prisma.projectNoteSection.findFirst({
    where: { workspaceId, projectId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return prisma.projectNoteSection.create({
    data: {
      workspaceId,
      projectId,
      name: input.name,
      sortOrder: (lastSection?.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateProjectNoteSection(
  userId: string,
  workspaceId: string,
  sectionId: string,
  input: UpdateProjectNoteSectionInput,
) {
  await requireWorkspaceMutationAccess(userId, workspaceId);

  const section = await prisma.projectNoteSection.findFirst({
    where: { id: sectionId, workspaceId, project: { archivedAt: null } },
    select: { id: true },
  });
  if (!section) throw new Error('PROJECT_NOTE_SECTION_NOT_FOUND');

  return prisma.projectNoteSection.update({
    where: { id: sectionId },
    data: { name: input.name },
  });
}

export async function deleteProjectNoteSection(userId: string, workspaceId: string, sectionId: string) {
  await requireWorkspaceMutationAccess(userId, workspaceId);

  const section = await prisma.projectNoteSection.findFirst({
    where: { id: sectionId, workspaceId, project: { archivedAt: null } },
    select: { id: true, _count: { select: { notes: true } } },
  });
  if (!section) throw new Error('PROJECT_NOTE_SECTION_NOT_FOUND');
  if (section._count.notes > 0) throw new Error('PROJECT_NOTE_SECTION_NOT_EMPTY');

  await prisma.projectNoteSection.delete({ where: { id: sectionId } });
  return { id: sectionId };
}

export async function createProjectNote(
  userId: string,
  workspaceId: string,
  projectId: string,
  input: CreateProjectNoteInput,
) {
  await requireWorkspaceMutationAccess(userId, workspaceId);
  await requireProject(workspaceId, projectId);
  await requireProjectNoteSection(workspaceId, projectId, input.sectionId);

  const lastNote = await prisma.projectNote.findFirst({
    where: { workspaceId, projectId, sectionId: input.sectionId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return prisma.projectNote.create({
    data: {
      workspaceId,
      projectId,
      sectionId: input.sectionId,
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
    select: { id: true, projectId: true, sectionId: true },
  });

  if (!note) {
    throw new Error('PROJECT_NOTE_NOT_FOUND');
  }

  let nextSortOrder: number | undefined;
  if (input.sectionId !== undefined && input.sectionId !== note.sectionId) {
    await requireProjectNoteSection(workspaceId, note.projectId, input.sectionId);
    const lastNote = await prisma.projectNote.findFirst({
      where: { workspaceId, projectId: note.projectId, sectionId: input.sectionId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    nextSortOrder = (lastNote?.sortOrder ?? -1) + 1;
  }

  return prisma.projectNote.update({
    where: { id: noteId },
    data: {
      sectionId: input.sectionId,
      title: input.title,
      body: input.body,
      sortOrder: nextSortOrder,
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
