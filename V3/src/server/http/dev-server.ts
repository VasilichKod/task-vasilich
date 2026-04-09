import { handleWorkspaceBootstrapRequest } from '../api/bootstrap/index.js';
import {
  handleCurrentUserRequest,
  handleLoginRequest,
  handleLogoutRequest,
  handleRegisterRequest,
} from '../auth/index.js';
import { createServer, sendWebResponse, toWebRequest } from './node-request.js';

const port = Number(process.env.PORT ?? 3000);

function notFound() {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'NOT_FOUND',
    }),
    {
      status: 404,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    },
  );
}

function withCors(request: Request, response: Response) {
  const requestOrigin = request.headers.get('origin');
  const allowOrigin = requestOrigin && requestOrigin !== 'null'
    ? requestOrigin
    : requestOrigin === 'null'
      ? 'null'
      : process.env.APP_URL ?? 'http://localhost:3000';
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', allowOrigin);
  headers.set('access-control-allow-credentials', 'true');
  headers.set('access-control-allow-headers', 'content-type');
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function route(request: Request) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return withCors(request, new Response(null, { status: 204 }));
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    return withCors(request, await handleRegisterRequest(request));
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    return withCors(request, await handleLoginRequest(request));
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    return withCors(request, await handleLogoutRequest());
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    return withCors(request, await handleCurrentUserRequest(request));
  }

  if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
    return withCors(request, await handleWorkspaceBootstrapRequest(request));
  }

  return withCors(request, notFound());
}

const server = createServer(async (req, res) => {
  try {
    const request = await toWebRequest(req);
    const response = await route(request);
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_SERVER_ERROR';
    const response = withCors(
      request,
      new Response(
        JSON.stringify({
          ok: false,
          error: 'INTERNAL_SERVER_ERROR',
          message,
        }),
        {
          status: 500,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        },
      ),
    );

    await sendWebResponse(res, response);
  }
});

server.listen(port, () => {
  console.log(`Task Vasilich V3 dev server listening on http://localhost:${port}`);
});
