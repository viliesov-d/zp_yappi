/* Pure date and salary helpers. All financial values are stored as integer kopiykas. */
(function (root, factory) {
  const logic = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  root.SalaryLogic = logic;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;
  const integerFormatter = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 });
  const dateFormatter = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  function iso(year, month, day) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  function dateParts(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { year, month, day };
  }
  function utcDay(value) {
    const p = dateParts(value);
    return p ? Date.UTC(p.year, p.month - 1, p.day) / DAY_MS : NaN;
  }
  function daysInMonth(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
  function shiftMonth(year, month, offset) {
    const d = new Date(Date.UTC(year, month - 1 + offset, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  }
  function mod(n, m) { return ((n % m) + m) % m; }
  function isScheduledWork(date, anchorDate, anchorPosition) {
    return mod(utcDay(date) - utcDay(anchorDate) + anchorPosition - 1, 6) < 4;
  }
  function dayType(date, state) {
    const entry = state.days[date];
    if (entry?.override === 'unpaid') return 'unpaid';
    if (entry?.override === 'replacement') return 'replacement';
    return isScheduledWork(date, state.anchorDate, state.anchorPosition) ? 'work' : 'off';
  }
  function isWorking(type) { return type === 'work' || type === 'replacement'; }
  function dayAmount(date, state) {
    if (!isWorking(dayType(date, state))) return 0;
    const amount = state.days[date]?.amount;
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : 0;
  }
  function periodTotal(state, year, month, startDay, endDay) {
    let result = 0;
    const max = Math.min(endDay, daysInMonth(year, month));
    for (let day = startDay; day <= max; day++) result += dayAmount(iso(year, month, day), state);
    return result;
  }
  function monthStats(state, year, month) {
    let recorded = 0, working = 0, replacements = 0, unpaid = 0;
    const last = daysInMonth(year, month);
    for (let d = 1; d <= last; d++) {
      const date = iso(year, month, d), type = dayType(date, state);
      if (isWorking(type)) {
        working++;
        if (Object.prototype.hasOwnProperty.call(state.days[date] || {}, 'amount')) recorded++;
        if (type === 'replacement') replacements++;
      }
      if (type === 'unpaid') unpaid++;
    }
    const firstHalf = periodTotal(state, year, month, 1, 15);
    const secondHalf = periodTotal(state, year, month, 16, last);
    return { total: firstHalf + secondHalf, firstHalf, secondHalf, recorded, working, replacements, unpaid };
  }
  function payday(date, state) {
    const p = dateParts(date);
    if (!p || (p.day !== 10 && p.day !== 25)) return null;
    if (p.day === 25) return {
      kind: 25, period: `${iso(p.year, p.month, 1)} — ${iso(p.year, p.month, 15)}`,
      amount: periodTotal(state, p.year, p.month, 1, 15)
    };
    const prev = shiftMonth(p.year, p.month, -1);
    return {
      kind: 10, period: `${iso(prev.year, prev.month, 16)} — ${iso(prev.year, prev.month, daysInMonth(prev.year, prev.month))}`,
      amount: periodTotal(state, prev.year, prev.month, 16, daysInMonth(prev.year, prev.month))
    };
  }
  function formatMoney(cents) {
    const whole = Math.floor(cents / 100);
    const rest = cents % 100;
    return `${integerFormatter.format(whole)}${rest ? ',' + String(rest).padStart(2, '0') : ''} ₴`;
  }
  function formatCompact(cents) {
    const amount = cents / 100;
    if (amount >= 1000000) return `${String((amount / 1000000).toFixed(1)).replace('.', ',')}м`;
    if (amount >= 1000) return `${String((amount / 1000).toFixed(1)).replace('.', ',')}к`;
    return `${Math.floor(amount)}${cents % 100 ? ',' + String(cents % 100).padStart(2, '0') : ''}`;
  }
  function formatDate(date) {
    const p = dateParts(date);
    return p ? dateFormatter.format(new Date(Date.UTC(p.year, p.month - 1, p.day))) : '';
  }
  function parseMoney(value) {
    const normalized = String(value).trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(normalized)) return null;
    const [whole, cents = ''] = normalized.split('.');
    return Number(whole) * 100 + Number((cents + '00').slice(0, 2));
  }
  return { iso, dateParts, utcDay, daysInMonth, shiftMonth, isScheduledWork, dayType, isWorking,
    dayAmount, periodTotal, monthStats, payday, formatMoney, formatCompact, formatDate, parseMoney };
});
