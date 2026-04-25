import { requireAdminSession } from '../../auth/admin.js';
import { getAdminStats } from './service.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

export async function handleGetAdminStatsRequest(request: Request) {
  try {
    await requireAdminSession(request);
    const data = await getAdminStats();

    return json({
      ok: true,
      data,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return json(
        {
          ok: false,
          error: 'UNAUTHORIZED',
        },
        401,
      );
    }

    if (error instanceof Error && error.message === 'FORBIDDEN_ADMIN_ACCESS') {
      return json(
        {
          ok: false,
          error: 'FORBIDDEN_ADMIN_ACCESS',
        },
        403,
      );
    }

    if (error instanceof Error) {
      return json(
        {
          ok: false,
          error: 'GET_ADMIN_STATS_FAILED',
          message: error.message,
        },
        500,
      );
    }

    return json(
      {
        ok: false,
        error: 'GET_ADMIN_STATS_FAILED',
      },
      500,
    );
  }
}
