import { ZodError } from 'zod';

import { getCurrentSessionFromRequest } from '../../auth/current-user.js';
import { planningStateSchema } from './schema.js';
import { savePlanningState } from './service.js';

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

export async function handleSavePlanningStateRequest(request: Request) {
  try {
    const session = await getAuthorizedSession(request);
    const body = planningStateSchema.parse(await request.json());
    const data = await savePlanningState(session.userId, session.workspaceId, body);

    return json({ ok: true, data });
  } catch (error) {
    return handlePlanningError(error, 'SAVE_PLANNING_STATE_FAILED');
  }
}

function handlePlanningError(error: unknown, fallbackCode: string) {
  if (error instanceof ZodError) {
    return json(
      {
        ok: false,
        error: 'INVALID_PLANNING_PAYLOAD',
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

    if (error.message === 'INSUFFICIENT_WORKSPACE_ROLE') {
      return json({ ok: false, error: 'INSUFFICIENT_WORKSPACE_ROLE' }, 403);
    }

    if (error.message === 'PLANNING_VERSION_CONFLICT') {
      return json({ ok: false, error: 'PLANNING_VERSION_CONFLICT' }, 409);
    }

    if (
      error.message === 'GROUP_NOT_FOUND' ||
      error.message === 'PROJECT_NOT_FOUND' ||
      error.message === 'PROJECT_GROUP_MISMATCH' ||
      error.message === 'INVALID_RECURRING_TASK_REFERENCE'
    ) {
      return json({ ok: false, error: error.message }, 400);
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
