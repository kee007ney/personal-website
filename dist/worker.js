var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/auth.js
var encoder = new TextEncoder();
var SESSION_COOKIE = "shopping_session";
var SESSION_DAYS = 30;
var PASSWORD_ITERATIONS = 21e4;
async function getSession(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash2 = await sha256(token);
  const row = await env.SHOPPING_DB.prepare(`
    SELECT u.id AS user_id, u.username, u.display_name, hm.household_id, hm.role,
           h.name AS household_name, s.expires_at
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    JOIN household_members hm ON hm.user_id = u.id
    JOIN households h ON h.id = hm.household_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled_at IS NULL
    LIMIT 1
  `).bind(tokenHash2, (/* @__PURE__ */ new Date()).toISOString()).first();
  if (!row) return null;
  return {
    tokenHash: tokenHash2,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    householdId: row.household_id,
    householdName: row.household_name,
    role: row.role,
    expiresAt: row.expires_at
  };
}
__name(getSession, "getSession");
async function createSession(env, userId) {
  const token = randomToken(32);
  const tokenHash2 = await sha256(token);
  const createdAt = /* @__PURE__ */ new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_DAYS * 864e5);
  await env.SHOPPING_DB.prepare(`
    INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(tokenHash2, userId, createdAt.toISOString(), expiresAt.toISOString(), createdAt.toISOString()).run();
  return { token, expiresAt };
}
__name(createSession, "createSession");
function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86400}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
__name(sessionCookie, "sessionCookie");
function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
__name(clearSessionCookie, "clearSessionCookie");
async function hashPassword(password, salt = randomBytes(16), iterations = PASSWORD_ITERATIONS) {
  const normalized = validatePassword(password);
  return derivePassword(normalized, salt, iterations);
}
__name(hashPassword, "hashPassword");
async function derivePassword(password, salt, iterations) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    baseKey,
    256
  );
  return { hash: base64Url(new Uint8Array(bits)), salt: base64Url(salt), iterations };
}
__name(derivePassword, "derivePassword");
async function verifyPassword(password, user) {
  if (typeof password !== "string" || password.length > 200) return false;
  const derived = await derivePassword(password, fromBase64Url(user.password_salt), Number(user.password_iterations));
  return timingSafeEqual(encoder.encode(derived.hash), encoder.encode(user.password_hash));
}
__name(verifyPassword, "verifyPassword");
function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 10 || password.length > 200) throw publicError("Password must be between 10 and 200 characters.", 400);
  return password;
}
__name(validatePassword, "validatePassword");
function cleanUsername(value) {
  const username = String(value || "").trim().toLocaleLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    throw publicError("Username must be 3\u201340 characters and use only letters, numbers, periods, hyphens, or underscores.", 400);
  }
  return username;
}
__name(cleanUsername, "cleanUsername");
function cleanDisplayName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) throw publicError("Name is required.", 400);
  return name;
}
__name(cleanDisplayName, "cleanDisplayName");
function randomToken(byteLength = 24) {
  return base64Url(randomBytes(byteLength));
}
__name(randomToken, "randomToken");
async function tokenHash(token) {
  return sha256(String(token || "").trim());
}
__name(tokenHash, "tokenHash");
async function safeSecretEqual(a, b) {
  const [left, right] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(String(a))), crypto.subtle.digest("SHA-256", encoder.encode(String(b)))]);
  return timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
}
__name(safeSecretEqual, "safeSecretEqual");
function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}
__name(readCookie, "readCookie");
function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}
__name(randomBytes, "randomBytes");
async function sha256(value) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
__name(sha256, "sha256");
function timingSafeEqual(a, b) {
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}
__name(timingSafeEqual, "timingSafeEqual");
function base64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(base64Url, "base64Url");
function fromBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
__name(fromBase64Url, "fromBase64Url");
function publicError(message, status) {
  const error = new Error(message);
  error.publicMessage = message;
  error.status = status;
  return error;
}
__name(publicError, "publicError");

// src/realtime.js
var ShoppingRoom = class {
  static {
    __name(this, "ShoppingRoom");
  }
  constructor(ctx) {
    this.ctx = ctx;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/broadcast") {
      const message = await request.text();
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(message);
        } catch {
          try {
            socket.close(1011, "Delivery failed");
          } catch {
          }
        }
      }
      return new Response(null, { status: 204 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({
      userId: request.headers.get("X-Shopping-User") || "unknown",
      displayName: request.headers.get("X-Shopping-Name") || "Household member"
    });
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "connected", at: (/* @__PURE__ */ new Date()).toISOString() }));
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(socket, message) {
    if (message === "ping") socket.send("pong");
  }
  webSocketClose() {
  }
  webSocketError(socket) {
    try {
      socket.close(1011, "Connection error");
    } catch {
    }
  }
};
async function connectToRoom(request, env, session) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return Response.json({ error: "WebSocket upgrade required." }, { status: 426 });
  }
  const headers = new Headers(request.headers);
  headers.set("X-Shopping-User", session.userId);
  headers.set("X-Shopping-Name", session.displayName);
  return env.SHOPPING_ROOM.getByName(session.householdId).fetch(new Request(request, { headers }));
}
__name(connectToRoom, "connectToRoom");
async function broadcast(env, householdId, type, detail = {}) {
  const room = env.SHOPPING_ROOM.getByName(householdId);
  await room.fetch("https://shopping-room.internal/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, detail, at: (/* @__PURE__ */ new Date()).toISOString() })
  });
}
__name(broadcast, "broadcast");

// src/worker.js
var worker_default = {
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
  }
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
  if (path === "catalog" && method === "GET") return getCatalog(request, env, session);
  if (path === "catalog" && method === "POST") return createCatalogItem(request, env, session);
  if (path.startsWith("catalog/") && method === "PUT") return updateCatalogItem(request, env, session, pathPart(path, 1));
  if (path.startsWith("catalog/") && method === "DELETE") return deleteCatalogItem(env, session, pathPart(path, 1));
  if (path === "list" && method === "GET") return getList(env, session);
  if (path === "list" && method === "POST") return createListItem(request, env, session);
  if (path.startsWith("list/") && method === "PUT") return updateListItem(request, env, session, pathPart(path, 1));
  if (path.startsWith("list/") && method === "DELETE") return deleteListItem(env, session, pathPart(path, 1));
  if (path === "finish" && method === "POST") return finishShopping(env, session);
  if (path === "history" && method === "GET") return getHistory(request, env, session);
  if (path.startsWith("history/") && method === "GET") return getTrip(env, session, pathPart(path, 1));
  if (path.startsWith("history/") && method === "PUT") return updateTrip(request, env, session, pathPart(path, 1));
  return json({ error: "Not found." }, 404);
}
__name(routeApi, "routeApi");
async function sessionStatus(request, env) {
  const session = await getSession(request, env);
  if (session) return json({ authenticated: true, setupRequired: false, user: publicUser(session) });
  const row = await env.SHOPPING_DB.prepare("SELECT COUNT(*) AS count FROM users").first();
  return json({ authenticated: false, setupRequired: Number(row?.count || 0) === 0 });
}
__name(sessionStatus, "sessionStatus");
async function setupHousehold(request, env) {
  const existing = await env.SHOPPING_DB.prepare("SELECT COUNT(*) AS count FROM users").first();
  if (Number(existing?.count || 0) > 0) throw publicError2("Household setup has already been completed.", 409);
  if (!env.SETUP_SECRET) throw publicError2("The one-time setup secret has not been configured.", 503);
  const body = await readJson(request);
  if (!await safeSecretEqual(body.setupCode, env.SETUP_SECRET)) throw publicError2("Incorrect setup code.", 401);
  const username = cleanUsername(body.username);
  const displayName = cleanDisplayName(body.displayName);
  const householdName = cleanLabel(body.householdName, "Household name", 80);
  const password = await hashPassword(body.password);
  const userId = crypto.randomUUID();
  const householdId = "household-default";
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await env.SHOPPING_DB.batch([
    env.SHOPPING_DB.prepare("UPDATE households SET name = ? WHERE id = ?").bind(householdName, householdId),
    env.SHOPPING_DB.prepare(`INSERT INTO users (id, username, display_name, password_hash, password_salt, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(userId, username, displayName, password.hash, password.salt, password.iterations, now),
    env.SHOPPING_DB.prepare("INSERT INTO household_members (household_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)").bind(householdId, userId, now)
  ]);
  const created = await createSession(env, userId);
  return json({ authenticated: true, user: { userId, username, displayName, householdId, householdName, role: "admin" } }, 201, { "Set-Cookie": sessionCookie(created.token) });
}
__name(setupHousehold, "setupHousehold");
async function login(request, env) {
  const body = await readJson(request);
  const username = cleanUsername(body.username);
  const user = await env.SHOPPING_DB.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND disabled_at IS NULL").bind(username).first();
  if (!user || !await verifyPassword(String(body.password || ""), user)) throw publicError2("Incorrect username or password.", 401);
  await env.SHOPPING_DB.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").bind((/* @__PURE__ */ new Date()).toISOString()).run();
  const created = await createSession(env, user.id);
  const session = await sessionForUser(env, user.id);
  return json({ authenticated: true, user: publicUser(session) }, 200, { "Set-Cookie": sessionCookie(created.token) });
}
__name(login, "login");
async function register(request, env) {
  const body = await readJson(request);
  const codeHash = await tokenHash(body.inviteCode);
  const invitation = await env.SHOPPING_DB.prepare(`SELECT * FROM household_invitations WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`).bind(codeHash, (/* @__PURE__ */ new Date()).toISOString()).first();
  if (!invitation) throw publicError2("That invitation is invalid or has expired.", 400);
  const username = cleanUsername(body.username);
  const displayName = cleanDisplayName(body.displayName);
  const password = await hashPassword(body.password);
  const userId = crypto.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await env.SHOPPING_DB.batch([
      env.SHOPPING_DB.prepare(`INSERT INTO users (id, username, display_name, password_hash, password_salt, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(userId, username, displayName, password.hash, password.salt, password.iterations, now),
      env.SHOPPING_DB.prepare("INSERT INTO household_members (household_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").bind(invitation.household_id, userId, now),
      env.SHOPPING_DB.prepare("UPDATE household_invitations SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").bind(now, codeHash)
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw publicError2("That username is already in use.", 409);
    throw error;
  }
  const created = await createSession(env, userId);
  const session = await sessionForUser(env, userId);
  await broadcast(env, invitation.household_id, "members_changed", { userId });
  return json({ authenticated: true, user: publicUser(session) }, 201, { "Set-Cookie": sessionCookie(created.token) });
}
__name(register, "register");
async function logout(request, env, session) {
  await env.SHOPPING_DB.prepare("DELETE FROM user_sessions WHERE token_hash = ?").bind(session.tokenHash).run();
  return json({ authenticated: false }, 200, { "Set-Cookie": clearSessionCookie() });
}
__name(logout, "logout");
async function getMembers(env, session) {
  const result = await env.SHOPPING_DB.prepare(`
    SELECT u.id, u.username, u.display_name, hm.role, hm.joined_at
    FROM household_members hm JOIN users u ON u.id = hm.user_id
    WHERE hm.household_id = ? AND u.disabled_at IS NULL
    ORDER BY CASE hm.role WHEN 'admin' THEN 0 ELSE 1 END, u.display_name
  `).bind(session.householdId).all();
  return json({ household: { id: session.householdId, name: session.householdName }, members: result.results.map((row) => ({ id: row.id, username: row.username, displayName: row.display_name, role: row.role, joinedAt: row.joined_at })) });
}
__name(getMembers, "getMembers");
async function createInvitation(env, session) {
  requireAdmin(session);
  const code = randomToken(18);
  const codeHash = await tokenHash(code);
  const now = /* @__PURE__ */ new Date();
  const expiresAt = new Date(now.getTime() + 7 * 864e5);
  await env.SHOPPING_DB.prepare(`INSERT INTO household_invitations (token_hash, household_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`).bind(codeHash, session.householdId, session.userId, now.toISOString(), expiresAt.toISOString()).run();
  return json({ invitationCode: code, expiresAt: expiresAt.toISOString() }, 201);
}
__name(createInvitation, "createInvitation");
async function getCatalog(request, env, session) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  const statement = query ? env.SHOPPING_DB.prepare("SELECT * FROM catalog_items WHERE household_id = ? AND name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 50").bind(session.householdId, `%${escapeLike(query)}%`) : env.SHOPPING_DB.prepare("SELECT * FROM catalog_items WHERE household_id = ? ORDER BY name LIMIT 500").bind(session.householdId);
  const result = await statement.all();
  return json({ items: result.results.map(serializeCatalogItem) });
}
__name(getCatalog, "getCatalog");
async function createCatalogItem(request, env, session) {
  const body = await readJson(request);
  const name = cleanName(body.name);
  const categories = cleanCategories(body.categories);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = crypto.randomUUID();
  try {
    await env.SHOPPING_DB.prepare(`INSERT INTO catalog_items (id, name, categories, created_at, updated_at, household_id) VALUES (?, ?, ?, ?, ?, ?)`).bind(id, name, JSON.stringify(categories), now, now, session.householdId).run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw publicError2("That item is already in the database.", 409);
    throw error;
  }
  await broadcast(env, session.householdId, "catalog_changed", { by: session.userId });
  return json({ item: { id, name, categories } }, 201);
}
__name(createCatalogItem, "createCatalogItem");
async function updateCatalogItem(request, env, session, id) {
  const body = await readJson(request);
  const name = cleanName(body.name);
  const categories = cleanCategories(body.categories);
  const categoryJson = JSON.stringify(categories);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const result = await env.SHOPPING_DB.batch([
      env.SHOPPING_DB.prepare("UPDATE catalog_items SET name = ?, categories = ?, updated_at = ? WHERE id = ? AND household_id = ?").bind(name, categoryJson, now, id, session.householdId),
      env.SHOPPING_DB.prepare("UPDATE list_items SET name = ?, categories = ?, updated_at = ? WHERE catalog_item_id = ? AND household_id = ?").bind(name, categoryJson, now, id, session.householdId)
    ]);
    ensureChanged(result[0]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw publicError2("That item name is already in use.", 409);
    throw error;
  }
  await broadcast(env, session.householdId, "catalog_changed", { by: session.userId });
  await broadcast(env, session.householdId, "list_changed", { by: session.userId });
  return json({ item: { id, name, categories } });
}
__name(updateCatalogItem, "updateCatalogItem");
async function deleteCatalogItem(env, session, id) {
  const result = await env.SHOPPING_DB.prepare("DELETE FROM catalog_items WHERE id = ? AND household_id = ?").bind(id, session.householdId).run();
  ensureChanged(result);
  await broadcast(env, session.householdId, "catalog_changed", { by: session.userId });
  return new Response(null, { status: 204 });
}
__name(deleteCatalogItem, "deleteCatalogItem");
async function getList(env, session) {
  const result = await env.SHOPPING_DB.prepare("SELECT * FROM list_items WHERE household_id = ? ORDER BY created_at, name").bind(session.householdId).all();
  return json({ items: result.results.map(serializeListItem) });
}
__name(getList, "getList");
async function createListItem(request, env, session) {
  const body = await readJson(request);
  const name = cleanName(body.name);
  const quantity = cleanQuantity(body.quantity);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let catalog = null;
  if (body.catalogItemId) catalog = await env.SHOPPING_DB.prepare("SELECT * FROM catalog_items WHERE id = ? AND household_id = ?").bind(body.catalogItemId, session.householdId).first();
  if (!catalog) catalog = await env.SHOPPING_DB.prepare("SELECT * FROM catalog_items WHERE name = ? COLLATE NOCASE AND household_id = ?").bind(name, session.householdId).first();
  if (!catalog) {
    const catalogId = crypto.randomUUID();
    await env.SHOPPING_DB.prepare(`INSERT INTO catalog_items (id, name, categories, created_at, updated_at, household_id) VALUES (?, ?, '[]', ?, ?, ?)`).bind(catalogId, name, now, now, session.householdId).run();
    catalog = { id: catalogId, name, categories: "[]" };
  }
  const existing = await env.SHOPPING_DB.prepare("SELECT * FROM list_items WHERE catalog_item_id = ? AND state = 'list' AND household_id = ? LIMIT 1").bind(catalog.id, session.householdId).first();
  let item;
  if (existing) {
    await env.SHOPPING_DB.prepare("UPDATE list_items SET quantity = ?, updated_at = ? WHERE id = ? AND household_id = ?").bind(quantity, now, existing.id, session.householdId).run();
    item = { ...serializeListItem(existing), quantity };
  } else {
    item = { id: crypto.randomUUID(), catalogItemId: catalog.id, name: catalog.name, quantity, categories: parseCategories(catalog.categories), state: "list", createdAt: now };
    await env.SHOPPING_DB.prepare(`INSERT INTO list_items (id, catalog_item_id, name, quantity, categories, state, created_at, updated_at, household_id) VALUES (?, ?, ?, ?, ?, 'list', ?, ?, ?)`).bind(item.id, item.catalogItemId, item.name, item.quantity, JSON.stringify(item.categories), now, now, session.householdId).run();
  }
  await broadcast(env, session.householdId, "list_changed", { by: session.userId });
  return json({ item }, existing ? 200 : 201);
}
__name(createListItem, "createListItem");
async function updateListItem(request, env, session, id) {
  const body = await readJson(request);
  const fields = [];
  const bindings = [];
  if (body.quantity !== void 0) {
    fields.push("quantity = ?");
    bindings.push(cleanQuantity(body.quantity));
  }
  if (body.state !== void 0) {
    if (!["list", "cart"].includes(body.state)) throw publicError2("Invalid list state.", 400);
    fields.push("state = ?");
    bindings.push(body.state);
  }
  if (!fields.length) throw publicError2("No changes supplied.", 400);
  fields.push("updated_at = ?");
  bindings.push((/* @__PURE__ */ new Date()).toISOString(), id, session.householdId);
  const result = await env.SHOPPING_DB.prepare(`UPDATE list_items SET ${fields.join(", ")} WHERE id = ? AND household_id = ?`).bind(...bindings).run();
  ensureChanged(result);
  const item = await env.SHOPPING_DB.prepare("SELECT * FROM list_items WHERE id = ? AND household_id = ?").bind(id, session.householdId).first();
  await broadcast(env, session.householdId, "list_changed", { by: session.userId });
  return json({ item: serializeListItem(item) });
}
__name(updateListItem, "updateListItem");
async function deleteListItem(env, session, id) {
  const result = await env.SHOPPING_DB.prepare("DELETE FROM list_items WHERE id = ? AND household_id = ?").bind(id, session.householdId).run();
  ensureChanged(result);
  await broadcast(env, session.householdId, "list_changed", { by: session.userId });
  return new Response(null, { status: 204 });
}
__name(deleteListItem, "deleteListItem");
async function finishShopping(env, session) {
  const cart = await env.SHOPPING_DB.prepare("SELECT * FROM list_items WHERE state = 'cart' AND household_id = ? ORDER BY created_at").bind(session.householdId).all();
  if (!cart.results.length) throw publicError2("There are no items in the cart.", 400);
  const tripId = crypto.randomUUID();
  const purchasedAt = (/* @__PURE__ */ new Date()).toISOString();
  await env.SHOPPING_DB.batch([
    env.SHOPPING_DB.prepare("INSERT INTO shopping_trips (id, purchased_at, metadata, household_id) VALUES (?, ?, '', ?)").bind(tripId, purchasedAt, session.householdId),
    ...cart.results.map((item) => env.SHOPPING_DB.prepare(`INSERT INTO history_items (id, trip_id, catalog_item_id, name, quantity, categories) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), tripId, item.catalog_item_id, item.name, item.quantity, item.categories)),
    env.SHOPPING_DB.prepare("DELETE FROM list_items WHERE state = 'cart' AND household_id = ?").bind(session.householdId)
  ]);
  await broadcast(env, session.householdId, "shopping_finished", { by: session.userId, tripId });
  return json({ tripId, purchasedAt, itemCount: cart.results.length }, 201);
}
__name(finishShopping, "finishShopping");
async function getHistory(request, env, session) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (!query) {
    const result = await env.SHOPPING_DB.prepare(`SELECT t.id, t.purchased_at, t.metadata, COUNT(h.id) AS item_count FROM shopping_trips t LEFT JOIN history_items h ON h.trip_id = t.id WHERE t.household_id = ? GROUP BY t.id ORDER BY t.purchased_at DESC LIMIT 100`).bind(session.householdId).all();
    const trips = [];
    for (const row of result.results) trips.push(await hydrateTrip(env, row));
    return json({ mode: "default", trips });
  }
  const like = `%${escapeLike(query)}%`;
  const itemHits = await env.SHOPPING_DB.prepare(`SELECT h.trip_id, h.name, h.quantity, h.categories, t.purchased_at FROM history_items h JOIN shopping_trips t ON t.id = h.trip_id WHERE t.household_id = ? AND (h.name LIKE ? ESCAPE '\\' OR h.categories LIKE ? ESCAPE '\\') ORDER BY t.purchased_at DESC LIMIT 100`).bind(session.householdId, like, like).all();
  const metadataHits = await env.SHOPPING_DB.prepare(`SELECT t.id AS trip_id, t.metadata, t.purchased_at, COUNT(h.id) AS item_count FROM shopping_trips t LEFT JOIN history_items h ON h.trip_id = t.id WHERE t.household_id = ? AND t.metadata LIKE ? ESCAPE '\\' GROUP BY t.id ORDER BY t.purchased_at DESC LIMIT 100`).bind(session.householdId, like).all();
  return json({ mode: "search", hits: [
    ...itemHits.results.map((row) => ({ type: "item", tripId: row.trip_id, name: row.name, quantity: row.quantity, categories: parseCategories(row.categories), purchasedAt: row.purchased_at })),
    ...metadataHits.results.map((row) => ({ type: "metadata", tripId: row.trip_id, metadata: row.metadata, itemCount: Number(row.item_count), purchasedAt: row.purchased_at }))
  ].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)) });
}
__name(getHistory, "getHistory");
async function getTrip(env, session, id) {
  const row = await env.SHOPPING_DB.prepare(`SELECT t.id, t.purchased_at, t.metadata, COUNT(h.id) AS item_count FROM shopping_trips t LEFT JOIN history_items h ON h.trip_id = t.id WHERE t.id = ? AND t.household_id = ? GROUP BY t.id`).bind(id, session.householdId).first();
  if (!row) throw publicError2("Shopping trip not found.", 404);
  return json({ trip: await hydrateTrip(env, row) });
}
__name(getTrip, "getTrip");
async function updateTrip(request, env, session, id) {
  const body = await readJson(request);
  const metadata = String(body.metadata || "").trim().slice(0, 500);
  const result = await env.SHOPPING_DB.prepare("UPDATE shopping_trips SET metadata = ? WHERE id = ? AND household_id = ?").bind(metadata, id, session.householdId).run();
  ensureChanged(result);
  await broadcast(env, session.householdId, "history_changed", { by: session.userId, tripId: id });
  return json({ id, metadata });
}
__name(updateTrip, "updateTrip");
async function hydrateTrip(env, row) {
  const items = await env.SHOPPING_DB.prepare("SELECT * FROM history_items WHERE trip_id = ? ORDER BY name").bind(row.id).all();
  return { id: row.id, purchasedAt: row.purchased_at, metadata: row.metadata, itemCount: Number(row.item_count), items: items.results.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, categories: parseCategories(item.categories) })) };
}
__name(hydrateTrip, "hydrateTrip");
async function sessionForUser(env, userId) {
  const row = await env.SHOPPING_DB.prepare(`SELECT u.id AS user_id, u.username, u.display_name, hm.household_id, hm.role, h.name AS household_name FROM users u JOIN household_members hm ON hm.user_id = u.id JOIN households h ON h.id = hm.household_id WHERE u.id = ? LIMIT 1`).bind(userId).first();
  return { userId: row.user_id, username: row.username, displayName: row.display_name, householdId: row.household_id, householdName: row.household_name, role: row.role };
}
__name(sessionForUser, "sessionForUser");
function publicUser(session) {
  return { id: session.userId, username: session.username, displayName: session.displayName, householdId: session.householdId, householdName: session.householdName, role: session.role };
}
__name(publicUser, "publicUser");
function requireBindings(env) {
  if (!env.SHOPPING_DB || !env.SHOPPING_ROOM || !env.ASSETS) throw publicError2("The shopping service is not fully configured.", 503);
}
__name(requireBindings, "requireBindings");
function requireAdmin(session) {
  if (session.role !== "admin") throw publicError2("Administrator access is required.", 403);
}
__name(requireAdmin, "requireAdmin");
function serializeCatalogItem(row) {
  return { id: row.id, name: row.name, categories: parseCategories(row.categories) };
}
__name(serializeCatalogItem, "serializeCatalogItem");
function serializeListItem(row) {
  return { id: row.id, catalogItemId: row.catalog_item_id, name: row.name, quantity: row.quantity, categories: parseCategories(row.categories), state: row.state, createdAt: row.created_at };
}
__name(serializeListItem, "serializeListItem");
function parseCategories(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
__name(parseCategories, "parseCategories");
function cleanCategories(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))].slice(0, 20);
}
__name(cleanCategories, "cleanCategories");
function cleanName(value) {
  return cleanLabel(value, "Item name", 120);
}
__name(cleanName, "cleanName");
function cleanQuantity(value) {
  return cleanLabel(value ?? "1", "Quantity", 40);
}
__name(cleanQuantity, "cleanQuantity");
function cleanLabel(value, label, max) {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
  if (!cleaned) throw publicError2(`${label} is required.`, 400);
  return cleaned;
}
__name(cleanLabel, "cleanLabel");
function pathPart(path, index) {
  const part = path.split("/")[index];
  if (!part) throw publicError2("Missing identifier.", 400);
  return part;
}
__name(pathPart, "pathPart");
function escapeLike(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}
__name(escapeLike, "escapeLike");
function ensureChanged(result) {
  if (!result.meta?.changes) throw publicError2("Record not found.", 404);
}
__name(ensureChanged, "ensureChanged");
function publicError2(message, status) {
  const error = new Error(message);
  error.publicMessage = message;
  error.status = status;
  return error;
}
__name(publicError2, "publicError");
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw publicError2("Invalid JSON request.", 400);
  }
}
__name(readJson, "readJson");
function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
__name(json, "json");
export {
  ShoppingRoom,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
