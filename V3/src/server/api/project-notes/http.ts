import { ZodError } from 'zod';

import { getCurrentSessionFromRequest } from '../../auth/current-user.js';
import {
  createProjectNote,
  createProjectNoteSection,
  deleteProjectNoteSection,
  deleteProjectNote,
  getProjectNotes,
  reorderProjectNotes,
  updateProjectNoteSection,
  updateProjectNote,
} from './service.js';
import {
  createProjectNoteSchema,
  createProjectNoteSectionSchema,
  projectNoteIdSchema,
  reorderProjectNotesSchema,
  updateProjectNoteSectionSchema,
  updateProjectNoteSchema,
} from './schema.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function getAuthorizedSession(request: Request) {
  const session = await getCurrentSessionFromRequest(request);
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

export async function handleGetProjectNotesRequest(request: Request, projectId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = projectNoteIdSchema.parse({ id: projectId });
    const data = await getProjectNotes(session.userId, session.workspaceId, params.id);
    return json({ ok: true, data });
  } catch (error) {
    return handleProjectNotesError(error, 'GET_PROJECT_NOTES_FAILED');
  }
}

export async function handleCreateProjectNoteRequest(request: Request, projectId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = projectNoteIdSchema.parse({ id: projectId });
    const body = createProjectNoteSchema.parse(await request.json());
    const data = await createProjectNote(session.userId, session.workspaceId, params.id, body);
    return json({ ok: true, data }, 201);
  } catch (error) {
    return handleProjectNotesError(error, 'CREATE_PROJECT_NOTE_FAILED');
  }
}

export async function handleReorderProjectNotesRequest(request: Request, projectId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = projectNoteIdSchema.parse({ id: projectId });
    const body = reorderProjectNotesSchema.parse(await request.json());
    const data = await reorderProjectNotes(session.userId, session.workspaceId, params.id, body);
    return json({ ok: true, data });
  } catch (error) {
    return handleProjectNotesError(error, 'REORDER_PROJECT_NOTES_FAILED');
  }
}

export async function handleCreateProjectNoteSectionRequest(request: Request, projectId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = projectNoteIdSchema.parse({ id: projectId });
    const body = createProjectNoteSectionSchema.parse(await request.json());
    const data = await createProjectNoteSection(session.userId, session.workspaceId, params.id, body);
    return json({ ok: true, data }, 201);
  } catch (error) {
    return handleProjectNotesError(error, 'CREATE_PROJECT_NOTE_SECTION_FAILED');
  }
}

export async function handleUpdateProjectNoteSectionRequest(request: Request, sectionId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = projectNoteIdSchema.parse({ id: sectionId });
    const body = updateProjectNoteSectionSchema.parse(await request.json());
    const data = await updateProjectNoteSection(session.userId, session.workspaceId, params.id, body);
    return json({ ok: true, data });
  } catch (error) {
    return handleProjectNotesError(error, 'UPDATE_PROJECT_NOTE_SECTION_FAILED');
  }
}

export async function handleDeleteProjectNoteSectionRequest(request: Request, sectionId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = projectNoteIdSchema.parse({ id: sectionId });
    const data = await deleteProjectNoteSection(session.userId, session.workspaceId, params.id);
    return json({ ok: true, data });
  } catch (error) {
    return handleProjectNotesError(error, 'DELETE_PROJECT_NOTE_SECTION_FAILED');
  }
}

export async function handleUpdateProjectNoteRequest(request: Request, noteId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = projectNoteIdSchema.parse({ id: noteId });
    const body = updateProjectNoteSchema.parse(await request.json());
    const data = await updateProjectNote(session.userId, session.workspaceId, params.id, body);
    return json({ ok: true, data });
  } catch (error) {
    return handleProjectNotesError(error, 'UPDATE_PROJECT_NOTE_FAILED');
  }
}

export async function handleDeleteProjectNoteRequest(request: Request, noteId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = projectNoteIdSchema.parse({ id: noteId });
    const data = await deleteProjectNote(session.userId, session.workspaceId, params.id);
    return json({ ok: true, data });
  } catch (error) {
    return handleProjectNotesError(error, 'DELETE_PROJECT_NOTE_FAILED');
  }
}

function handleProjectNotesError(error: unknown, fallbackCode: string) {
  if (error instanceof ZodError) {
    return json({ ok: false, error: 'INVALID_PROJECT_NOTE_PAYLOAD', details: error.flatten() }, 400);
  }

  if (error instanceof Error) {
    if (error.message === 'UNAUTHORIZED') {
      return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
    }
    if (error.message === 'FORBIDDEN_WORKSPACE_ACCESS' || error.message === 'INSUFFICIENT_WORKSPACE_ROLE') {
      return json({ ok: false, error: error.message }, 403);
    }
    if (
      error.message === 'PROJECT_NOT_FOUND'
      || error.message === 'PROJECT_NOTE_NOT_FOUND'
      || error.message === 'PROJECT_NOTE_SECTION_NOT_FOUND'
    ) {
      return json({ ok: false, error: error.message }, 404);
    }
    if (error.message === 'PROJECT_NOTE_SECTION_NOT_EMPTY') {
      return json({ ok: false, error: error.message }, 409);
    }
    if (error.message === 'PROJECT_NOTE_ORDER_CONFLICT') {
      return json({ ok: false, error: error.message }, 409);
    }
    return json({ ok: false, error: fallbackCode, message: error.message }, 500);
  }

  return json({ ok: false, error: fallbackCode }, 500);
}
