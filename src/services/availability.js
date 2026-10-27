// src/services/availability.js
import { parseUtc, intervalsOverlap, isValidCalendarDate, getLocalCalendarDateInfo, localDateTimeToUtc } from './time.js';
import { HttpError } from './appointments.js';
const ACTIVE_STATUS = 'AGENDADO';
export function buildOccupiedInterval(a) { return { start: parseUtc(a.inicio), end: parseUtc(a.buffer_fim) }; }
export function hasConflict({ startUtc, endUtc, bufferMin, appointments }) {
  const start = parseUtc(startUtc), end = parseUtc(new Date(parseUtc(endUtc) + Number(bufferMin || 0) * 60000).toISOString());
  return appointments.some((a) => a.status === ACTIVE_STATUS && intervalsOverlap(start, end, ...Object.values(buildOccupiedInterval(a))));
}
function normalizeIds(serviceIds, serviceId) {
  const raw = Array.isArray(serviceIds) ? serviceIds : serviceIds ? String(serviceIds).split(',') : serviceId ? [serviceId] : [];
  const ids = [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length || ids.length > 20 || ids.length !== raw.length) throw new HttpError(400, 'Informe uma seleção válida de serviços.');
  return ids;
}
export async function getAvailableSlots(db, { serviceIds, serviceId, date, barberId = null, timeZone = 'America/Sao_Paulo' }) {
  if (!isValidCalendarDate(date)) throw new HttpError(400, 'Data inválida.');
  const ids = normalizeIds(serviceIds, serviceId);
  const placeholders = ids.map(() => '?').join(',');
  const serviceRows = await db.prepare(`SELECT id, nome, preco_centavos, duracao_min, buffer_min FROM services WHERE ativo = 1 AND id IN (${placeholders})`).bind(...ids).all();
  const byId = new Map((serviceRows.results || []).map((s) => [s.id, s]));
  if (byId.size !== ids.length) throw new HttpError(404, 'Um ou mais serviços estão indisponíveis.');
  const services = ids.map((id) => byId.get(id));
  const duration = services.reduce((sum, s) => sum + Number(s.duracao_min), 0);
  const buffer = services.reduce((sum, s) => sum + Number(s.buffer_min || 0), 0);
  const barbersResult = barberId
    ? await db.prepare('SELECT id, nome FROM barbers WHERE id = ? AND ativo = 1').bind(barberId).all()
    : await db.prepare('SELECT id, nome FROM barbers WHERE ativo = 1 ORDER BY id').all();
  const { weekday } = getLocalCalendarDateInfo(date, timeZone);
  const nextDateObj = new Date(`${date}T12:00:00Z`); nextDateObj.setUTCDate(nextDateObj.getUTCDate() + 1);
  const nextDate = nextDateObj.toISOString().slice(0, 10);
  const dayStartUtc = new Date(localDateTimeToUtc(`${date}T00:00:00`, timeZone)).toISOString();
  const dayEndUtc = new Date(localDateTimeToUtc(`${nextDate}T00:00:00`, timeZone)).toISOString();
  const settings = await db.prepare("SELECT chave, valor FROM settings WHERE chave IN ('minimum_advance_minutes','booking_window_days')").all();
  const config = Object.fromEntries((settings.results || []).map((x) => [x.chave, Number(x.valor)]));
  const minStart = Date.now() + (config.minimum_advance_minutes ?? 60) * 60000;
  const maxStart = Date.now() + (config.booking_window_days ?? 30) * 86400000;
  const result = [];
  for (const barber of barbersResult.results || []) {
    const [hours, existing, blocks] = await Promise.all([
      db.prepare('SELECT hora_inicio, hora_fim FROM working_hours WHERE barber_id = ? AND dia_semana = ? ORDER BY hora_inicio').bind(barber.id, weekday).all(),
      db.prepare("SELECT inicio, fim, buffer_fim, status FROM appointments WHERE barber_id = ? AND status = 'AGENDADO' AND inicio < ? AND buffer_fim > ?").bind(barber.id, dayEndUtc, dayStartUtc).all(),
      db.prepare('SELECT inicio, fim FROM blocks WHERE (barber_id = ? OR barber_id IS NULL) AND inicio < ? AND fim > ?').bind(barber.id, dayEndUtc, dayStartUtc).all(),
    ]);
    for (const hour of hours.results || []) {
      const startLocal = `${date}T${hour.hora_inicio}:00`, endLocal = `${date}T${hour.hora_fim}:00`;
      const windowStart = localDateTimeToUtc(startLocal, timeZone), windowEnd = localDateTimeToUtc(endLocal, timeZone);
      const step = 15 * 60000;
      for (let start = windowStart; start + duration * 60000 <= windowEnd; start += step) {
        const end = start + duration * 60000, bufferEnd = end + buffer * 60000;
        if (start < minStart || start > maxStart || bufferEnd > windowEnd) continue;
        const conflict = (existing.results || []).some((a) => intervalsOverlap(start, bufferEnd, Date.parse(a.inicio), Date.parse(a.buffer_fim)));
        const blocked = (blocks.results || []).some((b) => intervalsOverlap(start, bufferEnd, Date.parse(b.inicio), Date.parse(b.fim)));
        if (!conflict && !blocked) result.push({ barber_id: barber.id, barber_nome: barber.nome, inicio: new Date(start).toISOString(), fim: new Date(end).toISOString(), buffer_fim: new Date(bufferEnd).toISOString(), preco_total_centavos: services.reduce((sum,s)=>sum+Number(s.preco_centavos),0), duracao_min_total: duration });
      }
    }
  }
  return result.sort((a,b)=>a.inicio.localeCompare(b.inicio)||a.barber_id.localeCompare(b.barber_id));
}
