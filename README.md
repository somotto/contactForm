# Event Lead Capture Platform

A multi-vendor, multi-event lead-capture system. Vendors self-register, create one or more events, and share a per-event link/QR code. Attendees scan it, fill out a short contact form (no login required), and their details are stored in DynamoDB against that vendor and event. Each vendor logs into their own dashboard to view and filter their submissions.

## How it works

```
Vendor → Register (Cognito) → Verify email → Log in → Dashboard
                                                          ↓
                                                   Create Event(s)
                                                          ↓
                                          Share /e/<event-slug> (QR code / link)
                                                          ↓
Attendees → Scan QR → Contact form (/e/<slug>) → DynamoDB (Submission)
                                                          ↕
                                          Dashboard reads/filters Submissions & Events
```

1. **Vendors** register at `/register.html` (full name, company name, email, phone, optional website, a required logo/selfie, a required product/service description, password). This creates a Cognito account and sends a 6-digit email verification code.
2. On first successful **login** at `/` (the dashboard), the pending profile and logo queued during registration are written to DynamoDB/S3, creating the vendor's `Vendor` record.
3. The vendor creates one or more **Events** from the dashboard. Each gets a URL-friendly slug and a shareable link: `/e/<slug>`. The vendor's logo, description, and contact info are snapshotted onto the `Event` at this point.
4. **Attendees** scan a QR code (or open the link) for a specific event, which opens the public **contact form** (`/e/<slug>`, served by `e.html`) — no login required. The vendor's logo, description, and contact info are shown on this page.
5. On submit, the form writes a `Submission` directly to **DynamoDB** via AWS AppSync (GraphQL), tagged with the event and vendor. A Lambda function, triggered by the `Submission` table's DynamoDB Stream, sends the attendee a confirmation email with the vendor and event details.
6. The vendor's **dashboard** lists their events and submissions, with a filter to view submissions by event. Vendors can reset a forgotten password from the login screen, or permanently delete their account (and all their events/submissions) from the dashboard.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Plain HTML, CSS, JavaScript (Vite-bundled, multi-page) |
| Backend | AWS Amplify Gen 2 |
| Authentication | Amazon Cognito (email + password) |
| API | AWS AppSync (GraphQL) |
| Database | Amazon DynamoDB |
| File storage | Amazon S3 (vendor logos) |
| Email | Amazon SES (submission confirmation emails) |
| Compute | AWS Lambda (`notify-submission`, triggered by a DynamoDB Stream) |
| Hosting | AWS Amplify Hosting |
| Source control / CI | GitHub → Amplify Hosting auto-deploy |

