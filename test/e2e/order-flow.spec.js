const { test, expect } = require('@playwright/test');

test('table order goes to the kitchen and comes back as a bill', async ({ browser, request }) => {
  const tables = await (await request.get('/api/tables')).json();
  const t1 = tables.find(t => t.number === 1);

  // Customer at table 1 on a phone
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`/t/${t1.code}`);
  await expect(phone.locator('#tableNo')).toHaveText('1');
  await phone.locator('.dish-info', { hasText: 'Gobhi Chilli' }).first().click();
  await phone.locator('label.option', { hasText: 'Gravy' }).click();
  await phone.click('#qtyPlus');
  await expect(phone.locator('#dishAdd')).toHaveText('Add · ₹260');
  await phone.click('#dishAdd');
  await phone.locator('.dish', { hasText: 'Butter Naan' }).locator('.add').click();
  await phone.click('#cartBar');
  await phone.getByRole('button', { name: /Place order · ₹300/ }).click();
  await expect(phone.locator('.order-card .pill')).toHaveText('Received');
  await expect(phone.getByRole('button', { name: 'Ask for bill' })).toBeDisabled();

  // Kitchen tablet
  const kitchen = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await kitchen.goto('/kitchen');
  await kitchen.fill('#pin', '1234');
  await kitchen.click('text=Open kitchen screen');
  const card = kitchen.locator('.card', { hasText: 'Table 1' });
  await expect(card).toContainText('2 ×Gobhi Chilli (Gravy)');
  for (const step of ['Start', 'Ready', 'Served']) {
    await kitchen.locator('.card', { hasText: 'Table 1' }).getByRole('button', { name: step }).click();
  }
  await expect(kitchen.locator('.card', { hasText: 'Table 1' })).toHaveCount(0);

  // Customer sees it served (live) and asks for the bill
  await expect(phone.locator('.order-card .pill')).toHaveText('Served');
  await phone.getByRole('button', { name: 'Ask for bill' }).click();
  await expect(phone.locator('.receipt')).toContainText('Bill 1');
  await expect(phone.locator('.receipt .grand')).toContainText('₹300');
});
