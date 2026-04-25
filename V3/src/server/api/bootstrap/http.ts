import { ZodError } from 'zod';

import { markUserSeen } from '../../auth/activity.js';
import { getCurrentSessionFromRequest } from '../../auth/current-user.js';
import { getWorkspaceBootstrap } from './get-workspace-bootstrap.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

export async function handleWorkspaceBootstrapRequest(request: Request) {
  try {
    const session = await getCurrentSessionFromRequest(request);

    if (!session) {
      return json(
        {
          ok: false,
          error: 'UNAUTHORIZED',
        },
        401,
      );
    }

    const data = await getWorkspaceBootstrap(session);
    await markUserSeen(session.userId);

    return json({
      ok: true,
      data,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return json(
        {
          ok: false,
          error: 'INVALID_BOOTSTRAP_QUERY',
          details: error.flatten(),
        },
        400,
      );
    }

    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return json(
        {
          ok: false,
          error: 'UNAUTHORIZED',
        },
        401,
      );
    }

    if (error instanceof Error && error.message === 'FORBIDDEN_WORKSPACE_ACCESS') {
      return json(
        {
          ok: false,
          error: 'FORBIDDEN_WORKSPACE_ACCESS',
        },
        403,
      );
    }

    if (error instanceof Error) {
      return json(
        {
          ok: false,
          error: 'BOOTSTRAP_REQUEST_FAILED',
          message: error.message,
        },
        500,
      );
    }

    return json(
      {
        ok: false,
        error: 'BOOTSTRAP_REQUEST_FAILED',
      },
      500,
    );
  }
}
