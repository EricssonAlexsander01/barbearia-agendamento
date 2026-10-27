PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS barbers (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 100),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 120),
  preco_centavos INTEGER NOT NULL CHECK (preco_centavos >= 0),
  duracao_min INTEGER NOT NULL CHECK (duracao_min BETWEEN 5 AND 480),
  buffer_min INTEGER NOT NULL DEFAULT 5 CHECK (buffer_min BETWEEN 0 AND 120),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS working_hours (
  id TEXT PRIMARY KEY,
  barber_id TEXT NOT NULL REFERENCES barbers(id),
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio TEXT NOT NULL,
  hora_fim TEXT NOT NULL,
  CHECK (hora_inicio < hora_fim),
  UNIQUE (barber_id, dia_semana, hora_inicio, hora_fim)
);
CREATE INDEX IF NOT EXISTS idx_working_hours_barber_day ON working_hours(barber_id, dia_semana);

CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  barber_id TEXT REFERENCES barbers(id),
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  motivo TEXT,
  criado_em TEXT NOT NULL,
  CHECK (inicio < fim)
);
CREATE INDEX IF NOT EXISTS idx_blocks_interval ON blocks(inicio, fim);
CREATE INDEX IF NOT EXISTS idx_blocks_barber_interval ON blocks(barber_id, inicio, fim);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  barber_id TEXT NOT NULL REFERENCES barbers(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  cliente_nome TEXT NOT NULL CHECK (length(trim(cliente_nome)) BETWEEN 1 AND 120),
  cliente_telefone TEXT NOT NULL CHECK (length(replace(replace(replace(replace(cliente_telefone, ' ', ''), '-', ''), '(', ''), ')', '')) BETWEEN 8 AND 20),
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  buffer_fim TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AGENDADO' CHECK (status IN ('AGENDADO', 'CANCELADO', 'CONCLUIDO', 'NO_SHOW')),
  preco_snapshot_centavos INTEGER NOT NULL CHECK (preco_snapshot_centavos >= 0),
  duracao_min_snapshot INTEGER NOT NULL CHECK (duracao_min_snapshot > 0),
  buffer_min_snapshot INTEGER NOT NULL CHECK (buffer_min_snapshot >= 0),
  criado_em TEXT NOT NULL,
  cancelado_em TEXT,
  motivo_cancelamento TEXT,
  CHECK (inicio < fim AND fim <= buffer_fim)
);
CREATE INDEX IF NOT EXISTS idx_appointments_barber_status_start ON appointments(barber_id, status, inicio);
CREATE INDEX IF NOT EXISTS idx_appointments_service_start ON appointments(service_id, inicio);
CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(cliente_telefone);

CREATE TABLE IF NOT EXISTS settings (
  chave TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('INTEGER', 'BOOLEAN', 'TEXT', 'JSON')),
  valor TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appointment_access_tokens (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  token_hash TEXT NOT NULL UNIQUE,
  criado_em TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  revogado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_access_tokens_appointment ON appointment_access_tokens(appointment_id);

CREATE TABLE IF NOT EXISTS barber_rotation_state (
  service_id TEXT PRIMARY KEY REFERENCES services(id),
  last_barber_id TEXT REFERENCES barbers(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('ADMIN', 'CLIENTE', 'SYSTEM')),
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  request_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(occurred_at);

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins(id),
  token_hash TEXT NOT NULL UNIQUE,
  criado_em TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  revogado_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash, expira_em);

INSERT OR IGNORE INTO settings(chave, tipo, valor, atualizado_em) VALUES
  ('minimum_advance_minutes', 'INTEGER', '60', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('booking_window_days', 'INTEGER', '30', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('customer_cancel_deadline_minutes', 'INTEGER', '120', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('business_time_zone', 'TEXT', 'America/Sao_Paulo', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
