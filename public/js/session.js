'use strict';

(() => {
  const { $, el, api, formatDate, formatTime } = window.ui;
  const id = location.pathname.split('/').filter(Boolean).pop();
  const endpoint = `/api/admin/sessions/${id}`;
  const REFRESH_MS = 5000;
  let session;
  let knownEmails = null;

  $('export').href = `${endpoint}/attendance.csv`;
  $('present').addEventListener('click', enterPresent);
  $('exit-present').addEventListener('click', exitPresent);
  $('download').addEventListener('click', downloadQr);
  $('print').addEventListener('click', () => window.print());
  $('copy').addEventListener('click', copyLink);
  $('toggle').addEventListener('click', toggleOpen);
  $('delete').addEventListener('click', deleteSession);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) document.body.classList.remove('presenting');
  });

  load().then(drawQr);
  setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);

  async function load() {
    const { ok, status, data } = await api(endpoint);
    if (!ok) {
      if (status === 404) location.href = '/admin';
      return;
    }
    session = data;
    render();
  }

  function render() {
    document.title = `${session.title} · Attendance`;
    $('title').textContent = session.title;
    $('date').textContent = formatDate(session.eventDate);
    $('url').textContent = session.attendUrl;
    $('url').href = session.attendUrl;
    $('qr-closed').hidden = session.isOpen;
    $('toggle').textContent = session.isOpen ? 'Close check-in' : 'Reopen check-in';
    $('count').textContent = session.attendees.length;
    $('present-count').textContent = session.attendees.length;

    // Briefly highlight people who checked in since the last refresh.
    const isFirstRender = knownEmails === null;
    const previous = knownEmails || new Set();
    knownEmails = new Set(session.attendees.map((a) => a.email));

    const rows = session.attendees.map((a, i) =>
      el('tr', { class: !isFirstRender && !previous.has(a.email) ? 'fresh' : '' },
        el('td', { class: 'num muted', text: String(i + 1) }),
        el('td', { text: a.name }),
        el('td', { text: a.email }),
        el('td', { text: a.department }),
        el('td', { class: 'nowrap', text: formatTime(a.checkedInAt) })));
    $('attendees').replaceChildren(...rows);
    $('empty').hidden = rows.length > 0;
  }

  // Compose the QR code with the Platcorp globe in the centre (the server encodes it with
  // high error correction, so the covered modules are recoverable).
  async function drawQr() {
    if (!session) return;
    const canvas = $('qr');
    const ctx = canvas.getContext('2d');
    // Awareness-campaign QR codes get the festive cheers mark; normal ones keep the globe.
    const markSrc = session.awareness ? '/img/platcorp-mark.png' : '/img/platcorp-mark.png';
    const [qr, mark] = await Promise.all([
      loadImage(`${endpoint}/qr.png?t=${Date.now()}`),
      loadImage(markSrc),
    ]);
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(qr, 0, 0, size, size);

    const badge = Math.round(size * 0.22);
    const x = (size - badge) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x, x, badge, badge, badge * 0.2);
    ctx.fill();
    const pad = badge * 0.12;
    ctx.drawImage(mark, x + pad, x + pad, badge - pad * 2, badge - pad * 2);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function downloadQr() {
    $('qr').toBlob((blob) => {
      const slug = session.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const link = el('a', { href: URL.createObjectURL(blob), download: `qr-${session.eventDate}-${slug || 'session'}.png` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, 'image/png');
  }

  async function copyLink() {
    const button = $('copy');
    try {
      await navigator.clipboard.writeText(session.attendUrl);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Copy failed';
    }
    setTimeout(() => { button.textContent = 'Copy link'; }, 1600);
  }

  function enterPresent() {
    document.body.classList.add('presenting');
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function exitPresent() {
    document.body.classList.remove('presenting');
    if (document.fullscreenElement) document.exitFullscreen();
  }

  async function toggleOpen() {
    const { ok, data } = await api(endpoint, { method: 'PATCH', body: { open: !session.isOpen } });
    if (ok) await load();
    else alert(data.error || 'Could not update the session.');
  }

  async function deleteSession() {
    const count = session.attendees.length;
    const message = `Delete "${session.title}" and its ${count} attendance record${count === 1 ? '' : 's'}? This cannot be undone.`;
    if (!confirm(message)) return;
    const { ok, data } = await api(endpoint, { method: 'DELETE' });
    if (ok) location.href = '/admin';
    else alert(data.error || 'Could not delete the session.');
  }
})();
