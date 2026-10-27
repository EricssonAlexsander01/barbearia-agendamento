import { handlePublic } from './routes/public.js';
import { handleAdmin } from './routes/admin.js';
import { HttpError } from './services/appointments.js';
import { nowIso } from './services/time.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const cors = corsHeaders(request, env);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (url.pathname.startsWith('/api/')) {
        if (!env.DB) throw new Error('Binding D1 DB ausente.');
        const publicResponse = await handlePublic(request, env, url, requestId);
        if (publicResponse) return withHeaders(publicResponse, cors);
        const adminResponse = await handleAdmin(request, env, url, requestId);
        if (adminResponse) return withHeaders(adminResponse, cors);
        return withHeaders(json({ error: 'Endpoint não encontrado.', request_id: requestId }, 404), cors);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) console.error(JSON.stringify({ request_id: requestId, at: nowIso(), error: String(error?.message || error) }));
      return withHeaders(json({ error: status === 500 ? 'Erro interno. Informe o código de atendimento.' : error.message, request_id: requestId }, status), cors);
    }
  }
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGIN;
  const headers = new Headers({ 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
  if (origin && allowed && origin === allowed) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  }
  return headers;
}
function withHeaders(response, headers) {
  const merged = new Headers(response.headers);
  headers.forEach((v, k) => merged.set(k, v));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
}
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
