
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);

  const loginView = $('#loginView');
  const dashboardView = $('#dashboardView');
  const loginForm = $('#loginForm');
  const loginButton = $('#loginButton');
  const loginMessage = $('#loginMessage');
  const dashboardMessage = $('#dashboardMessage');
  const filterForm = $('#filterForm');
  const filterButton = $('#filterButton');
  const appointmentsBody = $('#appointmentsBody');
  const appointmentCount = $('#appointmentCount');
  const loadingState = $('#loadingState');
  const emptyState = $('#emptyState');
  const tableWrap = $('#tableWrap');
  const logoutButton = $('#logoutButton');

  let appointments = [];
  let requestInProgress = false;

  const TIME_ZONE = 'America/Sao_Paulo';

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
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const contentType = response.headers.get('content-type') || '';
    let data = {};

    if (contentType.includes('application/json')) {
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
    element.className = `message message-${type}`;
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
      parts.filter(part => part.type !== 'literal')
        .map(part => [part.type, part.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
  }

  function setDefaultDates() {
    const today = localDateString();
    $('#dateFrom').value = today;
    $('#dateTo').value = today;
  }

  // Converte a meia-noite local de São Paulo em um instante UTC.
  function saoPauloMidnightUtc(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 3, 0, 0)).toISOString();
  }

  function getDateRange() {
    const fromDate = $('#dateFrom').value;
    const toDate = $('#dateTo').value;

    if (!fromDate || !toDate) {
      throw new Error('Selecione a data inicial e a data final.');
    }

    if (fromDate > toDate) {
      throw new Error('A data inicial não pode ser posterior à data final.');
    }

    const nextDay = new Date(`${toDate}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const nextDateString = nextDay.toISOString().slice(0, 10);

    return {
      from: saoPauloMidnightUtc(fromDate),
      to: saoPauloMidnightUtc(nextDateString)
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

  function createCell(label, content, className = '') {
    const td = document.createElement('td');
    td.dataset.label = label;

    if (className) td.className = className;

    if (content instanceof Node) {
      td.append(content);
    } else {
      td.textContent = content ?? '—';
    }

    return td;
  }

  function createActionButton(label, className, action, appointment) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button ${className}`;
    button.textContent = label;
    button.addEventListener('click', () => action(appointment));
    return button;
  }

  function renderAppointments() {
    appointmentsBody.replaceChildren();

    const fragment = document.createDocumentFragment();

    for (const appointment of appointments) {
      const tr = document.createElement('tr');

      const dateCell = createCell(
        'Data / horário',
        formatDateTime(appointment.inicio)
      );

      const client = document.createElement('div');
      client.className = 'client-name';
      client.textContent = appointment.cliente_nome || 'Cliente';

      const phone = document.createElement('span');
      phone.className = 'subline';
      phone.textContent = appointment.telefone_final
        ? `Telefone •••• ${appointment.telefone_final}`
        : 'Telefone não disponível';

      const clientContent = document.createElement('div');
      clientContent.append(client, phone);

      const status = document.createElement('span');
      status.className = statusClass(appointment.status);
      status.textContent = statusLabel(appointment.status);

      tr.append(
        dateCell,
        createCell('Cliente', clientContent),
        createCell('Serviço', appointment.servico),
        createCell('Barbeiro', appointment.barbeiro),
        createCell('Status', status)
      );

      const actions = document.createElement('div');
      actions.className = 'actions';

      if (appointment.status === 'AGENDADO') {
        actions.append(
          createActionButton(
            'Cancelar',
            'button-danger',
            cancelAppointment,
            appointment
          )
        );

        const start = new Date(appointment.inicio).getTime();

        if (Number.isFinite(start) && start < Date.now()) {
          actions.append(
            createActionButton(
              'Marcar falta',
              'button-gold',
              markNoShow,
              appointment
            )
          );
        }
      } else {
        const text = document.createElement('span');
        text.className = 'muted';
        text.textContent = 'Sem ações disponíveis';
        actions.append(text);
      }

      tr.append(createCell('Ações', actions));
      fragment.append(tr);
    }

    appointmentsBody.append(fragment);

    const count = appointments.length;
    appointmentCount.textContent =
      `${count} ${count === 1 ? 'agendamento' : 'agendamentos'}`;

    emptyState.hidden = count !== 0;
    tableWrap.hidden = count === 0;
  }

  async function loadAppointments() {
    if (requestInProgress) return;

    requestInProgress = true;
    filterButton.disabled = true;
    $('#refreshButton').disabled = true;
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
          error.message || 'Não foi possível carregar os agendamentos.'
        );
      }
    } finally {
      requestInProgress = false;
      filterButton.disabled = false;
      $('#refreshButton').disabled = false;
      loadingState.hidden = true;
    }
  }

  async function cancelAppointment(appointment) {
    const confirmed = window.confirm(
      `Cancelar o agendamento de ${appointment.cliente_nome || 'Cliente'} ` +
      `em ${formatDateTime(appointment.inicio)}?\n\n` +
      'Esta ação depende de uma rota administrativa de cancelamento.'
    );

    if (!confirmed) return;

    const reason = window.prompt(
      'Motivo do cancelamento (opcional):',
      'Cancelado pelo administrador'
    );

    if (reason === null) return;

    try {
      /*
       * Requer a rota POST /api/admin/appointments/cancel
       * implementada no backend.
       *
       * Não substitua por uma rota pública: ela pode exigir
       * um token privado que não é fornecido pela listagem.
       */
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
        error.status === 404
          ? 'A rota administrativa de cancelamento ainda não existe no backend. O agendamento não foi alterado.'
          : (error.message || 'Não foi possível cancelar o agendamento.')
      );
    }
  }

  async function markNoShow(appointment) {
    const confirmed = window.confirm(
      `Registrar que ${appointment.cliente_nome || 'o cliente'} ` +
      `não compareceu ao horário ${formatDateTime(appointment.inicio)}?`
    );

    if (!confirmed) return;

    const reason = window.prompt(
      'Observação (opcional):',
      'Cliente não compareceu'
    );

    if (reason === null) return;

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
        'Falta registrada com sucesso.',
        'success'
      );

      await loadAppointments();
    } catch (error) {
      showMessage(
        dashboardMessage,
        error.message || 'Não foi possível registrar a falta.'
      );
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(loginMessage);
    loginButton.disabled = true;
    loginButton.textContent = 'Verificando...';

    const login = $('#login').value.trim();
    const password = $('#password').value;

    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ login, password })
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

  $('#refreshButton').addEventListener('click', loadAppointments);

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;

    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch (error) {
      console.error('Erro ao encerrar sessão:', error);
    } finally {
      logoutButton.disabled = false;
      showLogin();
      hideMessage(loginMessage);
      showMessage(
        loginMessage,
        'Sessão encerrada. Entre novamente para continuar.',
        'success'
      );
    }
  });

  setDefaultDates();
})();
