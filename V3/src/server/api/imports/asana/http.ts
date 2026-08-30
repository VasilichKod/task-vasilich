import { ZodError } from 'zod';

import { getCurrentSessionFromRequest } from '../../../auth/current-user.js';
import { importAsanaProject, previewAsanaImport } from './service.js';
import { asanaImportRequestSchema, asanaPreviewRequestSchema } from './schema.js';

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

export async function handlePreviewAsanaImportRequest(request: Request) {
  try {
    const session = await getAuthorizedSession(request);
    const body = asanaPreviewRequestSchema.parse(await request.json());
    const data = await previewAsanaImport(session.userId, session.workspaceId, body.exportData);
    return json({ ok: true, data });
  } catch (error) {
    return handleAsanaImportError(error, 'ASANA_PREVIEW_FAILED');
  }
}

export async function handleImportAsanaProjectRequest(request: Request) {
  try {
    const session = await getAuthorizedSession(request);
    const body = asanaImportRequestSchema.parse(await request.json());
    const data = await importAsanaProject(session.userId, session.workspaceId, body);
    return json({ ok: true, data });
  } catch (error) {
    return handleAsanaImportError(error, 'ASANA_IMPORT_FAILED');
  }
}

function handleAsanaImportError(error: unknown, fallbackCode: string) {
  if (error instanceof ZodError) {
    return json({ ok: false, error: 'INVALID_ASANA_EXPORT', details: error.flatten() }, 400);
  }
  if (error instanceof SyntaxError) {
    return json({ ok: false, error: 'INVALID_ASANA_JSON' }, 400);
  }
  if (error instanceof Error) {
    if (error.message === 'UNAUTHORIZED') return json({ ok: false, error: error.message }, 401);
    if (error.message === 'FORBIDDEN_WORKSPACE_ACCESS' || error.message === 'INSUFFICIENT_WORKSPACE_ROLE') {
      return json({ ok: false, error: error.message }, 403);
    }
    if (error.message === 'PROJECT_NOT_FOUND' || error.message === 'GROUP_NOT_FOUND') {
      return json({ ok: false, error: error.message }, 404);
    }
    if (
      error.message === 'ASANA_PROJECT_NOT_FOUND'
      || error.message === 'ASANA_EXPORT_TOO_LARGE'
      || error.message === 'ASANA_NESTING_TOO_DEEP'
      || error.message === 'ASANA_TOKEN_INVALID'
      || error.message === 'ASANA_COMMENTS_RATE_LIMITED'
      || error.message === 'ASANA_COMMENTS_FETCH_FAILED'
    ) {
      return json({ ok: false, error: error.message }, 400);
    }
    return json({ ok: false, error: fallbackCode, message: error.message }, 500);
  }
  return json({ ok: false, error: fallbackCode }, 500);
}
