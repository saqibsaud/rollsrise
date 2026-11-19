// Kitchen board: New → Preparing → Ready → Served. Live updates with a sound for new orders.
(function () {
  const { api, h, live, toast } = window.RR;
  const $ = (id) => document.getElementById(id);
  const NEXT = { new: ['preparing', 'Start'], preparing: ['ready', 'Ready'], ready: ['served', 'Served'] };
  const sound = new Audio('/sounds/new-order.wav');
  const seen = new Set();
  let orders = [];
  let firstLoad = true;
  let soundOn = false;
  let es = null;
  let confirming = null;

  function minutesSince(iso) { return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000)); }

  function card(o, isNew) {
    const late = o.status !== 'ready' && Date.now() > Date.parse(o.etaAt);
    const [next, label] = NEXT[o.status];
    const actions = confirming === o.id
      ? h('div', { class: 'confirm' }, `Cancel this order for Table ${o.tableNumber}?`,
        h('div', {},
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => move(o.id, 'cancelled') }, 'Yes, cancel'),
          h('button', { class: 'btn', type: 'button', onclick: () => { confirming = null; render(); } }, 'Keep')))
      : h('div', { class: 'card-actions' },
        h('button', { class: `btn go ${o.status === 'ready' ? 'btn-dark' : 'btn-primary'}`, type: 'button', onclick: () => move(o.id, next) }, label),
        h('button', { class: 'btn cancel', type: 'button', onclick: () => { confirming = o.id; render(); }, 'aria-label': 'Cancel order' }, 'Cancel'));
    return h('article', { class: `card${isNew ? ' flash' : ''}` },
      h('div', { class: 'card-head' },
        h('span', { class: 'table-no' }, `Table ${o.tableNumber}`),
        h('span', { class: `age${late ? ' late' : ''}`, title: `Placed ${new Date(o.createdAt).toLocaleTimeString()}` },
          `${minutesSince(o.createdAt)} min${late ? ' · late' : ''}`)),
      h('ul', { class: 'items' }, o.items.map(i => h('li', {},
        h('b', {}, `${i.qty} ×`), i.name, i.option !== 'Regular' ? h('span', { class: 'opt' }, ` (${i.option})`) : null,
        i.note ? h('span', { class: 'inote' }, i.note) : null))),
      o.note ? h('span', { class: 'onote' }, `Note: ${o.note}`) : null,
      actions);
  }

  function render() {
    const fresh = [];
    for (const o of orders) if (!seen.has(o.id)) { fresh.push(o.id); seen.add(o.id); }
    const isNew = (id) => !firstLoad && fresh.includes(id);
    for (const status of ['new', 'preparing', 'ready']) {
      const list = orders.filter(o => o.status === status);
      $(`count-${status}`).textContent = list.length;
      $(`col-${status}`).replaceChildren(...(list.length ? list.map(o => card(o, isNew(o.id))) : [h('p', { class: 'empty-col' }, 'Nothing here')]));
    }
    if (!firstLoad && fresh.length && soundOn) sound.play().catch(() => {});
    firstLoad = false;
  }

  async function load() {
    try {
      orders = await api('/api/kitchen/orders');
      render();
    } catch (e) {
      if (e.status === 401) return showLogin();
      toast(e.message, 'error');
    }
  }

  async function move(id, status) {
    confirming = null;
    try {
      await api(`/api/kitchen/orders/${id}/status`, { method: 'POST', body: { status } });
      if (status === 'cancelled') toast('Order cancelled');
    } catch (e) {
      toast(e.message, 'error');
    }
    load();
  }

  function setLive(ok) {
    $('liveDot').classList.toggle('off', !ok);
    $('liveText').textContent = ok ? 'Live' : 'Reconnecting…';
  }

  function showLogin() {
    if (es) { es.close(); es = null; }
    $('board').hidden = true;
    $('soundBanner').hidden = true;
    $('login').hidden = false;
    $('pin').focus();
  }

  function showBoard() {
    $('login').hidden = true;
    $('board').hidden = false;
    $('soundBanner').hidden = soundOn;
    es = live('kitchen', load);
    es.addEventListener('open', () => setLive(true));
    es.addEventListener('error', () => setLive(false));
    load();
    keepAwake();
  }

  async function keepAwake() {
    try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch { /* not allowed */ }
  }

  $('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginErr').textContent = '';
    try {
      await api('/api/kitchen/login', { method: 'POST', body: { pin: $('pin').value } });
      $('pin').value = '';
      showBoard();
    } catch (err) {
      $('loginErr').textContent = err.message;
    }
  });

  function enableSound() {
    soundOn = true;
    $('soundBanner').hidden = true;
    sound.play().then(() => { sound.pause(); sound.currentTime = 0; }).catch(() => {});
  }
  $('soundBanner').addEventListener('click', enableSound);
  // Use click (not pointerdown) so hiding the banner never shifts the board under a tap in progress.
  document.addEventListener('click', () => { if (!soundOn && !$('board').hidden) enableSound(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

  function tick() { $('clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  setInterval(() => { tick(); if (!$('board').hidden) render(); }, 30000);
  tick();

  // Probe the session; a 401 shows the PIN form.
  api('/api/kitchen/orders').then(() => showBoard()).catch((e) => (e.status === 401 ? showLogin() : showBoard()));
})();
