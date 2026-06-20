# Event Contact Registration System

A QR-code-driven event check-in system. Attendees scan a QR code, fill out a short contact form, and their details are stored in DynamoDB. The event owner logs in to a separate dashboard to view everyone who has registered.

## How it works

```
Event Attendees → QR Code → Contact Form → DynamoDB
                                                ↕
                          Owner → Login → Dashboard (reads DynamoDB)
```

1. **Attendees** scan a QR code printed/displayed at the event.
2. The QR code opens the **contact form** (`index.html`) in their phone's browser.
3. On submit, the form writes a record directly to **DynamoDB** via an AWS AppSync GraphQL API — no backend server code required.
4. The **owner** logs into a separate **dashboard** (`dashboard.html`) using a Cognito account.
5. Once authenticated, the dashboard reads all submissions from DynamoDB and displays them in a table.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Plain HTML, CSS, JavaScript (Vite-bundled) |
| Backend | AWS Amplify Gen 2 |
| Authentication | Amazon Cognito (email + password) |
| API | AWS AppSync (GraphQL) |
| Database | Amazon DynamoDB |
| Hosting | AWS Amplify Hosting |
| Source control / CI | GitHub → Amplify Hosting auto-deploy |

This stack was chosen to keep the project as simple as possible: Amplify Gen 2 provisions Cognito, AppSync, and DynamoDB automatically from a single schema definition, with no hand-written Lambda functions or manually configured IAM policies.

## Project structure

```
contactForm/
├── amplify/
│   ├── auth/
│   │   └── resource.ts       # Cognito configuration (email login)
│   ├── data/
│   │   └── resource.ts       # Submission model + authorization rules
│   └── backend.ts            # Ties auth and data together
├── src/
│   ├── main.js                # Form submission logic (writes to DynamoDB)
│   └── dashboard.js           # Login + table rendering logic (reads DynamoDB)
├── index.html                  # Public contact form (attendee-facing)
├── dashboard.html               # Owner login + submissions table
├── vite.config.js              # Build config (multi-page: index + dashboard)
├── package.json
└── amplify_outputs.json        # Auto-generated backend connection details (not committed)
```

## Data model

Each form submission is stored as a `Submission` record with the following fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | ID | Yes | Auto-generated primary key |
| `name` | String | Yes | Full legal name |
| `email` | String | Yes | Corporate email address |
| `phone` | String | Yes | Direct telephone number |
| `consent` | Boolean | Yes | Whether the attendee opted in to follow-up contact. **Optional field on the form** — does not block submission either way |
| `submittedAt` | DateTime | No | Set by the client at submission time |
| `createdAt` | DateTime | No | Auto-set by AppSync |
| `updatedAt` | DateTime | No | Auto-set by AppSync |

### Authorization rules

- **Guests (unauthenticated)** can `create` submissions — this is what allows the public form to work without requiring attendees to log in.
- **Authenticated users** (i.e., the owner, after Cognito login) can `read` and `delete` submissions — this is what powers the dashboard.

These rules are defined in `amplify/data/resource.ts` and are enforced by AppSync itself, not by any custom backend code.

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

This provisions a temporary, personal backend (Cognito pool, AppSync API, DynamoDB table) tied to your AWS account, and writes `amplify_outputs.json` with the connection details the frontend needs. Leave this running in a terminal — it watches for changes to the `amplify/` folder and redeploys automatically.

In a second terminal:

```bash
npx vite
```

Open `http://localhost:5173/` to test the form, and `http://localhost:5173/dashboard.html` to test the dashboard.

> **Note:** The sandbox is for local development only. It is separate from the production backend used by the live, hosted site.

## Deployment

The production backend and frontend are deployed together via **AWS Amplify Hosting**, connected to the `main` branch of this GitHub repository. Every push to `main` triggers an automatic build and deploy.

### Build settings (Amplify Hosting)

| Setting | Value |
|---|---|
| Frontend build command | `npm run build` |
| Build output directory | `dist` |

> These are not auto-detected correctly by Amplify Hosting for this project type — they must be set manually when creating the app, or builds will fail to serve real content.

### What gets deployed

Pushing to `main` provisions (or updates) a complete, independent backend stack:
- A Cognito User Pool (separate from the local sandbox's pool)
- An AppSync GraphQL API
- A DynamoDB table

Amplify Hosting builds the frontend (`npm run build`), bundling the production `amplify_outputs.json` into the JavaScript automatically, and publishes the result.

## Setting up the owner account

The Cognito User Pool starts empty — there is no default owner login. To create one:

1. **AWS Console → Cognito → User pools** → select the pool tied to the deployed app (not the sandbox pool).
2. **Users → Create user**
   - Enter a real email address
   - Set a temporary password
   - Check **"Mark email address as verified"**
3. Set the password to permanent via the AWS CLI (the Console does not expose this directly for unconfirmed users):

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id <USER_POOL_ID> \
  --username <owner-email> \
  --password "<PermanentPassword123!>" \
  --permanent
```

The owner can now log in directly at `/dashboard.html` with that email and password.

## The QR code

The QR code simply encodes the live form's URL:

```
https://<your-amplify-domain>.amplifyapp.com/
```

Any QR code generator can produce this. Regenerate it whenever the hosting domain changes (e.g., after connecting a custom domain).

## Known limitations / things to watch

- **Consent is informational only.** The checkbox does not gate submission — it is stored as `true`/`false` for the owner's reference, per project requirements.
- **No rate limiting.** Since the form is public and requires no login, it is technically possible for someone to submit spam entries. Consider adding AWS WAF on the AppSync API if this becomes a problem at a public event.
- **Manual Cognito/DynamoDB changes are risky.** Deleting resources directly from the AWS Console (rather than through `amplify` commands or redeploys) can leave the CloudFormation stack in a drifted state, causing `Unauthorized` errors on subsequent guest writes. If this happens, the most reliable fix is a full teardown and redeploy of the affected stack rather than attempting to patch IAM roles by hand.
- **Sandbox vs. production are entirely separate backends.** A user, login, or data created in one will not appear in the other.

## Possible future improvements

- Custom domain for the hosted site (cosmetic, no architecture change required)
- Multiple events / a way to tag submissions by event if this form is reused
- CSV export from the dashboard
- AWS WAF rate limiting on the public submission endpoint
- Email notification to the owner on each new submission (would require adding a Lambda function triggered by DynamoDB Streams)
