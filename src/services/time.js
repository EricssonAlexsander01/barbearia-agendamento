// src/services/time.js

export function parseUtc(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  ) {
    throw new TypeError('Timestamp UTC inválido.');
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new TypeError('Timestamp UTC inválido.');
  }

  const date = new Date(timestamp);
  const [year, month, day, hour, minute, second] = [
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)),
    Number(value.slice(8, 10)),
    Number(value.slice(11, 13)),
    Number(value.slice(14, 16)),
    Number(value.slice(17, 19)),
  ];

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw new TypeError('Timestamp UTC inválido.');
  }

  return timestamp;
}

export function isoPlusMinutes(iso, minutes) {
  const timestamp = parseUtc(iso);

  if (!Number.isFinite(minutes)) {
    throw new TypeError('Quantidade de minutos inválida.');
  }

  return new Date(timestamp + minutes * 60_000).toISOString();
}

export function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export function isValidCalendarDate(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Retorna a data de calendário e o dia da semana de um instante UTC
 * no fuso horário informado.
 *
 * weekday:
 * 0 = domingo
 * 1 = segunda-feira
 * 2 = terça-feira
 * 3 = quarta-feira
 * 4 = quinta-feira
 * 5 = sexta-feira
 * 6 = sábado
 */
export function getZonedDateInfo(
  utcIso,
  timeZone = 'America/Sao_Paulo'
) {
  const timestamp = parseUtc(utcIso);

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  const date = `${values.year}-${values.month}-${values.day}`;

  if (!isValidCalendarDate(date)) {
    throw new TypeError('Não foi possível determinar a data local.');
  }

  const [year, month, day] = date.split('-').map(Number);

  const weekday = new Date(
    Date.UTC(year, month - 1, day, 12)
  ).getUTCDay();

  return { date, weekday };
}

/**
 * Converte data/hora de calendário local para milissegundos UTC.
 * Não depende do fuso horário do computador ou Worker.
 */
export function localDateTimeToUtc(
  local,
  timeZone = 'America/Sao_Paulo'
) {
  if (
    typeof local !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(local)
  ) {
    throw new TypeError('Data/hora local inválida.');
  }

  const [date, time] = local.split('T');

  if (!isValidCalendarDate(date)) {
    throw new TypeError('Data local inválida.');
  }

  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second] = time.split(':').map(Number);

  if (hour > 23 || minute > 59 || second > 59) {
    throw new TypeError('Hora local inválida.');
  }

  const target = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second
  );

  let guess = target;

  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));

    const values = Object.fromEntries(
      parts.map(({ type, value }) => [type, value])
    );

    const represented = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    );

    const adjustment = target - represented;

    if (adjustment === 0) {
      break;
    }

    guess += adjustment;
  }

  const check = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guess));

  const values = Object.fromEntries(
    check.map(({ type, value }) => [type, value])
  );

  const representedLocal =
    `${values.year}-${values.month}-${values.day}T` +
    `${values.hour}:${values.minute}:${values.second}`;

  if (representedLocal !== local) {
    throw new TypeError(
      'A data/hora local não existe neste fuso horário.'
    );
  }

  return guess;
}

/**
 * Recebe uma data de calendário local e retorna sua data e seu
 * dia da semana, usando o mesmo mecanismo de fuso horário.
 */
export function getLocalCalendarDateInfo(
  date,
  timeZone = 'America/Sao_Paulo'
) {
  if (!isValidCalendarDate(date)) {
    throw new TypeError('Data de calendário inválida.');
  }

  const utcNoon = localDateTimeToUtc(
    `${date}T12:00:00`,
    timeZone
  );

  return getZonedDateInfo(
    new Date(utcNoon).toISOString(),
    timeZone
  );
}

export function nowIso() {
  return new Date().toISOString();
}