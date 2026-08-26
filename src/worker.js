import {
  cleanDisplayName, cleanUsername, clearSessionCookie, createSession, getSession,
  hashPassword, randomToken, safeSecretEqual, sessionCookie, tokenHash,
  verifyPassword,
} from "./auth.js";
import { ShoppingRoom, broadcast, connectToRoom } from "./realtime.js";

export { ShoppingRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/shopping/")) return env.ASSETS.fetch(request);

    try {
      requireBindings(env);
      return await routeApi(request, env, url.pathname.slice("/api/shopping/".length).replace(/\/+$/, ""));
    } catch (error) {
      console.error("Shopping API error", error);
      return json({ error: error.publicMessage || "Something went wrong." }, error.status || 500);
    }
  },
};

async function routeApi(request, env, path) {
  const method = request.method;
  if (path === "session" && method === "GET") return sessionStatus(request, env);
  if (path === "setup" && method === "POST") return setupHousehold(request, env);
  if (path === "login" && method === "POST") return login(request, env);
  if (path === "register" && method === "POST") return register(request, env);

  const session = await getSession(request, env);
  if (!session) return json({ error: "Authentication required." }, 401);

  if (path === "logout" && method === "POST") return logout(request, env, session);
  if (path === "live" && method === "GET") return connectToRoom(request, env, session);
  if (path === "members" && method === "GET") return getMembers(env, session);
  if (path === "invitations" && method === "POST") return createInvitation(env, session);
  if (path === "note" && method === "GET") return getSharedNote(env, session);
  if (path === "note" && method === "PUT") return updateSharedNote(request, env, session);
  if (path === "catalog" && method === "GET") return getCatalog(request, env, session);
  if (path === "catalog" && method === "POST") return createCatalogItem(request, env, session);
  if (path.startsWith("catalog/") && method === "PUT") return updateCatalogItem(request, env, session, pathPart(path, 1));
  if (path.startsWith("catalog/") && method === "DELETE") return deleteCatalogItem(env, session, pathPart(path, 1));
  if (path === "suggestions" && method === "GET") return getSuggestions(env, session);
  if (path === "list" && method === "GET") return getList(env, session);
  if (path === "list" && method === "POST") return createListItem(request, env, session);
  if (path === "list/cart" && method === "POST") return moveAllItemsToCart(env, session);
  if (path.startsWith("list/") && method === "PUT") return updateListItem(request, env, session, pathPart(path, 1));
  if (path.startsWith("list/") && method === "DELETE") return deleteListItem(env, session, pathPart(path, 1));
  if (path === "finish" && method === "POST") return finishShopping(env, session);
  if (path === "history" && method === "GET") return getHistory(request, env, session);
  if (path.startsWith("history/") && method === "GET") return getTrip(env, session, pathPart(path, 1));
  if (path.startsWith("history/") && method === "PUT") return updateTrip(request, env, session, pathPart(path, 1));
  return json({ error: "Not found." }, 404);
}

async function sessionStatus(request, env) {
  const session = await getSession(request, env);
  if (session) return json({ authenticated: true, setupRequired: false, user: publicUser(session) });
  const row = await env.SHOPPING_DB.prepare("SELECT COUNT(*) AS count FROM users").first();
  return json({ authenticated: false, setupRequired: Number(row?.count || 0) === 0 });
}

