UPDATE services
SET nome = 'Barba', preco_centavos = 4000, duracao_min = 30
WHERE id = 'service-barba';

UPDATE services
SET nome = 'Cabelo', preco_centavos = 4000, duracao_min = 30
WHERE id = 'service-corte';

UPDATE services
SET nome = 'Corte + barba', ativo = 0
WHERE id = 'service-combo';

INSERT INTO services
(id, nome, preco_centavos, duracao_min, buffer_min, ativo, criado_em)
VALUES
('service-sobrancelha', 'Sobrancelha', 1000, 10, 5, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('service-depilacao-nasal', 'Depilação nasal', 1500, 10, 5, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('service-pigmentacao', 'Pigmentação', 2500, 20, 5, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('service-relaxamento', 'Relaxamento', 5500, 40, 5, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('service-luzes', 'Luzes', 12000, 90, 5, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('service-platinado', 'Platinado', 15000, 120, 5, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
