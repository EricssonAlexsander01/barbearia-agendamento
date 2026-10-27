import { describe, it, expect } from 'vitest';

import {
  getZonedDateInfo,
  getLocalCalendarDateInfo,
} from '../src/services/time.js';

describe('data e dia da semana no fuso da barbearia', () => {
  it('usa a data local quando a data UTC já mudou para o dia seguinte', () => {
    const result = getZonedDateInfo(
      '2026-10-27T02:30:00.000Z',
      'America/Sao_Paulo'
    );

    expect(result).toEqual({
      date: '2026-10-26',
      weekday: 1,
    });
  });

  it('determina o dia da semana a partir da data local', () => {
    const result = getLocalCalendarDateInfo(
      '2026-10-26',
      'America/Sao_Paulo'
    );

    expect(result).toEqual({
      date: '2026-10-26',
      weekday: 1,
    });
  });

  it('mantém terça-feira quando a data local também é terça-feira', () => {
    const result = getZonedDateInfo(
      '2026-10-27T15:00:00.000Z',
      'America/Sao_Paulo'
    );

    expect(result).toEqual({
      date: '2026-10-27',
      weekday: 2,
    });
  });
});