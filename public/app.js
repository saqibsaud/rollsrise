// Customer ordering app: pick table → browse menu → cart → place order → track → bill.
(function () {
  const { api, rupees, time, h, live, toast, store, vmark, chillies, receipt, STATUS_TEXT } = window.RR;
  const $ = (id) => document.getElementById(id);

  const SCRIPT_WORDS = [
    [/soup/i, 'Flavourful'], [/starter/i, 'Signature'], [/tandoor|bbq/i, 'Classic'], [/combo/i, 'Amazing'],
    [/burger/i, 'Broasted'], [/rice|noodle/i, 'Aromatic'], [/main course/i, 'Signature'], [/bread/i, 'Delightful'],
    [/shawarma|roll/i, 'Arabian'],
  ];
  const STEPS = ['new', 'preparing', 'ready', 'served'];
  const BILL_KEEP_MS = 3 * 60 * 60 * 1000;

  const state = {
    table: null,          // { number, code }
    menu: null,           // { categories, aiEnabled, restaurant }
    dishes: new Map(),    // id -> dish (with categoryName)
    cart: [],             // { optionId, dishId, name, option, price, qty, note, isVeg }
    visit: null,
    hadBillRequest: false,
    chat: [],             // { role, content }
    aiUnavailable: false,
    sheetDish: null,
    sheetQty: 1,
    streams: [],
  };

  // ---------- table ----------
  function codeFromPath() {
    const m = location.pathname.match(/^\/t\/([a-z2-7]+)$/i);
    return m ? m[1].toLowerCase() : null;
  }

  async function resolveTable() {
    const candidates = [codeFromPath(), store.get('rr_table')].filter(Boolean);
    for (const code of candidates) {
      try { return await api(`/api/tables/${encodeURIComponent(code)}`); } catch { /* try next */ }
    }
    return null;
  }

  async function showPicker() {
    state.table = null;
    $('tablePill').hidden = true;
    $('ordersLink').hidden = true;
    showView('pick');
    const grid = $('tableGrid');
    grid.replaceChildren(h('p', { class: 'muted' }, 'Loading tables…'));
    try {
      const tables = await api('/api/tables');
      grid.replaceChildren(...tables.map(t => h('button', { type: 'button', onclick: () => setTable(t), 'aria-label': `Table ${t.number}` }, t.number)));
    } catch (e) {
      grid.replaceChildren(h('p', { class: 'notice' }, e.message));
    }
  }

  function setTable(t) {
    state.table = t;
    store.set('rr_table', t.code);
    if (codeFromPath() !== t.code) history.replaceState(null, '', `/t/${t.code}${location.hash || '#menu'}`);
    $('tableNo').textContent = t.number;
    $('tablePill').hidden = false;
    $('ordersLink').hidden = false;
    state.cart = store.get(`rr_cart_${t.code}`, []);
    state.streams.forEach(s => s.close());
    state.streams = [live(`table:${t.code}`, refreshVisit), live('menu', loadMenu)];
    route();
  }

  // ---------- menu ----------
  async function loadMenu() {
    try {
      const menu = await api('/api/menu');
      state.menu = menu;
      state.dishes.clear();
      for (const c of menu.categories) for (const d of c.dishes) state.dishes.set(d.id, { ...d, categoryName: c.name });
      if (menu.restaurant?.tagline) $('tagline').textContent = menu.restaurant.tagline;
      pruneCart();
      renderMenu();
      renderAskButton();
    } catch (e) {
      $('menuList').replaceChildren(h('p', { class: 'notice' }, e.message));
    }
  }

  function headingFor(name) {
    const [main, sub] = name.split(/\s+[–-]\s+/);
    const script = (SCRIPT_WORDS.find(([re]) => re.test(name)) || [null, 'Our'])[1];
    return h('div', { class: 'menu-heading' },
      h('span', { class: 'script' }, script),
      h('span', { class: 'title' }, main),
      h('span', { class: 'rule' }),
      sub ? h('span', { class: 'sub' }, sub === 'Veg' ? 'Vegetarian' : sub === 'Non-Veg' ? 'Non-Vegetarian' : sub) : null);
  }

  const priceText = (d) => d.options.length === 1 ? rupees(d.options[0].price) : `from ${rupees(Math.min(...d.options.map(o => o.price)))}`;
  const inCart = (dishId) => state.cart.filter(l => l.dishId === dishId).reduce((n, l) => n + l.qty, 0);

  function matches(d, q, vegOnly) {
    if (vegOnly && !d.isVeg) return false;
    if (!q) return true;
    return d.name.toLowerCase().includes(q) || d.ingredients.some(i => i.toLowerCase().includes(q)) || d.description.toLowerCase().includes(q);
  }

  function renderMenu() {
    if (!state.menu) return;
    const q = $('search').value.trim().toLowerCase();
    const vegOnly = $('vegOnly').checked;
    const sections = [];
    const chips = [];
    for (const c of state.menu.categories) {
      const dishes = c.dishes.filter(d => matches(d, q, vegOnly));
      if (!dishes.length) continue;
      sections.push(h('section', { class: 'menu-section', id: `cat-${c.id}` }, headingFor(c.name), dishes.map(dishRow)));
      chips.push(h('button', { type: 'button', dataset: { cat: c.id }, onclick: () => document.getElementById(`cat-${c.id}`).scrollIntoView({ behavior: 'smooth' }) }, c.name));
    }
    $('menuList').replaceChildren(...sections);
    $('chips').replaceChildren(...chips);
    $('noResults').hidden = sections.length > 0;
    highlightChip();
  }

  function dishRow(d) {
    const count = inCart(d.id);
    const addBtn = d.available
      ? h('button', { type: 'button', class: `add${count ? ' in' : ''}`, onclick: () => quickAdd(d), 'aria-label': `Add ${d.name}` }, count ? `${count} ADDED` : 'ADD')
      : h('button', { type: 'button', class: 'add', disabled: true }, 'SOLD OUT');
    return h('div', { class: `dish${d.available ? '' : ' soldout'}` },
      h('button', { type: 'button', class: 'dish-info', onclick: () => openDish(d.id) },
        vmark(d.isVeg),
        h('span', { class: 'dish-text' },
          h('b', {}, d.name),
          h('span', { class: 'desc' }, d.available ? d.description : 'Sold out today'),
          h('span', { class: 'price-line' }, priceText(d), chillies(d.spice), h('span', { class: 'time' }, `~${d.prepMinutes} min`)))),
      addBtn);
  }

  function quickAdd(d) {
    if (d.options.length > 1) return openDish(d.id);
    addToCart(d, d.options[0], 1, '');
  }

  let chipTimer;
  function highlightChip() {
    clearTimeout(chipTimer);
    chipTimer = setTimeout(() => {
      const offset = 180;
      let current = null;
      for (const s of document.querySelectorAll('.menu-section')) if (s.getBoundingClientRect().top - offset <= 0) current = s.id.slice(4);
      if (!current) current = document.querySelector('.menu-section')?.id.slice(4);
      for (const b of document.querySelectorAll('#chips button')) {
        const on = b.dataset.cat === current;
        if (on && !b.classList.contains('on')) b.scrollIntoView({ block: 'nearest', inline: 'center' });
        b.classList.toggle('on', on);
      }
    }, 60);
  }

  // ---------- dish sheet ----------
  function openDish(id) {
    const d = state.dishes.get(id);
    if (!d) return;
    state.sheetDish = d;
    state.sheetQty = 1;
    $('dishPhoto').replaceChildren(...(d.photo ? [h('img', { src: d.photo, alt: d.name })] : []));
    $('dishName').textContent = d.name;
    $('dishMeta').replaceChildren(vmark(d.isVeg), h('span', {}, d.isVeg ? 'Vegetarian' : 'Non-vegetarian'),
      chillies(d.spice), h('span', {}, `About ${d.prepMinutes} min to prepare`));
    $('dishDesc').textContent = d.description;
    $('dishIngredients').replaceChildren(...d.ingredients.map(i => h('span', {}, i)));
    const legend = $('dishOptions').querySelector('legend');
    $('dishOptions').replaceChildren(legend, ...d.options.map((o, i) => h('label', { class: 'option' },
      h('span', {}, h('input', { type: 'radio', name: 'opt', value: o.id, checked: i === 0 }), o.label),
      h('b', { class: 'num' }, rupees(o.price)))));
    $('dishOptions').hidden = d.options.length === 1;
    $('dishNote').value = '';
    $('speakDish').hidden = !('speechSynthesis' in window);
    updateSheetButton();
    $('dishAdd').disabled = !d.available;
    $('dishSheet').showModal();
  }

  function selectedOption() {
    const d = state.sheetDish;
    const v = Number($('dishOptions').querySelector('input:checked')?.value);
    return d.options.find(o => o.id === v) || d.options[0];
  }

  function updateSheetButton() {
    const d = state.sheetDish;
    $('qty').textContent = state.sheetQty;
    $('dishAdd').textContent = d.available ? `Add · ${rupees(selectedOption().price * state.sheetQty)}` : 'Sold out';
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const v = voices.find(x => x.lang === 'en-IN') || voices.find(x => x.lang.startsWith('en'));
    if (v) u.voice = v;
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }

  function dishSpeech(d) {
    const sizes = d.options.length > 1 ? ` Available as ${d.options.map(o => `${o.label} for ${o.price} rupees`).join(', ')}.` : ` Price ${d.options[0].price} rupees.`;
    return `${d.name}. ${d.isVeg ? 'Vegetarian' : 'Non-vegetarian'}. ${d.description} Made with ${d.ingredients.join(', ')}. Takes about ${d.prepMinutes} minutes.${sizes}`;
  }

  // ---------- cart ----------
  function saveCart() {
    if (state.table) store.set(`rr_cart_${state.table.code}`, state.cart);
    renderCartBar();
  }

  function addToCart(d, o, qty, note) {
    const existing = state.cart.find(l => l.optionId === o.id && l.note === note);
    if (existing) existing.qty = Math.min(50, existing.qty + qty);
    else state.cart.push({ optionId: o.id, dishId: d.id, name: d.name, option: o.label, price: o.price, qty, note, isVeg: d.isVeg });
    saveCart();
    renderMenu();
    toast(`${qty} × ${d.name}${o.label !== 'Regular' ? ` (${o.label})` : ''} added`);
  }

  // Drop lines whose dish is gone and refresh prices from the current menu.
  function pruneCart() {
    const before = state.cart.length;
    state.cart = state.cart.filter(l => {
      const d = state.dishes.get(l.dishId);
      const o = d?.options.find(x => x.id === l.optionId);
      if (!o) return false;
      l.price = o.price;
      l.name = d.name;
      return true;
    });
    if (state.cart.length !== before) toast('Some items in your order are no longer on the menu and were removed.');
    saveCart();
  }

  const cartCount = () => state.cart.reduce((n, l) => n + l.qty, 0);
  const cartTotal = () => state.cart.reduce((n, l) => n + l.qty * l.price, 0);

  function renderCartBar() {
    const n = cartCount();
    const show = n > 0 && state.table && currentView() !== 'cart' && currentView() !== 'pick';
    $('cartBar').hidden = !show;
    document.body.classList.toggle('has-cart', Boolean(show));
    $('cartSummary').textContent = `${n} item${n === 1 ? '' : 's'} · ${rupees(cartTotal())}`;
  }

  function renderCart() {
    const body = $('cartBody');
    if (!state.cart.length) {
      body.replaceChildren(h('p', { class: 'muted' }, 'Your order is empty.'), h('a', { class: 'btn', href: '#menu' }, 'Browse the menu'));
      return;
    }
    const blocked = state.visit?.status === 'bill_requested';
    const noteInput = h('textarea', { class: 'input', id: 'orderNote', maxlength: '140', placeholder: 'Anything the kitchen should know? (optional)' });
    const placeBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: blocked }, `Place order · ${rupees(cartTotal())}`);
    placeBtn.addEventListener('click', () => placeOrder(placeBtn, noteInput.value));
    body.replaceChildren(
      h('div', {}, state.cart.map((l, i) => h('div', { class: 'line' },
        h('div', { class: 'name' }, vmark(l.isVeg), h('div', {}, h('div', {}, l.name),
          l.option !== 'Regular' ? h('div', { class: 'opt' }, l.option) : null,
          l.note ? h('div', { class: 'note' }, l.note) : null)),
        h('div', { class: 'amt' }, rupees(l.price * l.qty)),
        h('div', { class: 'controls' },
          h('div', { class: 'stepper' },
            h('button', { type: 'button', 'aria-label': 'Fewer', onclick: () => changeQty(i, -1) }, '−'),
            h('span', { class: 'num' }, l.qty),
            h('button', { type: 'button', 'aria-label': 'More', onclick: () => changeQty(i, 1) }, '+')),
          h('span', { class: 'muted small' }, `${rupees(l.price)} each`))))),
      h('label', { class: 'field' }, h('span', {}, 'Note for the kitchen'), noteInput),
      h('div', { class: 'total-row' }, h('span', {}, 'Total'), h('span', {}, rupees(cartTotal()))),
      blocked ? h('p', { class: 'notice' }, 'Your bill has been requested, so new orders are paused. Please ask our staff if you want to order more.') : null,
      placeBtn,
      h('a', { class: 'btn btn-ghost btn-block', href: '#menu' }, 'Add more dishes'));
  }

  function changeQty(i, delta) {
    const l = state.cart[i];
    l.qty += delta;
    if (l.qty <= 0) state.cart.splice(i, 1);
    if (l.qty > 50) l.qty = 50;
    saveCart();
    renderCart();
  }

  async function placeOrder(btn, note) {
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await api(`/api/t/${state.table.code}/orders`, {
        method: 'POST',
        body: { items: state.cart.map(l => ({ optionId: l.optionId, qty: l.qty, note: l.note })), note },
      });
      state.cart = [];
      saveCart();
      toast('Order sent to the kitchen');
      location.hash = '#orders';
      refreshVisit();
    } catch (e) {
      toast(e.message, 'error');
      if (e.status === 409 || e.status === 400) await loadMenu();
      renderCart();
    }
  }

  // ---------- orders ----------
  async function refreshVisit() {
    if (!state.table) return;
    try {
      const view = await api(`/api/t/${state.table.code}/visit`);
      const wasRequested = state.hadBillRequest;
      state.visit = view.visit;
      if (view.visit?.status === 'bill_requested') state.hadBillRequest = true;
      if (!view.visit && wasRequested) {
        const last = store.get(`rr_bill_${state.table.code}`);
        if (last) store.set(`rr_bill_${state.table.code}`, { ...last, paid: true });
        state.hadBillRequest = false;
      }
      renderOrdersBadge();
      if (currentView() === 'orders') renderOrders();
      if (currentView() === 'bill') renderBill();
      if (currentView() === 'cart') renderCart();
    } catch (e) {
      if (e.status === 404) { store.remove('rr_table'); showPicker(); }
    }
  }

  function renderOrdersBadge() {
    const active = (state.visit?.orders || []).filter(o => !['served', 'cancelled'].includes(o.status)).length;
    $('ordersBadge').hidden = active === 0;
    $('ordersBadge').textContent = active;
  }

  function stepBar(status) {
    const idx = STEPS.indexOf(status);
    return h('div', { class: 'steps', 'aria-label': `Status: ${STATUS_TEXT[status]}` },
      STEPS.map((s, i) => h('div', { class: i <= idx ? 'done' : '' }, STATUS_TEXT[s])));
  }

  function renderOrders() {
    const body = $('ordersBody');
    const v = state.visit;
    if (!v) {
      const last = store.get(`rr_bill_${state.table.code}`);
      const showLast = last && Date.now() - last.savedAt < BILL_KEEP_MS;
      body.replaceChildren(
        h('p', { class: 'muted' }, 'You have no orders at this table yet.'),
        h('a', { class: 'btn btn-primary', href: '#menu' }, 'Browse the menu'),
        showLast ? h('a', { class: 'btn btn-ghost', href: '#bill' }, 'See your last bill') : null);
      return;
    }
    const cards = v.orders.slice().reverse().map(o => h('article', { class: 'order-card' },
      h('div', { class: 'head' },
        h('b', {}, `Order placed at ${time(o.createdAt)}`),
        h('span', { class: `pill ${o.status}` }, STATUS_TEXT[o.status])),
      h('ul', {}, o.items.map(i => h('li', {},
        h('span', {}, `${i.qty} × ${i.name}${i.option !== 'Regular' ? ` (${i.option})` : ''}`, i.note ? h('span', { class: 'note' }, ` · ${i.note}`) : null),
        h('span', { class: 'num' }, rupees(i.qty * i.price))))),
      o.note ? h('div', { class: 'note' }, `Note: ${o.note}`) : null,
      o.status === 'cancelled' ? h('div', { class: 'eta' }, 'This order was cancelled by the restaurant and is not on your bill.') : stepBar(o.status),
      ['new', 'preparing'].includes(o.status) ? h('div', { class: 'eta' }, `Expected ready by about ${time(o.etaAt)}`) : null));

    let billArea;
    if (v.status === 'bill_requested') {
      billArea = h('div', { class: 'notice ok' }, 'Bill requested. Our staff will come to your table. ', h('a', { href: '#bill' }, 'View bill'));
    } else {
      const btn = h('button', { class: 'btn btn-dark btn-block', type: 'button', disabled: !v.canRequestBill }, 'Ask for bill');
      btn.addEventListener('click', () => requestBill(btn));
      billArea = h('div', { class: 'page', style: 'padding:0;gap:8px' }, btn,
        v.canRequestBill ? null : h('p', { class: 'muted small' }, 'You can ask for the bill once all your food has been served.'));
    }
    body.replaceChildren(
      h('div', { class: 'total-row' }, h('span', {}, 'Total so far'), h('span', {}, rupees(v.total))),
      ...cards,
      billArea,
      v.status === 'open' ? h('a', { class: 'btn btn-ghost btn-block', href: '#menu' }, 'Order more') : null);
  }

  async function requestBill(btn) {
    btn.disabled = true;
    try {
      const bill = await api(`/api/t/${state.table.code}/bill-request`, { method: 'POST' });
      store.set(`rr_bill_${state.table.code}`, { bill, savedAt: Date.now(), paid: false });
      state.hadBillRequest = true;
      location.hash = '#bill';
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false;
    }
  }

  // ---------- bill ----------
  async function renderBill() {
    const body = $('billBody');
    const code = state.table.code;
    if (state.visit?.status === 'bill_requested') {
      try {
        const bill = await api(`/api/t/${code}/bill`);
        store.set(`rr_bill_${code}`, { bill, savedAt: Date.now(), paid: false });
        body.replaceChildren(h('p', { class: 'notice ok' }, 'Bill requested. Our staff will come to your table to collect payment.'), receipt(bill));
        return;
      } catch { /* fall through to saved copy */ }
    }
    const last = store.get(`rr_bill_${code}`);
    if (last && Date.now() - last.savedAt < BILL_KEEP_MS) {
      body.replaceChildren(
        last.paid ? h('p', { class: 'notice ok' }, 'Paid. Thank you for dining with us!') : null,
        receipt(last.bill));
      return;
    }
    body.replaceChildren(h('p', { class: 'muted' }, 'No bill yet. Ask for the bill from My orders once your food is served.'),
      h('a', { class: 'btn', href: '#orders' }, 'Go to My orders'));
  }

  // ---------- assistant ----------
  function renderAskButton() {
    $('askBtn').hidden = !(state.menu?.aiEnabled && !state.aiUnavailable && state.table && currentView() !== 'pick');
  }

  function addMsg(role, text, dishIds = []) {
    const actions = [];
    if (role === 'bot') {
      for (const id of dishIds) {
        const d = state.dishes.get(id);
        if (d) actions.push(h('button', { type: 'button', onclick: () => { $('chatSheet').close(); openDish(id); } }, `+ ${d.name}`));
      }
      if ('speechSynthesis' in window) actions.push(h('button', { type: 'button', class: 'say', onclick: () => speak(text) }, '🔊 Listen'));
    }
    const el = h('div', { class: `msg ${role}` }, text, actions.length ? h('div', { class: 'msg-actions' }, actions) : null);
    $('chatLog').append(el);
    el.scrollIntoView({ block: 'end' });
  }

  async function sendQuestion(text) {
    const q = text.trim();
    if (!q) return;
    $('chatInput').value = '';
    addMsg('me', q);
    state.chat.push({ role: 'user', content: q });
    const thinking = h('div', { class: 'msg bot muted' }, 'Thinking…');
    $('chatLog').append(thinking);
    try {
      const r = await api(`/api/t/${state.table.code}/ask`, { method: 'POST', body: { messages: state.chat.slice(-10) } });
      thinking.remove();
      state.chat.push({ role: 'assistant', content: r.answer });
      addMsg('bot', r.answer, r.dishIds);
    } catch (e) {
      thinking.remove();
      state.chat.pop();
      if (e.status === 503) {
        addMsg('bot', 'The menu assistant is not available right now. Please ask our staff.');
        state.aiUnavailable = true;
        renderAskButton();
      } else {
        addMsg('bot', e.message);
      }
    }
  }

  function setupMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!window.isSecureContext || !SR) return;
    const mic = $('micBtn');
    mic.hidden = false;
    let rec = null;
    mic.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = navigator.language || 'en-IN';
      rec.interimResults = false;
      rec.onresult = (ev) => sendQuestion(ev.results[0][0].transcript);
      rec.onend = () => { rec = null; mic.classList.remove('listening'); };
      rec.onerror = () => toast('Could not hear that. Please try again or type your question.', 'error');
      mic.classList.add('listening');
      rec.start();
    });
  }

  // ---------- routing ----------
  const VIEWS = ['pick', 'menu', 'cart', 'orders', 'bill'];
  function currentView() { return VIEWS.find(v => !$(`view-${v}`).hidden) || null; }

  function showView(name) {
    for (const v of VIEWS) $(`view-${v}`).hidden = v !== name;
    renderCartBar();
    renderAskButton();
  }

  function route() {
    if (!state.table) return;
    const name = (location.hash || '#menu').slice(1);
    const view = ['menu', 'cart', 'orders', 'bill'].includes(name) ? name : 'menu';
    showView(view);
    if (view === 'cart') renderCart();
    if (view === 'orders') renderOrders();
    if (view === 'bill') renderBill();
    if (view !== 'menu') window.scrollTo(0, 0);
  }

  // ---------- wire up ----------
  function wire() {
    window.addEventListener('hashchange', route);
    window.addEventListener('scroll', highlightChip, { passive: true });
    $('search').addEventListener('input', renderMenu);
    $('vegOnly').addEventListener('change', renderMenu);
    $('tablePill').addEventListener('click', () => {
      if (cartCount() > 0 || state.visit) toast('To change table, please ask our staff.');
      else showPicker();
    });
    for (const dlg of document.querySelectorAll('dialog')) {
      dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.hasAttribute('data-close')) dlg.close(); });
    }
    $('dishSheet').addEventListener('close', () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); });
    $('dishOptions').addEventListener('change', updateSheetButton);
    $('qtyMinus').addEventListener('click', () => { state.sheetQty = Math.max(1, state.sheetQty - 1); updateSheetButton(); });
    $('qtyPlus').addEventListener('click', () => { state.sheetQty = Math.min(50, state.sheetQty + 1); updateSheetButton(); });
    $('speakDish').addEventListener('click', () => speak(dishSpeech(state.sheetDish)));
    $('dishForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const d = state.sheetDish;
      if (!d.available) return;
      addToCart(d, selectedOption(), state.sheetQty, $('dishNote').value.trim().slice(0, 140));
      $('dishSheet').close();
    });
    $('askBtn').addEventListener('click', () => { $('chatSheet').showModal(); $('chatInput').focus(); });
    $('chatForm').addEventListener('submit', (e) => { e.preventDefault(); sendQuestion($('chatInput').value); });
    setupMic();
  }

  async function start() {
    wire();
    loadMenu();
    const table = await resolveTable();
    if (table) setTable(table);
    else showPicker();
  }

  start();
})();
