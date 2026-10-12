'use strict';

// Small helpers shared by every page. User-supplied text is only ever set via textContent.
window.ui = {
  $: (id) => document.getElementById(id),

  el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    }
    node.append(...children.filter((c) => c != null));
    return node;
  },

  async api(url, { method = 'GET', body } = {}) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data: data || {} };
  },

  formatDate(isoDate) {
    return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  },

  formatShortDate(isoDate) {
    return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  },

  formatTime(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  },

  todayIso() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  },
};
