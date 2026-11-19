# Rolls Rise Signature — Table Ordering System: Design

Date: 2026-11-19
Status: Approved by owner 2026-11-19

## 1. Intent

Rolls Rise Signature (Iqbal Road, Vaniyambadi — Indian / Chinese / Arabian, open 12:00 PM – 11:00 PM)
wants customers to order from their table on their own phone, with the order going straight to a
screen in the kitchen. No waiter writes orders down. When the meal is done, the customer asks for
the bill from the same page and sees an itemised bill.

Customers should also be able to learn about any dish — what it is, what goes into it, how long it
takes — by reading, by having it read aloud, or by asking an AI menu assistant.

Owner/staff must be able to manage the menu themselves (add dishes, change prices, mark sold out)
without a developer.

Success looks like: a customer scans the table QR, orders in under a minute, the kitchen sees it
instantly, and the bill at the end matches what was ordered.

### Goals
- Customer ordering from phone, by table, over the restaurant Wi-Fi.
- Kitchen screen showing incoming orders live.
- Bill on request, itemised, on the customer's phone.
- Rich dish details: description, ingredients, prep time, veg/non-veg, spice level, read-aloud.
- AI menu assistant (chat), switchable on/off, answers only from the menu data.
- Admin page to manage dishes, tables, settings.
- Full current menu (~150 items) pre-loaded, with draft descriptions/ingredients/prep times.

### Non-goals (v1)
- Online payment processing (we show a UPI QR; payment is confirmed by staff, not by the system).
- Delivery / takeaway / party orders.
- Inventory or stock tracking, staff accounts with roles, sales reports beyond a simple daily total.
- Printing (kitchen tickets or bills). Can be added later.
- Native mobile apps.

### Anti-goals (would be a failure even if it "works")
- Ordering stops working when the internet is down. Ordering, kitchen and bills must run on the
  local network alone; only the AI chat may depend on the internet.
- The AI invents facts (e.g. calls a chicken dish vegetarian, makes up an ingredient or a price).
- Customers can see or change another table's order, or reach the admin/kitchen pages.
- Staff need a developer to change a price.

## 2. Constraints

- Runs on one computer inside the restaurant; customers connect via restaurant Wi-Fi.
- Customer devices are ordinary Android/iPhone browsers; nothing to install.
- Site is served over plain HTTP on the local network (see §8 on voice input).
- Low-maintenance: the owner must be able to start it by double-clicking / one command, and it
  must survive a restart without losing the menu or open orders.
- Prices in ₹, whole rupees.

## 3. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Written dish details + phone read-aloud only | Works offline, free, never wrong; no follow-up questions |
| B | AI chat assistant only | Conversational; needs internet + paid API; can occasionally err |
| **C (chosen)** | **A always, plus AI chat as an admin-switchable add-on** | Best experience when online, still fully works offline |

Owner picked C after asking which is best "in today's era". Rationale: customers increasingly
expect to just ask; but the core business (ordering, bills) must never depend on the internet,
and the AI needs the written details anyway as its source of truth.

Technical stack (builder's call, stated here): **Node.js + Express + SQLite** (single file DB,
`better-sqlite3`), **plain HTML/CSS/JavaScript** front-end with no build step, **Server-Sent
Events** for live updates, **Claude API** (`@anthropic-ai/sdk`, a fast/low-cost Claude model such
as `claude-haiku-5-5`) for the chat. Chosen because it is one process, one data file, trivial to
back up, and needs no database server or front-end tooling on the restaurant PC.

## 4. Who uses it, and the screens

### 4.1 Customer (phone) — `/`
1. **Table pick.** Opened via the table's QR code (`/t/<code>`) → table is set automatically.
   Opened without a code → grid of table numbers to tap. Table is remembered on that phone for
   the visit.
