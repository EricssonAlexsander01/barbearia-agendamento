
-- migrations/0003_create_appointment_services.sql
-- Adiciona suporte a múltiplos serviços por agendamento.
-- Não altera nem apaga os agendamentos existentes.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS appointment_services (
  appointment_id TEXT NOT NULL
    REFERENCES appointments(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL
    REFERENCES services(id),
  ordem INTEGER NOT NULL CHECK (ordem >= 1),
  nome_snapshot TEXT NOT NULL,
  preco_snapshot_centavos INTEGER NOT NULL
    CHECK (preco_snapshot_centavos >= 0),
  duracao_min_snapshot INTEGER NOT NULL
    CHECK (duracao_min_snapshot > 0),
  buffer_min_snapshot INTEGER NOT NULL
    CHECK (buffer_min_snapshot >= 0),

  PRIMARY KEY (appointment_id, service_id),
  UNIQUE (appointment_id, ordem)
);

CREATE INDEX IF NOT EXISTS idx_appointment_services_service
  ON appointment_services(service_id);

-- Migra os agendamentos existentes para a nova tabela.
-- Os valores históricos vêm dos snapshots do próprio agendamento
-- e do serviço associado.

INSERT OR IGNORE INTO appointment_services (
  appointment_id,
  service_id,
  ordem,
  nome_snapshot,
  preco_snapshot_centavos,
  duracao_min_snapshot,
  buffer_min_snapshot
)
SELECT
  a.id,
  a.service_id,
  1,
  s.nome,
  a.preco_snapshot_centavos,
  a.duracao_min_snapshot,
  a.buffer_min_snapshot
FROM appointments a
JOIN services s ON s.id = a.service_id;
