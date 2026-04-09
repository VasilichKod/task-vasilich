import {
  handleCurrentUserRequest,
  handleLoginRequest,
  handleLogoutRequest,
  handleRegisterRequest,
} from './http.js';

export async function POST(request: Request) {
  const url = new URL(request.url);

  if (url.pathname.endsWith('/register')) {
    return handleRegisterRequest(request);
  }

  if (url.pathname.endsWith('/login')) {
    return handleLoginRequest(request);
  }

  if (url.pathname.endsWith('/logout')) {
    return handleLogoutRequest();
  }

  return new Response('Not found', { status: 404 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.pathname.endsWith('/me')) {
    return handleCurrentUserRequest(request);
  }

  return new Response('Not found', { status: 404 });
}