async function setupHousehold(request, env) {
  const existing = await env.SHOPPING_DB.prepare("SELECT COUNT(*) AS count FROM users").first();
  if (Number(existing?.count || 0) > 0) throw publicError("Household setup has already been completed.", 409);
  if (!env.SETUP_SECRET) throw publicError("The one-time setup secret has not been configured.", 503);
  const body = await readJson(request);
  if (!(await safeSecretEqual(body.setupCode, env.SETUP_SECRET))) throw publicError("Incorrect setup code.", 401);

  const username = cleanUsername(body.username);
  const displayName = cleanDisplayName(body.displayName);
  const householdName = cleanLabel(body.householdName, "Household name", 80);
  const password = await hashPassword(body.password);
  const userId = crypto.randomUUID();
  const householdId = "household-default";
  const now = new Date().toISOString();

  await env.SHOPPING_DB.batch([
    env.SHOPPING_DB.prepare("UPDATE households SET name = ? WHERE id = ?").bind(householdName, householdId),
    env.SHOPPING_DB.prepare(`INSERT INTO users (id, username, display_name, password_hash, password_salt, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(userId, username, displayName, password.hash, password.salt, password.iterations, now),
    env.SHOPPING_DB.prepare("INSERT INTO household_members (household_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)")
      .bind(householdId, userId, now),
  ]);
  const created = await createSession(env, userId);
  return json({ authenticated: true, user: { userId, username, displayName, householdId, householdName, role: "admin" } }, 201, { "Set-Cookie": sessionCookie(created.token) });
}

async function login(request, env) {
  const body = await readJson(request);
  const username = cleanUsername(body.username);
  const user = await env.SHOPPING_DB.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND disabled_at IS NULL").bind(username).first();
  if (!user || !(await verifyPassword(String(body.password || ""), user))) throw publicError("Incorrect username or password.", 401);
  await env.SHOPPING_DB.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").bind(new Date().toISOString()).run();
  const created = await createSession(env, user.id);
  const session = await sessionForUser(env, user.id);
  return json({ authenticated: true, user: publicUser(session) }, 200, { "Set-Cookie": sessionCookie(created.token) });
}

async function register(request, env) {
  const body = await readJson(request);
  const codeHash = await tokenHash(body.inviteCode);
  const invitation = await env.SHOPPING_DB.prepare(`SELECT * FROM household_invitations WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`)
    .bind(codeHash, new Date().toISOString()).first();
  if (!invitation) throw publicError("That invitation is invalid or has expired.", 400);

  const username = cleanUsername(body.username);
  const displayName = cleanDisplayName(body.displayName);
  const password = await hashPassword(body.password);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.SHOPPING_DB.batch([
      env.SHOPPING_DB.prepare(`INSERT INTO users (id, username, display_name, password_hash, password_salt, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(userId, username, displayName, password.hash, password.salt, password.iterations, now),
      env.SHOPPING_DB.prepare("INSERT INTO household_members (household_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)")
        .bind(invitation.household_id, userId, now),
      env.SHOPPING_DB.prepare("UPDATE household_invitations SET used_at = ? WHERE token_hash = ? AND used_at IS NULL")
        .bind(now, codeHash),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw publicError("That username is already in use.", 409);
    throw error;
  }
  const created = await createSession(env, userId);
  const session = await sessionForUser(env, userId);
  await broadcast(env, invitation.household_id, "members_changed", { userId });
  return json({ authenticated: true, user: publicUser(session) }, 201, { "Set-Cookie": sessionCookie(created.token) });
}

async function logout(request, env, session) {
  await env.SHOPPING_DB.prepare("DELETE FROM user_sessions WHERE token_hash = ?").bind(session.tokenHash).run();
  return json({ authenticated: false }, 200, { "Set-Cookie": clearSessionCookie() });
}

async function getMembers(env, session) {
  const result = await env.SHOPPING_DB.prepare(`
    SELECT u.id, u.username, u.display_name, hm.role, hm.joined_at
    FROM household_members hm JOIN users u ON u.id = hm.user_id
    WHERE hm.household_id = ? AND u.disabled_at IS NULL
    ORDER BY CASE hm.role WHEN 'admin' THEN 0 ELSE 1 END, u.display_name
  `).bind(session.householdId).all();
  return json({ household: { id: session.householdId, name: session.householdName }, members: result.results.map(row => ({ id: row.id, username: row.username, displayName: row.display_name, role: row.role, joinedAt: row.joined_at })) });
}

async function createInvitation(env, session) {
  requireAdmin(session);
  const code = randomToken(18);
  const codeHash = await tokenHash(code);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 86400000);
  await env.SHOPPING_DB.prepare(`INSERT INTO household_invitations (token_hash, household_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(codeHash, session.householdId, session.userId, now.toISOString(), expiresAt.toISOString()).run();
  return json({ invitationCode: code, expiresAt: expiresAt.toISOString() }, 201);
}

async function getSharedNote(env, session) {
  const row = await env.SHOPPING_DB.prepare("SELECT note_content, note_color, note_size, note_font, note_updated_at FROM households WHERE id = ?")
    .bind(session.householdId).first();
  if (!row) throw publicError("Household not found.", 404);
  return json({ note: serializeSharedNote(row) });
}

async function updateSharedNote(request, env, session) {
  const body = await readJson(request);
  const note = {
    content: String(body.content ?? "").replace(/\r\n?/g, "\n").slice(0, 4000),
    color: cleanNoteStyle(body.color, ["default", "blue", "green", "red"], "color"),
    size: cleanNoteStyle(body.size, ["small", "medium", "large"], "size"),
    font: cleanNoteStyle(body.font, ["sans", "serif", "mono", "fun"], "font"),
    updatedAt: new Date().toISOString(),
  };
  await env.SHOPPING_DB.prepare("UPDATE households SET note_content = ?, note_color = ?, note_size = ?, note_font = ?, note_updated_at = ? WHERE id = ?")
    .bind(note.content, note.color, note.size, note.font, note.updatedAt, session.householdId).run();
  await broadcast(env, session.householdId, "note_changed", { by: session.userId, note });
  return json({ note });
}

async function getCatalog(request, env, session) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  const statement = query
    ? env.SHOPPING_DB.prepare("SELECT * FROM catalog_items WHERE household_id = ? AND name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 50").bind(session.householdId, `%${escapeLike(query)}%`)
    : env.SHOPPING_DB.prepare("SELECT * FROM catalog_items WHERE household_id = ? ORDER BY name LIMIT 500").bind(session.householdId);
  const result = await statement.all();
  return json({ items: result.results.map(serializeCatalogItem) });
}

async function createCatalogItem(request, env, session) {
  const body = await readJson(request);
  const name = cleanName(body.name);
  const categories = cleanCategories(body.categories);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  try {
    await env.SHOPPING_DB.prepare(`INSERT INTO catalog_items (id, name, categories, created_at, updated_at, household_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, name, JSON.stringify(categories), now, now, session.householdId).run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw publicError("That item is already in the database.", 409);
    throw error;
  }
  await broadcast(env, session.householdId, "catalog_changed", { by: session.userId });
  return json({ item: { id, name, categories } }, 201);
}

async function updateCatalogItem(request, env, session, id) {
  const body = await readJson(request);
  const name = cleanName(body.name);
  const categories = cleanCategories(body.categories);
  const categoryJson = JSON.stringify(categories);
  const now = new Date().toISOString();
  try {
    const result = await env.SHOPPING_DB.batch([
      env.SHOPPING_DB.prepare("UPDATE catalog_items SET name = ?, categories = ?, updated_at = ? WHERE id = ? AND household_id = ?")
        .bind(name, categoryJson, now, id, session.householdId),
      env.SHOPPING_DB.prepare("UPDATE list_items SET name = ?, categories = ?, updated_at = ? WHERE catalog_item_id = ? AND household_id = ?")
        .bind(name, categoryJson, now, id, session.householdId),
    ]);
    ensureChanged(result[0]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw publicError("That item name is already in use.", 409);
    throw error;
  }
  await broadcast(env, session.householdId, "catalog_changed", { by: session.userId });
  await broadcast(env, session.householdId, "list_changed", { by: session.userId });
  return json({ item: { id, name, categories } });
}

async function deleteCatalogItem(env, session, id) {
  const result = await env.SHOPPING_DB.prepare("DELETE FROM catalog_items WHERE id = ? AND household_id = ?").bind(id, session.householdId).run();
  ensureChanged(result);
  await broadcast(env, session.householdId, "catalog_changed", { by: session.userId });
  return new Response(null, { status: 204 });
}

async function getList(env, session) {
  const result = await env.SHOPPING_DB.prepare("SELECT * FROM list_items WHERE household_id = ? ORDER BY created_at, name").bind(session.householdId).all();
  return json({ items: result.results.map(serializeListItem) });
}

async function getSuggestions(env, session) {
  const result = await env.SHOPPING_DB.prepare(`
    SELECT
      MAX(h.catalog_item_id) AS catalog_item_id,
      COALESCE(c.name, MAX(h.name)) AS name,
      SUM(
        CASE
          WHEN CAST(TRIM(h.quantity) AS REAL) > 0 THEN CAST(TRIM(h.quantity) AS REAL)
          ELSE 1
        END
      ) AS ordered_quantity,
      MAX(t.purchased_at) AS last_purchased
    FROM history_items h
    JOIN shopping_trips t ON t.id = h.trip_id
    LEFT JOIN catalog_items c
      ON c.id = h.catalog_item_id AND c.household_id = t.household_id
    WHERE t.household_id = ?
      AND NOT EXISTS (
        SELECT 1
        FROM list_items current_item
        WHERE current_item.household_id = ?
          AND (
            (h.catalog_item_id IS NOT NULL AND current_item.catalog_item_id = h.catalog_item_id)
            OR current_item.name = COALESCE(c.name, h.name) COLLATE NOCASE
          )
      )
    GROUP BY COALESCE(h.catalog_item_id, LOWER(TRIM(h.name))), c.name
    ORDER BY ordered_quantity DESC, last_purchased DESC, name COLLATE NOCASE
    LIMIT 5
  `).bind(session.householdId, session.householdId).all();

  return json({
    items: result.results.map(row => ({
      catalogItemId: row.catalog_item_id || null,
      name: row.name,
    })),
  });
}

async function createListItem(request, env, session) {
  const body = await readJson(request);
  const name = cleanName(body.name);
  const quantity = cleanQuantity(body.quantity);
  const now = new Date().toISOString();
  let catalog = null;
  if (body.catalogItemId) catalog = await env.SHOPPING_DB.prepare("SELECT * FROM catalog_items WHERE id = ? AND household_id = ?").bind(body.catalogItemId, session.householdId).first();
  if (!catalog) catalog = await env.SHOPPING_DB.prepare("SELECT * FROM catalog_items WHERE name = ? COLLATE NOCASE AND household_id = ?").bind(name, session.householdId).first();
  if (!catalog) {
    const catalogId = crypto.randomUUID();
    await env.SHOPPING_DB.prepare(`INSERT INTO catalog_items (id, name, categories, created_at, updated_at, household_id) VALUES (?, ?, '[]', ?, ?, ?)`)
      .bind(catalogId, name, now, now, session.householdId).run();
    catalog = { id: catalogId, name, categories: "[]" };
  }
  const existing = await env.SHOPPING_DB.prepare("SELECT * FROM list_items WHERE catalog_item_id = ? AND state = 'list' AND household_id = ? LIMIT 1")
    .bind(catalog.id, session.householdId).first();
  let item;
  if (existing) {
    await env.SHOPPING_DB.prepare("UPDATE list_items SET quantity = ?, updated_at = ? WHERE id = ? AND household_id = ?")
      .bind(quantity, now, existing.id, session.householdId).run();
    item = { ...serializeListItem(existing), quantity };
  } else {
    item = { id: crypto.randomUUID(), catalogItemId: catalog.id, name: catalog.name, quantity, categories: parseCategories(catalog.categories), state: "list", createdAt: now };
    await env.SHOPPING_DB.prepare(`INSERT INTO list_items (id, catalog_item_id, name, quantity, categories, state, created_at, updated_at, household_id) VALUES (?, ?, ?, ?, ?, 'list', ?, ?, ?)`)
      .bind(item.id, item.catalogItemId, item.name, item.quantity, JSON.stringify(item.categories), now, now, session.householdId).run();
  }
  await broadcast(env, session.householdId, "list_changed", { by: session.userId });
  return json({ item }, existing ? 200 : 201);
}

async function updateListItem(request, env, session, id) {
  const body = await readJson(request);
  const fields = [];
  const bindings = [];
  if (body.quantity !== undefined) { fields.push("quantity = ?"); bindings.push(cleanQuantity(body.quantity)); }
  if (body.state !== undefined) {
    if (!["list", "cart"].includes(body.state)) throw publicError("Invalid list state.", 400);
    fields.push("state = ?"); bindings.push(body.state);
  }
  if (!fields.length) throw publicError("No changes supplied.", 400);
  fields.push("updated_at = ?"); bindings.push(new Date().toISOString(), id, session.householdId);
  const result = await env.SHOPPING_DB.prepare(`UPDATE list_items SET ${fields.join(", ")} WHERE id = ? AND household_id = ?`).bind(...bindings).run();
  ensureChanged(result);
  const item = await env.SHOPPING_DB.prepare("SELECT * FROM list_items WHERE id = ? AND household_id = ?").bind(id, session.householdId).first();
  await broadcast(env, session.householdId, "list_changed", { by: session.userId });
  return json({ item: serializeListItem(item) });
}

async function moveAllItemsToCart(env, session) {
  const result = await env.SHOPPING_DB.prepare("UPDATE list_items SET state = 'cart', updated_at = ? WHERE state = 'list' AND household_id = ?")
    .bind(new Date().toISOString(), session.householdId).run();
  const itemCount = Number(result.meta?.changes || 0);
  if (itemCount) await broadcast(env, session.householdId, "list_changed", { by: session.userId });
  return json({ itemCount });
}

async function deleteListItem(env, session, id) {
  const result = await env.SHOPPING_DB.prepare("DELETE FROM list_items WHERE id = ? AND household_id = ?").bind(id, session.householdId).run();
  ensureChanged(result);
  await broadcast(env, session.householdId, "list_changed", { by: session.userId });
  return new Response(null, { status: 204 });
}

async function finishShopping(env, session) {
  const cart = await env.SHOPPING_DB.prepare("SELECT * FROM list_items WHERE state = 'cart' AND household_id = ? ORDER BY created_at").bind(session.householdId).all();
  if (!cart.results.length) throw publicError("There are no items in the cart.", 400);
  const tripId = crypto.randomUUID();
  const purchasedAt = new Date().toISOString();
  await env.SHOPPING_DB.batch([
    env.SHOPPING_DB.prepare("INSERT INTO shopping_trips (id, purchased_at, metadata, household_id) VALUES (?, ?, '', ?)").bind(tripId, purchasedAt, session.householdId),
    ...cart.results.map(item => env.SHOPPING_DB.prepare(`INSERT INTO history_items (id, trip_id, catalog_item_id, name, quantity, categories) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), tripId, item.catalog_item_id, item.name, item.quantity, item.categories)),
    env.SHOPPING_DB.prepare("DELETE FROM list_items WHERE state = 'cart' AND household_id = ?").bind(session.householdId),
  ]);
  await broadcast(env, session.householdId, "shopping_finished", { by: session.userId, tripId });
  return json({ tripId, purchasedAt, itemCount: cart.results.length }, 201);
}

async function getHistory(request, env, session) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (!query) {
    const result = await env.SHOPPING_DB.prepare(`SELECT t.id, t.purchased_at, t.metadata, COUNT(h.id) AS item_count FROM shopping_trips t LEFT JOIN history_items h ON h.trip_id = t.id WHERE t.household_id = ? GROUP BY t.id ORDER BY t.purchased_at DESC LIMIT 100`)
      .bind(session.householdId).all();
    const trips = [];
    for (const row of result.results) trips.push(await hydrateTrip(env, row));
    return json({ mode: "default", trips });
  }
  const like = `%${escapeLike(query)}%`;
  const itemHits = await env.SHOPPING_DB.prepare(`SELECT h.trip_id, h.name, h.quantity, h.categories, t.purchased_at FROM history_items h JOIN shopping_trips t ON t.id = h.trip_id WHERE t.household_id = ? AND (h.name LIKE ? ESCAPE '\\' OR h.categories LIKE ? ESCAPE '\\') ORDER BY t.purchased_at DESC LIMIT 100`)
    .bind(session.householdId, like, like).all();
  const metadataHits = await env.SHOPPING_DB.prepare(`SELECT t.id AS trip_id, t.metadata, t.purchased_at, COUNT(h.id) AS item_count FROM shopping_trips t LEFT JOIN history_items h ON h.trip_id = t.id WHERE t.household_id = ? AND t.metadata LIKE ? ESCAPE '\\' GROUP BY t.id ORDER BY t.purchased_at DESC LIMIT 100`)
    .bind(session.householdId, like).all();
  return json({ mode: "search", hits: [
    ...itemHits.results.map(row => ({ type: "item", tripId: row.trip_id, name: row.name, quantity: row.quantity, categories: parseCategories(row.categories), purchasedAt: row.purchased_at })),
    ...metadataHits.results.map(row => ({ type: "metadata", tripId: row.trip_id, metadata: row.metadata, itemCount: Number(row.item_count), purchasedAt: row.purchased_at })),
  ].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)) });
}

async function getTrip(env, session, id) {
  const row = await env.SHOPPING_DB.prepare(`SELECT t.id, t.purchased_at, t.metadata, COUNT(h.id) AS item_count FROM shopping_trips t LEFT JOIN history_items h ON h.trip_id = t.id WHERE t.id = ? AND t.household_id = ? GROUP BY t.id`)
    .bind(id, session.householdId).first();
  if (!row) throw publicError("Shopping trip not found.", 404);
  return json({ trip: await hydrateTrip(env, row) });
}

async function updateTrip(request, env, session, id) {
  const body = await readJson(request);
  const metadata = String(body.metadata || "").trim().slice(0, 500);
  const result = await env.SHOPPING_DB.prepare("UPDATE shopping_trips SET metadata = ? WHERE id = ? AND household_id = ?").bind(metadata, id, session.householdId).run();
  ensureChanged(result);
  await broadcast(env, session.householdId, "history_changed", { by: session.userId, tripId: id });
  return json({ id, metadata });
}

async function hydrateTrip(env, row) {
  const items = await env.SHOPPING_DB.prepare("SELECT * FROM history_items WHERE trip_id = ? ORDER BY name").bind(row.id).all();
  return { id: row.id, purchasedAt: row.purchased_at, metadata: row.metadata, itemCount: Number(row.item_count), items: items.results.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, categories: parseCategories(item.categories) })) };
}

async function sessionForUser(env, userId) {
  const row = await env.SHOPPING_DB.prepare(`SELECT u.id AS user_id, u.username, u.display_name, hm.household_id, hm.role, h.name AS household_name FROM users u JOIN household_members hm ON hm.user_id = u.id JOIN households h ON h.id = hm.household_id WHERE u.id = ? LIMIT 1`).bind(userId).first();
  return { userId: row.user_id, username: row.username, displayName: row.display_name, householdId: row.household_id, householdName: row.household_name, role: row.role };
}

function publicUser(session) { return { id: session.userId, username: session.username, displayName: session.displayName, householdId: session.householdId, householdName: session.householdName, role: session.role }; }
function requireBindings(env) { if (!env.SHOPPING_DB || !env.SHOPPING_ROOM || !env.ASSETS) throw publicError("The shopping service is not fully configured.", 503); }
function requireAdmin(session) { if (session.role !== "admin") throw publicError("Administrator access is required.", 403); }
function serializeCatalogItem(row) { return { id: row.id, name: row.name, categories: parseCategories(row.categories) }; }
function serializeListItem(row) { return { id: row.id, catalogItemId: row.catalog_item_id, name: row.name, quantity: row.quantity, categories: parseCategories(row.categories), state: row.state, createdAt: row.created_at }; }
function serializeSharedNote(row) { return { content: row.note_content || "", color: row.note_color || "default", size: row.note_size || "medium", font: row.note_font || "sans", updatedAt: row.note_updated_at || "" }; }
function parseCategories(value) { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function cleanCategories(value) { const values = Array.isArray(value) ? value : String(value || "").split(","); return [...new Set(values.map(item => String(item).trim()).filter(Boolean))].slice(0, 20); }
function cleanNoteStyle(value, allowed, label) { const cleaned = String(value || ""); if (!allowed.includes(cleaned)) throw publicError(`Invalid note ${label}.`, 400); return cleaned; }
function cleanName(value) { return cleanLabel(value, "Item name", 120); }
function cleanQuantity(value) { return cleanLabel(value ?? "1", "Quantity", 40); }
function cleanLabel(value, label, max) { const cleaned = String(value || "").trim().replace(/\s+/g, " ").slice(0, max); if (!cleaned) throw publicError(`${label} is required.`, 400); return cleaned; }
function pathPart(path, index) { const part = path.split("/")[index]; if (!part) throw publicError("Missing identifier.", 400); return part; }
function escapeLike(value) { return value.replace(/[\\%_]/g, "\\$&"); }
function ensureChanged(result) { if (!result.meta?.changes) throw publicError("Record not found.", 404); }
function publicError(message, status) { const error = new Error(message); error.publicMessage = message; error.status = status; return error; }
async function readJson(request) { try { return await request.json(); } catch { throw publicError("Invalid JSON request.", 400); } }
function json(data, status = 200, headers = {}) { return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } }); }
