import { jwtVerify, SignJWT } from 'jose';

const SESSION_COOKIE_NAME = 'task_vasilich_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error('AUTH_SECRET_IS_NOT_CONFIGURED');
  }

  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  workspaceId: string;
};

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getAuthSecret());
}

export async function verifySessionToken(token: string) {
  const result = await jwtVerify<SessionPayload>(token, getAuthSecret());
  return result.payload;
}

export function createSessionCookie(token: string) {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=2592000',
  ].join('; ');
}

export function clearSessionCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');
}

export function readSessionTokenFromCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(part => part.trim());
  const sessionCookie = cookies.find(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!sessionCookie) return null;

  return sessionCookie.slice(SESSION_COOKIE_NAME.length + 1) || null;
}

export const sessionCookieName = SESSION_COOKIE_NAME;
