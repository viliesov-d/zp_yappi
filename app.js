/* Salary calendar 4/2 — standalone browser application, no accounts or backend required. */
(() => {
  'use strict';

  const L = window.SalaryLogic;
  const STORAGE_KEY = 'zminaSalaryCalendarV1';
  const today = new Date();
  const todayISO = L.iso(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const monthFormatter = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shortDayFormatter = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', timeZone: 'UTC' });
  const el = (id) => document.getElementById(id);
  const view = { year: today.getFullYear(), month: today.getMonth() + 1 };
  let state = { version: 1, anchorDate: todayISO, anchorPosition: 1, days: {} };
  let editingDate = null;
  let toastTimer = null;
  let storageOK = true;

  function validEntry(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const entry = {};
    if (raw.override === 'replacement' || raw.override === 'unpaid') entry.override = raw.override;
    if (Number.isSafeInteger(raw.amount) && raw.amount >= 0 && raw.amount <= 99999999999) entry.amount = raw.amount;
    if (typeof raw.note === 'string' && raw.note.trim()) entry.note = raw.note.slice(0, 250);
    return entry;
  }
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Невірний формат');
    if (!L.dateParts(raw.anchorDate) || !Number.isInteger(raw.anchorPosition) || raw.anchorPosition < 1 || raw.anchorPosition > 6) {
      throw new Error('Невірні параметри графіка');
    }
    if (!raw.days || typeof raw.days !== 'object' || Array.isArray(raw.days)) throw new Error('Не знайдено днів');
    const entries = Object.entries(raw.days);
    if (entries.length > 10000) throw new Error('Занадто багато записів');
    const days = {};
    for (const [date, rawEntry] of entries) {
      if (!L.dateParts(date) || !rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
        throw new Error('Некоректний запис дня');
      }
      if (rawEntry.override != null && !['unpaid', 'replacement'].includes(rawEntry.override)) throw new Error('Некоректний статус дня');
      if (rawEntry.amount != null && (!Number.isSafeInteger(rawEntry.amount) || rawEntry.amount < 0 || rawEntry.amount > 99999999999)) {
        throw new Error('Некоректна сума');
      }
      days[date] = validEntry(rawEntry);
    }
    return { version: 1, anchorDate: raw.anchorDate, anchorPosition: raw.anchorPosition, days };
  }
  function loadLocal() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) state = normalize(JSON.parse(saved));
    } catch (error) {
      storageOK = false;
      console.warn('Помилка читання даних:', error);
    }
    updateStorageIndicator();
  }
  function updateStorageIndicator() {
    const element = el('save-status');
    element.classList.toggle('warning', !storageOK);
    element.innerHTML = storageOK
      ? '<span class="status-dot"></span> Дані зберігаються на пристрої'
      : '<span class="status-dot"></span> Не вдалося зберегти дані';
    element.title = storageOK ? 'Записи зберігаються у цьому браузері' : 'Перевірте налаштування сховища або збережіть резервну копію';
  }
  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOK = true;
    } catch (error) {
      storageOK = false;
      console.warn('Помилка запису даних:', error);
      showToast('Не вдалося зберегти на пристрої. Експортуйте резервну копію.');
    }
    updateStorageIndicator();
  }
  function showToast(message) {
    const toast = el('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
  }
  function monthName(year, month) {
    const s = monthFormatter.format(new Date(Date.UTC(year, month - 1, 1))).replace(/\s*р\.$/, '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function renderOverview() {
    const stats = L.monthStats(state, view.year, view.month);
    el('overview-period').textContent = monthName(view.year, view.month);
    el('stat-total').textContent = L.formatMoney(stats.total);
    el('stat-first').textContent = L.formatMoney(stats.firstHalf);
    el('stat-second').textContent = L.formatMoney(stats.secondHalf);
    el('stat-shifts').textContent = `${stats.recorded} / ${stats.working}`;
    el('shifts-caption').textContent = `Заміни: ${stats.replacements} · За свій рахунок: ${stats.unpaid}`;
  }
  function renderPayments() {
    const next = L.shiftMonth(view.year, view.month, 1);
    const stats = L.monthStats(state, view.year, view.month);
    el('pay-25-date').textContent = L.formatDate(L.iso(view.year, view.month, 25));
    el('pay-10-date').textContent = L.formatDate(L.iso(next.year, next.month, 10));
    el('pay-25-amount').textContent = L.formatMoney(stats.firstHalf);
    el('pay-10-amount').textContent = L.formatMoney(stats.secondHalf);
  }
  function calendarCell(date, inMonth) {
    const parts = L.dateParts(date);
    if (!inMonth) return `<div class="calendar-day outside" aria-hidden="true"><span class="date-number">${Number(date.slice(8, 10))}</span></div>`;
    const type = L.dayType(date, state);
    const entry = state.days[date] || {};
    const hasAmount = L.isWorking(type) && Object.prototype.hasOwnProperty.call(entry, 'amount');
    const amount = L.dayAmount(date, state);
    const payday = L.payday(date, state);
    const dayLabels = { work: 'Робоча зміна', off: 'Вихідний', replacement: 'Заміна', unpaid: 'За свій рахунок' };
    const initials = { work: 'Р', off: 'В', replacement: 'З', unpaid: 'С' };
    let money = '<span class="day-income empty">—</span>';
    if (hasAmount) money = `<span class="day-income desktop-income" title="${L.formatMoney(amount)}">${amount >= 1000000 ? L.formatCompact(amount) + ' ₴' : L.formatMoney(amount)}</span><span class="day-income mobile-income" title="${L.formatMoney(amount)}">${L.formatCompact(amount)} ₴</span>`;
    else if (L.isWorking(type)) money = '<span class="day-income empty">+ сума</span>';
    const payHTML = payday ? `<span class="payday-chip" title="Виплата: ${L.formatMoney(payday.amount)}"><span class="pay-desktop">ЗП ${payday.kind} · ${L.formatCompact(payday.amount)} ₴</span><span class="pay-mobile">ЗП ${payday.kind}</span></span>` : '';
    const payAria = payday ? `; виплата ${payday.kind} числа — ${L.formatMoney(payday.amount)}` : '';
    const aria = `${L.formatDate(date)}; ${dayLabels[type]}; ${hasAmount ? L.formatMoney(amount) : 'сума не внесена'}${payAria}`;
    // Date/amount/status data comes only from validated local input and program-generated values.
    return `<button type="button" class="calendar-day ${type}${date === todayISO ? ' today' : ''}${payday ? ' has-payday' : ''}" data-date="${date}" aria-label="${aria}">
      <span class="day-top"><span class="date-number">${parts.day}</span><span class="day-indicator">${initials[type]}</span></span>
      <span class="day-label">${dayLabels[type]}</span>${money}${payHTML}</button>`;
  }
  function renderCalendar() {
    el('month-label').textContent = monthName(view.year, view.month);
    const firstWeekday = new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay();
    const offset = (firstWeekday + 6) % 7;
    const last = L.daysInMonth(view.year, view.month);
    const cellCount = Math.ceil((offset + last) / 7) * 7;
    const html = [];
    for (let cell = 0; cell < cellCount; cell++) {
      const dt = new Date(Date.UTC(view.year, view.month - 1, cell - offset + 1));
      const date = L.iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      html.push(calendarCell(date, dt.getUTCFullYear() === view.year && dt.getUTCMonth() + 1 === view.month));
    }
    el('day-grid').innerHTML = html.join('');
    el('previous-month').disabled = view.year === 1900 && view.month === 1;
    el('next-month').disabled = view.year === 2100 && view.month === 12;
  }
  function render() {
    renderOverview();
    renderPayments();
    renderCalendar();
    el('anchor-date').value = state.anchorDate;
    el('anchor-position').value = String(state.anchorPosition);
  }
  function goToMonth(offset) {
    const next = L.shiftMonth(view.year, view.month, offset);
    if (next.year < 1900 || next.year > 2100) return;
    view.year = next.year;
    view.month = next.month;
    render();
  }
  function setCurrentMonth() {
    view.year = today.getFullYear();
    view.month = today.getMonth() + 1;
    render();
  }
  function selectedStatus() {
    return document.querySelector('input[name="day-status"]:checked').value;
  }
  function updateAmountAvailability() {
    if (!editingDate) return;
    const status = selectedStatus();
    const workable = status === 'replacement' || (status === 'scheduled' && L.isScheduledWork(editingDate, state.anchorDate, state.anchorPosition));
    el('day-amount').disabled = !workable;
    el('day-amount').parentElement.classList.toggle('disabled', !workable);
    el('amount-hint').textContent = workable
      ? 'Введіть фактичну суму або залиште поле порожнім, якщо ще не знаєте заробіток.'
      : 'Цей день не оплачується. Щоб внести заробіток, оберіть «Вийшла на заміну».';
  }
  function openDayDialog(date) {
    editingDate = date;
    const entry = state.days[date] || {};
    const p = L.dateParts(date);
    const weekday = shortDayFormatter.format(new Date(Date.UTC(p.year, p.month - 1, p.day)));
    const scheduledWork = L.isScheduledWork(date, state.anchorDate, state.anchorPosition);
    el('dialog-heading').textContent = L.formatDate(date);
    el('dialog-schedule').textContent = `${weekday[0].toUpperCase() + weekday.slice(1)} · За графіком: ${scheduledWork ? 'робоча зміна' : 'вихідний'}`;
    el('scheduled-hint').textContent = scheduledWork ? 'Робочий день' : 'Вихідний';
    document.querySelector(`input[name="day-status"][value="${entry.override || 'scheduled'}"]`).checked = true;
    el('day-amount').value = Object.prototype.hasOwnProperty.call(entry, 'amount') ? String(entry.amount / 100).replace('.', ',') : '';
    el('day-note').value = entry.note || '';
    el('day-error').hidden = true;
    updateAmountAvailability();
    el('day-dialog').showModal();
  }
  function closeDayDialog() {
    el('day-dialog').close();
    editingDate = null;
  }
  function saveEditedDay(event) {
    event.preventDefault();
    if (!editingDate) return;
    const status = selectedStatus();
    const entry = { ...(state.days[editingDate] || {}) };
    if (status === 'scheduled') delete entry.override;
    else entry.override = status;
    const isWork = status === 'replacement' || (status === 'scheduled' && L.isScheduledWork(editingDate, state.anchorDate, state.anchorPosition));
    if (isWork) {
      const rawAmount = el('day-amount').value.trim();
      if (rawAmount) {
        const cents = L.parseMoney(rawAmount);
        if (cents === null) {
          el('day-error').textContent = 'Введіть коректну суму: невід’ємне число, максимум два знаки після коми.';
          el('day-error').hidden = false;
          el('day-amount').focus();
          return;
        }
        entry.amount = cents;
      } else delete entry.amount;
    }
    // Existing amount is retained on unpaid/off days but never counted. Reset clears it completely.
    const note = el('day-note').value.trim();
    if (note) entry.note = note.slice(0, 250);
    else delete entry.note;
    if (Object.keys(entry).length) state.days[editingDate] = entry;
    else delete state.days[editingDate];
    saveLocal();
    closeDayDialog();
    render();
    if (storageOK) showToast('Зміни збережено');
  }
  function resetEditedDay() {
    if (!editingDate) return;
    delete state.days[editingDate];
    saveLocal();
    closeDayDialog();
    render();
    if (storageOK) showToast('День повернуто до графіка 4/2');
  }
  function exportBackup() {
    try {
      const data = { ...state, exportedAt: new Date().toISOString(), app: 'Зміна — зарплата 4/2' };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `zmina-backup-${todayISO}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Резервна копія створена');
    } catch (error) {
      console.warn(error);
      showToast('Не вдалося експортувати дані');
    }
  }
  async function importBackup(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Файл надто великий (максимум 2 МБ)');
      const incoming = normalize(JSON.parse(await file.text()));
      const totalDays = Object.keys(incoming.days).length;
      if (!window.confirm(`Імпортувати ${totalDays} записів? Поточні дані будуть замінені даними з файлу.`)) return;
      state = incoming;
      saveLocal();
      render();
      showToast(storageOK ? 'Дані успішно імпортовано' : 'Дані імпортовано, але браузер не дозволив їх зберегти');
    } catch (error) {
      showToast(`Помилка імпорту: ${error.message}`);
    } finally {
      input.value = '';
    }
  }

  loadLocal();
  render();
  el('previous-month').addEventListener('click', () => goToMonth(-1));
  el('next-month').addEventListener('click', () => goToMonth(1));
  el('today-button').addEventListener('click', setCurrentMonth);
  el('month-label').addEventListener('click', setCurrentMonth);
  el('day-grid').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-date]');
    if (button) openDayDialog(button.dataset.date);
  });
  el('schedule-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const anchor = el('anchor-date').value;
    const position = Number(el('anchor-position').value);
    if (!L.dateParts(anchor) || !Number.isInteger(position) || position < 1 || position > 6) {
      showToast('Укажіть правильну опорну дату та день циклу');
      return;
    }
    state.anchorDate = anchor;
    state.anchorPosition = position;
    saveLocal();
    render();
    if (storageOK) showToast('Графік 4/2 оновлено для всіх місяців');
  });
  document.querySelectorAll('input[name="day-status"]').forEach((radio) => radio.addEventListener('change', updateAmountAvailability));
  el('day-form').addEventListener('submit', saveEditedDay);
  el('reset-day').addEventListener('click', resetEditedDay);
  el('dialog-close').addEventListener('click', closeDayDialog);
  el('day-dialog').addEventListener('click', (event) => { if (event.target === el('day-dialog')) closeDayDialog(); });
  el('day-dialog').addEventListener('close', () => { editingDate = null; });
  el('help-button').addEventListener('click', () => el('help-dialog').showModal());
  el('help-close').addEventListener('click', () => el('help-dialog').close());
  el('help-done').addEventListener('click', () => el('help-dialog').close());
  el('help-dialog').addEventListener('click', (event) => { if (event.target === el('help-dialog')) el('help-dialog').close(); });
  el('export-button').addEventListener('click', exportBackup);
  el('import-button').addEventListener('click', () => el('import-file').click());
  el('import-file').addEventListener('change', importBackup);
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      state = normalize(JSON.parse(event.newValue));
      render();
      showToast('Дані оновлено з іншої вкладки');
    } catch (error) { console.warn('Некоректні дані з іншої вкладки', error); }
  });
})();
