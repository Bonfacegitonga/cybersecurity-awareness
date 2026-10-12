'use strict';

(() => {
  const { $, el, api, formatShortDate } = window.ui;

  $('eventDate').value = window.ui.todayIso();
  $('create-form').addEventListener('submit', createSession);
  loadSessions();

  async function loadSessions() {
    const { ok, data } = await api('/api/admin/sessions');
    if (!ok) return;
    const rows = data.map((s) =>
      el('tr', {},
        el('td', {},
          el('a', { class: 'title-link', href: `/admin/sessions/${s.id}`, text: s.title })),
        el('td', { class: 'hide-sm nowrap', text: formatShortDate(s.eventDate) }),
        el('td', {},
          el('span', { class: `badge ${s.isOpen ? 'badge-open' : 'badge-closed'}`, text: s.isOpen ? 'Open' : 'Closed' })),
        el('td', { class: 'num', text: String(s.attendeeCount) })));
    $('sessions').replaceChildren(...rows);
    $('empty').hidden = rows.length > 0;
  }

  async function createSession(event) {
    event.preventDefault();
    const button = $('create');
    const error = $('create-error');
    error.hidden = true;
    button.disabled = true;
    try {
      const { ok, data } = await api('/api/admin/sessions', {
        method: 'POST',
        body: { title: $('title').value, eventDate: $('eventDate').value },
      });
      if (!ok) throw new Error(data.error || 'Could not create the session.');
      location.href = `/admin/sessions/${data.id}`;
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      button.disabled = false;
    }
  }
})();
