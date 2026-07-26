import { defineAuth } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 *
 * Email MFA is REQUIRED on every login: after a correct password, Cognito
 * emails a 6-digit code (via the SES-backed sender below) and the client
 * (index.html/dashboard.js `#otp-card`, `confirmSignIn`) must submit it to
 * complete sign-in. This applies to the very first login after registration
 * too, since register.js's post-registration login goes through the same
 * signIn() call path.
 *
 * senders.email.fromEmail must be a verified SES identity in the same
 * region as the backend (us-east-1), and this AWS account must have SES
 * production access — otherwise a vendor whose email isn't individually
 * pre-verified in SES would never receive their code and get permanently
 * stuck at the OTP screen. Both are confirmed true as of enabling this.
 * Set via the SES_SENDER_EMAIL environment variable (same variable the
 * notify-submission function reads) before running `ampx sandbox` /
 * `pipeline-deploy`.
 *
 * accountRecovery is set explicitly because Cognito rejects
 * EmailMfaConfiguration when the user pool's recovery mechanisms contain
 * only `verified_email` (Amplify's default when only email login is
 * configured) — it requires at least one non-email mechanism to be listed.
 * 'EMAIL_AND_PHONE_WITHOUT_MFA' keeps email as the priority-1 recovery
 * method (so `resetPassword`/`confirmResetPassword` in dashboard.js behave
 * exactly as before) and lists phone as a fallback purely to satisfy that
 * constraint — no vendor currently has a verified phone number, so it's
 * never actually used.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  multifactor: {
    mode: 'REQUIRED',
    email: true,
  },
  accountRecovery: 'EMAIL_AND_PHONE_WITHOUT_MFA',
  senders: {
    email: {
      fromEmail: process.env.SES_SENDER_EMAIL ?? '',
    },
  },
});
