const SESSION_COOKIE = "shopping_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function onRequest(context) {
  const { request, env, params } = context;
  const path = normalizePath(params.path);

  try {
    requireConfiguration(env);

    if (path === "login" && request.method === "POST") return login(request, env);
    if (path === "session" && request.method === "GET") return sessionStatus(request, env);

    if (!(await isAuthenticated(request, env))) {
      return json({ error: "Authentication required." }, 401);
    }

    if (path === "logout" && request.method === "POST") return logout();
    if (path === "catalog" && request.method === "GET") return getCatalog(request, env);
    if (path === "catalog" && request.method === "POST") return createCatalogItem(request, env);
    if (path.startsWith("catalog/") && request.method === "PUT") return updateCatalogItem(request, env, pathPart(path, 1));
    if (path.startsWith("catalog/") && request.method === "DELETE") return deleteCatalogItem(env, pathPart(path, 1));
    if (path === "list" && request.method === "GET") return getList(env);
    if (path === "list" && request.method === "POST") return createListItem(request, env);
    if (path.startsWith("list/") && request.method === "PUT") return updateListItem(request, env, pathPart(path, 1));
    if (path.startsWith("list/") && request.method === "DELETE") return deleteListItem(env, pathPart(path, 1));
    if (path === "finish" && request.method === "POST") return finishShopping(env);
    if (path === "history" && request.method === "GET") return getHistory(request, env);
    if (path.startsWith("history/") && request.method === "GET") return getTrip(env, pathPart(path, 1));
    if (path.startsWith("history/") && request.method === "PUT") return updateTrip(request, env, pathPart(path, 1));

    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("Shopping API error", error);
    return json({ error: error.publicMessage || "Something went wrong." }, error.status || 500);
  }
}

function requireConfiguration(env) {
  if (!env.SHOPPING_DB || !env.SHOPPING_PASSWORD || !env.SESSION_SECRET) {
    throw publicError("The shopping service is not configured.", 503);
  }
}

async function login(request, env) {
  const body = await readJson(request);
  if (!body.password || !(await safeEqual(String(body.password), env.SHOPPING_PASSWORD))) {
    return json({ error: "Incorrect password." }, 401);
  }

  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expires);
  const signature = await sign(payload, env.SESSION_SECRET);
  return json({ authenticated: true }, 200, {
    "Set-Cookie": `${SESSION_COOKIE}=${payload}.${signature}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`,
  });
}

async function sessionStatus(request, env) {
  return json({ authenticated: await isAuthenticated(request, env) });
}

function logout() {
  return json({ authenticated: false }, 200, {
    "Set-Cookie": `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`,
  });
}

async function getCatalog(request, env) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  const statement = query
    ? env.SHOPPING_DB.prepare("SELECT * FROM catalog_items WHERE name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 50").bind(`%${escapeLike(query)}%`)
    : env.SHOPPING_DB.prepare("SELECT * FROM catalog_items ORDER BY name LIMIT 500");
  const result = await statement.all();
  return json({ items: result.results.map(serializeCatalogItem) });
}

