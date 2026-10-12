'use strict';

(() => {
  const { $, el, api, formatDate, formatTime } = window.ui;
  const code = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const endpoint = `/api/attend/${encodeURIComponent(code)}`;
  const STORAGE_KEY = 'platcorp-attendee';
  const form = $('form');
  let session;

  init();

  async function init() {
    try {
      const { ok, data } = await api(endpoint);
      if (!ok) return showNotice('Link not valid', data.error || 'Ask the organiser for a new QR code.');
      session = data;
      if (!session.open) return showNotice('Check-in closed', `Check-in for "${session.title}" is no longer open.`);
      renderForm();
    } catch {
      showNotice('Could not load', 'Check your connection and scan the QR code again.');
    } finally {
      $('loading').hidden = true;
    }
  }

  function renderForm() {
    $('title').textContent = session.title;
    $('date').textContent = formatDate(session.eventDate);
    document.title = `Check in · ${session.title}`;

    const select = $('department');
    for (const dept of session.departments) select.append(el('option', { value: dept, text: dept }));
    select.addEventListener('change', syncOtherField);

    if (session.emailDomains.length) {
      $('email-hint').textContent = `Use your work email (${session.emailDomains.map((d) => `@${d}`).join(' or ')}).`;
      $('email-hint').hidden = false;
    }

    prefillFromLastVisit();
    form.addEventListener('submit', onSubmit);
    form.addEventListener('input', (e) => clearFieldError(e.target.name));
    form.hidden = false;
  }

  function syncOtherField() {
    const isOther = $('department').value === session.otherDepartment;
    $('other-field').hidden = !isOther;
    if (isOther) $('departmentOther').focus();
  }

  async function onSubmit(event) {
    event.preventDefault();
    clearErrors();

    const button = $('submit');
    button.disabled = true;
    button.textContent = 'Checking in…';

    const payload = {
      name: $('name').value,
      email: $('email').value,
      department: $('department').value,
      departmentOther: $('departmentOther').value,
    };

    try {
      const { status, data } = await api(endpoint, { method: 'POST', body: payload });
      if (status === 201) {
        remember(payload);
        showDone('You’re checked in', `Thank you, ${firstName(data.name)}. Your attendance has been recorded.`, data.checkedInAt);
      } else if (status === 409) {
        remember(payload);
        showDone('Already checked in', data.error, data.checkedInAt, true);
      } else if (status === 410) {
        showNotice('Check-in closed', data.error);
      } else if (status === 400 && data.fields) {
        showFieldErrors(data.fields);
      } else {
        showFormError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      showFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      button.disabled = false;
      button.textContent = 'Check in';
    }
  }

  function showFieldErrors(fields) {
    let first;
    for (const [name, message] of Object.entries(fields)) {
      const field = form.querySelector(`[data-field="${name}"]`);
      if (!field) continue;
      field.classList.add('invalid');
      field.querySelector('.field-error').textContent = message;
      first ??= field.querySelector('input, select');
    }
    first?.focus();
  }

  function clearFieldError(name) {
    const field = name && form.querySelector(`[data-field="${name}"]`);
    if (!field) return;
    field.classList.remove('invalid');
    field.querySelector('.field-error').textContent = '';
  }

  function clearErrors() {
    form.querySelectorAll('.field').forEach((f) => clearFieldError(f.dataset.field));
    $('form-error').hidden = true;
  }

  function showFormError(message) {
    $('form-error').textContent = message;
    $('form-error').hidden = false;
  }

  function showNotice(title, text) {
    form.hidden = true;
    $('notice-title').textContent = title;
    $('notice-text').textContent = text;
    $('notice').hidden = false;
  }

  function showDone(title, text, checkedInAt, repeat = false) {
    form.hidden = true;
    $('done').classList.toggle('repeat', repeat);
    $('done-title').textContent = title;
    $('done-text').textContent = text;
    $('done-time').textContent = `${session.title} · checked in at ${formatTime(checkedInAt)}`;
    $('done').hidden = false;
  }

  function firstName(name) {
    return String(name || '').split(' ')[0];
  }

  // Remember details on this device so regular attendees don't retype them next time.
  function remember({ name, email, department, departmentOther }) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, email, department, departmentOther }));
    } catch { /* storage unavailable (private mode etc.) */ }
  }

  function prefillFromLastVisit() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { saved = null; }
    if (!saved) return;
    $('name').value = saved.name || '';
    $('email').value = saved.email || '';
    if (session.departments.includes(saved.department)) $('department').value = saved.department;
    $('departmentOther').value = saved.departmentOther || '';
    $('other-field').hidden = $('department').value !== session.otherDepartment;
  }
})();