This stack was chosen to keep the project as simple as possible: Amplify Gen 2 provisions Cognito, AppSync, DynamoDB, and S3 automatically from a single backend definition. The one exception is the `notify-submission` Lambda (see [Submission confirmation email](#submission-confirmation-email)), which is hand-written because sending email isn't something AppSync/DynamoDB can do on their own.

## Project structure

```
contactForm/
├── amplify/
│   ├── auth/
│   │   └── resource.ts       # Cognito configuration (email login)
│   ├── data/
│   │   └── resource.ts       # Vendor / Event / Submission models + authorization rules
│   ├── storage/
│   │   └── resource.ts       # S3 bucket for vendor logos
│   ├── functions/
│   │   └── notify-submission/
│   │       ├── resource.ts   # Lambda definition (defineFunction)
│   │       └── handler.ts    # DynamoDB Stream handler — sends confirmation email via SES
│   └── backend.ts            # Ties auth, data, storage, and the function together;
│                              # also wires the Submission table's stream to the Lambda
├── src/
│   ├── dashboard.js           # Vendor login + event/submission dashboard logic
│   ├── event.js               # Public contact form logic (slug lookup + guest submission)
│   └── register.js             # Vendor sign-up + email verification logic
├── index.html                  # Vendor dashboard (root)
├── e.html                      # Public contact form, served at /e/<slug>
├── register.html                # Vendor registration + verification
├── vite.config.js              # Build config (multi-page: index + e + register)
├── package.json
└── amplify_outputs.json         # Auto-generated backend connection details (per-environment; see note below)
```

## Data model

### `Vendor`

One record per vendor account, created after their first login.

| Field | Type | Required | Notes |
|---|---|---|---|
| `fullName` | String | Yes | |
| `companyName` | String | Yes | Shown in the dashboard header |
| `email` | String | Yes | |
| `phone` | String | Yes | |
| `websiteUrl` | String | No | Defaults to `''` |
| `vendorId` | String | Yes | Slug generated from company name at registration time (not currently used for filtering — see `Event`/`Submission` below) |
| `logoKey` | String | No | S3 key for the uploaded logo, set after the first authenticated login |
| `description` | String | Yes | Brief description of the vendor's product/service, shown to attendees on the public event form |
| `brandColor` | String | No | Hex color chosen from a preset swatch palette at registration; re-tints the header/subbar on the public event form |

Authorization: `allow.owner()` — a vendor can only read/write their own record.

### `Event`

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | String | Yes | |
| `slug` | String | Yes | URL-friendly, generated from `name`; used in `/e/<slug>` |
| `vendorId` | String | No | Set to the creating vendor's Cognito `userId` (sub) |
| `eventUrl` | String | No | Optional vendor-provided link (e.g. event website) |
| `startDate` / `endDate` | Date | No | |
| `vendorCompanyName`, `vendorDescription`, `vendorLogoKey`, `vendorPhone`, `vendorContactEmail`, `vendorBrandColor` | String | No | Snapshot of the vendor's profile, copied from `Vendor` at the moment the event is created (see [Vendor logos and profile info](#vendor-logos-and-profile-info)) |

Authorization: guests can `read` (needed to resolve `/e/<slug>` on the public form); authenticated users can `create`/`read`/`update`/`delete`.

### `Submission`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | ID | Yes | Auto-generated primary key |
| `name` | String | Yes | |
| `email` | String | Yes | |
| `phone` | String | Yes | |
| `consent` | Boolean | Yes | Whether the attendee opted in to follow-up contact. **Informational only** — does not block submission either way |
| `submittedAt` | DateTime | No | Set by the client at submission time |
| `eventId` | ID | No | The `Event` this submission was made against |
| `eventName` | String | No | Denormalized at submit time for easy display in the dashboard |
| `vendorId` | String | No | The owning vendor's Cognito `userId` (sub), copied from the resolved `Event` |
| `vendorCompanyName`, `vendorDescription`, `vendorPhone`, `vendorContactEmail` | String | No | Copied from the resolved `Event` at submit time — the `notify-submission` Lambda reads these straight off the Submission stream record to build the confirmation email, with no extra database lookups |

Authorization: guests can `create` (this is what allows the public form to work without login); authenticated users can `read`/`delete`.

These rules are defined in `amplify/data/resource.ts` and enforced by AppSync itself, not by any custom backend code.

> **Note on multi-tenancy:** `Event` and `Submission` authorization only distinguishes guest vs. authenticated — it does not scope rows to the requesting vendor. Any logged-in vendor can technically query any vendor's events/submissions via the API. The dashboard filters by `vendorId` client-side (`dashboard.js`) for UX, but this is not a server-enforced security boundary today. Only `Vendor` records are truly isolated per owner.

## Vendor logos and profile info

Vendors upload a required logo/photo, write a required product/service description, and pick a brand color from a preset swatch palette during registration (`register.html`). Since the account isn't authenticated yet at that point, the logo is held as a base64 data URL in `localStorage` and uploaded to S3 (`vendorAssets` bucket, path `logos/<identity-id>/logo.<ext>`) on the vendor's first successful login, at which point `Vendor.logoKey` is set.

The `Vendor` record itself stays fully private (`allow.owner()` only) — there's no public-read access to it. Instead, the vendor's logo key, description, phone, email, and brand color are **snapshotted onto each `Event`** at the moment it's created (`dashboard.js`'s `handleAddEvent`), and (minus the brand color) again onto each `Submission` at the moment a guest submits (`event.js`). The public contact form (`e.html`) reads these fields off the resolved `Event` to render the vendor's logo/description/contact info and re-tint its header, and the confirmation-email Lambda reads the rest off the `Submission` stream record — neither ever queries `Vendor` directly.

**Brand color:** `e.html` exposes the header/subbar/icon/input-focus/checkbox colors as a `--brand-color` CSS custom property (default `#0C447C`, matching the original design). `event.js` overrides it via `document.documentElement.style.setProperty('--brand-color', ...)` once the event resolves. The subbar/icon use `color-mix(in srgb, var(--brand-color) 75%, white)` to reproduce the original lighter-tint relationship between the header and subbar for whatever color a vendor picks. Registration only offers 8 preset swatches (not a free color picker) specifically so every option stays legible against the header's light text without needing contrast-checking logic.

**Trade-off:** because this is a snapshot, not a live reference, editing a vendor's profile after an event has been created won't update that event's (or any of its submissions') display — there's no "edit profile" UI today, so this hasn't come up in practice, but it's worth knowing before adding one.