async function createCatalogItem(request, env) {
  const body = await readJson(request);
  const name = cleanName(body.name);
  const categories = cleanCategories(body.categories);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  try {
    await env.SHOPPING_DB.prepare(
      "INSERT INTO catalog_items (id, name, categories, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, name, JSON.stringify(categories), now, now).run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw publicError("That item is already in the database.", 409);
    throw error;
  }
  return json({ item: { id, name, categories } }, 201);
}

async function updateCatalogItem(request, env, id) {
  const body = await readJson(request);
  const name = cleanName(body.name);
  const categories = cleanCategories(body.categories);
  const now = new Date().toISOString();
  try {
    const result = await env.SHOPPING_DB.prepare(
      "UPDATE catalog_items SET name = ?, categories = ?, updated_at = ? WHERE id = ?"
    ).bind(name, JSON.stringify(categories), now, id).run();
    ensureChanged(result);
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw publicError("That item name is already in use.", 409);
    throw error;
  }
  return json({ item: { id, name, categories } });
}

async function deleteCatalogItem(env, id) {
  const result = await env.SHOPPING_DB.prepare("DELETE FROM catalog_items WHERE id = ?").bind(id).run();
  ensureChanged(result);
  return new Response(null, { status: 204 });
}

async function getList(env) {
  const result = await env.SHOPPING_DB.prepare("SELECT * FROM list_items ORDER BY created_at, name").all();
  return json({ items: result.results.map(serializeListItem) });
}

async function createListItem(request, env) {
  const body = await readJson(request);
  const name = cleanName(body.name);
  const quantity = cleanQuantity(body.quantity);
  const now = new Date().toISOString();

  let catalog = null;
  if (body.catalogItemId) {
    catalog = await env.SHOPPING_DB.prepare("SELECT * FROM catalog_items WHERE id = ?").bind(body.catalogItemId).first();
  }
  if (!catalog) {
    catalog = await env.SHOPPING_DB.prepare("SELECT * FROM catalog_items WHERE name = ? COLLATE NOCASE").bind(name).first();
  }
  if (!catalog) {
    const catalogId = crypto.randomUUID();
    await env.SHOPPING_DB.prepare(
      "INSERT INTO catalog_items (id, name, categories, created_at, updated_at) VALUES (?, ?, '[]', ?, ?)"
    ).bind(catalogId, name, now, now).run();
    catalog = { id: catalogId, name, categories: "[]" };
  }

  const existing = await env.SHOPPING_DB.prepare(
    "SELECT * FROM list_items WHERE catalog_item_id = ? AND state = 'list' LIMIT 1"
  ).bind(catalog.id).first();
  if (existing) {
    await env.SHOPPING_DB.prepare("UPDATE list_items SET quantity = ?, updated_at = ? WHERE id = ?")
      .bind(quantity, now, existing.id).run();
    return json({ item: { ...serializeListItem(existing), quantity } });
  }

  const item = {
    id: crypto.randomUUID(), catalogItemId: catalog.id, name: catalog.name, quantity,
    categories: parseCategories(catalog.categories), state: "list", createdAt: now,
  };
  await env.SHOPPING_DB.prepare(
    "INSERT INTO list_items (id, catalog_item_id, name, quantity, categories, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'list', ?, ?)"
  ).bind(item.id, item.catalogItemId, item.name, item.quantity, JSON.stringify(item.categories), now, now).run();
  return json({ item }, 201);
}

async function updateListItem(request, env, id) {
  const body = await readJson(request);
  const fields = [];
  const bindings = [];
  if (body.quantity !== undefined) { fields.push("quantity = ?"); bindings.push(cleanQuantity(body.quantity)); }
  if (body.state !== undefined) {
    if (!["list", "cart"].includes(body.state)) throw publicError("Invalid list state.", 400);
    fields.push("state = ?"); bindings.push(body.state);
  }
  if (!fields.length) throw publicError("No changes supplied.", 400);
  fields.push("updated_at = ?"); bindings.push(new Date().toISOString(), id);
  const result = await env.SHOPPING_DB.prepare(`UPDATE list_items SET ${fields.join(", ")} WHERE id = ?`).bind(...bindings).run();
  ensureChanged(result);
  const item = await env.SHOPPING_DB.prepare("SELECT * FROM list_items WHERE id = ?").bind(id).first();
  return json({ item: serializeListItem(item) });
}

async function deleteListItem(env, id) {
  const result = await env.SHOPPING_DB.prepare("DELETE FROM list_items WHERE id = ?").bind(id).run();
  ensureChanged(result);
  return new Response(null, { status: 204 });
}

async function finishShopping(env) {
  const cart = await env.SHOPPING_DB.prepare("SELECT * FROM list_items WHERE state = 'cart' ORDER BY created_at").all();
  if (!cart.results.length) throw publicError("There are no items in the cart.", 400);

  const tripId = crypto.randomUUID();
  const purchasedAt = new Date().toISOString();
  const statements = [
    env.SHOPPING_DB.prepare("INSERT INTO shopping_trips (id, purchased_at, metadata) VALUES (?, ?, '')").bind(tripId, purchasedAt),
    ...cart.results.map(item => env.SHOPPING_DB.prepare(
      "INSERT INTO history_items (id, trip_id, catalog_item_id, name, quantity, categories) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), tripId, item.catalog_item_id, item.name, item.quantity, item.categories)),
    env.SHOPPING_DB.prepare("DELETE FROM list_items WHERE state = 'cart'"),
  ];
  await env.SHOPPING_DB.batch(statements);
  return json({ tripId, purchasedAt, itemCount: cart.results.length }, 201);
}

async function getHistory(request, env) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (!query) {
    const result = await env.SHOPPING_DB.prepare(`
      SELECT t.id, t.purchased_at, t.metadata, COUNT(h.id) AS item_count
      FROM shopping_trips t LEFT JOIN history_items h ON h.trip_id = t.id
      GROUP BY t.id ORDER BY t.purchased_at DESC LIMIT 100
    `).all();
    const trips = [];
    for (const row of result.results) trips.push(await hydrateTrip(env, row));
    return json({ mode: "default", trips });
  }

  const like = `%${escapeLike(query)}%`;
  const itemHits = await env.SHOPPING_DB.prepare(`
    SELECT h.trip_id, h.name, h.quantity, h.categories, t.purchased_at
    FROM history_items h JOIN shopping_trips t ON t.id = h.trip_id
    WHERE h.name LIKE ? ESCAPE '\\' OR h.categories LIKE ? ESCAPE '\\'
    ORDER BY t.purchased_at DESC LIMIT 100
  `).bind(like, like).all();
  const metadataHits = await env.SHOPPING_DB.prepare(`
    SELECT t.id AS trip_id, t.metadata, t.purchased_at, COUNT(h.id) AS item_count
    FROM shopping_trips t LEFT JOIN history_items h ON h.trip_id = t.id
    WHERE t.metadata LIKE ? ESCAPE '\\'
    GROUP BY t.id ORDER BY t.purchased_at DESC LIMIT 100
  `).bind(like).all();
  return json({
    mode: "search",
    hits: [
      ...itemHits.results.map(row => ({ type: "item", tripId: row.trip_id, name: row.name, quantity: row.quantity, categories: parseCategories(row.categories), purchasedAt: row.purchased_at })),
      ...metadataHits.results.map(row => ({ type: "metadata", tripId: row.trip_id, metadata: row.metadata, itemCount: Number(row.item_count), purchasedAt: row.purchased_at })),
    ].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)),
  });
}

