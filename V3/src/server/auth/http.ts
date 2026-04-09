import { ZodError } from 'zod';

import { getCurrentUserFromRequest } from './current-user.js';
import { loginUser } from './login.js';
import { registerUser } from './register.js';
import { clearSessionCookie, createSessionCookie } from './session.js';

function json(data: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(headers ?? {}),
    },
  });
}

async function readJsonBody<T>(request: Request) {
  return (await request.json()) as T;
}

export async function handleRegisterRequest(request: Request) {
  try {
    const body = await readJsonBody(request);
    const result = await registerUser(body);

    return json(
      {
        ok: true,
        data: {
          user: result.user,
          workspace: result.workspace,
        },
      },
      201,
      {
        'set-cookie': createSessionCookie(result.sessionToken),
      },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return json(
        {
          ok: false,
          error: 'INVALID_REGISTER_PAYLOAD',
          details: error.flatten(),
        },
        400,
      );
    }

    if (error instanceof Error && error.message === 'EMAIL_ALREADY_IN_USE') {
      return json(
        {
          ok: false,
          error: 'EMAIL_ALREADY_IN_USE',
        },
        409,
      );
    }

    if (error instanceof Error) {
      return json(
        {
          ok: false,
          error: 'REGISTER_REQUEST_FAILED',
          message: error.message,
        },
        500,
      );
    }

    return json(
      {
        ok: false,
        error: 'REGISTER_REQUEST_FAILED',
      },
      500,
    );
  }
}

export async function handleLoginRequest(request: Request) {
  try {
    const body = await readJsonBody(request);
    const result = await loginUser(body);

    return json(
      {
        ok: true,
        data: {
          user: result.user,
          workspace: result.workspace,
        },
      },
      200,
      {
        'set-cookie': createSessionCookie(result.sessionToken),
      },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return json(
        {
          ok: false,
          error: 'INVALID_LOGIN_PAYLOAD',
          details: error.flatten(),
        },
        400,
      );
    }

    if (
      error instanceof Error &&
      (error.message === 'INVALID_CREDENTIALS' ||
        error.message === 'USER_IS_DISABLED' ||
        error.message === 'USER_HAS_NO_WORKSPACE')
    ) {
      return json(
        {
          ok: false,
          error: error.message,
        },
        401,
      );
    }

    if (error instanceof Error) {
      return json(
        {
          ok: false,
          error: 'LOGIN_REQUEST_FAILED',
          message: error.message,
        },
        500,
      );
    }

    return json(
      {
        ok: false,
        error: 'LOGIN_REQUEST_FAILED',
      },
      500,
    );
  }
}

export async function handleLogoutRequest() {
  return json(
    {
      ok: true,
    },
    200,
    {
      'set-cookie': clearSessionCookie(),
    },
  );
}

export async function handleCurrentUserRequest(request: Request) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return json(
        {
          ok: false,
          error: 'UNAUTHORIZED',
        },
        401,
      );
    }

    return json({
      ok: true,
      data: user,
    });
  } catch (error) {
    if (error instanceof Error) {
      return json(
        {
          ok: false,
          error: 'CURRENT_USER_REQUEST_FAILED',
          message: error.message,
        },
        500,
      );
    }

    return json(
      {
        ok: false,
        error: 'CURRENT_USER_REQUEST_FAILED',
      },
      500,
    );
  }
}
