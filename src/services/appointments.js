// src/services/appointments.js
import { randomToken, sha256Hex } from './security.js';
import { nowIso, parseUtc, isoPlusMinutes, getZonedDateInfo } from './time.js';

function normalizeServiceIds(input) {
  const raw = Array.isArray(input.service_ids) ? input.service_ids
    : Array.isArray(input.serviceIds) ? input.serviceIds
    : input.service_id ? [input.service_id] : [];
  const ids = [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))];
  if (!ids.length || ids.length > 20) throw new HttpError(400, 'Selecione pelo menos um serviço (máximo de 20).');
  if (ids.length !== raw.length) throw new HttpError(400, 'Há serviços duplicados ou inválidos na seleção.');
  return ids;
}

export async function createAppointment(env, input, requestId) {
  const db = env.DB;
  const name = String(input.nome || '').trim();
  const phone = String(input.telefone || '').trim();
  const serviceIds = normalizeServiceIds(input);
  const requestedBarberId = input.barber_id ? String(input.barber_id) : null;
  const startUtc = String(input.inicio || '');
  parseUtc(startUtc);
  if (name.length < 1 || name.length > 120) throw new HttpError(400, 'Informe seu nome.');
  if (!/^\+?[0-9 ()-]{8,20}$/.test(phone)) throw new HttpError(400, 'Informe um telefone válido.');

  const placeholders = serviceIds.map(() => '?').join(',');
  const serviceRows = await db.prepare(`SELECT id, nome, preco_centavos, duracao_min, buffer_min FROM services WHERE ativo = 1 AND id IN (${placeholders})`).bind(...serviceIds).all();
  const byId = new Map((serviceRows.results || []).map((s) => [s.id, s]));
  if (byId.size !== serviceIds.length) throw new HttpError(400, 'Um ou mais serviços estão indisponíveis. Atualize a página e tente novamente.');
  const services = serviceIds.map((id) => byId.get(id)); // preserve client selection order
  const totalPrice = services.reduce((sum, s) => sum + Number(s.preco_centavos), 0);
  const totalDuration = services.reduce((sum, s) => sum + Number(s.duracao_min), 0);
  const totalBuffer = services.reduce((sum, s) => sum + Number(s.buffer_min || 0), 0);
  const endUtc = isoPlusMinutes(startUtc, totalDuration);
  const bufferEndUtc = isoPlusMinutes(endUtc, totalBuffer);

  const settingsRows = await db.prepare("SELECT chave, valor FROM settings WHERE chave IN ('minimum_advance_minutes','booking_window_days','business_time_zone')").all();
  const settings = Object.fromEntries((settingsRows.results || []).map((x) => [x.chave, x.valor]));
  const nowMs = Date.now();
  const startMs = parseUtc(startUtc);
  const minAdvance = Number(settings.minimum_advance_minutes || 60);
  const bookingDays = Number(settings.booking_window_days || 30);
  if (startMs < nowMs + minAdvance * 60_000) throw new HttpError(400, `Escolha um horário com pelo menos ${minAdvance} minutos de antecedência.`);
  if (startMs > nowMs + bookingDays * 86400_000) throw new HttpError(400, `O agendamento pode ser feito com até ${bookingDays} dias de antecedência.`);
  const timeZone = settings.business_time_zone || env.APP_TIME_ZONE || 'America/Sao_Paulo';
  const { weekday } = getZonedDateInfo(startUtc, timeZone);
  const candidates = await getCandidates(db, { requestedBarberId, serviceIds, startUtc, endUtc, bufferEndUtc, timeZone, weekday });
  if (!candidates.length) throw new HttpError(409, 'Esse horário não está mais disponível para todos os serviços com um único profissional. Escolha outro horário.');

  const accessToken = randomToken(32);
  const accessTokenHash = await sha256Hex(accessToken);
  const tokenId = crypto.randomUUID();
  const now = nowIso();
  const tokenTtlDays = Number(env.PUBLIC_TOKEN_TTL_DAYS || 45);
  const tokenExpiry = new Date(Date.now() + tokenTtlDays * 86400_000).toISOString();

  for (const barber of candidates) {
    const appointmentId = crypto.randomUUID();
    const statements = [db.prepare(`
      INSERT INTO appointments (
        id, barber_id, service_id, cliente_nome, cliente_telefone,
        inicio, fim, buffer_fim, status, preco_snapshot_centavos,
        duracao_min_snapshot, buffer_min_snapshot, criado_em
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'AGENDADO', ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM appointments a WHERE a.barber_id = ? AND a.status = 'AGENDADO'
          AND ? < a.buffer_fim AND a.inicio < ?
      )
      AND EXISTS (SELECT 1 FROM barbers b WHERE b.id = ? AND b.ativo = 1)
      AND NOT EXISTS (SELECT 1 FROM blocks bl WHERE (bl.barber_id = ? OR bl.barber_id IS NULL) AND ? < bl.fim AND bl.inicio < ?)
      AND EXISTS (SELECT 1 FROM working_hours wh WHERE wh.barber_id = ? AND wh.dia_semana = ? AND wh.hora_inicio <= ? AND wh.hora_fim >= ?)
      RETURNING id
    `).bind(appointmentId, barber.id, services[0].id, name, phone, startUtc, endUtc, bufferEndUtc, totalPrice, totalDuration, totalBuffer, now,
      barber.id, startUtc, bufferEndUtc, barber.id, barber.id, startUtc, bufferEndUtc, barber.id, weekday, localClock(startUtc, timeZone), localClock(endUtc, timeZone))];

    for (let i = 0; i < services.length; i++) {
      const service = services[i];
      statements.push(db.prepare(`INSERT INTO appointment_services (appointment_id, service_id, ordem, nome_snapshot, preco_snapshot_centavos, duracao_min_snapshot, buffer_min_snapshot)
        SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ? AND status = 'AGENDADO')`)
        .bind(appointmentId, service.id, i + 1, service.nome, service.preco_centavos, service.duracao_min, service.buffer_min || 0, appointmentId));
    }
    statements.push(db.prepare(`UPDATE barber_rotation_state SET last_barber_id = ?, updated_at = ? WHERE service_id = ? AND EXISTS (SELECT 1 FROM appointments WHERE id = ? AND status = 'AGENDADO')`).bind(barber.id, now, services[0].id, appointmentId));
    statements.push(db.prepare(`INSERT INTO appointment_access_tokens (id, appointment_id, token_hash, criado_em, expira_em)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ? AND status = 'AGENDADO')`).bind(tokenId, appointmentId, accessTokenHash, now, tokenExpiry, appointmentId));
    statements.push(db.prepare(`INSERT INTO audit_logs (id, occurred_at, actor_type, action, entity_type, entity_id, after_json, request_id)
      SELECT ?, ?, 'CLIENTE', 'APPOINTMENT_CREATED', 'APPOINTMENT', ?, ?, ? WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ? AND status = 'AGENDADO')`)
      .bind(crypto.randomUUID(), now, appointmentId, JSON.stringify({ barber_id: barber.id, service_ids: serviceIds, inicio: startUtc, fim: endUtc, preco_snapshot_centavos: totalPrice, status: 'AGENDADO' }), requestId, appointmentId));

    let batch;
    try { batch = await db.batch(statements); }
    catch (error) {
      if (String(error?.message || error).includes('APPOINTMENT_SLOT_CONFLICT')) continue;
      throw error;
    }
    if (!batch[0]?.success) throw new Error('Falha SQL ao criar agendamento.');
    if (Number(batch[0].meta?.changes) === 1) {
      return { id: appointmentId, codigo: appointmentId.slice(0, 8).toUpperCase(), inicio: startUtc, fim: endUtc,
        barber: barber.nome, service: services.map((s) => s.nome).join(' + '), services: services.map((s) => ({ id: s.id, nome: s.nome, preco_centavos: s.preco_centavos, duracao_min: s.duracao_min })),
        total_preco_centavos: totalPrice, duracao_min: totalDuration, access_url: `/manage-booking#${accessToken}` };
    }
  }
  throw new HttpError(409, 'Esse horário acabou de ficar indisponível. Escolha outro horário.');
}

