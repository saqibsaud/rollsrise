const { tx } = require('./db');
const { HttpError } = require('./errors');
const { getSettings, setSettings } = require('./settings');

const NOTE_MAX = 140;
const MAX_LINES = 30;
const MAX_QTY = 50;
const FORWARD = { new: 'preparing', preparing: 'ready', ready: 'served' };

const now = () => new Date().toISOString();
const cleanNote = (n) => (typeof n === 'string' ? n.trim().slice(0, NOTE_MAX) : '');

function getTableByCode(db, code) {
  const t = db.prepare('SELECT id, number, code FROM tables WHERE code=? AND deleted=0').get(String(code));
  if (!t) throw new HttpError(404, 'Table not found');
  return { ...t };
}

function getActiveVisit(db, tableId) {
  const v = db.prepare("SELECT * FROM visits WHERE table_id=? AND status != 'closed'").get(tableId);
  return v ? { ...v } : null;
}

function itemsForOrder(db, orderId) {
  return db.prepare('SELECT dish_name, option_label, price, qty, note FROM order_items WHERE order_id=? ORDER BY id').all(orderId)
    .map(i => ({ name: i.dish_name, option: i.option_label, price: i.price, qty: i.qty, note: i.note }));
}

function toOrder(db, o) {
  return {
    id: o.id,
    visitId: o.visit_id,
    status: o.status,
    note: o.note,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    etaAt: o.eta_at,
    items: itemsForOrder(db, o.id),
  };
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LINES) {
    throw new HttpError(400, 'Your order is empty or too large');
  }
  for (const it of items) {
    if (!it || !Number.isInteger(it.qty) || it.qty < 1 || it.qty > MAX_QTY) {
      throw new HttpError(400, `Quantity must be a whole number from 1 to ${MAX_QTY}`);
    }
    if (!Number.isInteger(it.optionId)) throw new HttpError(400, 'Invalid item');
  }
}

