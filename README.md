# Rolls Rise Signature: Table Ordering

Customers order from their table on their own phone. Orders appear on the kitchen screen right away, and customers get an itemised bill when they finish. The system runs on one Windows laptop in the restaurant and works over the restaurant Wi-Fi. Ordering, the kitchen screen and bills do not need the internet.

| Who | Opens | What they do |
|---|---|---|
| Customers | Scan the QR code on their table | Browse the menu, order, track their food, ask for the bill |
| Kitchen | `/kitchen` on a tablet or TV (PIN) | See new orders, tap Start, then Ready, then Served |
| Owner / counter | `/admin` on the laptop (password) | See tables and bills, mark tables paid, edit the menu, print QR codes, change settings |

---

## 1. One-time setup on the Windows laptop

1. **Install Node.js.** Go to <https://nodejs.org>, download the **LTS** version (24 or newer), and install it with the default options.
2. **Copy this folder** to the laptop, for example to `C:\RollsRise`.
3. **Double-click `start.bat`.** The first time, it installs what it needs. This needs internet once and takes about a minute.
4. **Allow the Windows Firewall prompt.** When Windows asks, tick **Private networks** and click **Allow**. Phones can't connect without this.
5. The admin page opens in the browser. **Create the admin password**, at least 6 characters.

The black window shows the addresses to use, for example:

```
Customers: http://192.168.1.20:3000
Kitchen:   http://192.168.1.20:3000/kitchen
Admin:     http://192.168.1.20:3000/admin
```

Keep that window open while the restaurant is open. Closing it stops ordering.

### Give the laptop a fixed address

The QR codes contain the laptop's address. If the router gives the laptop a new address, the codes stop working. In the Wi-Fi router's settings, find **DHCP reservation** (also called "address reservation" or "static lease") and reserve the laptop's current address. Your internet provider's technician can do this in a few minutes.

### Stop the laptop from sleeping

Go to **Settings → System → Power** and set **Screen and sleep → When plugged in, put my device to sleep after** to **Never**. Keep the laptop plugged in during service.

## 2. Before the first service

1. Go to **Admin → Settings**:
   - Change the **kitchen PIN**. It starts as `1234`.
   - Check the restaurant name, address and phone. They're printed on every bill.
   - Add **GST %** and **GSTIN** when you're ready. Bills then show CGST and SGST.
   - Add your **UPI ID**. Bills then show a pay-by-UPI QR code.
2. Go to **Admin → Tables & QR codes** and click **Print QR codes**. Check that the address under each code starts with the laptop's address, like `192.168…`, and not `localhost`. Place each card on its table.
3. Go to **Admin → Menu** and check the dishes. Descriptions, ingredients and prep times were written as a first draft, so please correct anything that's wrong.
   **Please check these prices.** They were hard to read on the printed menu photo:
   - Non-veg soups (Chicken Clear ₹90 through Chicken Sweet Corn ₹110)
   - Breads (Khubus ₹15 through Butter Garlic Naan ₹50)
   - The Shawarma column (it was partly in shadow)
   - Crispy Chicken Burger ₹130 and Shawarma Burger ₹100
   - Whether **Kathi Roll** is chicken (it's set as non-veg)
4. On the kitchen tablet, open the Kitchen address, enter the PIN and **tap the screen once** to turn on the new-order sound.

## 3. Daily use

- **Start of day:** double-click `start.bat`.
- **Sold out?** Go to **Admin → Menu** and untick the dish. Customers see "Sold out" straight away.
- **Bill requested:** the table turns red on **Admin → Tables** and a sound plays. Open **View bill** (you can print it), collect payment, then click **Mark paid & free table**.
- **Guests want to order after asking for the bill:** click **Reopen for more orders** on that table.
- **Mistake in an order:** the kitchen can tap **Cancel** on the order card. Cancelled orders don't appear on the bill.
- **End of day:** the top of the admin page shows today's number of orders, bills paid and total. Close the black window.

## 4. AI menu assistant (optional)

Customers can tap **Ask about the menu** and type questions like "What's not spicy?" or "Is Paneer Dragon vegetarian?", in English, Tamil, Urdu or Hindi. Answers come only from your menu data. Each answer can be read aloud.

To turn it on:
1. Create an account at <https://console.anthropic.com>, add credit, and create an **API key**.
2. In **Admin → Settings → AI menu assistant**, paste the key, tick **Turn on**, and save.

- **Internet:** the assistant needs an internet connection. If the internet drops, the button simply disappears; ordering keeps working.
- **Cost:** each question costs a small amount, billed by Anthropic. The default model is a fast, low-cost one (`claude-haiku-5-5`), and you can change it in Settings.
- **Customer questions:** see what customers asked in **Admin → Customer questions**.

**Read aloud** on each dish works on the customer's own phone, with no internet and no cost.

**Speaking questions** into the microphone needs a secure (HTTPS) connection, which a local Wi-Fi setup doesn't have by default, so the microphone button stays hidden. It needs a domain name and a certificate pointing at the laptop. Ask a developer if you want this later.

## 5. Backups

Every day the system saves a copy of everything (menu, orders, bills, settings) to `data\backups\`. It keeps the last 14 days.

To restore a backup:
1. Close the black window.
2. Copy a backup file over `data\rollsrise.db`, and delete `rollsrise.db-wal` and `rollsrise.db-shm` if they exist.
3. Start again.

Copy the `data` folder to a USB drive now and then.

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| Phones can't open the page | The phone must be on the restaurant Wi-Fi, not mobile data. Check the Windows Firewall allowed Node.js on Private networks. Check that the laptop is on and the black window is open. |
| QR codes stopped working | The laptop's address changed. Set a DHCP reservation (above) and print the QR codes again. |
| "Port 3000 is already in use" | The system is already running in another window. Use that one, or restart the laptop. |
| Kitchen screen makes no sound | Tap the kitchen screen once after opening it. Check the tablet's volume. |
| Forgot the admin password | Ask a developer to clear `admin_password_hash` in the database. The next visit to `/admin` then asks for a new password. |

---

## For developers

- Node.js 22.13+ (uses the built-in `node:sqlite`), Express 5, plain HTML/CSS/JS, no build step.
- `npm test` runs the unit and API tests. `npm run e2e` runs the browser test (needs the `@playwright/test` dev dependency and Chromium).
- `PORT` (default 3000) and `DATA_DIR` (default `./data`) are environment variables.
- Design: `docs/superpowers/specs/2026-11-19-table-ordering-design.md`. Plan: `docs/superpowers/plans/2026-11-19-table-ordering.md`.

| Path | What it holds |
|---|---|
| `server/` | API, database and business logic |
| `server/seed/menu-data.js` | The starting menu |
| `public/` | The customer page (`index.html`, `app.js`), the kitchen screen and the admin page |
| `test/` | Tests |