async function getCandidates(db, { requestedBarberId, serviceIds, startUtc, endUtc, bufferEndUtc, timeZone, weekday }) {
  const rows = requestedBarberId
    ? await db.prepare('SELECT id, nome FROM barbers WHERE id = ? AND ativo = 1').bind(requestedBarberId).all()
    : await db.prepare('SELECT id, nome FROM barbers WHERE ativo = 1 ORDER BY id').all();
  const eligible = [];
  for (const barber of rows.results || []) {
    const hours = await db.prepare(`SELECT 1 AS ok FROM working_hours WHERE barber_id = ? AND dia_semana = ? AND hora_inicio <= ? AND hora_fim >= ? LIMIT 1`)
      .bind(barber.id, weekday, localClock(startUtc, timeZone), localClock(endUtc, timeZone)).first();
    if (!hours) continue;
    const block = await db.prepare(`SELECT 1 FROM blocks WHERE (barber_id = ? OR barber_id IS NULL) AND ? < fim AND inicio < ? LIMIT 1`).bind(barber.id, startUtc, bufferEndUtc).first();
    if (block) continue;
    const conflict = await db.prepare(`SELECT 1 FROM appointments WHERE barber_id = ? AND status = 'AGENDADO' AND inicio < ? AND buffer_fim > ? LIMIT 1`).bind(barber.id, bufferEndUtc, startUtc).first();
    if (conflict) continue;
    eligible.push(barber);
  }
  if (requestedBarberId || eligible.length < 2) return eligible;
  const rotation = await db.prepare('SELECT last_barber_id FROM barber_rotation_state WHERE service_id = ?').bind(serviceIds[0]).first();
  eligible.sort((a, b) => a.id.localeCompare(b.id));
  const idx = eligible.findIndex((b) => b.id === rotation?.last_barber_id);
  return idx < 0 ? eligible : [...eligible.slice(idx + 1), ...eligible.slice(0, idx + 1)];
}
function localClock(utcIso, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(utcIso));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute}`;
}

export async function cancelPublicAppointment(env, token, requestId) {
  if (!token || token.length < 32) {
    throw new HttpError(
      404,
      'Não foi possível localizar um agendamento autorizado.'
    );
  }

  const tokenHash = await sha256Hex(token);
  const now = nowIso();

  const row = await env.DB.prepare(`
    SELECT
      t.id AS token_id,
      t.appointment_id,
      t.expira_em,
      t.revogado_em,
      a.inicio,
      a.status,
      s.valor AS deadline
    FROM appointment_access_tokens t
    JOIN appointments a ON a.id = t.appointment_id
    JOIN settings s ON s.chave = 'customer_cancel_deadline_minutes'
    WHERE t.token_hash = ?
    LIMIT 1
  `).bind(tokenHash).first();

  if (
    !row ||
    row.revogado_em ||
    row.expira_em <= now ||
    row.status !== 'AGENDADO'
  ) {
    throw new HttpError(
      404,
      'Não foi possível localizar um agendamento autorizado.'
    );
  }

  if (
    Date.parse(row.inicio) - Date.now() <
    Number(row.deadline) * 60_000
  ) {
    throw new HttpError(
      409,
      'Não foi possível cancelar este agendamento online porque o prazo de cancelamento já terminou. O cancelamento pelo site deve ser feito com pelo menos 2 horas de antecedência. Entre em contato com a barbearia para verificar se é possível ajudar.'
    );
  }

  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE appointments
      SET
        status = 'CANCELADO',
        cancelado_em = ?,
        motivo_cancelamento = 'Cancelamento pelo cliente'
      WHERE
        id = ?
        AND status = 'AGENDADO'
        AND inicio > ?
    `).bind(
      now,
      row.appointment_id,
      new Date(
        Date.now() + Number(row.deadline) * 60_000
      ).toISOString()
    ),

    env.DB.prepare(`
      UPDATE appointment_access_tokens
      SET revogado_em = ?
      WHERE
        id = ?
        AND EXISTS (
          SELECT 1 FROM appointments
          WHERE id = ? AND status = 'CANCELADO'
        )
    `).bind(now, row.token_id, row.appointment_id),

    env.DB.prepare(`
      INSERT INTO audit_logs (
        id, occurred_at, actor_type, action, entity_type,
        entity_id, reason, request_id
      )
      SELECT ?, ?, 'CLIENTE', 'APPOINTMENT_CANCELLED',
        'APPOINTMENT', ?, 'Cancelamento pelo cliente', ?
      WHERE EXISTS (
        SELECT 1 FROM appointments
        WHERE id = ? AND status = 'CANCELADO'
      )
    `).bind(
      crypto.randomUUID(),
      now,
      row.appointment_id,
      requestId,
      row.appointment_id
    ),
  ]);

  if (!results[0]?.success) {
    throw new Error('Falha SQL ao cancelar agendamento.');
  }

  if (Number(results[0].meta?.changes) !== 1) {
    throw new HttpError(
      409,
      'O agendamento mudou de estado. Atualize a página e tente novamente.'
    );
  }

  return { ok: true };
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}