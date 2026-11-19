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
