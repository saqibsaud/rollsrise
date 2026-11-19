const crypto = require('node:crypto');
const { tx } = require('../db');
const { MENU } = require('./menu-data');
const { DEFAULT_SETTINGS, setSettings, hashSecret } = require('../settings');

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

function randomCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (const b of bytes) out += BASE32[b % 32];
  return out;
}

function seedIfEmpty(db) {
  if (db.prepare('SELECT COUNT(*) n FROM categories').get().n > 0) return false;
  tx(db, () => {
    const insCat = db.prepare('INSERT INTO categories(name, sort) VALUES (?, ?)');
    const insDish = db.prepare(`INSERT INTO dishes(category_id, name, is_veg, spice, description, ingredients, prep_minutes, sort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insOpt = db.prepare('INSERT INTO dish_options(dish_id, label, price, sort) VALUES (?, ?, ?, ?)');
    MENU.forEach((cat, ci) => {
      const catId = insCat.run(cat.category, ci).lastInsertRowid;
      cat.dishes.forEach((dish, di) => {
        const dishId = insDish.run(catId, dish.name, dish.isVeg ? 1 : 0, dish.spice, dish.description,
          dish.ingredients.join(', '), dish.prepMinutes, di).lastInsertRowid;
        dish.options.forEach((o, oi) => insOpt.run(dishId, o.label, o.price, oi));
      });
    });
    const insTable = db.prepare('INSERT INTO tables(number, code) VALUES (?, ?)');
    for (let n = 1; n <= 6; n++) insTable.run(n, randomCode());
    setSettings(db, { ...DEFAULT_SETTINGS, kitchen_pin_hash: hashSecret('1234') });
  });
  return true;
}

module.exports = { seedIfEmpty, randomCode };