2. **Menu.** Header: logo, table number, "Ask about the menu" button (only if AI is on and
   reachable). Sticky category bar (Soups, Starters – Veg, Starters – Non-Veg, Tandoor & BBQ,
   Combos, Burgers, Rice, Noodles, Main Course – Veg, Main Course – Non-Veg, Breads, Shawarma,
   Rolls). Search box. Veg-only toggle.
   Each dish row: veg/non-veg dot, name, price (or "from ₹X"), spice level, "Add" button.
   Sold-out dishes greyed out, not orderable.
3. **Dish details** (tap a dish): description, ingredients list, approx. prep time, spice level,
   size options with prices, 🔊 "Read aloud" button (browser speech synthesis), quantity, note
   ("less spicy"), Add.
4. **Cart → Place order.** Review items, total, optional note. Confirm.
5. **My orders.** All orders placed from this table in the current visit, each with live status:
   *Received → Preparing → Ready → Served*, plus estimated ready time. Customer can order more
   rounds. **"Ask for bill"** button enabled once every order is Served (or Cancelled).
6. **Bill.** Shown after asking: restaurant name/address/phone, table, date/time, bill number,
   every item (name, size, qty, rate, amount), subtotal, taxes/charges if configured, grand total,
   UPI QR to pay (if UPI ID set), "Thank you for dining with us." Status shows "Bill requested —
   staff will come to you" until staff mark it paid.

### 4.2 Kitchen — `/kitchen` (PIN protected)
Large-text board meant for a tablet/TV. Columns: **New**, **Preparing**, **Ready**. Each card:
table number (big), time since placed, items with size and qty, notes. One tap moves a card to
the next column; from Ready, tap "Served" to clear it. New orders play a sound and flash.
Kitchen can also cancel an item/order (with confirm). Updates live, no refresh. Nothing about
bills here — the kitchen screen is only orders, as requested.

### 4.3 Admin — `/admin` (password protected)
- **Live tables:** each table's state (free / ordering / bill requested / unpaid), running total,
  "View bill", **"Mark paid & free table"**. Bill requests appear here with a sound. This is the
  counter's screen.
- **Dishes:** list with search and category filter; add/edit form with fields:
  name, category, veg/non-veg, spice level (0–3), description, ingredients (comma list),
  prep time (minutes), sizes & prices (one or more rows: e.g. *Regular 110*, or *Dry 110 /
  Gravy 130*, or *Full 440 / Half 220 / Qtr 120*), optional photo, available (sold-out toggle),
  display order. Categories can be added/renamed/reordered.
- **Tables:** add/remove tables, print sheet of QR codes (one per table).
- **Settings:** restaurant name, address, phone, bill footer, GSTIN and tax % (optional),
  UPI ID (optional), kitchen PIN, admin password, AI assistant on/off, AI API key.
- **AI questions log:** recent customer questions and answers, to spot menu confusion.
- **Today:** count of orders and total billed today (simple).

## 5. How an order moves

```
Customer picks table ─▶ table "visit" opens (if none open)
Customer places order ─▶ status NEW ─▶ kitchen screen (sound)
Kitchen taps ─▶ PREPARING ─▶ READY ─▶ SERVED      (customer sees each step live)
Customer taps "Ask for bill" (all orders served) ─▶ visit = BILL_REQUESTED ─▶ admin alert
Bill is generated from all orders in the visit (prices frozen at order time)
Staff collect payment ─▶ "Mark paid & free table" ─▶ visit CLOSED, table free
```

- Several phones at one table share the same visit and the same bill.
- New orders are blocked once the bill is requested (customer sees "Bill requested"; staff can
  re-open if they want to order more).
- Estimated ready time for an order = placed time + longest prep time among its items.
- Prices and names are copied into the order when placed, so editing the menu later never
  changes an existing order or bill.

## 6. Data

- `categories` (id, name, sort)
- `dishes` (id, category_id, name, is_veg, spice, description, ingredients, prep_minutes,
  photo, available, sort)