function placeOrder(db, tableCode, body = {}) {
  const table = getTableByCode(db, tableCode);
  validateItems(body.items);
  return tx(db, () => {
    const lookup = db.prepare(`SELECT o.id option_id, o.label, o.price, d.id dish_id, d.name, d.available, d.deleted, d.prep_minutes
      FROM dish_options o JOIN dishes d ON d.id = o.dish_id WHERE o.id = ?`);
    const lines = body.items.map(it => {
      const row = lookup.get(it.optionId);
      if (!row || row.deleted) throw new HttpError(400, 'Invalid item');
      if (!row.available) throw new HttpError(409, `${row.name} is sold out`);
      return { ...row, qty: it.qty, note: cleanNote(it.note) };
    });

    let visit = getActiveVisit(db, table.id);
    if (visit && visit.status === 'bill_requested') throw new HttpError(409, 'Bill already requested. Please ask staff.');
    const ts = now();
    if (!visit) {
      const id = db.prepare("INSERT INTO visits(table_id, status, opened_at) VALUES (?, 'open', ?)").run(table.id, ts).lastInsertRowid;
      visit = { id: Number(id) };
    }
    const prep = Math.max(...lines.map(l => l.prep_minutes));
    const eta = new Date(Date.parse(ts) + prep * 60000).toISOString();
    const orderId = db.prepare(`INSERT INTO orders(visit_id, status, note, created_at, updated_at, eta_at)
      VALUES (?, 'new', ?, ?, ?, ?)`).run(visit.id, cleanNote(body.note), ts, ts, eta).lastInsertRowid;
    const insItem = db.prepare(`INSERT INTO order_items(order_id, dish_id, dish_name, option_label, price, qty, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const l of lines) insItem.run(orderId, l.dish_id, l.name, l.label, l.price, l.qty, l.note);
    return toOrder(db, db.prepare('SELECT * FROM orders WHERE id=?').get(orderId));
  });
}

function visitOrders(db, visitId) {
  return db.prepare('SELECT * FROM orders WHERE visit_id=? ORDER BY id').all(visitId).map(o => toOrder(db, o));
}

function canRequestBill(visit, orders) {
  const live = orders.filter(o => o.status !== 'cancelled');
  return visit.status === 'open' && live.length > 0 && live.every(o => o.status === 'served');
}

function orderTotal(orders) {
  return orders.filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.price * i.qty, 0), 0);
}

function getVisitView(db, tableCode) {
  const table = getTableByCode(db, tableCode);
  const v = getActiveVisit(db, table.id);
  if (!v) return { table: { number: table.number, code: table.code }, visit: null };
  const orders = visitOrders(db, v.id);
  return {
    table: { number: table.number, code: table.code },
    visit: {
      id: v.id,
      status: v.status,
      billNo: v.bill_no,
      orders,
      canRequestBill: canRequestBill(v, orders),
      total: orderTotal(orders),
    },
  };
}

function setOrderStatus(db, orderId, status) {
  return tx(db, () => {
    const o = db.prepare(`SELECT o.*, t.code table_code FROM orders o JOIN visits v ON v.id=o.visit_id
      JOIN tables t ON t.id=v.table_id WHERE o.id=?`).get(Number(orderId));
    if (!o) throw new HttpError(404, 'Order not found');
    const ok = status === 'cancelled' ? !['served', 'cancelled'].includes(o.status) : FORWARD[o.status] === status;
    if (!ok) throw new HttpError(409, `Cannot change order from ${o.status} to ${status}`);
    db.prepare('UPDATE orders SET status=?, updated_at=? WHERE id=?').run(status, now(), o.id);
    return { order: toOrder(db, db.prepare('SELECT * FROM orders WHERE id=?').get(o.id)), tableCode: o.table_code };
  });
}

function visitById(db, visitId) {
  const v = db.prepare('SELECT v.*, t.code table_code FROM visits v JOIN tables t ON t.id=v.table_id WHERE v.id=?').get(Number(visitId));
  if (!v) throw new HttpError(404, 'Visit not found');
  return { ...v };
}

function toVisit(v) {
  return { id: v.id, status: v.status, billNo: v.bill_no, tableCode: v.table_code };
}

function requestBill(db, tableCode) {
  const table = getTableByCode(db, tableCode);
  return tx(db, () => {
    const v = getActiveVisit(db, table.id);
    if (!v) throw new HttpError(409, 'Bill can be requested after all food is served');
    if (v.status === 'bill_requested') return toVisit(visitById(db, v.id));
    if (!canRequestBill(v, visitOrders(db, v.id))) throw new HttpError(409, 'Bill can be requested after all food is served');
    const billNo = getSettings(db).next_bill_no;
    setSettings(db, { next_bill_no: billNo + 1 });
    db.prepare("UPDATE visits SET status='bill_requested', bill_requested_at=?, bill_no=? WHERE id=?").run(now(), billNo, v.id);
    return toVisit(visitById(db, v.id));
  });
}

function closeVisit(db, visitId) {
  return tx(db, () => {
    const v = visitById(db, visitId);
    if (v.status === 'closed') return toVisit(v);
    if (v.status === 'open') {
      const live = db.prepare("SELECT COUNT(*) n FROM orders WHERE visit_id=? AND status != 'cancelled'").get(v.id).n;
      if (live > 0) throw new HttpError(409, 'This table has orders that are not billed yet');
    }
    db.prepare("UPDATE visits SET status='closed', closed_at=? WHERE id=?").run(now(), v.id);
    return toVisit(visitById(db, v.id));
  });
}

function reopenVisit(db, visitId) {
  return tx(db, () => {
    const v = visitById(db, visitId);
    if (v.status !== 'bill_requested') throw new HttpError(409, 'Only a table waiting for its bill can be reopened');
    db.prepare("UPDATE visits SET status='open' WHERE id=?").run(v.id);
    return toVisit(visitById(db, v.id));
  });
}

function listKitchenOrders(db) {
  return db.prepare(`SELECT o.*, t.number table_number FROM orders o JOIN visits v ON v.id=o.visit_id
    JOIN tables t ON t.id=v.table_id WHERE o.status IN ('new','preparing','ready') ORDER BY o.created_at, o.id`).all()
    .map(o => ({ ...toOrder(db, o), tableNumber: o.table_number }));
}

module.exports = {
  HttpError, getTableByCode, getActiveVisit, placeOrder, getVisitView, setOrderStatus,
  requestBill, closeVisit, reopenVisit, listKitchenOrders, visitById, orderTotal,
};
