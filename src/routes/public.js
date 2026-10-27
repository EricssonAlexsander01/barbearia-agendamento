import { getAvailableSlots } from '../services/availability.js';
import { createAppointment, cancelPublicAppointment, HttpError } from '../services/appointments.js';
import { sha256Hex } from '../services/security.js';
import { nowIso } from '../services/time.js';

export async function handlePublic(request, env, url, requestId) {
  if (request.method === 'GET' && url.pathname === '/api/public/services') {
    const r = await env.DB.prepare('SELECT id, nome, preco_centavos, duracao_min FROM services WHERE ativo = 1 ORDER BY nome').all();
    return json({ services: r.results || [] });
  }
  if (request.method === 'GET' && url.pathname === '/api/public/barbers') {
    const r = await env.DB.prepare('SELECT id, nome FROM barbers WHERE ativo = 1 ORDER BY nome').all();
    return json({ barbers: r.results || [] });
  }
  if (request.method === 'GET' && url.pathname === '/api/public/availability') {
    const serviceIds = url.searchParams.getAll('service_id');
    if (!serviceIds.length && url.searchParams.has('service_ids')) serviceIds.push(...url.searchParams.get('service_ids').split(','));
    const date = url.searchParams.get('date');
    const barberId = url.searchParams.get('barber_id');
    if (!serviceIds.length || !date) throw new HttpError(400, 'Informe os serviços e a data.');
    const cfg = await env.DB.prepare("SELECT valor FROM settings WHERE chave = 'business_time_zone'").first();
    const slots = await getAvailableSlots(env.DB, { serviceIds, date, barberId, timeZone: cfg?.valor || env.APP_TIME_ZONE || 'America/Sao_Paulo' });
    return json({ slots });
  }
  if (request.method === 'POST' && url.pathname === '/api/public/appointments') {
    const body = await readJson(request);
    const appointment = await createAppointment(env, body, requestId);
    return json({ appointment }, 201);
  }
  if (request.method === 'POST' && url.pathname === '/api/public/appointments/cancel') {
    const body = await readJson(request);
    return json(await cancelPublicAppointment(env, body.token, requestId));
  }
  if (request.method === 'GET' && url.pathname === '/api/public/appointments/me') {
    const token = url.searchParams.get('token') || '';
    const hash = await sha256Hex(token);
    const row = await env.DB.prepare(`SELECT a.id, a.inicio, a.fim, a.status, a.preco_snapshot_centavos, a.duracao_min_snapshot, b.nome AS barbeiro
      FROM appointment_access_tokens t JOIN appointments a ON a.id = t.appointment_id
      JOIN barbers b ON b.id = a.barber_id
      WHERE t.token_hash = ? AND t.revogado_em IS NULL AND t.expira_em > ? AND a.status = 'AGENDADO' LIMIT 1`).bind(hash, nowIso()).first();
    if (!row) throw new HttpError(404, 'Não foi possível localizar um agendamento autorizado.');
    const services = await env.DB.prepare('SELECT nome_snapshot AS nome, preco_snapshot_centavos, duracao_min_snapshot FROM appointment_services WHERE appointment_id = ? ORDER BY ordem').bind(row.id).all();
    const legacy = !services.results?.length ? await env.DB.prepare('SELECT nome AS nome, preco_centavos AS preco_snapshot_centavos, duracao_min AS duracao_min_snapshot FROM services s JOIN appointments a ON a.service_id = s.id WHERE a.id = ?').bind(row.id).all() : null;
    const list = services.results?.length ? services.results : (legacy?.results || []);
    return json({ appointment: { ...row, servico: list.map(s => s.nome).join(' + '), servicos: list, total_preco_centavos: Number(row.preco_snapshot_centavos), duracao_min: Number(row.duracao_min_snapshot) } });
  }
  return null;
}
async function readJson(request) { try { return await request.json(); } catch { throw new HttpError(400, 'JSON inválido.'); } }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
