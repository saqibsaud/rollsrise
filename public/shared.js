// Small helpers shared by the customer, kitchen and admin pages.
(function () {
  const rupeeFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

  async function api(path, { method = 'GET', body, form } = {}) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (form) opts.body = form;
    else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try {
      res = await fetch(path, opts);
    } catch {
      const e = new Error('Cannot reach the restaurant server. Check the Wi-Fi connection.');
      e.status = 0;
      throw e;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.error || `Request failed (${res.status})`);
      e.status = res.status;
      throw e;
    }
    return data;
  }

  const rupees = (n) => `₹${rupeeFmt.format(n)}`;
  const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dateTime = (iso) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  // h('div', {class: 'x', onclick: fn}, 'text', child) — text is always set with textContent.
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v; // only used for server-generated QR SVGs
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // Live updates. The browser retries dropped connections by itself, but gives up for good when the
  // server answers with an error (for example after a login expires). Then we reconnect ourselves
  // and call onChange, so the page re-fetches and can show its login form.
  function live(channel, onChange) {
    const listeners = [];
    let es = null;
    let stopped = false;
    let timer = null;
    function connect() {
      es = new EventSource(`/api/events?channel=${encodeURIComponent(channel)}`);
      es.addEventListener('changed', () => onChange());
      es.addEventListener('open', () => onChange());
      es.addEventListener('error', () => {
        if (stopped || es.readyState !== EventSource.CLOSED) return;
        clearTimeout(timer);
        timer = setTimeout(() => { if (!stopped) { connect(); onChange(); } }, 3000);
      });
      for (const [type, fn] of listeners) es.addEventListener(type, fn);
    }
    connect();
    return {
      addEventListener(type, fn) { listeners.push([type, fn]); es.addEventListener(type, fn); },
      close() { stopped = true; clearTimeout(timer); es.close(); },
    };
  }

  let toastTimer;
  function toast(message, kind = '') {
    let el = document.getElementById('rr-toast');
    if (!el) {
      el = h('div', { id: 'rr-toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
      document.body.append(el);
    }
    el.className = `toast ${kind}`;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, kind === 'error' ? 5000 : 2500);
  }

  const store = {
    get(key, fallback = null) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } },
  };

  function vmark(isVeg) {
    return h('span', { class: `vmark ${isVeg ? 'veg' : 'nonveg'}`, role: 'img', 'aria-label': isVeg ? 'Vegetarian' : 'Non-vegetarian', title: isVeg ? 'Vegetarian' : 'Non-vegetarian' });
  }

  function chillies(spice) {
    if (!spice) return null;
    return h('span', { class: 'chilli', title: `Spice level ${spice} of 3`, 'aria-label': `Spice level ${spice} of 3` }, '🌶'.repeat(spice));
  }

  const STATUS_TEXT = { new: 'Received', preparing: 'Preparing', ready: 'Ready', served: 'Served', cancelled: 'Cancelled' };

  // Renders a bill object from the server as a receipt element.
  function receipt(bill) {
    const r = bill.restaurant;
    return h('article', { class: 'receipt' },
      h('header', {},
        h('h2', {}, r.name),
        r.tagline ? h('div', { class: 'caps muted' }, r.tagline) : null,
        h('div', { class: 'muted' }, r.address),
        h('div', { class: 'muted' }, `Phone ${r.phone}`),
        r.gstin ? h('div', { class: 'muted' }, `GSTIN ${r.gstin}`) : null),
      h('div', { class: 'meta' },
        h('span', {}, `Bill ${bill.billNo ?? '—'}`),
        h('span', {}, `Table ${bill.tableNumber}`),
        h('span', {}, dateTime(bill.requestedAt || bill.openedAt))),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', { class: 'r' }, 'Qty'), h('th', { class: 'r' }, 'Rate'), h('th', { class: 'r' }, 'Amount'))),
        h('tbody', {}, bill.lines.map(l => h('tr', {},
          h('td', {}, l.name, l.option !== 'Regular' ? h('div', { class: 'muted' }, l.option) : null),
          h('td', { class: 'r' }, l.qty),
          h('td', { class: 'r' }, rupees(l.rate)),
          h('td', { class: 'r' }, rupees(l.amount)))))),
      h('div', { class: 'sums num' },
        h('div', {}, h('span', {}, 'Subtotal'), h('span', {}, rupees(bill.subtotal))),
        bill.taxes.map(t => h('div', {}, h('span', {}, t.label), h('span', {}, rupees(t.amount)))),
        bill.roundOff ? h('div', {}, h('span', {}, 'Round off'), h('span', {}, rupees(bill.roundOff))) : null,
        h('div', { class: 'grand' }, h('span', {}, 'Total'), h('span', {}, rupees(bill.total)))),
      bill.upi ? h('div', { class: 'upi' },
        h('div', { class: 'qr', html: bill.upi.qrSvg, role: 'img', 'aria-label': 'UPI payment QR code' }),
        h('div', { class: 'muted' }, 'Scan with any UPI app to pay')) : null,
      h('footer', {}, bill.footer));
  }

  window.RR = { api, rupees, time, dateTime, h, live, toast, store, vmark, chillies, receipt, STATUS_TEXT };
})();
