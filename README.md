# Barbearia Agendamento

MVP de agendamento online: frontend HTML/CSS/JS puro, Cloudflare Workers e D1.

## Incluído neste primeiro corte

- Schema D1 com tabelas de barbeiros, serviços, horários, bloqueios, agendamentos, configurações, tokens públicos, alternância, auditoria, administradores e sessões.
- Endpoints públicos para listar serviços/barbeiros, consultar disponibilidade, criar agendamento, consultar o próprio agendamento com token e cancelar dentro do prazo.
- Sessões administrativas opacas em cookie `HttpOnly; Secure; SameSite=Strict` e hash de senha com `pbkdf2-lite` a 100.000 iterações.
- Registro manual de no-show via API autenticada.
- Seed local de barbeiros, serviços e horários.

## Antes de executar

1. Instale Node.js LTS e dependências: `npm install`.
2. Crie o banco D1: `npx wrangler d1 create barbearia-agendamento`.
3. Copie o `database_id` retornado para `wrangler.toml`.
4. Aplique migrações locais: `npm run db:local`.
5. Rode o seed: `npm run seed:local`.
6. Inicie: `npm run dev`.

## Administrador

O seed não cria administrador. Para criar o primeiro admin, gere um hash usando `PBKDF2Lite(100000).hash(senha)` em um script local temporário e insira a linha em `admins`. Nunca commite senha, hash real, cookie ou token no Git. Um fluxo de bootstrap administrativo será adicionado antes de publicar em produção.

## Limitações importantes desta primeira versão

- O endpoint de disponibilidade é um cálculo inicial; a conversão de horário local/UTC e a janela diária devem ser validadas para o fuso real do estabelecimento, incluindo transições de horário de verão se aplicáveis.
- A interface administrativa é um esqueleto, não um calendário completo.
- Os endpoints de manutenção de serviços, barbeiros, horários e bloqueios ainda não estão completos.
- O login precisa de rate limiting persistente e verificação de origem/CSRF antes de produção.
- A estratégia de concorrência usa inserção condicional e `meta.changes`; execute os testes no D1 local antes de colocar em produção.
- A configuração `wrangler.toml` contém um placeholder para `database_id`; não faça deploy até substituí-lo.

## Deploy

Após configurar e testar o banco remoto: `npm run db:remote` e `npm run deploy`.
