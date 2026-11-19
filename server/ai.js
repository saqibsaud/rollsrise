const Anthropic = require('@anthropic-ai/sdk');
const { getPublicMenu } = require('./menu');
const { getSettings } = require('./settings');
const { HttpError } = require('./errors');

const MAX_HISTORY = 10;
const MAX_CHARS = 500;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function buildMenuContext(menu) {
  const lines = [];
  for (const c of menu.categories) {
    lines.push(`## ${c.name}`);
    for (const d of c.dishes) {
      const opts = d.options.map(o => `${o.label} ₹${o.price}`).join(', ');
      const parts = [
        `#${d.id} ${d.name} [${d.isVeg ? 'veg' : 'non-veg'}] spice ${d.spice}/3`,
        opts,
        d.ingredients.join(', '),
        d.description,
        `~${d.prepMinutes} min`,
      ];
      if (!d.available) parts.push('SOLD OUT');
      lines.push(parts.join(' | '));
    }
  }
  return lines.join('\n');
}

function systemPrompt(restaurantName, menuText) {
  return `You are the menu assistant for ${restaurantName}, a restaurant serving Indian, Chinese and Arabian food. Customers ask you questions from their table on their phone.

Rules:
- Answer only from the menu below. If the menu doesn't say, say you're not sure and suggest asking our staff.
- Never say a dish is allergen-free or safe for an allergy. List its ingredients from the menu and suggest confirming with staff.
- Never invent dishes or prices. Dishes marked SOLD OUT can't be ordered today.
- Keep answers under 80 words, friendly and plain.
- Reply in the customer's language (English, Tamil, Urdu or Hindi).
- You can't place orders. Customers add dishes to their cart themselves.

Respond with only a JSON object, no other text: {"answer": string, "dishIds": number[]}
dishIds lists the menu ids (the number after #) of dishes you recommend or talk about, at most 5.

MENU (id, name, veg flag, spice, sizes and prices, ingredients, description, prep time):
${menuText}`;
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) throw new HttpError(400, 'Ask a question');
  let msgs = messages.slice(-MAX_HISTORY).map(m => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m?.content === 'string' ? m.content.trim().slice(0, MAX_CHARS) : '',
  })).filter(m => m.content !== '');
  while (msgs.length && msgs[0].role !== 'user') msgs = msgs.slice(1);
  if (!msgs.length || msgs.at(-1).role !== 'user') throw new HttpError(400, 'Ask a question');
  return msgs;
}

function parseReply(text) {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try {
    const obj = JSON.parse(stripped);
    if (obj && typeof obj.answer === 'string') {
      return { answer: obj.answer, dishIds: Array.isArray(obj.dishIds) ? obj.dishIds.filter(Number.isInteger) : [] };
    }
  } catch { /* not JSON: use the text as is */ }
  return { answer: text.trim(), dishIds: [] };
}

function createAssistant({ makeClient = (apiKey) => new Anthropic({ apiKey, maxRetries: 1, timeout: 30000 }), log = console.error } = {}) {
  const hits = new Map(); // table number -> timestamps
  let cachedKey = null;
  let client = null;

  function checkRate(table) {
    const now = Date.now();
    const recent = (hits.get(table) || []).filter(t => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) throw new HttpError(429, 'Too many questions. Please ask our staff.');
    recent.push(now);
    hits.set(table, recent);
  }

  async function ask({ db, tableNumber, messages }) {
    const s = getSettings(db);
    if (!s.ai_enabled || !s.ai_api_key) throw new HttpError(503, 'Assistant unavailable');
    const msgs = cleanMessages(messages);
    checkRate(tableNumber);
    if (cachedKey !== s.ai_api_key) { client = makeClient(s.ai_api_key); cachedKey = s.ai_api_key; }

    const menu = getPublicMenu(db);
    let response;
    try {
      response = await client.messages.create({
        model: s.ai_model,
        max_tokens: 2000,
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: systemPrompt(s.restaurant_name, buildMenuContext(menu)), cache_control: { type: 'ephemeral' } }],
        messages: msgs,
      });
    } catch (err) {
      log('AI assistant error:', err?.status ?? '', err?.message ?? err);
      throw new HttpError(503, 'Assistant unavailable');
    }

    let result;
    if (response.stop_reason === 'refusal') {
      result = { answer: "Sorry, I can't help with that. Please ask our staff.", dishIds: [] };
    } else {
      const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      result = parseReply(text || 'Sorry, I could not answer that. Please ask our staff.');
    }
    const orderable = new Set(menu.categories.flatMap(c => c.dishes.filter(d => d.available).map(d => d.id)));
    result.dishIds = [...new Set(result.dishIds)].filter(id => orderable.has(id)).slice(0, 5);

    db.prepare('INSERT INTO ai_log(table_number, question, answer, created_at) VALUES (?, ?, ?, ?)')
      .run(tableNumber, msgs.at(-1).content, result.answer, new Date().toISOString());
    return result;
  }

  return { ask };
}

module.exports = { buildMenuContext, createAssistant, parseReply };
