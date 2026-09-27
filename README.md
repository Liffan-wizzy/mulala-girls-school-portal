# Mulala Girls High School Portal

Responsive school portal with separate `SECRETARY`, `TEACHER`, and `PARENT` workspaces. Identity is provided by Cloudflare Access; D1 maps each verified email to one role. Built for Cloudflare Pages Functions and Cloudflare D1.

## Current status

- The secretary manages student and admissions records, school accounts/parent-child links, fees, attendance, announcements, parent messages, and teacher mark approvals.
- Teachers are assigned a subject, form, and stream. They submit marks for review and see their own `Pending`, `Approved`, or `Returned` outcomes; they cannot edit settings, finance, admissions, or other teachers' work.
- Parents see only children explicitly linked to their active account. Their private portal shows approved results, attendance, fee balances and ledger entries, announcements, and parent-secretary messages.
- The public home page is `/`; `/enquire` accepts general enquiries from non-logged-in families. **Staff sign in** at `/portal`; verified D1 roles route secretaries and teachers to their workspaces. Parents sign in at `/parent`.
- General public enquiries are stored in the separate `enquiries` table. Public users can submit but cannot list/read them; only secretaries can review them.
- Secretaries can publish announcements to parent portals, open WhatsApp/email share drafts for non-confidential notices, and send private direct messages to an individual parent's authenticated portal. WhatsApp/email drafts are not sent by the server; direct messages are stored in D1 and appear after parent sign-in.
- The public school map link starts blank. A secretary can enter a verified HTTPS map URL under **School management → School map link**; the public home page displays it after saving. Photo placeholders and the fee structure remain blank until school-approved assets/schedules are supplied.
- The starting student, admissions and ledger records are fictional **DEMO** examples stored in the current browser. They are not school records. Clear them before real use.
- Annual fee items, payment account details and secretary phone number intentionally start blank.
- The secretary number and payment-account details can be saved to D1 from Settings once the staff portal is connected.
- Recording a payment only updates the ledger; it does not collect, transfer, or verify money.
- Teacher marks remain pending until the secretary approves them. Only approved submissions are copied to published marks and returned by parent/report endpoints. Returned submissions include secretary feedback and may be corrected and resubmitted by the assigned teacher.
- The PWA can be installed from Chrome after deployment over HTTPS. It supports a standalone app window and requests fullscreen display where the browser supports it. API records are never cached for offline use.

## Run locally

1. Install Node.js (LTS) and npm.
2. Run `npm install`.
3. Run `npm run dev` and open the local Vite address shown in the terminal.

Without a Cloudflare D1 database, the UI runs in local demo mode and saves edits only in the current browser's local storage. Do not put real student data in demo mode.

## Install on Android or desktop Chrome

1. Deploy the site to its HTTPS Cloudflare Pages address first; Chrome does not offer PWA installation from an ordinary local file or insecure HTTP site.
2. Open the site in Chrome. If Chrome presents the install prompt, use **Install app**. Otherwise, on Android open Chrome's menu and choose **Add to Home screen**; on desktop use the install icon in the address bar or Chrome's **Install app** menu item.
3. Launch Mulala Girls from the Android home screen/app drawer or from the desktop app launcher. It opens in an app-style window and uses fullscreen when supported by that Chrome version/device.
4. The floating **Install school app** button appears when Chrome signals that installation is available. If it does not appear, use Chrome's menu as described above.

The app shell can open offline after it has been loaded once, but admissions, marks, finance, and other D1 data require a network connection. The service worker deliberately never stores `/api/` responses.

## Connect Cloudflare D1

1. Sign in to Cloudflare with Wrangler: `npx wrangler login`.
2. Create the database: `npx wrangler d1 create mulala-school`.
3. Copy the returned database ID into `wrangler.toml` in place of `REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID`.
4. Apply pending schema migrations: `npx wrangler d1 migrations apply mulala-school --remote`.
5. Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in the Cloudflare Pages environment variables. The team domain is the hostname of your Cloudflare Access organization (without `https://`); the audience is the Access application's AUD tag.
6. Create Cloudflare Access policies for `/portal*`, `/admin*`, `/teacher*`, and `/parent*`. Allow every approved secretary and teacher identity (and every parent identity that needs portal access) to authenticate. Add an initial secretary account directly in D1 with the verified email: `INSERT INTO accounts (email, role) VALUES (lower('YOUR_SECRETARY_ACCESS_EMAIL'), 'SECRETARY');`. The secretary can then add the remaining accounts in **School management → Accounts & roles**. A D1 role does not create an Access identity; each person must already be allowed to authenticate through Cloudflare Access.
7. Leave `ACCESS_ALLOWED_EMAILS` unset to rely on the D1 account allowlist, or include every enabled secretary, teacher, and parent Access email in the comma-separated value. A staff-only list will block parent and teacher API requests.
8. Build and deploy with `npm run cf:deploy` (or use the Cloudflare Pages Git integration).

Leave `/` and `/enquire` public. Protect `/portal*`, `/admin*`, `/teacher*`, and `/parent*` with Cloudflare Access. Allow all intended secretary and teacher accounts in that Access policy; D1 role checks still limit each account's actions. Protect `/api/*` at the edge by default. The only API paths that need an Access-policy bypass are `/api/shared-reports/*`, `/api/enquiries`, and `/api/public-settings`: the function permits only `GET /api/shared-reports/*`, `POST /api/enquiries`, and `GET /api/public-settings` before Access verification. The public-settings response contains only the school map link. Every other route/method verifies the signed Cloudflare Access JWT and then checks the active D1 role. If Access exceptions are path-only, function checks still deny unapproved methods on these paths. Do not add a broad API bypass. Shared links are bearer credentials: anyone holding a still-valid link can view its limited report. Parent accounts should normally use the authenticated `/parent` portal.

## Cloudflare setup

- Build command: `npm run build`
- Build output directory: `dist`
- Functions directory: `functions/`
- D1 binding name: `DB`
- D1 migrations directory: `migrations/`

The `wrangler.toml` contains a placeholder database ID. Replace it with the ID for the school's Cloudflare account before deployment. This workspace cannot create or link the school's Cloudflare account without the account owner signing in and authorizing Wrangler.

## Security and operational checklist

- Use real staff identities in Cloudflare Access; enable MFA on staff accounts.
- Restrict secretary, teacher, and parent paths to approved identities. Every API route other than public enquiry submission, public map-link lookup, and expiring bearer report reads must pass Cloudflare Access JWT verification and D1 role/child-assignment checks. Do not create a broad API bypass. Verify the `ACCESS_AUD` and team domain before entering real data.
- Do not load real student records into local demo mode. Check local browser storage before handing over a shared device.
- Confirm school consent and records-retention policies before putting student reports online. Family links are bearer links: anyone forwarded the URL can view the limited report until it expires; confirm recipient identity before sending.
- Back up D1 data and define who can administer the database.
- Confirm the approved fee structure and school payment account details with the school office before entering them.
- For actual online payments, select and integrate a payment provider with server-side transaction verification and reconciliation. No payment gateway is included.
- Photo boxes are placeholders; add only school-approved images with the required permissions.
