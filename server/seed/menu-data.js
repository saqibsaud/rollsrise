// The Rolls Rise Signature menu, transcribed from the printed menu boards.
// Descriptions, ingredients, spice levels and prep times are first drafts for the owner to correct in Admin.
//
// d(name, price, isVeg, spice, prepMinutes, description, ingredients)
//   price: a number (single "Regular" option), [dry, gravy], or [full, half, qtr] for tandoor.

const VEG = true;
const NV = false;

function d(name, price, isVeg, spice, prepMinutes, description, ingredients) {
  return { name, price, isVeg, spice, prepMinutes, description, ingredients: ingredients.split(',').map(s => s.trim()) };
}

function toOptions(price, labels) {
  if (typeof price === 'number') return [{ label: 'Regular', price }];
  return price.map((p, i) => ({ label: labels[i], price: p }));
}

const RAW = [
  ['Soups', null, [
    d('Veg Clear Soup', 80, VEG, 0, 10, 'A light, clear vegetable broth with finely chopped seasonal vegetables.', 'Carrot, beans, cabbage, spring onion, garlic, pepper, vegetable stock'),
    d('Veg Hot & Sour Soup', 80, VEG, 2, 10, 'Thick, tangy and peppery Indo-Chinese soup with crunchy vegetables.', 'Cabbage, carrot, mushroom, soy sauce, vinegar, chilli sauce, pepper, cornflour'),
    d('Veg Sweet Corn Soup', 90, VEG, 0, 10, 'Creamy, mildly sweet soup with corn kernels and soft vegetables.', 'Sweet corn, carrot, beans, spring onion, pepper, cornflour'),
    d('Veg Mancho Soup', 90, VEG, 2, 10, 'Spicy garlic-ginger vegetable soup topped with crispy fried noodles.', 'Cabbage, carrot, capsicum, garlic, ginger, soy sauce, chilli, fried noodles'),
    d('Cream of Tomato Soup', 90, VEG, 0, 10, 'Smooth, velvety tomato soup finished with fresh cream.', 'Tomato, butter, onion, garlic, fresh cream, pepper, bread croutons'),
    d('Veg Lemon Coriander Soup', 90, VEG, 1, 10, 'Light, refreshing vegetable broth with lemon juice and fresh coriander.', 'Lemon, coriander, carrot, cabbage, beans, ginger, pepper'),
    d('Chicken Clear Soup', 90, NV, 0, 10, 'Light chicken broth with shredded chicken and vegetables.', 'Chicken, chicken stock, carrot, cabbage, spring onion, garlic, pepper'),
    d('Chicken Hot & Sour Soup', 100, NV, 2, 10, 'Tangy, peppery Indo-Chinese soup with shredded chicken.', 'Chicken, egg, mushroom, soy sauce, vinegar, chilli sauce, pepper, cornflour'),
    d('Chicken Pepper Soup', 100, NV, 2, 10, 'Warming chicken soup with a strong black pepper kick.', 'Chicken, black pepper, garlic, ginger, onion, coriander, chicken stock'),
    d('Chicken Mancho Soup', 100, NV, 2, 10, 'Spicy garlic chicken soup topped with crispy fried noodles.', 'Chicken, garlic, ginger, cabbage, soy sauce, chilli, fried noodles'),
    d('Chicken Lemon Coriander Soup', 110, NV, 1, 10, 'Light chicken broth with lemon juice and fresh coriander.', 'Chicken, lemon, coriander, ginger, carrot, pepper, chicken stock'),
    d('Cream of Chicken Soup', 110, NV, 0, 10, 'Rich, creamy soup with tender pieces of chicken.', 'Chicken, butter, fresh cream, milk, onion, pepper, flour'),
    d('Chicken Sweet Corn Soup', 110, NV, 0, 10, 'Creamy sweet corn soup with shredded chicken and egg.', 'Chicken, sweet corn, egg, spring onion, pepper, cornflour'),
  ]],
  ['Starters – Veg', ['Dry', 'Gravy'], [
    d('French Fries', 80, VEG, 0, 8, 'Crispy golden potato fries, lightly salted.', 'Potato, salt, oil, tomato ketchup'),
    d('Peri Peri French Fries', 90, VEG, 2, 8, 'Crispy fries tossed in spicy peri peri seasoning.', 'Potato, peri peri spice, chilli, garlic powder, salt, oil'),
    d('Gobhi 65', 110, VEG, 2, 15, 'Crispy deep-fried cauliflower florets in a spicy South Indian batter.', 'Cauliflower, chilli powder, ginger garlic paste, curry leaves, cornflour, rice flour'),
    d('Gobhi Chilli', [110, 130], VEG, 2, 15, 'Crispy cauliflower tossed with onion, capsicum and green chilli in a spicy sauce. Choose dry or gravy.', 'Cauliflower, onion, capsicum, green chilli, soy sauce, chilli sauce, garlic, cornflour'),
    d('Gobhi Manchurian', [110, 130], VEG, 2, 15, 'Fried cauliflower in a tangy garlic-soy Manchurian sauce. Choose dry or gravy.', 'Cauliflower, garlic, ginger, soy sauce, spring onion, chilli sauce, cornflour'),
    d('Mushroom Manchurian', [130, 150], VEG, 2, 15, 'Crispy mushrooms in a tangy garlic-soy Manchurian sauce. Choose dry or gravy.', 'Mushroom, garlic, ginger, soy sauce, spring onion, chilli sauce, cornflour'),
    d('Paneer Chilli', [180, 200], VEG, 2, 15, 'Soft paneer cubes tossed with onion, capsicum and green chilli. Choose dry or gravy.', 'Paneer, onion, capsicum, green chilli, soy sauce, chilli sauce, garlic, cornflour'),
    d('Paneer Manchurian', [180, 200], VEG, 2, 15, 'Fried paneer in a tangy garlic-soy Manchurian sauce. Choose dry or gravy.', 'Paneer, garlic, ginger, soy sauce, spring onion, chilli sauce, cornflour'),
    d('Paneer Dragon', 200, VEG, 3, 15, 'Paneer strips tossed in a fiery, slightly sweet dragon sauce with cashews.', 'Paneer, red chilli paste, cashew, capsicum, onion, honey, soy sauce, garlic'),
  ]],
  ['Starters – Non-Veg', ['Dry', 'Gravy'], [
    d('Egg Chilli', [130, 150], NV, 2, 12, 'Boiled egg pieces tossed with onion, capsicum and green chilli. Choose dry or gravy.', 'Egg, onion, capsicum, green chilli, soy sauce, chilli sauce, garlic'),
    d('Egg Manchurian', [130, 150], NV, 2, 12, 'Fried egg pieces in a tangy garlic-soy Manchurian sauce. Choose dry or gravy.', 'Egg, garlic, ginger, soy sauce, spring onion, chilli sauce, cornflour'),
    d('Chicken Lollipop (6 Nos)', 170, NV, 2, 18, 'Six frenched chicken wings, marinated and fried crisp, served with Schezwan dip.', 'Chicken wings, ginger garlic paste, chilli powder, cornflour, egg, Schezwan sauce'),
    d('Boneless 65', 150, NV, 2, 15, 'Boneless chicken bites in a spicy South Indian batter, fried with curry leaves.', 'Boneless chicken, chilli powder, ginger garlic paste, curry leaves, yogurt, cornflour'),
    d('Chicken Chilli', [190, 200], NV, 2, 15, 'Crispy chicken tossed with onion, capsicum and green chilli. Choose dry or gravy.', 'Chicken, onion, capsicum, green chilli, soy sauce, chilli sauce, garlic, cornflour'),
    d('Chicken Manchurian', [190, 200], NV, 2, 15, 'Fried chicken in a tangy garlic-soy Manchurian sauce. Choose dry or gravy.', 'Chicken, garlic, ginger, soy sauce, spring onion, chilli sauce, cornflour'),
    d('Salt & Pepper Chicken', 190, NV, 2, 15, 'Crispy chicken tossed with crushed black pepper, garlic and spring onion.', 'Chicken, black pepper, garlic, spring onion, green chilli, cornflour, salt'),
    d('Schezwan Chicken', 200, NV, 3, 15, 'Chicken tossed in a hot, garlicky Schezwan sauce.', 'Chicken, Schezwan sauce, dry red chilli, garlic, onion, capsicum, soy sauce'),
    d('Dragon Chicken', 210, NV, 3, 15, 'Chicken strips in a fiery, slightly sweet dragon sauce with cashews.', 'Chicken, red chilli paste, cashew, capsicum, onion, honey, soy sauce, garlic'),
    d('Hunan Chicken', 210, NV, 3, 15, 'Chicken in a hot and savoury Hunan-style chilli garlic sauce.', 'Chicken, dry red chilli, garlic, ginger, soy sauce, capsicum, onion'),
    d('Honey Chilli Chicken', 230, NV, 2, 15, 'Crispy chicken glazed with honey, chilli and sesame.', 'Chicken, honey, chilli flakes, sesame seeds, garlic, soy sauce, spring onion'),
    d('Butter Garlic Chicken', 230, NV, 1, 15, 'Tender chicken tossed in butter with plenty of garlic and herbs.', 'Chicken, butter, garlic, pepper, spring onion, soy sauce, coriander'),
  ]],
  ['Tandoor & BBQ', ['Full', 'Half', 'Qtr'], [
    d('BBQ Chicken', [440, 220, 120], NV, 2, 30, 'Chicken marinated in spiced yogurt and grilled over charcoal.', 'Chicken, yogurt, chilli powder, ginger garlic paste, lemon, garam masala'),
    d('Al-Faham', [440, 220, 120], NV, 1, 30, 'Arabian-style charcoal-grilled chicken with aromatic spices.', 'Chicken, Arabic spice mix, garlic, lemon, tomato paste, pepper, olive oil'),
    d('Pepper BBQ', [440, 220, 120], NV, 2, 30, 'Charcoal-grilled chicken with a bold black pepper marinade.', 'Chicken, black pepper, yogurt, garlic, lemon, salt'),
    d('Tandoori Chicken', [440, 220, 120], NV, 2, 30, 'Classic red tandoori chicken roasted in the clay oven.', 'Chicken, yogurt, Kashmiri chilli, ginger garlic paste, lemon, tandoori masala'),
    d('Chicken Tikka (6 Nos)', 190, NV, 2, 20, 'Six boneless chicken pieces marinated in spiced yogurt and roasted in the tandoor.', 'Boneless chicken, yogurt, chilli powder, ginger garlic paste, lemon, tikka masala'),
    d('Chicken Malai Tikka (6 Nos)', 190, NV, 0, 20, 'Six creamy, mild chicken pieces marinated with cream and cheese.', 'Boneless chicken, fresh cream, cheese, cashew paste, cardamom, white pepper'),
    d('Chicken Angara Tikka (6 Nos)', 190, NV, 3, 20, 'Six fiery, smoky chicken pieces with a red chilli marinade.', 'Boneless chicken, red chilli paste, yogurt, mustard oil, garlic, garam masala'),
  ]],
  ['Combos', null, [
    d('Ghee Rice + Dal', 150, VEG, 1, 12, 'Fragrant ghee rice served with dal.', 'Basmati rice, ghee, cashew, onion, toor dal, cumin, garlic'),
    d('Zeera Rice + Dal', 160, VEG, 1, 12, 'Cumin-flavoured basmati rice served with dal.', 'Basmati rice, cumin, ghee, toor dal, garlic, tomato'),
    d('Ghee Rice + Butter Chicken', 200, NV, 1, 15, 'Fragrant ghee rice served with creamy butter chicken.', 'Basmati rice, ghee, chicken, butter, tomato, fresh cream, cashew'),
    d('Zeera Rice + Butter Chicken', 210, NV, 1, 15, 'Cumin rice served with creamy butter chicken.', 'Basmati rice, cumin, chicken, butter, tomato, fresh cream, cashew'),
    d('Chicken Fried Rice or Noodles + Chilli Chicken', 210, NV, 2, 15, 'Chicken fried rice or noodles (tell us which in the note) with chilli chicken.', 'Rice or noodles, chicken, egg, onion, capsicum, green chilli, soy sauce'),
    d('Chicken Fried Rice or Noodles + Chicken Manchurian (Semi)', 210, NV, 2, 15, 'Chicken fried rice or noodles (tell us which in the note) with semi-gravy chicken Manchurian.', 'Rice or noodles, chicken, egg, garlic, ginger, soy sauce, spring onion'),
  ]],
  ['Burgers', null, [
    d('Crispy Chicken Burger', 130, NV, 1, 10, 'Broasted crispy chicken fillet in a soft bun with lettuce and mayo.', 'Chicken fillet, burger bun, lettuce, mayonnaise, tomato, cheese'),
    d('Shawarma Burger', 100, NV, 1, 10, 'Shawarma chicken in a burger bun with garlic sauce and pickles.', 'Shawarma chicken, burger bun, garlic sauce, pickled cucumber, lettuce, mayonnaise'),
  ]],
  ['Rice', null, [
    d('Ghee Rice', 100, VEG, 0, 12, 'Fragrant basmati rice cooked with ghee, whole spices and fried onion.', 'Basmati rice, ghee, cashew, onion, cardamom, cinnamon'),
    d('Zeera Rice', 100, VEG, 0, 12, 'Basmati rice tempered with cumin seeds and ghee.', 'Basmati rice, cumin, ghee, bay leaf, coriander'),
    d('Veg Fried Rice', 100, VEG, 1, 12, 'Wok-tossed rice with mixed vegetables and soy sauce.', 'Rice, carrot, beans, cabbage, spring onion, soy sauce, pepper'),
    d('Veg Schezwan Rice', 120, VEG, 3, 12, 'Vegetable fried rice tossed in hot Schezwan sauce.', 'Rice, Schezwan sauce, carrot, beans, cabbage, spring onion, garlic'),
    d('Veg Chilli Garlic Rice', 120, VEG, 2, 12, 'Vegetable fried rice with plenty of garlic and chilli.', 'Rice, garlic, green chilli, carrot, beans, spring onion, soy sauce'),
    d('Paneer Rice', 160, VEG, 1, 12, 'Fried rice tossed with paneer cubes and vegetables.', 'Rice, paneer, carrot, beans, spring onion, soy sauce, pepper'),
    d('Egg Fried Rice', 110, NV, 1, 12, 'Wok-tossed rice with scrambled egg and vegetables.', 'Rice, egg, carrot, beans, spring onion, soy sauce, pepper'),
    d('Chicken Fried Rice', 120, NV, 1, 12, 'Wok-tossed rice with chicken, egg and vegetables.', 'Rice, chicken, egg, carrot, beans, spring onion, soy sauce'),
    d('Schezwan Egg Fried Rice', 130, NV, 3, 12, 'Egg fried rice tossed in hot Schezwan sauce.', 'Rice, egg, Schezwan sauce, carrot, cabbage, spring onion, garlic'),
    d('Schezwan Chicken Fried Rice', 140, NV, 3, 12, 'Chicken fried rice tossed in hot Schezwan sauce.', 'Rice, chicken, egg, Schezwan sauce, carrot, spring onion, garlic'),
    d('Chicken Butter Garlic Rice', 160, NV, 1, 12, 'Rice tossed with butter, garlic and chicken.', 'Rice, chicken, butter, garlic, egg, spring onion, pepper'),
    d('Chicken Tikka Rice', 200, NV, 2, 15, 'Fried rice topped with smoky tandoori chicken tikka pieces.', 'Rice, chicken tikka, egg, onion, capsicum, spring onion, soy sauce'),
  ]],
  ['Noodles', null, [
    d('Veg Noodles', 100, VEG, 1, 12, 'Wok-tossed noodles with mixed vegetables.', 'Noodles, cabbage, carrot, capsicum, spring onion, soy sauce'),
    d('Veg Schezwan Noodles', 120, VEG, 3, 12, 'Vegetable noodles tossed in hot Schezwan sauce.', 'Noodles, Schezwan sauce, cabbage, carrot, capsicum, garlic'),
    d('Veg Butter Garlic Noodles', 120, VEG, 1, 12, 'Noodles tossed in butter and garlic with vegetables.', 'Noodles, butter, garlic, cabbage, carrot, spring onion, pepper'),
    d('Veg American Chopsuey', 140, VEG, 1, 15, 'Crispy fried noodles topped with a sweet and tangy vegetable sauce.', 'Fried noodles, cabbage, carrot, capsicum, tomato ketchup, vinegar, cornflour'),
    d('Paneer Noodles', 160, VEG, 1, 12, 'Wok-tossed noodles with paneer and vegetables.', 'Noodles, paneer, cabbage, carrot, capsicum, soy sauce'),
    d('Egg Noodles', 110, NV, 1, 12, 'Wok-tossed noodles with scrambled egg and vegetables.', 'Noodles, egg, cabbage, carrot, spring onion, soy sauce'),
    d('Chicken Noodles', 120, NV, 1, 12, 'Wok-tossed noodles with chicken, egg and vegetables.', 'Noodles, chicken, egg, cabbage, carrot, soy sauce'),
    d('Schezwan Egg Noodles', 130, NV, 3, 12, 'Egg noodles tossed in hot Schezwan sauce.', 'Noodles, egg, Schezwan sauce, cabbage, carrot, garlic'),
    d('Schezwan Chicken Noodles', 140, NV, 3, 12, 'Chicken noodles tossed in hot Schezwan sauce.', 'Noodles, chicken, egg, Schezwan sauce, cabbage, garlic'),
    d('Chicken American Chopsuey', 180, NV, 1, 15, 'Crispy fried noodles topped with a sweet and tangy chicken sauce.', 'Fried noodles, chicken, egg, cabbage, capsicum, tomato ketchup, vinegar'),
  ]],
  ['Main Course – Veg', null, [
    d('Dal Tadka', 100, VEG, 1, 15, 'Yellow lentils finished with a sizzling tempering of ghee, cumin and garlic.', 'Toor dal, ghee, cumin, garlic, dry red chilli, tomato, coriander'),
    d('Dal Fry', 90, VEG, 1, 15, 'Lentils cooked with onion, tomato and mild spices.', 'Toor dal, onion, tomato, cumin, garlic, turmeric, coriander'),
    d('Kadai Paneer', 200, VEG, 2, 20, 'Paneer cooked with capsicum and onion in a freshly ground kadai masala.', 'Paneer, capsicum, onion, tomato, coriander seeds, dry red chilli, ginger'),
    d('Palak Paneer', 200, VEG, 1, 20, 'Paneer cubes in a smooth, mildly spiced spinach gravy.', 'Paneer, spinach, onion, garlic, ginger, fresh cream, cumin'),
    d('Paneer Butter Masala', 200, VEG, 1, 20, 'Paneer in a rich, creamy tomato and butter gravy.', 'Paneer, butter, tomato, cashew, fresh cream, kasuri methi, garam masala'),
    d('Methi Paneer', 200, VEG, 1, 20, 'Paneer in a creamy gravy flavoured with fenugreek leaves.', 'Paneer, fenugreek leaves, onion, tomato, cashew, fresh cream'),
    d('Paneer Tikka Masala', 200, VEG, 2, 20, 'Tandoor-roasted paneer tikka in a spiced onion-tomato masala.', 'Paneer, yogurt, capsicum, onion, tomato, tikka masala, butter'),
    d('Paneer Lababdar', 230, VEG, 1, 20, 'Paneer in a rich, mildly sweet tomato-onion gravy with cream.', 'Paneer, tomato, onion, cashew, fresh cream, butter, kasuri methi'),
  ]],
  ['Main Course – Non-Veg', null, [
    d('Egg Bhurji', 60, NV, 1, 8, 'Spiced scrambled eggs with onion, tomato and green chilli.', 'Egg, onion, tomato, green chilli, turmeric, coriander'),
    d('Egg Masala', 100, NV, 2, 15, 'Boiled eggs in a spicy onion-tomato masala.', 'Egg, onion, tomato, ginger garlic paste, chilli powder, garam masala'),
    d('Kadai Chicken', 180, NV, 2, 20, 'Chicken cooked with capsicum and onion in a freshly ground kadai masala.', 'Chicken, capsicum, onion, tomato, coriander seeds, dry red chilli, ginger'),
    d('Pepper Chicken', 180, NV, 3, 20, 'Chicken cooked dry with crushed black pepper and curry leaves.', 'Chicken, black pepper, curry leaves, onion, ginger garlic paste, fennel'),
    d('Methi Chicken', 200, NV, 1, 20, 'Chicken in a creamy gravy flavoured with fenugreek leaves.', 'Chicken, fenugreek leaves, onion, tomato, cashew, fresh cream'),
    d('Butter Chicken', 200, NV, 1, 20, 'Tandoori chicken in a rich, creamy tomato and butter gravy.', 'Chicken, butter, tomato, cashew, fresh cream, kasuri methi, garam masala'),
    d('Chettinad Chicken', 200, NV, 3, 20, 'Fiery South Indian chicken curry with freshly roasted Chettinad spices.', 'Chicken, coconut, black pepper, fennel, dry red chilli, curry leaves, star anise'),
    d('Chicken Tikka Masala', 220, NV, 2, 20, 'Tandoor-roasted chicken tikka in a spiced onion-tomato masala.', 'Chicken tikka, onion, tomato, capsicum, fresh cream, tikka masala, butter'),
    d('Chicken Lababdar', 220, NV, 1, 20, 'Chicken in a rich, mildly sweet tomato-onion gravy with cream.', 'Chicken, tomato, onion, cashew, fresh cream, butter, kasuri methi'),
    d('Kadai Chicken Boneless', 230, NV, 2, 20, 'Boneless chicken cooked with capsicum and onion in kadai masala.', 'Boneless chicken, capsicum, onion, tomato, coriander seeds, dry red chilli'),
    d('Murgh Afghani (BL)', 240, NV, 0, 25, 'Boneless chicken in a mild, creamy white gravy with cashew and cream.', 'Boneless chicken, cashew, fresh cream, yogurt, white pepper, cardamom'),
  ]],
  ['Breads', null, [
    d('Khubus', 15, VEG, 0, 5, 'Soft Arabic flatbread, perfect with shawarma and grills.', 'Wheat flour, yeast, salt, sugar, oil'),
    d('Wheat Porotta', 20, VEG, 0, 5, 'Flaky layered flatbread made with whole wheat.', 'Whole wheat flour, oil, salt, water'),
    d('Kerala Porotta', 20, VEG, 0, 5, 'Soft, flaky layered Kerala-style flatbread.', 'Maida, oil, salt, sugar, water'),
    d('Romali Roti', 25, VEG, 0, 5, 'Thin, soft handkerchief bread cooked on an inverted griddle.', 'Wheat flour, maida, milk, salt, oil'),
    d('Butter Romali Roti', 30, VEG, 0, 5, 'Romali roti brushed with butter.', 'Wheat flour, maida, milk, butter, salt'),
    d('Tandoori Roti', 25, VEG, 0, 5, 'Whole wheat bread baked in the clay oven.', 'Whole wheat flour, salt, water, oil'),
    d('Plain Naan', 30, VEG, 0, 5, 'Soft leavened bread baked in the tandoor.', 'Maida, yogurt, yeast, salt, milk'),
    d('Kulcha', 30, VEG, 0, 5, 'Soft, slightly thick leavened bread from the tandoor.', 'Maida, yogurt, baking soda, salt, milk'),
    d('Butter Kulcha', 40, VEG, 0, 5, 'Tandoor kulcha brushed with butter.', 'Maida, yogurt, butter, baking soda, salt'),
    d('Butter Naan', 40, VEG, 0, 5, 'Soft tandoor naan brushed with butter.', 'Maida, yogurt, yeast, butter, salt'),
    d('Butter Garlic Naan', 50, VEG, 0, 6, 'Tandoor naan topped with garlic, coriander and butter.', 'Maida, yogurt, garlic, butter, coriander, salt'),
  ]],
  ['Shawarma', null, [
    d('Chicken Shawarma', 80, NV, 1, 8, 'Spit-roasted chicken rolled in bread with garlic sauce and pickles.', 'Shawarma chicken, khubus, garlic sauce, pickled cucumber, cabbage, mayonnaise'),
    d('Chicken Mexican Shawarma', 90, NV, 2, 8, 'Chicken shawarma with a zesty Mexican-style spicy sauce.', 'Shawarma chicken, khubus, Mexican sauce, jalapeño, onion, capsicum, mayonnaise'),
    d('Chicken Pepper Shawarma', 90, NV, 2, 8, 'Chicken shawarma with a black pepper kick.', 'Shawarma chicken, khubus, black pepper, garlic sauce, cabbage, mayonnaise'),
    d('Peri Peri Chicken Shawarma', 90, NV, 2, 8, 'Chicken shawarma with spicy peri peri seasoning.', 'Shawarma chicken, khubus, peri peri sauce, garlic sauce, cabbage, mayonnaise'),
    d('Mexican Shawarma Burger', 110, NV, 2, 10, 'Shawarma chicken with Mexican sauce in a burger bun.', 'Shawarma chicken, burger bun, Mexican sauce, jalapeño, lettuce, mayonnaise'),
    d('Chicken Shawarma Special', 110, NV, 1, 8, 'A larger chicken shawarma with extra chicken and sauce.', 'Shawarma chicken, khubus, garlic sauce, pickled cucumber, fries, mayonnaise'),
    d('Plate Shawarma', 160, NV, 1, 10, 'Shawarma chicken served open on a plate with khubus, fries, garlic sauce and salad.', 'Shawarma chicken, khubus, French fries, garlic sauce, pickles, salad'),
    d('Plate Mexican Shawarma', 170, NV, 2, 10, 'Plate shawarma with spicy Mexican sauce, khubus, fries and salad.', 'Shawarma chicken, khubus, French fries, Mexican sauce, jalapeño, salad'),
    d('Special Mexican Shawarma', 120, NV, 2, 8, 'A larger Mexican-style chicken shawarma with extra filling.', 'Shawarma chicken, khubus, Mexican sauce, jalapeño, cheese, mayonnaise'),
    d('Special Peri Peri Shawarma', 120, NV, 2, 8, 'A larger peri peri chicken shawarma with extra filling.', 'Shawarma chicken, khubus, peri peri sauce, cheese, garlic sauce, mayonnaise'),
    d('Special Plate Shawarma', 190, NV, 1, 10, 'A larger plate shawarma with extra chicken, khubus, fries and salad.', 'Shawarma chicken, khubus, French fries, garlic sauce, pickles, salad, cheese'),
  ]],
  ['Rolls', null, [
    d('Chicken Tikka Roll', 100, NV, 2, 8, 'Tandoori chicken tikka wrapped in a soft porotta with onion and mint mayo.', 'Chicken tikka, porotta, onion, mint mayonnaise, cabbage, chaat masala'),
    d('Kathi Roll', 100, NV, 2, 8, 'Kolkata-style roll with spiced chicken and egg-coated paratha.', 'Chicken, egg, paratha, onion, green chilli, chaat masala, sauce'),
    d('Gobhi Chilli Roll', 100, VEG, 2, 8, 'Gobhi chilli wrapped in a soft porotta with onion and sauce.', 'Cauliflower, porotta, onion, capsicum, chilli sauce, mayonnaise'),
    d('Gobhi Manchurian Roll', 100, VEG, 2, 8, 'Gobhi Manchurian wrapped in a soft porotta with onion and sauce.', 'Cauliflower, porotta, garlic, soy sauce, onion, mayonnaise'),
    d('Angara Tikka Roll', 100, NV, 3, 8, 'Fiery angara chicken tikka wrapped in a soft porotta.', 'Angara chicken tikka, porotta, onion, mint mayonnaise, cabbage'),
    d('Malai Tikka Roll', 120, NV, 0, 8, 'Creamy, mild malai chicken tikka wrapped in a soft porotta.', 'Malai chicken tikka, porotta, onion, mayonnaise, cabbage'),
    d('Chicken Manchurian Roll', 120, NV, 2, 8, 'Chicken Manchurian wrapped in a soft porotta with onion and sauce.', 'Chicken, porotta, garlic, soy sauce, onion, mayonnaise'),
    d('Chicken Mexican Roll', 110, NV, 2, 8, 'Chicken with spicy Mexican sauce wrapped in a soft porotta.', 'Chicken, porotta, Mexican sauce, jalapeño, onion, capsicum'),
    d('Paneer Chilli Roll', 120, VEG, 2, 8, 'Paneer chilli wrapped in a soft porotta with onion and sauce.', 'Paneer, porotta, onion, capsicum, chilli sauce, mayonnaise'),
    d('Paneer Manchurian Roll', 120, VEG, 2, 8, 'Paneer Manchurian wrapped in a soft porotta with onion and sauce.', 'Paneer, porotta, garlic, soy sauce, onion, mayonnaise'),
    d('Dragon Chicken Roll', 120, NV, 3, 8, 'Dragon chicken wrapped in a soft porotta with onion and sauce.', 'Dragon chicken, porotta, cashew, capsicum, onion, mayonnaise'),
    d('Arabian Chicken Roll', 130, NV, 1, 8, 'Arabian-spiced grilled chicken wrapped with garlic sauce and pickles.', 'Grilled chicken, khubus, garlic sauce, pickled cucumber, Arabic spices'),
    d('Paneer Mexican Roll', 130, VEG, 2, 8, 'Paneer with spicy Mexican sauce wrapped in a soft porotta.', 'Paneer, porotta, Mexican sauce, jalapeño, onion, capsicum'),
    d('Paneer Dragon Roll', 130, VEG, 3, 8, 'Paneer dragon wrapped in a soft porotta with onion and sauce.', 'Paneer, porotta, red chilli paste, cashew, capsicum, onion'),
  ]],
];

const MENU = RAW.map(([category, labels, dishes]) => ({
  category,
  dishes: dishes.map(({ price, ...rest }) => ({ ...rest, options: toOptions(price, labels) })),
}));

module.exports = { MENU };
