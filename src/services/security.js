import PBKDF2Lite from 'pbkdf2-lite';

const encoder = new TextEncoder();
const ITERATIONS = 100_000;
const hasher = new PBKDF2Lite(ITERATIONS);

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('A senha deve ter entre 12 e 256 caracteres.');
  return hasher.hash(password);
}

export async function verifyPassword(storedHash, password) {
  if (typeof storedHash !== 'string' || typeof password !== 'string') return false;
  try { return await hasher.verify(storedHash, password); } catch { return false; }
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return [...data].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseCookies(request) {
  const raw = request.headers.get('Cookie') || '';
  const cookies = Object.create(null);
  for (const part of raw.split(';')) {
    const pair = part.trim();
    if (!pair) continue;
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    if (!name) continue;
    const value = pair.slice(index + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      // Cookie malformado nunca deve ser aceito como credencial.
      delete cookies[name];
    }
  }
  return cookies;
}

export function sessionCookie(token, maxAgeSeconds) {
  return `admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}
