# Rolls Rise Table Ordering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-network web app where customers order from their table, the kitchen sees orders live, customers get an itemised bill, staff manage the menu, and an optional AI assistant answers menu questions.

**Architecture:** One Node.js process (Express) serves three static front-ends (customer, kitchen, admin) and a JSON API backed by a single SQLite file. Live updates go over Server-Sent Events: the server emits "something changed" on a channel and clients re-fetch. Business logic lives in plain modules that take a `db` handle (testable without HTTP); routes are thin.

**Tech Stack:** Node.js 24 LTS, Express 5, `node:sqlite` (built-in, no native build on Windows — builder's swap for `better-sqlite3` named in the spec), `qrcode` (SVG QR codes, offline), `multer` (photo upload), `@anthropic-ai/sdk` (AI chat), plain HTML/CSS/JS front-end (no build step). Tests: `node --test` + `supertest`; one Playwright end-to-end test.

**Spec:** `docs/superpowers/specs/2026-11-19-table-ordering-design.md`

## Global Constraints

- Ordering, kitchen, bills and admin must work with **no internet**. Only `/api/t/:code/ask` may call out.
- No CDN assets: every font/script/style is served from `public/`.
- Prices are whole rupees (integers). Tax amounts in rupees with 2 decimals.
- Name and price of an item are **copied into `order_items` at order time**; bills read only `order_items`.
- 6 tables, numbered 1–6, pre-created on first run.
- Restaurant defaults: name `Rolls Rise Signature`, tagline `Indian · Chinese · Arabian`, address `Iqbal Road, (Near Jadeed Mosque) Vaniyambadi`, phone `8122776332`, bill footer `Thank you for dining with us. Every meal is made with passion and served with gratitude.`
- GST, GSTIN, UPI ID: empty by default; bill shows tax lines / UPI QR only when set.
- AI model id default: `claude-haiku-5-5` (stored in settings key `ai_model`).
- Visual style: white background, black text, deep red accent `#9b1c1c`, serif headings (system serif stack, e.g. `Georgia, 'Times New Roman', serif`), mobile-first.
- Runs on a **Windows laptop**: `start.bat` double-click start; default port `3000` (env `PORT`).
- Default kitchen PIN `1234`. Admin password: none until first visit to `/admin`, which forces creating one.

## Review Focus

1. **Stale menu on a phone** — customer orders a dish that was marked sold out after their page loaded → order rejected with `409 {error:"Gobhi 65 is sold out"}`, nothing saved. (Task 4 test `rejects sold-out dish`.)
2. **Bad cart input** — qty 0, negative, non-integer, > 50, unknown/foreign `optionId`, empty items → `400`, nothing saved. (Task 4 tests `rejects bad quantities`, `rejects unknown option`.)
3. **Two phones at one table** ordering at the same moment → both orders land in the **same** visit, one bill. (Task 4 test `two orders share one visit`.)
4. **Ordering after "Ask for bill"** → `409 {error:"Bill already requested. Please ask staff."}`. (Task 4 test `blocks orders after bill request`.)
5. **Server restart mid-service** — open visits/orders survive (file DB), and kitchen/customer pages reconnect SSE and re-fetch automatically. (Task 2 test `data survives reopen`; Task 8/9 use `EventSource` auto-reconnect plus refetch on `open`.)

---

## File Structure

```
package.json
start.bat                      Windows double-click launcher
README.md                      owner setup guide
server/
  index.js                     reads env, opens db, seeds, starts backup timer, listen, prints LAN URLs
  app.js                       createApp({ db, assistant, events }) -> express app
  db.js                        openDb(file) -> DatabaseSync; schema; tx(db, fn)
  seed/menu-data.js            the menu: categories -> dishes -> options + drafted details
  seed/seed.js                 seedIfEmpty(db)
  settings.js                  getSettings / setSettings / defaults
  menu.js                      public menu read + admin dish/category CRUD
  orders.js                    visits & orders lifecycle
  bill.js                      computeBill(db, visitId)
  auth.js                      password/PIN hashing, session cookies, middleware
  events.js                    SSE hub
  ai.js                        menu context + Claude call + rate limit
  backup.js                    backupDb(db, dir, keep)
  routes/public.js             customer API
  routes/kitchen.js            kitchen API
  routes/admin.js              admin API
public/
  shared.css                   tokens + base styles
  index.html, app.js           customer
  kitchen.html, kitchen.js     kitchen board
  admin.html, admin.js         admin
  sounds/new-order.wav, sounds/bill.wav
data/                          (gitignored) rollsrise.db, photos/, backups/
test/
  helpers.js                   makeTestApp()
  *.test.js
  e2e/order-flow.spec.js
```

---

### Task 1: Project skeleton and database schema

**Files:**
- Create: `package.json`, `.gitignore`, `server/db.js`, `test/db.test.js`

**Interfaces:**
- Produces: `openDb(file: string) -> DatabaseSync` (creates schema if missing, `PRAGMA foreign_keys=ON`, `journal_mode=WAL` for files); `tx(db, fn) -> fn's return` (BEGIN IMMEDIATE / COMMIT / ROLLBACK on throw).

Schema (exact):
```sql
categories(id INTEGER PK, name TEXT NOT NULL UNIQUE, sort INTEGER NOT NULL DEFAULT 0)
dishes(id INTEGER PK, category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL, is_veg INTEGER NOT NULL, spice INTEGER NOT NULL DEFAULT 0 CHECK(spice BETWEEN 0 AND 3),
  description TEXT NOT NULL DEFAULT '', ingredients TEXT NOT NULL DEFAULT '',  -- comma separated
  prep_minutes INTEGER NOT NULL DEFAULT 15, photo TEXT, available INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0)
dish_options(id INTEGER PK, dish_id INTEGER NOT NULL REFERENCES dishes(id), label TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price >= 0), sort INTEGER NOT NULL DEFAULT 0)
tables(id INTEGER PK, number INTEGER NOT NULL UNIQUE, code TEXT NOT NULL UNIQUE, deleted INTEGER NOT NULL DEFAULT 0)
visits(id INTEGER PK, table_id INTEGER NOT NULL REFERENCES tables(id),
  status TEXT NOT NULL CHECK(status IN ('open','bill_requested','closed')),
  opened_at TEXT NOT NULL, bill_requested_at TEXT, bill_no INTEGER, closed_at TEXT)
  + partial unique index: one visit per table WHERE status != 'closed'
orders(id INTEGER PK, visit_id INTEGER NOT NULL REFERENCES visits(id),
  status TEXT NOT NULL CHECK(status IN ('new','preparing','ready','served','cancelled')),
  note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, eta_at TEXT NOT NULL)
order_items(id INTEGER PK, order_id INTEGER NOT NULL REFERENCES orders(id), dish_id INTEGER,
  dish_name TEXT NOT NULL, option_label TEXT NOT NULL, price INTEGER NOT NULL, qty INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '')
settings(key TEXT PK, value TEXT NOT NULL)
ai_log(id INTEGER PK, table_number INTEGER, question TEXT NOT NULL, answer TEXT NOT NULL, created_at TEXT NOT NULL)
```
Timestamps are ISO-8601 UTC strings (`new Date().toISOString()`). Dishes are soft-deleted (`deleted=1`) so old orders keep `dish_id`.

- [ ] **Step 1:** `npm init`, set `"type":"commonjs"`, `"engines":{"node":">=24"}`, scripts `"start":"node server/index.js"`, `"test":"node --test test/"`, `"e2e":"playwright test test/e2e --trace off"`. Install `express@5 qrcode multer @anthropic-ai/sdk`; dev `supertest`. `.gitignore`: `node_modules/`, `data/`.
- [ ] **Step 2: Write failing tests** in `test/db.test.js`:
  - `creates all tables`: `openDb(':memory:')`, query `sqlite_master` → names include all 9 tables.
  - `one open visit per table`: insert table, insert visit `open`, inserting a second `open` for same table throws; a `closed` one does not.
  - `tx rolls back on throw`: insert inside `tx` that throws → row count unchanged.
  - `data survives reopen`: open a temp file db, insert category, close, reopen → row present; schema creation is idempotent.
- [ ] **Step 3:** Run `npm test` → FAIL (module missing).
- [ ] **Step 4:** Implement `server/db.js`.
- [ ] **Step 5:** Run `npm test` → PASS.
- [ ] **Step 6:** Commit `feat: project skeleton and sqlite schema`.

---

### Task 2: Settings, menu data and seeding

**Files:**
- Create: `server/settings.js`, `server/seed/menu-data.js`, `server/seed/seed.js`, `test/seed.test.js`

**Interfaces:**
- Produces:
  - `DEFAULT_SETTINGS` object; `getSettings(db) -> object` (defaults merged with stored; numeric keys returned as numbers); `setSettings(db, partial)`.
  - Setting keys: `restaurant_name, tagline, address, phone, bill_footer, gstin, gst_percent (0), upi_id, kitchen_pin_hash, admin_password_hash, ai_enabled (false), ai_api_key, ai_model ('claude-haiku-5-5'), next_bill_no (1)`.
  - `MENU` export: `[{ category, dishes: [{ name, isVeg, spice, description, ingredients: string[], prepMinutes, options: [{label, price}] }] }]`.
  - `seedIfEmpty(db)` — if `categories` is empty: inserts MENU in order (sort = index), tables 1–6 with random 8-char codes (`crypto.randomBytes` → base32 lowercase), and default settings with `kitchen_pin_hash` = hash of `1234` (use `hashSecret` — define it here in `server/settings.js` as `hashSecret(plain) -> "scrypt$salt$hash"` and `verifySecret(plain, stored) -> boolean`; Task 6 reuses them).

**Menu (exact names and prices).** Options: single price → label `Regular`; two prices → `Dry` / `Gravy`; tandoor three prices → `Full` / `Half` / `Qtr`.

| # | Category | Dishes (price, or Dry/Gravy, or Full/Half/Qtr) |
|---|---|---|
| 1 | Soups | Veg Clear Soup 80 · Veg Hot & Sour Soup 80 · Veg Sweet Corn Soup 90 · Veg Mancho Soup 90 · Cream of Tomato Soup 90 · Veg Lemon Coriander Soup 90 · Chicken Clear Soup 90 · Chicken Hot & Sour Soup 100 · Chicken Pepper Soup 100 · Chicken Mancho Soup 100 · Chicken Lemon Coriander Soup 110 · Cream of Chicken Soup 110 · Chicken Sweet Corn Soup 110 |
| 2 | Starters – Veg | French Fries 80 · Peri Peri French Fries 90 · Gobhi 65 110 · Gobhi Chilli 110/130 · Gobhi Manchurian 110/130 · Mushroom Manchurian 130/150 · Paneer Chilli 180/200 · Paneer Manchurian 180/200 · Paneer Dragon 200 |
| 3 | Starters – Non-Veg | Egg Chilli 130/150 · Egg Manchurian 130/150 · Chicken Lollipop (6 Nos) 170 · Boneless 65 150 · Chicken Chilli 190/200 · Chicken Manchurian 190/200 · Salt & Pepper Chicken 190 · Schezwan Chicken 200 · Dragon Chicken 210 · Hunan Chicken 210 · Honey Chilli Chicken 230 · Butter Garlic Chicken 230 |
| 4 | Tandoor & BBQ | BBQ Chicken 440/220/120 · Al-Faham 440/220/120 · Pepper BBQ 440/220/120 · Tandoori Chicken 440/220/120 · Chicken Tikka (6 Nos) 190 · Chicken Malai Tikka (6 Nos) 190 · Chicken Angara Tikka (6 Nos) 190 |
| 5 | Combos | Ghee Rice + Dal 150 · Zeera Rice + Dal 160 · Ghee Rice + Butter Chicken 200 · Zeera Rice + Butter Chicken 210 · Chicken Fried Rice or Noodles + Chilli Chicken 210 · Chicken Fried Rice or Noodles + Chicken Manchurian (Semi) 210 |
| 6 | Burgers | Crispy Chicken Burger 130 · Shawarma Burger 100 |
| 7 | Rice | Ghee Rice 100 · Zeera Rice 100 · Veg Fried Rice 100 · Veg Schezwan Rice 120 · Veg Chilli Garlic Rice 120 · Paneer Rice 160 · Egg Fried Rice 110 · Chicken Fried Rice 120 · Schezwan Egg Fried Rice 130 · Schezwan Chicken Fried Rice 140 · Chicken Butter Garlic Rice 160 · Chicken Tikka Rice 200 |
| 8 | Noodles | Veg Noodles 100 · Veg Schezwan Noodles 120 · Veg Butter Garlic Noodles 120 · Veg American Chopsuey 140 · Paneer Noodles 160 · Egg Noodles 110 · Chicken Noodles 120 · Schezwan Egg Noodles 130 · Schezwan Chicken Noodles 140 · Chicken American Chopsuey 180 |
| 9 | Main Course – Veg | Dal Tadka 100 · Dal Fry 90 · Kadai Paneer 200 · Palak Paneer 200 · Paneer Butter Masala 200 · Methi Paneer 200 · Paneer Tikka Masala 200 · Paneer Lababdar 230 |
| 10 | Main Course – Non-Veg | Egg Bhurji 60 · Egg Masala 100 · Kadai Chicken 180 · Pepper Chicken 180 · Methi Chicken 200 · Butter Chicken 200 · Chettinad Chicken 200 · Chicken Tikka Masala 220 · Chicken Lababdar 220 · Kadai Chicken Boneless 230 · Murgh Afghani (BL) 240 |
| 11 | Breads | Khubus 15 · Wheat Porotta 20 · Kerala Porotta 20 · Romali Roti 25 · Butter Romali Roti 30 · Tandoori Roti 25 · Plain Naan 30 · Kulcha 30 · Butter Kulcha 40 · Butter Naan 40 · Butter Garlic Naan 50 |
| 12 | Shawarma | Chicken Shawarma 80 · Chicken Mexican Shawarma 90 · Chicken Pepper Shawarma 90 · Peri Peri Chicken Shawarma 90 · Mexican Shawarma Burger 110 · Chicken Shawarma Special 110 · Plate Shawarma 160 · Plate Mexican Shawarma 170 · Special Mexican Shawarma 120 · Special Peri Peri Shawarma 120 · Special Plate Shawarma 190 |
| 13 | Rolls | Chicken Tikka Roll 100 · Kathi Roll 100 · Gobhi Chilli Roll 100 · Gobhi Manchurian Roll 100 · Angara Tikka Roll 100 · Malai Tikka Roll 120 · Chicken Manchurian Roll 120 · Chicken Mexican Roll 110 · Paneer Chilli Roll 120 · Paneer Manchurian Roll 120 · Dragon Chicken Roll 120 · Arabian Chicken Roll 130 · Paneer Mexican Roll 130 · Paneer Dragon Roll 130 |

Total: **126 dishes**. (Shawarma Burger appears on both boards; listed once, under Burgers.)
`isVeg`: true for every dish without chicken/egg/meat in its name or recipe, i.e. all of Starters–Veg, Main Course–Veg, Veg* soups, Cream of Tomato, Veg*/Paneer*/Ghee/Zeera rice & noodles, Ghee/Zeera Rice + Dal, all Breads, Gobhi*/Paneer* rolls. Kathi Roll = non-veg (chicken) — flagged for owner to verify.
Drafted details: the implementer writes for every dish a one–two sentence `description` in plain English, 4–8 `ingredients`, `spice` 0–3, and realistic `prepMinutes` (soups 10, fries 8, Chinese starters 15, tandoor full 30 / others 20, rice & noodles 12, curries 20, breads 5, shawarma & rolls 8, burgers 10). Owner corrects these in Admin.

- [ ] **Step 1: Write failing tests** in `test/seed.test.js` (each on fresh `openDb(':memory:')` + `seedIfEmpty`):
  - `seeds 13 categories in menu order` — names equal the table's category column, in order.
  - `seeds 126 dishes with details` — count 126; every dish has non-empty description, ≥ 3 ingredients, `prep_minutes` between 3 and 45, ≥ 1 option.
  - `seeds multi-price options` — Gobhi Chilli → `[{Dry,110},{Gravy,130}]`; BBQ Chicken → `[{Full,440},{Half,220},{Qtr,120}]`; Khubus → `[{Regular,15}]`.
  - `veg flags` — Paneer Butter Masala veg, Butter Chicken non-veg, Egg Fried Rice non-veg, Butter Naan veg.
  - `seeds tables 1-6 with unique 8-char codes`.
  - `seeding twice is a no-op` — second call leaves counts unchanged.
  - `settings defaults` — `getSettings(db)` has `restaurant_name === 'Rolls Rise Signature'`, `gst_percent === 0`, `ai_enabled === false`, `next_bill_no === 1`; `verifySecret('1234', s.kitchen_pin_hash) === true`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `settings.js`, `menu-data.js`, `seed.js`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: seed full Rolls Rise menu, tables and settings`.

---

### Task 3: Public menu API and app factory

**Files:**
- Create: `server/menu.js`, `server/events.js`, `server/app.js`, `server/routes/public.js`, `test/helpers.js`, `test/menu.test.js`

**Interfaces:**
- Produces:
  - `getPublicMenu(db) -> { categories: [{ id, name, dishes: [{ id, name, isVeg, spice, description, ingredients: string[], prepMinutes, photo, available, options: [{id, label, price}] }] }] }` — excludes deleted dishes and categories with no dishes; ordered by sort then id.
  - `createEvents() -> { subscribe(channel, res), emit(channel), handler(req,res) }` — SSE: headers `text/event-stream`, `retry: 3000`, heartbeat comment every 25 s, `emit` writes `event: changed\ndata: {}\n\n` to every subscriber of that channel. Channels: `table:<code>`, `kitchen`, `admin`.
  - `createApp({ db, events, assistant }) -> express.Application` — JSON body limit 100 kb, `express.static('public')`, `/t/:code` → `public/index.html`, `/kitchen` → `kitchen.html`, `/admin` → `admin.html`, `/photos` static from `data/photos`, mounts routers, JSON 404 for unknown `/api/*`, error handler returns `{error}` with status (default 500, never a stack).
  - `test/helpers.js`: `makeTestApp() -> { app, db, events, assistant }` with `:memory:` db seeded and a fake assistant `{ ask: async () => ({answer:'ok', dishIds:[]}) }`; `tableCode(db, number) -> string`.
  - Routes: `GET /api/menu` → `{...getPublicMenu(db), aiEnabled: boolean, restaurant: {name, tagline}}` (`aiEnabled` = `ai_enabled && ai_api_key !== ''`). `GET /api/tables` → `[{number, code}]` sorted by number, non-deleted. `GET /api/tables/:code` → `{number, code}` or 404.
- [ ] **Step 1: Write failing tests** `test/menu.test.js` (supertest):
  - `GET /api/menu lists 13 categories` and first category is `Soups` with 13 dishes.
  - `sold-out dish is listed with available:false`.
  - `deleted dish is hidden`.
  - `aiEnabled false by default; true when ai_enabled and key set`.
  - `GET /api/tables returns 1..6`; `GET /api/tables/<bad>` → 404 JSON.
  - `GET /t/<code>` returns HTML (status 200, `text/html`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Create placeholder `public/index.html`, `kitchen.html`, `admin.html` (title only) so static routes resolve.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: public menu API and app factory`.

---

### Task 4: Orders and visit lifecycle

**Files:**
- Create: `server/orders.js`, `test/orders.test.js`
- Modify: `server/routes/public.js`

**Interfaces:**
- Consumes: `tx`, `getSettings`, `setSettings`, `events.emit`.
- Produces (all throw `HttpError(status, message)` — define `class HttpError extends Error {status}` in `server/orders.js` and export it):
  - `getTableByCode(db, code) -> {id, number, code}` (404 `Table not found`).
  - `getActiveVisit(db, tableId) -> visit | null` (status open or bill_requested).
  - `placeOrder(db, tableCode, { items: [{optionId, qty, note?}], note? }) -> order` — inside `tx`: validate (items 1–30 entries; `qty` integer 1–50; option exists, its dish not deleted → else 400 `Invalid item`; dish available → else 409 `<Dish name> is sold out`); get or create open visit; visit `bill_requested` → 409 `Bill already requested. Please ask staff.`; insert order `new`, `eta_at = now + max(prep_minutes)` minutes; insert items with snapshot name/label/price; trim notes to 140 chars.
  - `getVisitView(db, tableCode) -> { table: {number, code}, visit: null | { id, status, billNo, orders: [{ id, status, note, createdAt, etaAt, items: [{name, option, qty, price, note}] }], canRequestBill: boolean, total: number } }` — `canRequestBill` = status open, ≥ 1 non-cancelled order, all non-cancelled served.
  - `setOrderStatus(db, orderId, status)` — allowed forward moves only: new→preparing, preparing→ready, ready→served; plus any non-served → cancelled. Else 409 `Cannot change order from X to Y`. Returns `{order, tableCode}`.
  - `requestBill(db, tableCode) -> visit` — requires `canRequestBill` (else 409 `Bill can be requested after all food is served`); sets `bill_requested`, `bill_requested_at`, `bill_no = next_bill_no` and increments the setting, in one `tx`. Idempotent if already requested.
  - `closeVisit(db, visitId)` — bill_requested → closed (`closed_at`); open → closed allowed only if no non-cancelled orders. `reopenVisit(db, visitId)` — bill_requested → open (keeps bill_no).
  - `listKitchenOrders(db) -> [{ id, status, tableNumber, createdAt, etaAt, note, items }]` — statuses new/preparing/ready, oldest first.
- Routes (public): `GET /api/t/:code/visit` → `getVisitView`; `POST /api/t/:code/orders` → 201 order; `POST /api/t/:code/bill-request` → bill (from Task 5; until then return visit). Every mutation emits `table:<code>`, `kitchen`, `admin`.

- [ ] **Step 1: Write failing tests** `test/orders.test.js`:
  - `places order and snapshots price` — order 2× Gobhi Chilli Gravy → item price 130, qty 2; then change option price to 999 → `getVisitView` total still 260.
  - `eta uses longest prep time` — order with dishes prep 5 and 30 → `etaAt - createdAt` = 30 min.
  - `two orders share one visit` — two `placeOrder` calls same table → same visit id; `getVisitView` lists 2 orders.
  - `rejects sold-out dish` — set available 0 → 409 with message `Gobhi 65 is sold out`; orders count 0.
  - `rejects bad quantities` — qty 0, -1, 1.5, 51 → 400 each; nothing saved.
  - `rejects unknown option` and `rejects empty items` → 400.
  - `status moves forward only` — new→ready 409; new→preparing→ready→served ok; served→cancelled 409.
  - `bill request needs all served` — with one order `ready` → 409; after served → ok, `billNo === 1`; second visit's bill gets `billNo === 2`.
  - `blocks orders after bill request` → 409 message exact.
  - `cancelled orders don't block bill and aren't counted` — orders A served, B cancelled → `canRequestBill` true, total excludes B.
  - `close then new visit` — `closeVisit` → `getVisitView.visit === null`; next order opens a new visit.
  - `reopen allows more orders`.
  - `HTTP: POST /api/t/:code/orders emits kitchen and table events` — spy on `events.emit`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `orders.js` and routes.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: order placement and visit lifecycle`.

---

### Task 5: Bill

**Files:**
- Create: `server/bill.js`, `test/bill.test.js`
- Modify: `server/routes/public.js`

**Interfaces:**
- Consumes: `getSettings`, visits/orders tables.
- Produces: `computeBill(db, visitId) -> { billNo, tableNumber, status, openedAt, requestedAt, restaurant: {name, tagline, address, phone, gstin}, lines: [{name, option, qty, rate, amount}], subtotal, taxes: [{label, amount}], roundOff, total, footer, upi: null | { link, qrSvg } }`.
  - `lines`: non-cancelled items merged by (name, option, rate), in first-ordered order.
  - Taxes: if `gst_percent > 0` → `[{label:'CGST @ g/2%', amount}, {label:'SGST @ g/2%', amount}]`, each `round2(subtotal * g/2 / 100)`.
  - `total = Math.round(subtotal + sum(taxes))`; `roundOff = round2(total - subtotal - sum(taxes))`.
  - `upi` when `upi_id` set: `link = upi://pay?pa=<id>&pn=<encoded name>&am=<total>&cu=INR&tn=<encoded "Bill <no>">`, `qrSvg` from `qrcode.toString(link, {type:'svg'})` (so `computeBill` is `async`).
- Routes: `POST /api/t/:code/bill-request` → `requestBill` then `computeBill`; `GET /api/t/:code/bill` → bill of active visit if `bill_requested`, else 404 `No bill yet`.

- [ ] **Step 1: Write failing tests** `test/bill.test.js`:
  - `merges identical lines` — two orders each 1× Butter Naan → one line qty 2, amount 80.
  - `no tax lines when GST unset` — `taxes` empty, `total === subtotal`, `upi === null`.
  - `GST 5% splits into CGST/SGST` — Kadai Chicken 180 + Egg Fried Rice 110 (subtotal 290) → CGST 7.25, SGST 7.25, total 305, roundOff 0.5.
  - `UPI QR when upi_id set` — `upi.link` contains `pa=rollsrise@upi&` and `am=<total>`; `qrSvg` starts with `<svg`.
  - `GET /api/t/:code/bill before request → 404`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: itemised bill with optional GST and UPI QR`.

---

### Task 6: Auth, kitchen API, admin API, live events

**Files:**
- Create: `server/auth.js`, `server/routes/kitchen.js`, `server/routes/admin.js`, `test/kitchen.test.js`, `test/admin.test.js`
- Modify: `server/menu.js` (admin CRUD), `server/app.js` (mount, SSE route)

**Interfaces:**
- Consumes: `hashSecret`, `verifySecret`, orders/bill functions, `events`.
- Produces:
  - `auth.js`: in-memory session map `token -> role ('kitchen'|'admin')`, cookie `rr_session` (httpOnly, sameSite=lax, 12 h). `login(role) -> token`; `requireRole(...roles)` middleware (admin also passes kitchen checks) → 401 `{error:'Login required'}`. Failed login → 401 after 500 ms delay.
  - `GET /api/events?channel=` — `table:<code>` open to anyone with a valid code; `kitchen` requires kitchen/admin; `admin` requires admin.
  - Kitchen: `POST /api/kitchen/login {pin}`; `GET /api/kitchen/orders` → `listKitchenOrders`; `POST /api/kitchen/orders/:id/status {status}`.
  - Admin auth: `GET /api/admin/setup-needed` → `{needed: admin_password_hash === ''}`; `POST /api/admin/setup {password}` (min 6 chars, only when needed); `POST /api/admin/login {password}`; `POST /api/admin/logout`.
  - Admin live tables: `GET /api/admin/tables/live` → `[{ number, code, state: 'free'|'ordering'|'bill_requested', visitId, total, openOrders, billNo }]`; `POST /api/admin/visits/:id/paid` → `closeVisit`; `POST /api/admin/visits/:id/reopen`; `GET /api/admin/visits/:id/bill` → `computeBill`.
  - Admin menu (`menu.js`): `listAdminDishes(db)` (incl. unavailable, excl. deleted, with category name and options); `saveDish(db, dish, id?) -> id` — validates name 1–80 chars, category exists, spice 0–3, prep 1–120, ≥ 1 option with label 1–20 chars and integer price 0–100000 → 400 otherwise; replaces options in a `tx`; `deleteDish(db, id)` (soft); `setAvailable(db, id, bool)`; categories `listCategories`, `saveCategory(db, {name, sort}, id?)`. Routes: `GET/POST /api/admin/dishes`, `PUT/DELETE /api/admin/dishes/:id`, `POST /api/admin/dishes/:id/available {available}`, `POST /api/admin/dishes/:id/photo` (multer, image/jpeg|png|webp ≤ 3 MB → `data/photos/<id>-<ts>.<ext>`, sets `photo` to `/photos/<file>`), `GET/POST /api/admin/categories`, `PUT /api/admin/categories/:id`.
  - Tables: `POST /api/admin/tables {number}` (new random code; 409 if number exists), `DELETE /api/admin/tables/:number` (409 if active visit), `GET /api/admin/tables/qr` → `[{number, url, svg}]` where `url = <origin>/t/<code>` (origin from request `Host`).
  - Settings: `GET /api/admin/settings` → all settings **except** hashes and `ai_api_key`, plus `hasApiKey`; `PUT /api/admin/settings` accepts `restaurant_name, tagline, address, phone, bill_footer, gstin, gst_percent (0–28), upi_id, ai_enabled, ai_model, ai_api_key (empty string = unchanged), kitchen_pin (4–8 digits), admin_password (≥ 6)`.
  - `GET /api/admin/ai-log?limit=100`; `GET /api/admin/today` → `{orders, billsClosed, totalBilled}` for visits closed since local midnight (server local time).
  - Every menu/table/settings change emits `admin` and a broadcast `menu` channel (customers listen to refetch menu).
- [ ] **Step 1: Write failing tests** `test/kitchen.test.js` and `test/admin.test.js`:
  - `kitchen endpoints need login` → 401; wrong PIN → 401; PIN `1234` → orders list.
  - `kitchen moves order to served` via API and customer `visit` reflects it.
  - `admin setup only once` — setup ok, second setup → 403; login with password ok.
  - `customer cannot reach admin API` → 401.
  - `save dish validation` — missing options → 400; spice 5 → 400.
  - `new dish appears in public menu`; `edit price doesn't change existing bill`.
  - `settings never return secrets` — response has no `ai_api_key`, `kitchen_pin_hash`, `admin_password_hash`; has `hasApiKey`.
  - `blank ai_api_key keeps existing key`.
  - `cannot delete table with active visit` → 409.
  - `live tables shows bill_requested state` and `paid frees table`.
  - `photo upload rejects non-image` → 400.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: kitchen and admin APIs with login and live events`.

---

### Task 7: AI menu assistant

Before coding, the implementer loads the `claude-api` skill for current SDK usage.

**Files:**
- Create: `server/ai.js`, `test/ai.test.js`
- Modify: `server/routes/public.js`, `server/index.js`

**Interfaces:**
- Consumes: `getPublicMenu`, `getSettings`.
- Produces:
  - `buildMenuContext(menu) -> string` — one line per dish: `#<id> <name> [veg|non-veg] spice <n>/3 | <option> ₹<price>, … | <ingredients> | <description> | ~<prep> min | <SOLD OUT if unavailable>`, grouped under category headings.
  - `createAssistant({ makeClient = (apiKey) => new Anthropic({apiKey}) }) -> { ask({ db, tableNumber, messages }) -> Promise<{answer: string, dishIds: number[]}> }`.
    - System prompt (exact intent): you are the menu assistant for <restaurant_name>; answer only from the menu below; if the menu doesn't say, say you're not sure and suggest asking staff; never state a dish is allergen-free or safe for an allergy — list its ingredients and suggest confirming with staff; keep answers under 80 words; reply in the customer's language (English, Tamil, Urdu or Hindi); never invent prices or dishes. Respond only with JSON `{"answer": string, "dishIds": number[]}` where dishIds are dishes you recommend or discuss.
    - `messages`: last 10, each `{role:'user'|'assistant', content ≤ 500 chars}`; last must be `user`.
    - Parse JSON; on parse failure use raw text as `answer`, `dishIds: []`. Filter `dishIds` to existing, non-deleted, available dishes.
    - Write `ai_log` row.
    - Rate limit: 20 questions per table per rolling hour → `HttpError(429, 'Too many questions. Please ask our staff.')`.
    - AI disabled or no key → `HttpError(503, 'Assistant unavailable')`; network/API error → 503 same message (log the real error to console).
  - Route `POST /api/t/:code/ask {messages}` → `{answer, dishIds}`.
- [ ] **Step 1: Write failing tests** `test/ai.test.js` with a fake client whose `messages.create` records the request and returns `{content:[{type:'text', text: JSON.stringify({answer:'Spicy!', dishIds:[<id>, 99999]})}]}`:
  - `menu context includes prices and veg flags` — contains `Gobhi Chilli [veg]` and `Dry ₹110`.
  - `returns answer and filters dish ids` — 99999 dropped.
  - `uses configured model and sends menu in system prompt`.
  - `503 when disabled`; `503 when client throws`.
  - `429 after 20 questions from one table`; other table unaffected.
  - `logs question and answer`.
  - `non-JSON reply falls back to text`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: AI menu assistant grounded in menu data`.

---

### Task 8: Customer web app

**Files:**
- Create: `public/shared.css`, `public/index.html`, `public/app.js`, `public/sounds/` (none needed here)
- Test: covered by Task 11 e2e; manual check steps below.

**Interfaces:**
- Consumes: `/api/menu`, `/api/tables`, `/api/tables/:code`, `/api/t/:code/{visit,orders,bill-request,bill,ask}`, `/api/events?channel=table:<code>` and `channel=menu`.

Behaviour (spec §4.1):
- Table: from `/t/<code>` URL, else `localStorage.rr_table` (try/catch), else table-grid picker. "Change table" link in header.
- Views (hash routing `#menu`, `#cart`, `#orders`, `#bill`): sticky header (name, `Table N`, cart count), sticky category chips that scroll to sections, search box, Veg-only toggle.
- Dish row: green/red veg dot, name, price or `from ₹X`, chilli icons for spice, `Add` button; sold out greyed with "Sold out".
- Dish sheet (bottom sheet): photo if any, description, ingredients chips, `~N min`, option radio buttons with prices, qty stepper, note field, `Add · ₹total`; 🔊 button uses `speechSynthesis.speak` of "<name>. <description>. Made with <ingredients>. Takes about N minutes." — hidden if `speechSynthesis` missing.
- Cart persisted per table in `localStorage` (try/catch). Place order → on 409/400 show the server message and refetch menu.
- Orders view: each order card with status steps Received → Preparing → Ready → Served, ETA "Ready by 8:42 PM"; `Ask for bill` button enabled per `canRequestBill`, with explanation text when disabled.
- Bill view: renders `computeBill` fields as a receipt; UPI QR + "Pay with any UPI app" when present; banner "Bill requested — staff will come to you". Keep last bill in `localStorage` so it still shows after staff close the visit, with "Paid — thank you!".
- Assistant: floating "Ask about the menu" button only if `aiEnabled`; chat panel; each assistant answer shows "Add" chips for `dishIds` (open dish sheet) and a 🔊 button; on 503 hide the button for this page session. Mic button only when `window.isSecureContext && (window.SpeechRecognition || window.webkitSpeechRecognition)`.
- Live: `EventSource` on `table:<code>` and `menu`; on `changed` or `open` refetch visit/menu.
- All money via `formatRupees(n)` → `₹1,160` / `₹27.63` (`en-IN`).
- All user/admin-entered text inserted with `textContent` (never `innerHTML`).

- [ ] **Step 1:** Implement the page.
- [ ] **Step 2:** Run `npm start`, open `http://localhost:3000/t/<table1 code>` at 390×844 with Playwright screenshot; check: categories show, Gobhi Chilli sheet offers Dry ₹110 / Gravy ₹130, order placed appears in Orders as Received.
- [ ] **Step 3:** Commit `feat: customer ordering app`.

---

### Task 9: Kitchen screen

**Files:**
- Create: `public/kitchen.html`, `public/kitchen.js`, `public/sounds/new-order.wav` (short generated beep)

Behaviour (spec §4.2): PIN login form if API returns 401. Three columns New / Preparing / Ready (stack vertically under 700 px). Card: big `Table N`, minutes since placed (updates every 30 s, turns red past ETA), items `2 × Gobhi Chilli (Gravy)` with notes, order note. Primary button per column: `Start` / `Ready` / `Served`; small `Cancel` with `confirm()`. New order id not seen before → play sound + flash card 3 s. Browser blocks audio until a tap: show "Tap to enable sound" banner until first interaction. SSE `kitchen` channel; refetch on `changed` and `open`. Wake lock (`navigator.wakeLock` if available, try/catch).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Manual check with server running: place order from customer page → appears in New within 2 s; move through to Served; customer page shows each step.
- [ ] **Step 3:** Commit `feat: kitchen order board`.

---

### Task 10: Admin page

**Files:**
- Create: `public/admin.html`, `public/admin.js`, `public/sounds/bill.wav`

Behaviour (spec §4.3): first-run "Create admin password" form when `setup-needed`; else login. Tabs:
- **Tables** (default): card per table with state colour (free grey / ordering amber / bill requested red, pulsing + sound), total, `View bill` (opens bill modal with `Print` → `window.print()` receipt CSS), `Mark paid & free table` (confirm), `Reopen` for bill-requested. Header strip shows `Today: N bills · ₹X`.
- **Menu:** category filter + search; rows with veg dot, name, prices, available toggle, Edit, Delete (confirm). Dish form: name, category select, veg/non-veg, spice 0–3, description, ingredients (comma list), prep minutes, options rows (label + price, add/remove, at least one), photo upload, available. Categories sub-section: add/rename/reorder (sort number).
- **QR codes:** add/remove table; printable sheet, one card per table: restaurant name, `Table N`, QR SVG, "Scan to order". Print CSS: 2 per A4 row.
- **Settings:** restaurant info, GST % + GSTIN, UPI ID, kitchen PIN, change admin password, AI on/off, API key (password field, placeholder "saved" when `hasApiKey`), model. Note under AI: "Needs internet. Ordering works without it."
- **AI questions:** table of recent questions/answers.
SSE `admin` channel; refetch current tab on `changed`/`open`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Manual check: create password, add a dish "Test Biryani" ₹150 → visible on customer page live; mark it sold out → customer sees Sold out; full order → bill requested shows red + sound → Mark paid → table free; set GST 5 → next bill shows CGST/SGST.
- [ ] **Step 3:** Commit `feat: admin page for tables, menu, QR codes and settings`.

---

### Task 11: Windows launcher, backups, README, end-to-end test

**Files:**
- Create: `server/index.js` (finalise), `server/backup.js`, `start.bat`, `README.md`, `test/backup.test.js`, `test/e2e/order-flow.spec.js`, `playwright.config.js`

**Interfaces:**
- Produces: `backupDb(db, dir, keep = 14) -> string` — `VACUUM INTO '<dir>/rollsrise-YYYY-MM-DD.db'` (overwrite same day), delete oldest beyond `keep`. `server/index.js`: `PORT` (3000), `DATA_DIR` (`./data`); opens `data/rollsrise.db`, `seedIfEmpty`, backup at start and every 24 h, listens on `0.0.0.0`, prints every LAN IPv4 as `Customers: http://<ip>:<port>`, `Kitchen: …/kitchen`, `Admin: …/admin`.
- `start.bat`: `cd /d %~dp0`; if `node` missing → message with nodejs.org link + `pause`; if no `node_modules` → `npm install --omit=dev`; `start "" http://localhost:3000/admin`; `node server\index.js`; `pause` on exit.

- [ ] **Step 1: Write failing test** `test/backup.test.js`: `creates dated backup and keeps 14` — pre-create 15 old dated files, run → 14 remain incl. today's; today's file opens as a db with 13 categories.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `backup.js`, `index.js`. **Step 4:** Run → PASS.
- [ ] **Step 5: E2E test** `test/e2e/order-flow.spec.js` (server started by `playwright.config.js` `webServer` with temp `DATA_DIR`): customer at table 1 adds Gobhi Chilli (Gravy) ×2 and Butter Naan ×1, places order → kitchen (PIN 1234) sees `Table 1` card, taps Start/Ready/Served → customer `Ask for bill` enabled → bill shows total `₹300` and `Bill 1`. Run `npm run e2e` → PASS.
- [ ] **Step 6:** `README.md` for the owner: install Node.js 24 LTS on the Windows laptop; copy folder; double-click `start.bat`; allow Windows Firewall prompt (Private networks); set a fixed IP for the laptop in the router (DHCP reservation); first visit `/admin` to create password; change kitchen PIN; print QR sheet; laptop power settings "never sleep" while plugged in; where backups are; how to turn on AI (get API key at console.anthropic.com, paste in Settings); voice input needs HTTPS (optional, later); list of prices to verify (non-veg soups, breads, shawarma column, burgers, Kathi Roll veg/non-veg).
- [ ] **Step 7:** Run `npm test` and `npm run e2e` → all PASS.
- [ ] **Step 8:** Commit `feat: windows launcher, daily backups, README and e2e test`.
