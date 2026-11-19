// Admin / counter page: live tables & bills, menu editor, table QR codes, settings, AI question log.
(function () {
  const { api, rupees, dateTime, h, live, toast, vmark, receipt } = window.RR;
  const $ = (id) => document.getElementById(id);
  const billSound = new Audio('/sounds/bill.wav');

  const state = { tab: 'tables', categories: [], dishes: [], editing: null, filter: { q: '', cat: '' }, billCount: null, confirm: null, es: null };

  // ---------- auth ----------
  async function boot() {
    try {
      const { needed } = await api('/api/admin/setup-needed');
      if (needed) return show('setup');
      await api('/api/admin/settings');
      startApp();
    } catch (e) {
      if (e.status === 401) show('login');
      else toast(e.message, 'error');
    }
  }

  function show(which) {
    $('setup').hidden = which !== 'setup';
    $('login').hidden = which !== 'login';
    $('app').hidden = which !== 'app';
  }

  $('setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('setupPw').value !== $('setupPw2').value) { $('setupErr').textContent = 'The two passwords are different.'; return; }
    try {
      await api('/api/admin/setup', { method: 'POST', body: { password: $('setupPw').value } });
      startApp();
    } catch (err) { $('setupErr').textContent = err.message; }
  });

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginErr').textContent = '';
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: $('loginPw').value } });
      $('loginPw').value = '';
      startApp();
    } catch (err) { $('loginErr').textContent = err.message; }
  });

  function startApp() {
    show('app');
    const saved = (location.hash || '').slice(1);
    if (['tables', 'menu', 'qr', 'settings', 'ai'].includes(saved)) state.tab = saved;
    if (state.es) state.es.close();
    state.es = live('admin', refresh);
    refresh();
  }

  function handleAuth(e) {
    if (e.status === 401) { if (state.es) state.es.close(); show('login'); return true; }
    return false;
  }

  // ---------- tabs ----------
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    state.tab = b.dataset.tab;
    state.editing = null;
    history.replaceState(null, '', `#${state.tab}`);
    refresh();
  });

  async function refresh() {
    for (const b of $('tabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === state.tab);
    try {
      await Promise.all([renderToday(), watchBills()]);
      if (state.tab === 'tables') await renderTables();
      if (state.tab === 'menu' && !state.editing) await renderMenu();
      if (state.tab === 'qr') await renderQr();
      if (state.tab === 'settings' && !$('main').querySelector('#settingsForm')) await renderSettings();
      if (state.tab === 'ai') await renderAi();
    } catch (e) {
      if (!handleAuth(e)) toast(e.message, 'error');
    }
  }

  async function renderToday() {
    const t = await api('/api/admin/today');
    $('today').replaceChildren(
      h('span', {}, 'Today: ', h('b', {}, t.orders), ' orders · ', h('b', {}, t.billsClosed), ' bills paid · ', h('b', {}, rupees(t.totalBilled))),
      h('button', { type: 'button', onclick: logout }, 'Log out'));
  }

  async function logout() {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    if (state.es) state.es.close();
    show('login');
  }

  async function watchBills() {
    const tables = await api('/api/admin/tables/live');
    const count = tables.filter(t => t.state === 'bill_requested').length;
    if (state.billCount !== null && count > state.billCount) {
      billSound.play().catch(() => {});
      toast('A table has asked for the bill');
    }
    state.billCount = count;
    $('billBadge').hidden = count === 0;
    $('billBadge').textContent = count;
    state.liveTables = tables;
  }

  // ---------- tables & bills ----------
  async function renderTables() {
    const tables = state.liveTables || await api('/api/admin/tables/live');
    const label = { free: 'Free', ordering: 'Ordering', bill_requested: 'Bill requested' };
    const cards = tables.map(t => {
      const actions = [];
      if (t.visitId) actions.push(h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openBill(t.visitId) }, t.state === 'bill_requested' ? 'View bill' : 'View orders'));
      if (t.state === 'bill_requested') {
        if (state.confirm === t.visitId) {
          actions.push(h('div', { class: 'confirm-box' }, `Payment of ${rupees(t.total)} received for Table ${t.number}?`,
            h('div', {},
              h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => markPaid(t.visitId) }, 'Yes, mark paid'),
              h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { state.confirm = null; renderTables(); } }, 'Not yet'))));
        } else {
          actions.push(h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { state.confirm = t.visitId; renderTables(); } }, 'Mark paid & free table'));
        }
        actions.push(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => reopen(t.visitId) }, 'Reopen for more orders'));
      }
      return h('article', { class: `tcard ${t.state}` },
        h('div', { class: 'head' }, h('span', { class: 'no' }, `Table ${t.number}`), h('span', { class: 'state' }, label[t.state])),
        t.visitId ? h('div', { class: 'amount' }, rupees(t.total)) : h('div', { class: 'muted' }, 'No guests ordering'),
        t.state === 'ordering' ? h('div', { class: 'muted' }, t.openOrders ? `${t.openOrders} order${t.openOrders > 1 ? 's' : ''} in the kitchen` : 'All food served') : null,
        t.billNo ? h('div', { class: 'muted' }, `Bill ${t.billNo}`) : null,
        actions.length ? h('div', { class: 'actions' }, actions) : null);
    });
    $('main').replaceChildren(h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Tables'), h('p', { class: 'hint' }, 'Tables asking for the bill turn red and play a sound. After collecting payment, mark the table paid to free it for the next guests.')),
      h('div', { class: 'tables' }, cards)));
  }

  async function markPaid(visitId) {
    state.confirm = null;
    try { await api(`/api/admin/visits/${visitId}/paid`, { method: 'POST' }); toast('Table is free'); } catch (e) { toast(e.message, 'error'); }
    refresh();
  }

  async function reopen(visitId) {
    try { await api(`/api/admin/visits/${visitId}/reopen`, { method: 'POST' }); toast('Table reopened. Guests can order more.'); } catch (e) { toast(e.message, 'error'); }
    refresh();
  }

  async function openBill(visitId) {
    try {
      const bill = await api(`/api/admin/visits/${visitId}/bill`);
      const note = bill.status === 'open' ? h('p', { class: 'notice', style: 'margin:0' }, 'Running total. The guests have not asked for the bill yet.') : null;
      $('billArea').replaceChildren(...[note, receipt(bill)].filter(Boolean));
      $('billDialog').showModal();
    } catch (e) { toast(e.message, 'error'); }
  }

  $('printBill').addEventListener('click', () => window.print());
  for (const dlg of document.querySelectorAll('dialog')) {
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.hasAttribute('data-close')) dlg.close(); });
  }

  // ---------- menu ----------
  async function loadMenuData() {
    [state.categories, state.dishes] = await Promise.all([api('/api/admin/categories'), api('/api/admin/dishes')]);
  }

  async function renderMenu() {
    await loadMenuData();
    const q = state.filter.q.toLowerCase();
    const shown = state.dishes.filter(d => (!state.filter.cat || String(d.categoryId) === state.filter.cat) && (!q || d.name.toLowerCase().includes(q)));
    const rows = [];
    let lastCat = null;
    for (const d of shown) {
      if (d.categoryId !== lastCat) { rows.push(h('tr', { class: 'cat-row' }, h('td', { colspan: '5' }, d.categoryName))); lastCat = d.categoryId; }
      const toggle = h('input', { type: 'checkbox', checked: d.available, 'aria-label': `${d.name} available` });
      toggle.addEventListener('change', () => setAvailable(d, toggle.checked));
      rows.push(h('tr', { class: d.available ? '' : 'off' },
        h('td', {}, h('span', { class: 'name' }, vmark(d.isVeg), d.name)),
        h('td', { class: 'prices' }, d.options.map(o => `${o.label === 'Regular' ? '' : `${o.label} `}${rupees(o.price)}`).join(' · ')),
        h('td', { class: 'muted' }, `${d.prepMinutes} min`),
        h('td', {}, h('label', { class: 'toggle' }, toggle, d.available ? 'Available' : 'Sold out')),
        h('td', {}, h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => editDish(d) }, 'Edit'),
          state.confirm === `dish-${d.id}`
            ? h('span', { class: 'row-actions' },
              h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => deleteDish(d) }, 'Delete'),
              h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { state.confirm = null; renderMenu(); } }, 'Keep'))
            : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { state.confirm = `dish-${d.id}`; renderMenu(); } }, 'Remove')))));
    }
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search dishes', value: state.filter.q, id: 'dishSearch' });
    search.addEventListener('input', () => { state.filter.q = search.value; renderMenu().then(() => { const s = $('dishSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }); });
    const catSel = h('select', { class: 'input', id: 'catFilter' }, h('option', { value: '' }, 'All categories'),
      state.categories.map(c => h('option', { value: c.id, selected: String(c.id) === state.filter.cat }, `${c.name} (${c.dishCount})`)));
    catSel.addEventListener('change', () => { state.filter.cat = catSel.value; renderMenu(); });

    $('main').replaceChildren(h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Menu'),
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => editDish(null) }, '+ Add dish'),
          h('button', { class: 'btn', type: 'button', onclick: editCategories }, 'Categories'))),
      h('p', { class: 'hint' }, 'Untick a dish to mark it sold out for today. Customers see the change straight away.'),
      h('div', { class: 'filters' }, search, catSel),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Dish'), h('th', {}, 'Price'), h('th', {}, 'Prep'), h('th', {}, 'Status'), h('th', {}, ''))),
        h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: '5', class: 'muted' }, 'No dishes match.')))))));
  }

  async function setAvailable(d, available) {
    try { await api(`/api/admin/dishes/${d.id}/available`, { method: 'POST', body: { available } }); toast(available ? `${d.name} is available` : `${d.name} marked sold out`); } catch (e) { toast(e.message, 'error'); }
    renderMenu();
  }

  async function deleteDish(d) {
    state.confirm = null;
    try { await api(`/api/admin/dishes/${d.id}`, { method: 'DELETE' }); toast(`${d.name} removed from the menu`); } catch (e) { toast(e.message, 'error'); }
    renderMenu();
  }

  function optionRow(o = { label: '', price: '' }) {
    const row = h('div', { class: 'opt-row' },
      h('input', { class: 'input', placeholder: 'Size, e.g. Regular, Dry, Half', value: o.label, maxlength: '20', 'aria-label': 'Size name' }),
      h('input', { class: 'input', type: 'number', min: '0', step: '1', placeholder: 'Price ₹', value: o.price, 'aria-label': 'Price in rupees' }),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Remove size', onclick: () => row.remove() }, '×'));
    return row;
  }

  async function editDish(d) {
    if (!state.categories.length) await loadMenuData();
    state.editing = d ? d.id : 'new';
    const v = d || { name: '', categoryId: state.categories[0]?.id, isVeg: true, spice: 0, description: '', ingredients: '', prepMinutes: 15, available: true, options: [{ label: 'Regular', price: '' }] };
    const opts = h('div', { style: 'display:grid;gap:8px' }, v.options.map(optionRow));
    const err = h('p', { class: 'err', role: 'alert' });
    const f = {
      name: h('input', { class: 'input', value: v.name, maxlength: '80', required: true }),
      cat: h('select', { class: 'input' }, state.categories.map(c => h('option', { value: c.id, selected: c.id === v.categoryId }, c.name))),
      desc: h('textarea', { class: 'input', maxlength: '600' }),
      ingr: h('input', { class: 'input', value: v.ingredients, maxlength: '600', placeholder: 'Comma separated, e.g. Paneer, onion, capsicum' }),
      prep: h('input', { class: 'input', type: 'number', min: '1', max: '120', value: v.prepMinutes }),
      spice: h('select', { class: 'input' }, ['Not spicy', 'Mild', 'Medium', 'Hot'].map((t, i) => h('option', { value: i, selected: i === v.spice }, `${i} – ${t}`))),
      available: h('input', { type: 'checkbox', checked: v.available }),
      photo: h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'input' }),
    };
    f.desc.value = v.description;
    const vegRadio = h('div', { class: 'radio-row' },
      h('label', {}, h('input', { type: 'radio', name: 'veg', value: '1', checked: v.isVeg }), vmark(true), 'Vegetarian'),
      h('label', {}, h('input', { type: 'radio', name: 'veg', value: '0', checked: !v.isVeg }), vmark(false), 'Non-vegetarian'));

    const form = h('form', { class: 'form', id: 'dishForm' },
      h('label', { class: 'field' }, h('span', {}, 'Dish name'), f.name),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', {}, 'Category'), f.cat),
        h('div', { class: 'field' }, h('span', {}, 'Type'), vegRadio)),
      h('label', { class: 'field' }, h('span', {}, 'Description (shown to customers and read aloud)'), f.desc),
      h('label', { class: 'field' }, h('span', {}, 'Ingredients'), f.ingr),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', {}, 'Time to prepare (minutes)'), f.prep),
        h('label', { class: 'field' }, h('span', {}, 'Spice level'), f.spice)),
      h('fieldset', { class: 'box' }, h('legend', {}, 'Sizes and prices'),
        h('p', { class: 'hint' }, 'One row for a single price. Add rows for choices like Dry / Gravy or Full / Half / Qtr.'),
        opts,
        h('button', { class: 'btn btn-sm', type: 'button', style: 'justify-self:start', onclick: () => opts.append(optionRow()) }, '+ Add size')),
      h('div', { class: 'field' }, h('span', {}, 'Photo (optional, JPG/PNG/WebP up to 3 MB)'),
        d?.photo ? h('img', { src: d.photo, alt: '', class: 'photo-prev' }) : null, f.photo),
      h('label', { class: 'toggle' }, f.available, 'Available to order'),
      err,
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn-primary', type: 'submit' }, d ? 'Save changes' : 'Add dish'),
        h('button', { class: 'btn', type: 'button', onclick: () => { state.editing = null; renderMenu(); } }, 'Cancel')));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const options = [...opts.querySelectorAll('.opt-row')].map(r => {
        const [l, p] = r.querySelectorAll('input');
        return { label: l.value.trim(), price: p.value === '' ? NaN : Number(p.value) };
      });
      if (options.some(o => !Number.isInteger(o.price))) { err.textContent = 'Every size needs a price in whole rupees.'; return; }
      const body = {
        name: f.name.value, categoryId: Number(f.cat.value), isVeg: form.querySelector('input[name=veg]:checked').value === '1',
        spice: Number(f.spice.value), description: f.desc.value, ingredients: f.ingr.value, prepMinutes: Number(f.prep.value),
        available: f.available.checked, options,
      };
      try {
        const res = d ? await api(`/api/admin/dishes/${d.id}`, { method: 'PUT', body }) : await api('/api/admin/dishes', { method: 'POST', body });
        if (f.photo.files[0]) {
          const fd = new FormData();
          fd.append('photo', f.photo.files[0]);
          await api(`/api/admin/dishes/${res.id}/photo`, { method: 'POST', form: fd });
        }
        toast(d ? 'Dish saved' : 'Dish added to the menu');
        state.editing = null;
        renderMenu();
      } catch (ex) {
        if (!handleAuth(ex)) err.textContent = ex.message;
      }
    });

    $('main').replaceChildren(h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, d ? `Edit ${d.name}` : 'Add a dish')), form));
    window.scrollTo(0, 0);
    f.name.focus();
  }

  async function editCategories() {
    state.editing = 'categories';
    const cats = await api('/api/admin/categories');
    const rows = cats.map(c => {
      const name = h('input', { class: 'input', value: c.name, maxlength: '40', 'aria-label': 'Category name' });
      const sort = h('input', { class: 'input', type: 'number', value: c.sort, 'aria-label': 'Order', style: 'width:90px' });
      return h('div', { class: 'opt-row', style: 'grid-template-columns:minmax(0,1fr) 90px auto' }, name, sort,
        h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => {
          try { await api(`/api/admin/categories/${c.id}`, { method: 'PUT', body: { name: name.value, sort: Number(sort.value) } }); toast('Category saved'); } catch (e) { toast(e.message, 'error'); }
        } }, 'Save'));
    });
    const newName = h('input', { class: 'input', placeholder: 'New category, e.g. Desserts', maxlength: '40' });
    $('main').replaceChildren(h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Categories'),
        h('button', { class: 'btn', type: 'button', onclick: () => { state.editing = null; renderMenu(); } }, '← Back to menu')),
      h('p', { class: 'hint' }, 'Lower numbers show first on the menu. Empty categories are hidden from customers.'),
      h('div', { class: 'form' }, rows,
        h('div', { class: 'opt-row', style: 'grid-template-columns:minmax(0,1fr) auto' }, newName,
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: async () => {
            try { await api('/api/admin/categories', { method: 'POST', body: { name: newName.value } }); toast('Category added'); editCategories(); } catch (e) { toast(e.message, 'error'); }
          } }, 'Add')))));
  }

  // ---------- tables & QR ----------
  async function renderQr() {
    const codes = await api('/api/admin/tables/qr');
    const name = (await api('/api/admin/settings')).restaurant_name;
    const num = h('input', { class: 'input', type: 'number', min: '1', max: '999', placeholder: 'Table number', style: 'width:160px' });
    const cards = codes.map(c => h('div', { class: 'qr-card' },
      h('div', { class: 'r-name' }, name),
      h('div', { class: 't-no' }, `Table ${c.number}`),
      h('div', { class: 'qr', html: c.svg, role: 'img', 'aria-label': `QR code for table ${c.number}` }),
      h('div', { class: 'scan' }, 'Scan to order'),
      h('div', { class: 'url' }, c.url),
      state.confirm === `table-${c.number}`
        ? h('div', { class: 'confirm-box no-print' }, `Remove table ${c.number}?`, h('div', {},
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => removeTable(c.number) }, 'Remove'),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { state.confirm = null; renderQr(); } }, 'Keep')))
        : h('button', { class: 'btn btn-ghost btn-sm remove no-print', type: 'button', 'aria-label': `Remove table ${c.number}`, onclick: () => { state.confirm = `table-${c.number}`; renderQr(); } }, '×')));
    $('main').replaceChildren(h('section', { class: 'panel' },
      h('div', { class: 'panel-head no-print' }, h('h2', {}, 'Tables & QR codes'),
        h('button', { class: 'btn btn-dark', type: 'button', onclick: () => window.print() }, 'Print QR codes')),
      h('p', { class: 'hint no-print' }, 'Print this page and place each card on its table. Scanning the code opens the menu with the table already chosen. Check that the address under each code starts with the laptop\'s network address (like 192.168…), not "localhost". If the laptop\'s address changes, print the codes again.'),
      h('div', { class: 'form-actions no-print' }, num,
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          try { await api('/api/admin/tables', { method: 'POST', body: { number: Number(num.value) } }); toast(`Table ${num.value} added`); renderQr(); } catch (e) { toast(e.message, 'error'); }
        } }, 'Add table')),
      h('div', { class: 'qr-grid print-area' }, cards)));
  }

  async function removeTable(n) {
    state.confirm = null;
    try { await api(`/api/admin/tables/${n}`, { method: 'DELETE' }); toast(`Table ${n} removed`); } catch (e) { toast(e.message, 'error'); }
    renderQr();
  }

  // ---------- settings ----------
  async function renderSettings() {
    const s = await api('/api/admin/settings');
    const input = (key, label, attrs = {}) => h('label', { class: 'field' }, h('span', {}, label), h('input', { class: 'input', name: key, value: s[key] ?? '', ...attrs }));
    const aiOn = h('input', { type: 'checkbox', name: 'ai_enabled', checked: s.ai_enabled });
    const err = h('p', { class: 'err', role: 'alert' });
    const form = h('form', { class: 'form', id: 'settingsForm' },
      h('fieldset', { class: 'box' }, h('legend', {}, 'Restaurant (printed on bills)'),
        input('restaurant_name', 'Name', { maxlength: '80' }),
        input('tagline', 'Tagline', { maxlength: '80' }),
        input('address', 'Address', { maxlength: '200' }),
        input('phone', 'Phone', { maxlength: '30' }),
        h('label', { class: 'field' }, h('span', {}, 'Message at the bottom of the bill'), h('textarea', { class: 'input', name: 'bill_footer', maxlength: '300' }, s.bill_footer))),
      h('fieldset', { class: 'box' }, h('legend', {}, 'GST & payment'),
        h('p', { class: 'hint' }, 'Leave GST at 0 until you are ready. When set, bills show CGST and SGST (half each).'),
        h('div', { class: 'grid2' },
          input('gst_percent', 'GST %', { type: 'number', min: '0', max: '28', step: '0.5' }),
          input('gstin', 'GSTIN', { maxlength: '20' })),
        input('upi_id', 'UPI ID (shows a pay-by-UPI QR code on bills)', { maxlength: '60', placeholder: 'e.g. rollsrise@okaxis' })),
      h('fieldset', { class: 'box' }, h('legend', {}, 'Logins'),
        h('div', { class: 'grid2' },
          h('label', { class: 'field' }, h('span', {}, 'New kitchen PIN (4–8 digits)'), h('input', { class: 'input', name: 'kitchen_pin', inputmode: 'numeric', maxlength: '8', placeholder: 'Leave blank to keep', autocomplete: 'off' })),
          h('label', { class: 'field' }, h('span', {}, 'New admin password'), h('input', { class: 'input', name: 'admin_password', type: 'password', placeholder: 'Leave blank to keep', autocomplete: 'new-password' })))),
      h('fieldset', { class: 'box' }, h('legend', {}, 'AI menu assistant'),
        h('p', { class: 'hint' }, 'Lets customers ask questions about dishes. Needs an internet connection and an Anthropic API key (console.anthropic.com). Ordering keeps working without it.'),
        h('label', { class: 'toggle' }, aiOn, 'Turn on the menu assistant'),
        h('label', { class: 'field' }, h('span', {}, 'API key'), h('input', { class: 'input', name: 'ai_api_key', type: 'password', autocomplete: 'off', placeholder: s.hasApiKey ? 'Saved. Type a new key to replace it.' : 'Paste your API key' })),
        input('ai_model', 'Model', { maxlength: '60' })),
      err,
      h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save settings')));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const data = Object.fromEntries(new FormData(form).entries());
      const body = {};
      for (const k of ['restaurant_name', 'tagline', 'address', 'phone', 'bill_footer', 'gstin', 'upi_id', 'ai_model', 'ai_api_key']) body[k] = data[k] ?? '';
      body.gst_percent = Number(data.gst_percent || 0);
      body.ai_enabled = aiOn.checked;
      if (data.kitchen_pin) body.kitchen_pin = data.kitchen_pin;
      if (data.admin_password) body.admin_password = data.admin_password;
      try {
        await api('/api/admin/settings', { method: 'PUT', body });
        toast('Settings saved');
        $('main').replaceChildren();
        renderSettings();
      } catch (ex) {
        if (!handleAuth(ex)) err.textContent = ex.message;
      }
    });
    $('main').replaceChildren(h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Settings')), form));
  }

  // ---------- AI log ----------
  async function renderAi() {
    const log = await api('/api/admin/ai-log?limit=200');
    $('main').replaceChildren(h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Customer questions')),
      h('p', { class: 'hint' }, 'What customers asked the menu assistant. Repeated questions can show what to explain better on the menu.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Table'), h('th', {}, 'Question'), h('th', {}, 'Answer'))),
        h('tbody', {}, log.length ? log.map(r => h('tr', {},
          h('td', { class: 'muted', style: 'white-space:nowrap' }, dateTime(r.created_at)),
          h('td', {}, r.table_number),
          h('td', {}, r.question),
          h('td', {}, r.answer))) : h('tr', {}, h('td', { colspan: '4', class: 'muted' }, 'No questions yet.')))))));
  }

  boot();
})();
