import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleWorkspaceBootstrapRequest } from '../api/bootstrap/index.js';
import {
  handleGetAccountRequest,
  handleUpdateProfileRequest,
  handleUpdateSettingsRequest,
} from '../api/account/index.js';
import { handleSaveAchievementsStateRequest } from '../api/achievements/index.js';
import { handleSavePlanningStateRequest } from '../api/planning/index.js';
import {
  handleArchiveGroupRequest,
  handleArchiveProjectRequest,
  handleCreateGroupRequest,
  handleCreateProjectRequest,
  handleGetArchivedCatalogRequest,
  handleGetCatalogRequest,
  handleRestoreGroupRequest,
  handleRestoreProjectRequest,
  handleUpdateGroupRequest,
  handleUpdateProjectRequest,
} from '../api/catalog/index.js';
import {
  handleCurrentUserRequest,
  handleLoginRequest,
  handleLogoutRequest,
  handleRegisterRequest,
} from '../auth/index.js';
import { createServer, sendWebResponse, toWebRequest } from './node-request.js';

const port = Number(process.env.PORT ?? 3000);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '../../..');

function getContentType(filePath: string) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.ico')) return 'image/x-icon';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'text/plain; charset=utf-8';
}

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

async function serveStaticAsset(relativePath: string) {
  const filePath = path.resolve(projectRoot, relativePath);
  const file = await readFile(filePath);

  return new Response(file, {
    status: 200,
    headers: {
      'content-type': getContentType(filePath),
    },
  });
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
  headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function route(request: Request) {
  const url = new URL(request.url);

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/version3.html')) {
    return serveStaticAsset('version3.html');
  }

  if (request.method === 'GET' && url.pathname === '/favicon.ico') {
    return serveStaticAsset('favicon.ico');
  }

  if (request.method === 'GET' && url.pathname === '/apple-touch-icon.png') {
    return serveStaticAsset('apple-touch-icon.png');
  }

  if (request.method === 'GET' && url.pathname === '/icon-192.png') {
    return serveStaticAsset('icon-192.png');
  }

  if (request.method === 'GET' && url.pathname === '/icon-512.png') {
    return serveStaticAsset('icon-512.png');
  }

  if (request.method === 'GET' && url.pathname === '/style-v3.css') {
    return serveStaticAsset('style-v3.css');
  }

  if (request.method === 'GET' && url.pathname === '/app-v3.js') {
    return serveStaticAsset('app-v3.js');
  }

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

  if (request.method === 'GET' && url.pathname === '/api/account') {
    return withCors(request, await handleGetAccountRequest(request));
  }

  if (request.method === 'PATCH' && url.pathname === '/api/account/profile') {
    return withCors(request, await handleUpdateProfileRequest(request));
  }

  if (request.method === 'PATCH' && url.pathname === '/api/account/settings') {
    return withCors(request, await handleUpdateSettingsRequest(request));
  }

  if (request.method === 'PATCH' && url.pathname === '/api/planning-state') {
    return withCors(request, await handleSavePlanningStateRequest(request));
  }

  if (request.method === 'PATCH' && url.pathname === '/api/achievements-state') {
    return withCors(request, await handleSaveAchievementsStateRequest(request));
  }

  if (request.method === 'GET' && url.pathname === '/api/catalog') {
    return withCors(request, await handleGetCatalogRequest(request));
  }

  if (request.method === 'GET' && url.pathname === '/api/catalog/archive') {
    return withCors(request, await handleGetArchivedCatalogRequest(request));
  }

  if (request.method === 'POST' && url.pathname === '/api/catalog/groups') {
    return withCors(request, await handleCreateGroupRequest(request));
  }

  if (request.method === 'PATCH' && url.pathname.startsWith('/api/catalog/groups/')) {
    const groupId = url.pathname.slice('/api/catalog/groups/'.length);
    return withCors(request, await handleUpdateGroupRequest(request, groupId));
  }

  if (request.method === 'DELETE' && url.pathname.startsWith('/api/catalog/groups/')) {
    const groupId = url.pathname.slice('/api/catalog/groups/'.length);
    return withCors(request, await handleArchiveGroupRequest(request, groupId));
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/catalog/groups/') && url.pathname.endsWith('/restore')) {
    const groupId = url.pathname.slice('/api/catalog/groups/'.length, -'/restore'.length);
    return withCors(request, await handleRestoreGroupRequest(request, groupId));
  }

  if (request.method === 'POST' && url.pathname === '/api/catalog/projects') {
    return withCors(request, await handleCreateProjectRequest(request));
  }

  if (request.method === 'PATCH' && url.pathname.startsWith('/api/catalog/projects/')) {
    const projectId = url.pathname.slice('/api/catalog/projects/'.length);
    return withCors(request, await handleUpdateProjectRequest(request, projectId));
  }

  if (request.method === 'DELETE' && url.pathname.startsWith('/api/catalog/projects/')) {
    const projectId = url.pathname.slice('/api/catalog/projects/'.length);
    return withCors(request, await handleArchiveProjectRequest(request, projectId));
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/catalog/projects/') && url.pathname.endsWith('/restore')) {
    const projectId = url.pathname.slice('/api/catalog/projects/'.length, -'/restore'.length);
    return withCors(request, await handleRestoreProjectRequest(request, projectId));
  }

  return withCors(request, notFound());
}

const server = createServer(async (req, res) => {
  let request: Request | null = null;

  try {
    request = await toWebRequest(req);
    const response = await route(request);
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_SERVER_ERROR';
    const fallbackResponse = new Response(
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
    );
    const response = request ? withCors(request, fallbackResponse) : fallbackResponse;

    await sendWebResponse(res, response);
  }
});

server.listen(port, () => {
  console.log(`Task Vasilich V3 dev server listening on http://localhost:${port}`);
});