- `dish_options` (id, dish_id, label, price, sort) — every dish has ≥ 1 option
- `tables` (id, number, qr_code)
- `visits` (id, table_id, status open|bill_requested|closed, opened_at, bill_no, closed_at)
- `orders` (id, visit_id, status new|preparing|ready|served|cancelled, note, created_at, updated_at)
- `order_items` (id, order_id, dish_name, option_label, price, qty, note)
- `settings` (key, value)
- `ai_log` (id, table, question, answer, created_at)

## 7. AI menu assistant

- Server-side only: the browser talks to our server, our server calls the Claude API with the
  key stored in settings. Key never reaches customer phones.
- Each request sends the current menu (names, categories, options/prices, veg flag, spice,
  ingredients, description, availability) plus the customer's question and short chat history.
  System instruction: answer only from this menu; if unsure, say so and suggest asking staff;
  never claim allergen safety beyond the listed ingredients; keep answers short; reply in the
  customer's language (English, Tamil, Urdu, Hindi).
- Can suggest dishes and return "add to cart" buttons for dishes it mentions; the customer still
  confirms in the cart. The AI never places orders on its own.
- Each answer can be read aloud with the 🔊 button.
- If AI is off, the key is missing, or the internet is down: the button is hidden; nothing else
  is affected. Basic rate limit per table to control cost.
- Customer **voice input** (speaking a question) — see §8.

## 8. Voice

- **Read-aloud** (dish details, AI answers): browser speech synthesis. Works over local HTTP,
  offline, free. Language voice depends on the phone.
- **Speaking a question** to the assistant needs microphone access, which browsers only allow on
  HTTPS. Over plain local HTTP it is unavailable. v1 ships with a mic button that appears only
  when the page is served over HTTPS; enabling HTTPS on the local network needs a domain name
  pointing to the restaurant PC and a certificate (setup guide included, optional).

## 9. Security (local network)
- Admin pages behind a password, kitchen behind a PIN (session cookie).
- Customer actions limited to their own table's open visit; table QR codes are random so a
  customer can't easily target another table by typing a URL.
- Admin can see and cancel any order, so mistakes are fixable.

## 10. Menu data
- All items from the two menu boards are pre-loaded with their prices and size options.
- Draft description, ingredients, prep time, veg flag and spice level are written for every dish;
  the owner reviews and corrects them in Admin.
- Prices to verify (photo was unclear or misaligned): non-veg soup prices, bread prices
  (Khubus ₹15 assumed), the shadowed shawarma column, Crispy Chicken Burger ₹130 /
  Shawarma Burger ₹100.

## 11. Running it
- One command / double-click start script; opens on port 80 (or 3000) on the restaurant PC.
- The PC needs a fixed local IP on the router so table QR codes keep working.
- Daily automatic backup copy of the database file.
- README with setup steps for the owner.

## 12. Owner answers
- GST applies; GSTIN and rate will be entered later in Settings. Bill shows GST lines only once set.
- Runs on a **Windows laptop**: provide `start.bat` (double-click) and Windows setup steps.
- **6 tables**, numbered 1–6, pre-created.
- UPI ID will be added later in Settings; bill shows UPI QR only once set.

## 13. Visual theme (owner chose Option A, "Printed menu")
- Paper `#FAF8F5`, white surfaces `#FFFFFF`, ink `#1A1A1A`, muted `#6E6A64`, lines `#E6E1DA`, deep red accent `#9B1C1C`.
- Headings: Playfair Display; body: Jost; section titles as on the card: script word ("Signature",
  "Flavourful", "Aromatic"…) in Great Vibes above spaced capitals ("STARTERS"), with a thin black rule.
- Black-and-red double vertical line down the left edge of the customer page, like the card.
- Square-ish corners (2–4px). Veg/non-veg dots in standard green/red.
- Kitchen screen: dark background, large white text, deep red accent.
- Fonts are bundled locally (no internet needed).

## 14. Left to the builder
Exact wording of screens, sound choice, file layout, test approach.
