
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const TIME_ZONE = 'America/Sao_Paulo';

  const loginView = $('#loginView');
  const dashboardView = $('#dashboardView');
  const loginForm = $('#loginForm');
  const loginButton = $('#loginButton');
  const loginMessage = $('#loginMessage');
  const dashboardMessage = $('#dashboardMessage');
  const filterForm = $('#filterForm');
  const filterButton = $('#filterButton');
  const refreshButton = $('#refreshButton');
  const appointmentsBody = $('#appointmentsBody');
  const appointmentCount = $('#appointmentCount');
  const loadingState = $('#loadingState');
  const emptyState = $('#emptyState');
  const tableWrap = $('#tableWrap');
  const logoutButton = $('#logoutButton');

  let appointments = [];
  let loading = false;
  let actionInProgress = false;

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });

    const type = response.headers.get('content-type') || '';
    let data = {};

    if (type.includes('application/json')) {
      data = await response.json().catch(() => ({}));
    } else {
      const text = await response.text().catch(() => '');
      data = { error: text };
    }

    if (response.status === 401 && path !== '/api/admin/login') {
      showLogin();
      throw new ApiError('Sua sessão expirou. Entre novamente.', 401);
    }

    if (!response.ok) {
      throw new ApiError(
        data.error || data.message || `Erro HTTP ${response.status}`,
        response.status
      );
    }

    return data;
  }

  function showMessage(element, message, type = 'error') {
    element.textContent = message;
    element.className = `message ${type}`;
    element.hidden = false;
  }

  function hideMessage(element) {
    element.hidden = true;
    element.textContent = '';
  }

  function showLogin() {
    loginView.hidden = false;
    dashboardView.hidden = true;
    logoutButton.hidden = true;
    appointments = [];
    appointmentsBody.replaceChildren();
    appointmentCount.textContent = '0 agendamentos';
    $('#password').value = '';
  }

  function showDashboard() {
    loginView.hidden = true;
    dashboardView.hidden = false;
    logoutButton.hidden = false;
    hideMessage(loginMessage);
  }

  function localDateString(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);

    const values = Object.fromEntries(
      parts.filter(p => p.type !== 'literal')
        .map(p => [p.type, p.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
  }

  function setDefaultDates() {
    const today = localDateString();
    $('#dateFrom').value = today;
    $('#dateTo').value = today;
  }

  // São Paulo usa UTC-3 atualmente.
  // Converte meia-noite local para UTC para consultar o backend.
  function midnightUtc(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 3)).toISOString();
  }

  function getDateRange() {
    const fromDate = $('#dateFrom').value;
    const toDate = $('#dateTo').value;

    if (!fromDate || !toDate) {
      throw new Error('Selecione a data inicial e a data final.');
    }

    if (fromDate > toDate) {
      throw new Error('A data inicial não pode ser posterior à final.');
    }

    const nextDay = new Date(`${toDate}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const nextDate = nextDay.toISOString().slice(0, 10);

    return {
      from: midnightUtc(fromDate),
      to: midnightUtc(nextDate)
    };
  }

  function formatDateTime(value) {
    if (!value) return '—';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Data inválida';

    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  }

  function statusLabel(status) {
    const labels = {
      AGENDADO: 'Agendado',
      CANCELADO: 'Cancelado',
      NO_SHOW: 'Não compareceu',
      CONCLUIDO: 'Concluído'
    };

    return labels[status] || status || 'Indefinido';
  }

  function statusClass(status) {
    if (status === 'CANCELADO') return 'status status-cancelado';
    if (status === 'NO_SHOW') return 'status status-no-show';
    if (status === 'CONCLUIDO') return 'status status-concluido';
    return 'status';
  }

  function cell(label, content) {
    const td = document.createElement('td');
    td.dataset.label = label;

    if (content instanceof Node) {
      td.append(content);
    } else {
      td.textContent = content ?? '—';
    }

    return td;
  }

  function actionButton(label, className, handler, appointment) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button ${className}`;
    button.textContent = label;
    button.addEventListener('click', () => handler(appointment));
    return button;
  }

  function renderAppointments() {
    const fragment = document.createDocumentFragment();

    for (const appointment of appointments) {
      const row = document.createElement('tr');

      const client = document.createElement('div');
      client.className = 'client';
      client.textContent = appointment.cliente_nome || 'Cliente';

      const phone = document.createElement('span');
      phone.className = 'detail';
      phone.textContent = appointment.telefone_final
        ? `Telefone •••• ${appointment.telefone_final}`
        : 'Telefone não disponível';

      const clientInfo = document.createElement('div');
      clientInfo.append(client, phone);

      const status = document.createElement('span');
      status.className = statusClass(appointment.status);
      status.textContent = statusLabel(appointment.status);

      const actions = document.createElement('div');
      actions.className = 'actions';

      if (appointment.status === 'AGENDADO') {
        actions.append(actionButton(
          'Cancelar',
          'danger',
          cancelAppointment,
          appointment
        ));

        const start = new Date(appointment.inicio).getTime();

        if (Number.isFinite(start) && start < Date.now()) {
          actions.append(actionButton(
            'Marcar No-Show',
            'gold',
            markNoShow,
            appointment
          ));
        }
      } else {
        const note = document.createElement('span');
        note.className = 'muted';
        note.textContent = 'Sem ações disponíveis';
        actions.append(note);
      }

      const serviceInfo = document.createElement('div');

      const serviceName = document.createElement('div');
      serviceName.className = 'client';
      serviceName.textContent = appointment.servico || 'Serviço não informado';

      const serviceDetails = document.createElement('span');
      serviceDetails.className = 'detail';

      const quantidade = Number(appointment.quantidade_servicos || 0);
      const duracao = Number(appointment.duracao_total_min || 0);
      const preco = Number(appointment.preco_total_centavos);

      const detalhes = [];

      if (quantidade > 0) {
        detalhes.push(
          String(quantidade) + ' ' +
          (quantidade === 1 ? 'serviço' : 'serviços')
        );
      }

      if (duracao > 0) {
        detalhes.push(String(duracao) + ' min');
      }

      if (Number.isFinite(preco)) {
        detalhes.push(
          (preco / 100).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
          })
        );
      }

      serviceDetails.textContent = detalhes.join(' • ');
      serviceInfo.append(serviceName, serviceDetails);

      row.append(
        cell('Data / horário', formatDateTime(appointment.inicio)),
        cell('Cliente', clientInfo),
        cell('Serviço', serviceInfo),
        cell('Barbeiro', appointment.barbeiro),
        cell('Status', status),
        cell('Ações', actions)
      );

      fragment.append(row);
    }

    appointmentsBody.replaceChildren(fragment);

    const total = appointments.length;
    appointmentCount.textContent =
      `${total} ${total === 1 ? 'agendamento' : 'agendamentos'}`;

    emptyState.hidden = total !== 0;
    tableWrap.hidden = total === 0;
  }

  async function loadAppointments() {
    if (loading) return;

    loading = true;
    filterButton.disabled = true;
    refreshButton.disabled = true;
    loadingState.hidden = false;
    emptyState.hidden = true;
    tableWrap.hidden = true;
    hideMessage(dashboardMessage);

    try {
      const range = getDateRange();
      const params = new URLSearchParams(range);

      const data = await api(
        `/api/admin/appointments?${params.toString()}`
      );

      appointments = Array.isArray(data.appointments)
        ? data.appointments
        : [];

      renderAppointments();
    } catch (error) {
      if (error.status !== 401) {
        showMessage(
          dashboardMessage,
          error.message || 'Erro ao carregar os agendamentos.'
        );
      }
    } finally {
      loading = false;
      filterButton.disabled = false;
      refreshButton.disabled = false;
      loadingState.hidden = true;
    }
  }

  async function cancelAppointment(appointment) {
    if (actionInProgress) return;

    const confirmed = window.confirm(
      `Deseja cancelar o agendamento de ` +
      `${appointment.cliente_nome || 'Cliente'} em ` +
      `${formatDateTime(appointment.inicio)}?`
    );

    if (!confirmed) return;

    const reason = window.prompt(
      'Motivo do cancelamento (opcional):',
      'Cancelado pelo administrador'
    );

    if (reason === null) return;

    actionInProgress = true;

    try {
      await api('/api/admin/appointments/cancel', {
        method: 'POST',
        body: JSON.stringify({
          appointment_id: appointment.id,
          reason: reason.trim()
        })
      });

      showMessage(
        dashboardMessage,
        'Agendamento cancelado com sucesso.',
        'success'
      );

      await loadAppointments();
    } catch (error) {
      showMessage(
        dashboardMessage,
        error.message || 'Não foi possível cancelar o agendamento.'
      );
    } finally {
      actionInProgress = false;
    }
  }

  async function markNoShow(appointment) {
    if (actionInProgress) return;

    const confirmed = window.confirm(
      `Confirmar falta do cliente ` +
      `${appointment.cliente_nome || 'Cliente'} no horário ` +
      `${formatDateTime(appointment.inicio)}?`
    );

    if (!confirmed) return;

    const reason = window.prompt(
      'Observação (opcional):',
      'Cliente não compareceu'
    );

    if (reason === null) return;

    actionInProgress = true;

    try {
      await api('/api/admin/appointments/no-show', {
        method: 'POST',
        body: JSON.stringify({
          appointment_id: appointment.id,
          reason: reason.trim() || 'Cliente não compareceu'
        })
      });

      showMessage(
        dashboardMessage,
        'No-show registrado com sucesso.',
        'success'
      );

      await loadAppointments();
    } catch (error) {
      showMessage(
        dashboardMessage,
        error.message || 'Não foi possível registrar o no-show.'
      );
    } finally {
      actionInProgress = false;
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(loginMessage);

    loginButton.disabled = true;
    loginButton.textContent = 'Verificando...';

    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          login: $('#login').value.trim(),
          password: $('#password').value
        })
      });

      $('#password').value = '';
      showDashboard();
      await loadAppointments();
    } catch (error) {
      showMessage(
        loginMessage,
        error.message || 'Não foi possível entrar.'
      );
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = 'Entrar no painel';
    }
  });

  filterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadAppointments();
  });

  $('#todayButton').addEventListener('click', async () => {
    setDefaultDates();
    await loadAppointments();
  });

  refreshButton.addEventListener('click', loadAppointments);

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;

    try {
      await api('/api/admin/logout', { method: 'POST' });
      showLogin();
      showMessage(loginMessage, 'Sessão encerrada.', 'success');
    } catch (error) {
      showMessage(
        dashboardMessage,
        error.message || 'Não foi possível encerrar a sessão.'
      );
    } finally {
      logoutButton.disabled = false;
    }
  });

  setDefaultDates();
})();
