import { ZodError } from 'zod';

import { getCurrentSessionFromRequest } from '../../auth/current-user.js';
import { achievementsStateSchema } from './schema.js';
import { saveAchievementsState } from './service.js';

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

export async function handleSaveAchievementsStateRequest(request: Request) {
  try {
    const session = await getAuthorizedSession(request);
    const body = achievementsStateSchema.parse(await request.json());
    const data = await saveAchievementsState(session.userId, session.workspaceId, body);

    return json({ ok: true, data });
  } catch (error) {
    return handleAchievementsError(error, 'SAVE_ACHIEVEMENTS_STATE_FAILED');
  }
}

function handleAchievementsError(error: unknown, fallbackCode: string) {
  if (error instanceof ZodError) {
    return json(
      {
        ok: false,
        error: 'INVALID_ACHIEVEMENTS_PAYLOAD',
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
