const encoder = new TextEncoder();
const SESSION_COOKIE = "shopping_session";
const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 100000;

export async function getSession(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.SHOPPING_DB.prepare(`
    SELECT u.id AS user_id, u.username, u.display_name, hm.household_id, hm.role,
           h.name AS household_name, s.expires_at
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    JOIN household_members hm ON hm.user_id = u.id
    JOIN households h ON h.id = hm.household_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled_at IS NULL
    LIMIT 1
  `).bind(tokenHash, new Date().toISOString()).first();
  if (!row) return null;
  return {
    tokenHash,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    householdId: row.household_id,
    householdName: row.household_name,
    role: row.role,
    expiresAt: row.expires_at,
  };
}

export async function createSession(env, userId) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_DAYS * 86400000);
  await env.SHOPPING_DB.prepare(`
    INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(tokenHash, userId, createdAt.toISOString(), expiresAt.toISOString(), createdAt.toISOString()).run();
  return { token, expiresAt };
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86400}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export async function hashPassword(password, salt = randomBytes(16), iterations = PASSWORD_ITERATIONS) {
  const normalized = validatePassword(password);
  return derivePassword(normalized, salt, iterations);
}

async function derivePassword(password, salt, iterations) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations }, baseKey, 256,
  );
  return { hash: base64Url(new Uint8Array(bits)), salt: base64Url(salt), iterations };
}

export async function verifyPassword(password, user) {
  if (typeof password !== "string" || password.length > 200) return false;
  const derived = await derivePassword(password, fromBase64Url(user.password_salt), Number(user.password_iterations));
  return timingSafeEqual(encoder.encode(derived.hash), encoder.encode(user.password_hash));
}

export function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 10 || password.length > 200) throw publicError("Password must be between 10 and 200 characters.", 400);
  return password;
}

export function cleanUsername(value) {
  const username = String(value || "").trim().toLocaleLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    throw publicError("Username must be 3–40 characters and use only letters, numbers, periods, hyphens, or underscores.", 400);
  }
  return username;
}

export function cleanDisplayName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) throw publicError("Name is required.", 400);
  return name;
}

export function randomToken(byteLength = 24) { return base64Url(randomBytes(byteLength)); }
//export async function tokenHash(token) { return sha256(String(token || "").trim()); }
export async function tokenHash(token) { return sha256(String(token || "").replace(/\s+/gu, "")); }

export async function safeSecretEqual(a, b) {
  const [left, right] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(String(a))), crypto.subtle.digest("SHA-256", encoder.encode(String(b)))]);
  return timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function randomBytes(length) { const bytes = new Uint8Array(length); crypto.getRandomValues(bytes); return bytes; }
async function sha256(value) { return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))); }
function timingSafeEqual(a, b) { return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b); }
function base64Url(bytes) { let binary = ""; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function fromBase64Url(value) { const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4); const binary = atob(base64); return Uint8Array.from(binary, character => character.charCodeAt(0)); }
function publicError(message, status) { const error = new Error(message); error.publicMessage = message; error.status = status; return error; }
