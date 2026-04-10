import { ZodError } from 'zod';

import { getCurrentSessionFromRequest } from '../../auth/current-user.js';
import { getAccount, updateProfile, updateSettings } from './service.js';
import { updateProfileSchema, updateSettingsSchema } from './schema.js';

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

export async function handleGetAccountRequest(request: Request) {
  try {
    const session = await getAuthorizedSession(request);
    const data = await getAccount(session.userId, session.workspaceId);

    return json({ ok: true, data });
  } catch (error) {
    return handleAccountError(error, 'GET_ACCOUNT_FAILED');
  }
}

export async function handleUpdateProfileRequest(request: Request) {
  try {
    const session = await getAuthorizedSession(request);
    const body = updateProfileSchema.parse(await request.json());
    const data = await updateProfile(session.userId, session.workspaceId, body);

    return json({ ok: true, data });
  } catch (error) {
    return handleAccountError(error, 'UPDATE_PROFILE_FAILED');
  }
}

export async function handleUpdateSettingsRequest(request: Request) {
  try {
    const session = await getAuthorizedSession(request);
    const body = updateSettingsSchema.parse(await request.json());
    const data = await updateSettings(session.userId, session.workspaceId, body);

    return json({ ok: true, data });
  } catch (error) {
    return handleAccountError(error, 'UPDATE_SETTINGS_FAILED');
  }
}

function handleAccountError(error: unknown, fallbackCode: string) {
  if (error instanceof ZodError) {
    return json(
      {
        ok: false,
        error: 'INVALID_ACCOUNT_PAYLOAD',
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

    if (error.message === 'EMAIL_ALREADY_IN_USE') {
      return json({ ok: false, error: 'EMAIL_ALREADY_IN_USE' }, 409);
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
