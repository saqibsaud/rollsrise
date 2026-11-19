const QRCode = require('qrcode');
const { getSettings } = require('./settings');
const { visitById } = require('./orders');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const enc = (s) => encodeURIComponent(s).replace(/%40/g, '@');

async function computeBill(db, visitId) {
  const v = visitById(db, visitId);
  const s = getSettings(db);
  const table = db.prepare('SELECT number FROM tables WHERE id=?').get(v.table_id);
  const items = db.prepare(`SELECT i.dish_name, i.option_label, i.price, i.qty FROM order_items i
    JOIN orders o ON o.id=i.order_id WHERE o.visit_id=? AND o.status != 'cancelled' ORDER BY o.id, i.id`).all(v.id);

  const lines = [];
  const byKey = new Map();
  for (const i of items) {
    const key = `${i.dish_name}\u0000${i.option_label}\u0000${i.price}`;
    let line = byKey.get(key);
    if (!line) {
      line = { name: i.dish_name, option: i.option_label, qty: 0, rate: i.price, amount: 0 };
      byKey.set(key, line);
      lines.push(line);
    }
    line.qty += i.qty;
    line.amount += i.qty * i.price;
  }

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const taxes = [];
  const g = Number(s.gst_percent) || 0;
  if (g > 0) {
    const half = g / 2;
    const amount = round2((subtotal * half) / 100);
    taxes.push({ label: `CGST @ ${half}%`, amount }, { label: `SGST @ ${half}%`, amount });
  }
  const taxTotal = taxes.reduce((sum, t) => sum + t.amount, 0);
  const total = Math.round(subtotal + taxTotal);
  const roundOff = round2(total - subtotal - taxTotal);

  let upi = null;
  if (s.upi_id) {
    const link = `upi://pay?pa=${enc(s.upi_id)}&pn=${enc(s.restaurant_name)}&am=${total}&cu=INR&tn=${enc(`Bill ${v.bill_no ?? ''}`.trim())}`;
    upi = { link, qrSvg: await QRCode.toString(link, { type: 'svg', margin: 1 }) };
  }

  return {
    billNo: v.bill_no,
    tableNumber: table.number,
    status: v.status,
    openedAt: v.opened_at,
    requestedAt: v.bill_requested_at,
    restaurant: { name: s.restaurant_name, tagline: s.tagline, address: s.address, phone: s.phone, gstin: s.gstin },
    lines,
    subtotal,
    taxes,
    roundOff,
    total,
    footer: s.bill_footer,
    upi,
  };
}

module.exports = { computeBill, round2 };
