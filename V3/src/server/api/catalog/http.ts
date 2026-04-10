import { ZodError } from 'zod';

import { getCurrentSessionFromRequest } from '../../auth/current-user.js';
import {
  archiveGroup,
  archiveProject,
  createGroup,
  createProject,
  getArchivedCatalog,
  getCatalog,
  restoreGroup,
  restoreProject,
  updateGroup,
  updateProject,
} from './service.js';
import {
  createGroupSchema,
  createProjectSchema,
  entityIdSchema,
  updateGroupSchema,
  updateProjectSchema,
} from './schema.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

async function getAuthorizedSession(request: Request) {
  const session = await getCurrentSessionFromRequest(request);

  if (!session) {
    throw new Error('UNAUTHORIZED');
  }

  return session;
}

export async function handleGetCatalogRequest(request: Request) {
  try {
    const session = await getAuthorizedSession(request);
    const data = await getCatalog(session.userId, session.workspaceId);

    return json({ ok: true, data });
  } catch (error) {
    return handleCatalogError(error, 'GET_CATALOG_FAILED');
  }
}

export async function handleGetArchivedCatalogRequest(request: Request) {
  try {
    const session = await getAuthorizedSession(request);
    const data = await getArchivedCatalog(session.userId, session.workspaceId);

    return json({ ok: true, data });
  } catch (error) {
    return handleCatalogError(error, 'GET_ARCHIVED_CATALOG_FAILED');
  }
}

export async function handleCreateGroupRequest(request: Request) {
  try {
    const session = await getAuthorizedSession(request);
    const body = createGroupSchema.parse(await request.json());
    const data = await createGroup(session.userId, session.workspaceId, body);

    return json({ ok: true, data }, 201);
  } catch (error) {
    return handleCatalogError(error, 'CREATE_GROUP_FAILED');
  }
}

export async function handleUpdateGroupRequest(request: Request, groupId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = entityIdSchema.parse({ id: groupId });
    const body = updateGroupSchema.parse(await request.json());
    const data = await updateGroup(session.userId, session.workspaceId, params.id, body);

    return json({ ok: true, data });
  } catch (error) {
    return handleCatalogError(error, 'UPDATE_GROUP_FAILED');
  }
}

export async function handleArchiveGroupRequest(request: Request, groupId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = entityIdSchema.parse({ id: groupId });
    const data = await archiveGroup(session.userId, session.workspaceId, params.id);

    return json({ ok: true, data });
  } catch (error) {
    return handleCatalogError(error, 'ARCHIVE_GROUP_FAILED');
  }
}

export async function handleRestoreGroupRequest(request: Request, groupId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = entityIdSchema.parse({ id: groupId });
    const data = await restoreGroup(session.userId, session.workspaceId, params.id);

    return json({ ok: true, data });
  } catch (error) {
    return handleCatalogError(error, 'RESTORE_GROUP_FAILED');
  }
}

export async function handleCreateProjectRequest(request: Request) {
  try {
    const session = await getAuthorizedSession(request);
    const body = createProjectSchema.parse(await request.json());
    const data = await createProject(session.userId, session.workspaceId, body);

    return json({ ok: true, data }, 201);
  } catch (error) {
    return handleCatalogError(error, 'CREATE_PROJECT_FAILED');
  }
}

export async function handleUpdateProjectRequest(request: Request, projectId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = entityIdSchema.parse({ id: projectId });
    const body = updateProjectSchema.parse(await request.json());
    const data = await updateProject(session.userId, session.workspaceId, params.id, body);

    return json({ ok: true, data });
  } catch (error) {
    return handleCatalogError(error, 'UPDATE_PROJECT_FAILED');
  }
}

export async function handleArchiveProjectRequest(request: Request, projectId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = entityIdSchema.parse({ id: projectId });
    const data = await archiveProject(session.userId, session.workspaceId, params.id);

    return json({ ok: true, data });
  } catch (error) {
    return handleCatalogError(error, 'ARCHIVE_PROJECT_FAILED');
  }
}

export async function handleRestoreProjectRequest(request: Request, projectId: string) {
  try {
    const session = await getAuthorizedSession(request);
    const params = entityIdSchema.parse({ id: projectId });
    const data = await restoreProject(session.userId, session.workspaceId, params.id);

    return json({ ok: true, data });
  } catch (error) {
    return handleCatalogError(error, 'RESTORE_PROJECT_FAILED');
  }
}

function handleCatalogError(error: unknown, fallbackCode: string) {
  if (error instanceof ZodError) {
    return json(
      {
        ok: false,
        error: 'INVALID_CATALOG_PAYLOAD',
        details: error.flatten(),
      },
      400,
    );
  }

  if (error instanceof Error) {
    if (error.message === 'UNAUTHORIZED') {
      return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
    }

    if (error.message === 'FORBIDDEN_WORKSPACE_ACCESS') {
      return json({ ok: false, error: 'FORBIDDEN_WORKSPACE_ACCESS' }, 403);
    }

    if (
      error.message === 'GROUP_NOT_FOUND' ||
      error.message === 'PROJECT_NOT_FOUND'
    ) {
      return json({ ok: false, error: error.message }, 404);
    }

    if (
      error.message === 'SYSTEM_GROUP_ARCHIVE_FORBIDDEN' ||
      error.message === 'SYSTEM_GROUP_RENAME_FORBIDDEN'
    ) {
      return json({ ok: false, error: error.message }, 409);
    }

    return json(
      {
        ok: false,
        error: fallbackCode,
        message: error.message,
      },
      500,
    );
  }

  return json({ ok: false, error: fallbackCode }, 500);
}
