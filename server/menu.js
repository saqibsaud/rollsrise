function splitIngredients(text) {
  return text.split(',').map(s => s.trim()).filter(Boolean);
}

function optionsByDish(db) {
  const map = new Map();
  for (const o of db.prepare('SELECT id, dish_id, label, price FROM dish_options ORDER BY sort, id').all()) {
    if (!map.has(o.dish_id)) map.set(o.dish_id, []);
    map.get(o.dish_id).push({ id: o.id, label: o.label, price: o.price });
  }
  return map;
}

function toPublicDish(d, options) {
  return {
    id: d.id,
    name: d.name,
    isVeg: d.is_veg === 1,
    spice: d.spice,
    description: d.description,
    ingredients: splitIngredients(d.ingredients),
    prepMinutes: d.prep_minutes,
    photo: d.photo || null,
    available: d.available === 1,
    options: options.get(d.id) || [],
  };
}

function getPublicMenu(db) {
  const options = optionsByDish(db);
  const dishes = db.prepare('SELECT * FROM dishes WHERE deleted=0 ORDER BY sort, id').all();
  const categories = db.prepare('SELECT id, name FROM categories ORDER BY sort, id').all().map(c => ({
    id: c.id,
    name: c.name,
    dishes: dishes.filter(d => d.category_id === c.id).map(d => toPublicDish(d, options)),
  }));
  return { categories: categories.filter(c => c.dishes.length > 0) };
}

module.exports = { getPublicMenu, splitIngredients, optionsByDish, toPublicDish };

// ---------- Admin ----------
const { tx } = require('./db');
const { HttpError } = require('./errors');

function listAdminDishes(db) {
  const options = optionsByDish(db);
  return db.prepare(`SELECT d.*, c.name category_name FROM dishes d JOIN categories c ON c.id=d.category_id
    WHERE d.deleted=0 ORDER BY c.sort, c.id, d.sort, d.id`).all().map(d => ({
    id: d.id,
    categoryId: d.category_id,
    categoryName: d.category_name,
    name: d.name,
    isVeg: d.is_veg === 1,
    spice: d.spice,
    description: d.description,
    ingredients: d.ingredients,
    prepMinutes: d.prep_minutes,
    photo: d.photo || null,
    available: d.available === 1,
    sort: d.sort,
    options: options.get(d.id) || [],
  }));
}

const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function validateDish(db, dish) {
  const name = str(dish?.name);
  if (name.length < 1 || name.length > 80) throw new HttpError(400, 'Name must be 1–80 characters');
  if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(Number(dish.categoryId))) throw new HttpError(400, 'Choose a category');
  if (!isInt(dish.spice, 0, 3)) throw new HttpError(400, 'Spice level must be 0 to 3');
  if (!isInt(dish.prepMinutes, 1, 120)) throw new HttpError(400, 'Preparation time must be 1 to 120 minutes');
  const options = Array.isArray(dish.options) ? dish.options : [];
  if (options.length < 1) throw new HttpError(400, 'Add at least one size and price');
  const cleanOptions = options.map(o => {
    const label = str(o?.label);
    if (label.length < 1 || label.length > 20) throw new HttpError(400, 'Each size needs a name of 1–20 characters');
    if (!isInt(o.price, 0, 100000)) throw new HttpError(400, 'Each price must be a whole number of rupees');
    return { label, price: o.price };
  });
  return {
    name,
    categoryId: Number(dish.categoryId),
    isVeg: dish.isVeg ? 1 : 0,
    spice: dish.spice,
    description: str(dish.description).slice(0, 600),
    ingredients: str(dish.ingredients).slice(0, 600),
    prepMinutes: dish.prepMinutes,
    available: dish.available === false ? 0 : 1,
    sort: Number.isInteger(dish.sort) ? dish.sort : null,
    options: cleanOptions,
  };
}

function saveDish(db, input, id) {
  const d = validateDish(db, input);
  return tx(db, () => {
    let dishId = id;
    if (id) {
      if (!db.prepare('SELECT 1 FROM dishes WHERE id=? AND deleted=0').get(id)) throw new HttpError(404, 'Dish not found');
      db.prepare(`UPDATE dishes SET category_id=?, name=?, is_veg=?, spice=?, description=?, ingredients=?, prep_minutes=?,
        available=?, sort=COALESCE(?, sort) WHERE id=?`)
        .run(d.categoryId, d.name, d.isVeg, d.spice, d.description, d.ingredients, d.prepMinutes, d.available, d.sort, id);
      db.prepare('DELETE FROM dish_options WHERE dish_id=?').run(id);
    } else {
      const sort = d.sort ?? (db.prepare('SELECT COALESCE(MAX(sort),-1)+1 s FROM dishes WHERE category_id=?').get(d.categoryId).s);
      dishId = Number(db.prepare(`INSERT INTO dishes(category_id, name, is_veg, spice, description, ingredients, prep_minutes, available, sort)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(d.categoryId, d.name, d.isVeg, d.spice, d.description, d.ingredients, d.prepMinutes, d.available, sort).lastInsertRowid);
    }
    const ins = db.prepare('INSERT INTO dish_options(dish_id, label, price, sort) VALUES (?, ?, ?, ?)');
    d.options.forEach((o, i) => ins.run(dishId, o.label, o.price, i));
    return dishId;
  });
}

function requireDish(db, id) {
  if (!db.prepare('SELECT 1 FROM dishes WHERE id=? AND deleted=0').get(id)) throw new HttpError(404, 'Dish not found');
}

function deleteDish(db, id) {
  requireDish(db, id);
  db.prepare('UPDATE dishes SET deleted=1 WHERE id=?').run(id);
}

function setAvailable(db, id, available) {
  requireDish(db, id);
  db.prepare('UPDATE dishes SET available=? WHERE id=?').run(available ? 1 : 0, id);
}

function setPhoto(db, id, photo) {
  requireDish(db, id);
  db.prepare('UPDATE dishes SET photo=? WHERE id=?').run(photo, id);
}

function listCategories(db) {
  return db.prepare(`SELECT c.id, c.name, c.sort, (SELECT COUNT(*) FROM dishes d WHERE d.category_id=c.id AND d.deleted=0) dishCount
    FROM categories c ORDER BY c.sort, c.id`).all().map(c => ({ ...c }));
}

function saveCategory(db, input, id) {
  const name = str(input?.name);
  if (name.length < 1 || name.length > 40) throw new HttpError(400, 'Category name must be 1–40 characters');
  const sort = Number.isInteger(input.sort) ? input.sort : null;
  const clash = db.prepare('SELECT id FROM categories WHERE name=?').get(name);
  if (clash && clash.id !== id) throw new HttpError(409, 'A category with that name already exists');
  if (id) {
    const r = db.prepare('UPDATE categories SET name=?, sort=COALESCE(?, sort) WHERE id=?').run(name, sort, id);
    if (r.changes === 0) throw new HttpError(404, 'Category not found');
    return id;
  }
  const s = sort ?? db.prepare('SELECT COALESCE(MAX(sort),-1)+1 s FROM categories').get().s;
  return Number(db.prepare('INSERT INTO categories(name, sort) VALUES (?, ?)').run(name, s).lastInsertRowid);
}

module.exports.listAdminDishes = listAdminDishes;
module.exports.saveDish = saveDish;
module.exports.deleteDish = deleteDish;
module.exports.setAvailable = setAvailable;
module.exports.setPhoto = setPhoto;
module.exports.listCategories = listCategories;
module.exports.saveCategory = saveCategory;