async function getTrip(env, id) {
  const row = await env.SHOPPING_DB.prepare(`
    SELECT t.id, t.purchased_at, t.metadata, COUNT(h.id) AS item_count
    FROM shopping_trips t LEFT JOIN history_items h ON h.trip_id = t.id
    WHERE t.id = ? GROUP BY t.id
  `).bind(id).first();
  if (!row) throw publicError("Shopping trip not found.", 404);
  return json({ trip: await hydrateTrip(env, row) });
}

async function updateTrip(request, env, id) {
  const body = await readJson(request);
  const metadata = String(body.metadata || "").trim().slice(0, 500);
  const result = await env.SHOPPING_DB.prepare("UPDATE shopping_trips SET metadata = ? WHERE id = ?").bind(metadata, id).run();
  ensureChanged(result);
  return json({ id, metadata });
}

async function hydrateTrip(env, row) {
  const items = await env.SHOPPING_DB.prepare("SELECT * FROM history_items WHERE trip_id = ? ORDER BY name").bind(row.id).all();
  return {
    id: row.id, purchasedAt: row.purchased_at, metadata: row.metadata,
    itemCount: Number(row.item_count),
    items: items.results.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, categories: parseCategories(item.categories) })),
  };
}

function serializeCatalogItem(row) { return { id: row.id, name: row.name, categories: parseCategories(row.categories) }; }
function serializeListItem(row) { return { id: row.id, catalogItemId: row.catalog_item_id, name: row.name, quantity: row.quantity, categories: parseCategories(row.categories), state: row.state, createdAt: row.created_at }; }
function parseCategories(value) { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function cleanCategories(value) { const values = Array.isArray(value) ? value : String(value || "").split(","); return [...new Set(values.map(item => String(item).trim()).filter(Boolean))].slice(0, 20); }
function cleanName(value) { const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 120); if (!name) throw publicError("Item name is required.", 400); return name; }
function cleanQuantity(value) { const quantity = String(value ?? "1").trim().slice(0, 40); if (!quantity) throw publicError("Quantity is required.", 400); return quantity; }
function pathPart(path, index) { const part = path.split("/")[index]; if (!part) throw publicError("Missing identifier.", 400); return part; }
function normalizePath(path) { return (Array.isArray(path) ? path.join("/") : path || "").replace(/^\/+|\/+$/g, ""); }
function escapeLike(value) { return value.replace(/[\\%_]/g, "\\$&"); }
function ensureChanged(result) { if (!result.meta?.changes) throw publicError("Record not found.", 404); }
function publicError(message, status) { const error = new Error(message); error.publicMessage = message; error.status = status; return error; }
async function readJson(request) { try { return await request.json(); } catch { throw publicError("Invalid JSON request.", 400); } }
function json(data, status = 200, headers = {}) { return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } }); }

async function isAuthenticated(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return false;
  const [expires, signature] = match[1].split(".");
  if (!expires || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, await sign(expires, env.SESSION_SECRET));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64Url(new Uint8Array(signature));
}

async function safeEqual(a, b) {
  const aHash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(a))));
  const bHash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(b))));
  let diff = 0;
  for (let i = 0; i < aHash.length; i += 1) diff |= aHash[i] ^ bHash[i];
  return diff === 0;
}

function base64Url(bytes) {
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
