
-- Impede novos agendamentos que se sobreponham a reservas ativas.
-- Considera o intervalo de segurança armazenado em buffer_fim.

CREATE TRIGGER IF NOT EXISTS prevent_appointment_overlap_insert
BEFORE INSERT ON appointments
WHEN NEW.status = 'AGENDADO'
BEGIN
  SELECT RAISE(ABORT, 'APPOINTMENT_SLOT_CONFLICT')
  WHERE EXISTS (
    SELECT 1
    FROM appointments a
    WHERE a.barber_id = NEW.barber_id
      AND a.status = 'AGENDADO'
      AND NEW.inicio < a.buffer_fim
      AND a.inicio < NEW.buffer_fim
  );
END;

-- Impede que uma alteração de horário, barbeiro ou status
-- reintroduza um conflito.

CREATE TRIGGER IF NOT EXISTS prevent_appointment_overlap_update
BEFORE UPDATE OF barber_id, inicio, buffer_fim, status
ON appointments
WHEN NEW.status = 'AGENDADO'
BEGIN
  SELECT RAISE(ABORT, 'APPOINTMENT_SLOT_CONFLICT')
  WHERE EXISTS (
    SELECT 1
    FROM appointments a
    WHERE a.id <> NEW.id
      AND a.barber_id = NEW.barber_id
      AND a.status = 'AGENDADO'
      AND NEW.inicio < a.buffer_fim
      AND a.inicio < NEW.buffer_fim
  );
END;