## Local development

### Prerequisites

- Node.js v18 or later
- An AWS account with credentials configured (`aws configure`)
- The AWS CDK bootstrapped once per account/region (`npx cdk bootstrap aws://ACCOUNT_ID/REGION`)

### Setup

```bash
npm install
npx ampx sandbox
```

This provisions a temporary, personal backend (Cognito pool, AppSync API, DynamoDB tables, S3 bucket) tied to your AWS account, and writes `amplify_outputs.json` with the connection details the frontend needs. Leave this running in a terminal — it watches for changes to the `amplify/` folder and redeploys automatically.

In a second terminal:

```bash
npx vite
```

Open:
- `http://localhost:5173/` — vendor dashboard (login)
- `http://localhost:5173/register.html` — vendor registration
- `http://localhost:5173/e.html?path=/e/<slug>` — public contact form for a given event (the clean `/e/<slug>` path relies on a hosting-level rewrite rule that isn't active under the plain Vite dev server; use the `?path=` query param locally instead)

> **Note:** The sandbox is for local development only. It is separate from the production backend used by the live, hosted site.

## Deployment

The production backend and frontend are deployed together via **AWS Amplify Hosting**, connected to the `main` branch of this GitHub repository. Every push to `main` triggers an automatic build and deploy, per `amplify.yml`.

### Build settings (Amplify Hosting)

| Setting | Value |
|---|---|
| Frontend build command | `npm run build` |
| Build output directory | `dist` |

> These are not auto-detected correctly by Amplify Hosting for this project type — they must be set manually when creating the app, or builds will fail to serve real content.

### `/e/<slug>` rewrite rule

The clean event URL (`/e/<slug>`) is served by rewriting to `e.html` — this rewrite rule is configured directly in the Amplify Hosting console (**App settings → Rewrites and redirects**), not in this repo. `event.js` reads the slug from `window.location.pathname` and falls back to a `?path=` query param, so it works whether the rewrite serves `e.html` directly or a catch-all serves it first.

### What gets deployed

Pushing to `main` provisions (or updates) a complete, independent backend stack:
- A Cognito User Pool (separate from the local sandbox's pool)
- An AppSync GraphQL API
- DynamoDB tables (`Vendor`, `Event`, `Submission`)
- An S3 bucket for vendor logos

Amplify Hosting builds the frontend (`npm run build`), bundling the production `amplify_outputs.json` into the JavaScript automatically, and publishes the result.

### Submission confirmation email

The `notify-submission` Lambda (`amplify/functions/notify-submission/`) is subscribed to the `Submission` table's DynamoDB Stream — every guest submission triggers it asynchronously, so a slow or failed email send never blocks or errors out the public contact form. It sends a plain-text email to the attendee via **Amazon SES**, using the `vendorCompanyName`/`vendorDescription`/`vendorPhone`/`vendorContactEmail` fields already present on the `Submission` record.

**Required setup before this works, in any environment (sandbox or production):**
1. Verify a sender identity (an email address or domain) in SES, in the `us-east-1` region (same region as the rest of the backend).
2. Set the `SES_SENDER_EMAIL` environment variable to that verified address before deploying, e.g. `SES_SENDER_EMAIL=you@yourdomain.com npx ampx sandbox` locally, or as an environment variable on the Amplify Hosting app for production deploys.
3. If the AWS account's SES access is still in **sandbox mode**, SES can only send to *verified* recipient addresses — request production access, or verify test recipient emails individually, before trying this with real attendee emails.

If `SES_SENDER_EMAIL` isn't set, the Lambda logs an error and skips sending — it does not fail the submission itself.

## Vendor accounts

Vendors create their own account by registering at `/register.html` — there is no manual Cognito setup step. Registration requires email verification (6-digit code) before the vendor can log in. Cognito password policy applies (the UI currently requires 8+ characters; Cognito itself may additionally require uppercase/lowercase/number/symbol depending on pool settings).

**Forgot password:** the login screen (`/`) has a "Forgot password?" link that walks the vendor through Cognito's standard reset flow — request a code (`resetPassword`), then submit the code with a new password (`confirmResetPassword`). Both are Amplify Auth APIs; no custom backend code is involved.

**Delete account:** the dashboard has a "Danger Zone" section where a vendor can permanently delete their account. Clicking it (after a confirmation prompt) deletes, in order: all of the vendor's `Submission` rows, all of their `Event` rows, their uploaded logo from S3, their `Vendor` record, and finally their Cognito user itself (via `deleteUser()`, which also ends the session). Data is deleted before the Cognito user so the client still has valid credentials to perform the authorized deletes; there's no rollback if a step partway through fails.

## The QR code

Each event's QR code encodes that event's share link:

```
https://<your-amplify-domain>.amplifyapp.com/e/<event-slug>
```

This link is shown in the dashboard next to each event once created. Regenerate the QR code whenever an event's slug or the hosting domain changes.

## Known limitations / things to watch

- **Consent is informational only.** The checkbox does not gate submission — it is stored as `true`/`false` for the vendor's reference.
- **No server-enforced multi-tenancy.** See the note under Data model — `vendorId` filtering for `Event`/`Submission` is client-side only.
- **Vendor profile info is snapshotted onto `Event`/`Submission`, not live.** Editing a vendor's profile after an event exists won't retroactively update it (there's no edit-profile UI today, so this is currently theoretical).
- **Confirmation emails require SES setup outside this repo** (verified sender identity, possibly production access) — see [Submission confirmation email](#submission-confirmation-email). Without it, submissions still succeed; only the email silently doesn't send.
- **Account deletion is best-effort, not transactional.** If it fails partway through (e.g. after deleting submissions but before deleting the Cognito user), there's no automatic rollback.
- **Brand color theming relies on CSS `color-mix()`** (Chrome 111+, Safari 16.2+, Firefox 113+ — all in wide use since 2023). On older browsers the subbar/icon just won't tint correctly; the header itself still applies fine since it's a plain `var()`.
- **No rate limiting.** Since the contact form is public and requires no login, it's technically possible for someone to submit spam entries. Consider AWS WAF on the AppSync API if this becomes a problem at a public event.
- **Manual Cognito/DynamoDB changes are risky.** Deleting resources directly from the AWS Console (rather than through `amplify` commands or redeploys) can leave the CloudFormation stack in a drifted state, causing `Unauthorized` errors on subsequent guest writes. If this happens, the most reliable fix is a full teardown and redeploy of the affected stack rather than attempting to patch IAM roles by hand.
- **Sandbox vs. production are entirely separate backends.** A user, login, or data created in one will not appear in the other.
- **`amplify_outputs.json` is committed to this repo**, despite `.gitignore` intending to exclude Amplify-generated files (the `amplify` entry only matches a path literally named `amplify`, not `amplify_outputs.json`). It's regenerated per-environment by `ampx sandbox`/`ampx generate outputs`, so treat a stale-looking copy as something to regenerate, not hand-edit.

## Possible future improvements

- Display the vendor logo/profile on the dashboard itself (currently only shown on the public event form)
- Server-enforced per-vendor authorization on `Event`/`Submission` (rather than client-side filtering)
- An "edit profile" UI for vendors, plus a decision on whether to re-sync existing events/submissions when a profile changes
- Custom domain for the hosted site (cosmetic, no architecture change required)
- CSV export from the dashboard
- AWS WAF rate limiting on the public submission endpoint
- Email notification to the *vendor* on each new submission (the `notify-submission` Lambda currently only emails the attendee)
