# Collaborative household shopping list

This package adds a private, real-time shopping list to the existing `personal-website` Cloudflare Worker. Static pages continue to be served from `public/`; only `/api/shopping/*` requests invoke the Worker.

The application includes:

- Individual username/password accounts
- One shared household list for every authorized member
- Single-use invitation codes created by the household administrator
- Live updates across open phones, tablets, and computers using WebSockets and a Durable Object
- D1 persistence for the catalog, current list, and shopping history
- A 30-day HTTP-only login session on each browser

## Package layout

```text
public/
  shopping.html
  css/shopping.css
  js/shopping.js
src/
  worker.js
  auth.js
  realtime.js
migrations/
  0001_shopping.sql
  0002_household_accounts.sql
wrangler.jsonc
package.json
```

The package intentionally does not include the rest of the existing `public/` directory. Merge these files into the current project; do not replace or remove the existing website assets.

## 1. Copy the files

From the extracted package, copy `public`, `src`, and `migrations` into the existing project root while preserving their paths. Use the included `wrangler.jsonc` as the completed configuration or compare it with the local copy you already edited.

The D1 binding must remain `SHOPPING_DB`, and the Durable Object binding must remain `SHOPPING_ROOM`.

## 2. Install dependencies

From the project root:

```bash
npm install
```

## 3. Apply the database migration

Run:

```bash
npm run migrate:remote
```

If `0001_shopping.sql` was already applied, Wrangler will apply only `0002_household_accounts.sql`. Do not rerun either SQL file manually. Wrangler records which migrations have already been applied.

## 4. Deploy the Worker code

Run:

```bash
npm run deploy
```

The deployment should report the `SHOPPING_DB`, `SHOPPING_ROOM`, and `ASSETS` bindings. This first deployment changes the project from static-assets-only to static assets plus a Worker API. Existing public pages remain available from the same `public/` directory.

## 5. Create the one-time setup secret

Generate a random value locally:

```bash
openssl rand -base64 32
```

Copy the result, then run:

```bash
npx wrangler secret put SETUP_SECRET
```

Paste the generated value when prompted. Keep it long enough to complete first-time setup. It is not an ongoing household password.

`SHOPPING_PASSWORD` and `SESSION_SECRET` from the earlier shared-password design are no longer used.

## 6. Create the first administrator

Open:

```text
https://jonathonkeeney.com/shopping.html
```

Because the users table is empty, the page will display the one-time household setup form. Enter:

- The `SETUP_SECRET` value generated above
- A household name
- Your display name
- Your desired username
- Your desired password (at least 10 characters)

This creates the household and the first administrator account. The setup endpoint disables itself automatically once the first account exists.

After setup succeeds, the setup secret can be removed:

```bash
npx wrangler secret delete SETUP_SECRET
```

## 7. Invite other household members

While signed in as the administrator:

1. Select **Household**.
2. Select **Create invitation**.
3. Copy the generated single-use code and send it to the intended person.
4. They should open `/shopping.html`, select **Join with an invitation**, and choose their own username and password.

Invitation codes expire after 7 days and are shown only once.

## Live collaboration behavior

The green **Live** indicator means that the browser has an active WebSocket connection to the shared household room. Adding, moving, removing, or finishing items sends an immediate update to every connected household member.

If a device sleeps or loses its network connection, the page displays **Reconnecting…** and reconnects automatically with increasing delays. After reconnecting, API reads use D1 as the authoritative state, so missed WebSocket messages do not cause permanent divergence.

## Local development

Create an uncommitted `.dev.vars` file in the project root:

```text
SETUP_SECRET=choose-a-local-setup-code
```

Then run:

```bash
npm run migrate:local
npm run dev
```

Wrangler stores the local D1 and Durable Object data separately from production.

## Security notes

- Passwords are derived with salted PBKDF2-SHA-256 and are never stored as plaintext.
- Login cookies contain random session tokens, not passwords, and are HTTP-only, HTTPS-only, same-site, and valid for 30 days.
- Stored session tokens and invitation codes are hashed before being written to D1.
- All list, catalog, history, member, and WebSocket requests require an authenticated household session.
