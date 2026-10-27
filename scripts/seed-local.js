
/**
 * Seed seguro para D1 local.
 * Insere barbeiros, horários, serviços e estado de rodízio.
 * Nunca execute automaticamente em produção.
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const wranglerPath = resolve(
  projectRoot,
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js'
);

if (!existsSync(wranglerPath)) {
  console.error('Erro: arquivo do Wrangler não encontrado em:', wranglerPath);
  console.error('Verifique se as dependências foram instaladas.');
  process.exit(1);
}

const now = new Date().toISOString();

const barbers = [
  { id: 'barber-1', nome: 'Barbeiro 1' },
  { id: 'barber-2', nome: 'Barbeiro 2' }
];

const services = [
  {
    id: 'service-barba',
    nome: 'Barba',
    preco_centavos: 4000,
    duracao_min: 30,
    buffer_min: 5,
    ativo: 1
  },
  {
    id: 'service-corte',
    nome: 'Cabelo',
    preco_centavos: 4000,
    duracao_min: 30,
    buffer_min: 5,
    ativo: 1
  },
  {
    id: 'service-sobrancelha',
    nome: 'Sobrancelha',
    preco_centavos: 1000,
    duracao_min: 10,
    buffer_min: 5,
    ativo: 1
  },
  {
    id: 'service-depilacao-nasal',
    nome: 'Depilação nasal',
    preco_centavos: 1500,
    duracao_min: 10,
    buffer_min: 5,
    ativo: 1
  },
  {
    id: 'service-pigmentacao',
    nome: 'Pigmentação',
    preco_centavos: 2500,
    duracao_min: 20,
    buffer_min: 5,
    ativo: 1
  },
  {
    id: 'service-relaxamento',
    nome: 'Relaxamento',
    preco_centavos: 5500,
    duracao_min: 40,
    buffer_min: 5,
    ativo: 1
  },
  {
    id: 'service-luzes',
    nome: 'Luzes',
    preco_centavos: 12000,
    duracao_min: 90,
    buffer_min: 5,
    ativo: 1
  },
  {
    id: 'service-platinado',
    nome: 'Platinado',
    preco_centavos: 15000,
    duracao_min: 120,
    buffer_min: 5,
    ativo: 1
  },
  {
    id: 'service-combo',
    nome: 'Corte + barba',
    preco_centavos: 5000,
    duracao_min: 45,
    buffer_min: 5,
    ativo: 0
  }
];

const statements = [];

for (const barber of barbers) {
  statements.push(`
    INSERT OR IGNORE INTO barbers
      (id, nome, ativo, criado_em)
    VALUES
      ('${barber.id}', '${barber.nome}', 1, '${now}');
  `);

  for (let day = 1; day <= 6; day++) {
    statements.push(`
      INSERT OR IGNORE INTO working_hours
        (id, barber_id, dia_semana, hora_inicio, hora_fim)
      VALUES
        ('${randomUUID()}', '${barber.id}', ${day}, '09:00', '12:00');
    `);

    statements.push(`
      INSERT OR IGNORE INTO working_hours
        (id, barber_id, dia_semana, hora_inicio, hora_fim)
      VALUES
        ('${randomUUID()}', '${barber.id}', ${day}, '13:00', '19:00');
    `);
  }
}

for (const service of services) {
  const nomeSql = service.nome.replaceAll("'", "''");

  statements.push(`
    INSERT INTO services
      (id, nome, preco_centavos, duracao_min, buffer_min, ativo, criado_em)
    VALUES
      (
        '${service.id}',
        '${nomeSql}',
        ${service.preco_centavos},
        ${service.duracao_min},
        ${service.buffer_min},
        ${service.ativo},
        '${now}'
      )
    ON CONFLICT(id) DO UPDATE SET
      nome = excluded.nome,
      preco_centavos = excluded.preco_centavos,
      duracao_min = excluded.duracao_min,
      buffer_min = excluded.buffer_min,
      ativo = excluded.ativo;
  `);

  if (service.ativo === 1) {
    statements.push(`
      INSERT OR IGNORE INTO barber_rotation_state
        (service_id, last_barber_id, updated_at)
      VALUES
        ('${service.id}', NULL, '${now}');
    `);
  }
}

const sql = statements.join('\n');

console.log('Aplicando dados fictícios no D1 local...');

try {
  execFileSync(
    process.execPath,
    [
      wranglerPath,
      'd1',
      'execute',
      'barbearia-agendamento',
      '--local',
      '--command',
      sql
    ],
    {
      cwd: projectRoot,
      stdio: 'inherit'
    }
  );

  console.log(
    'Seed local aplicado. Dados fictícios; nenhum administrador de produção foi criado.'
  );
} catch (error) {
  console.error('Falha ao aplicar o seed local.');
  console.error('Verifique a mensagem do Wrangler acima.');
  process.exitCode = 1;
}
