import { defineAuth } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 *
 * Email MFA (`multifactor: { mode: 'REQUIRED', email: true }`) is implemented
 * client-side (index.html/dashboard.js `#otp-card`, `confirmSignIn`) but left
 * disabled here for now: Cognito's email MFA requires SES-backed sending
 * (`senders.email.fromEmail`, an `emailSendingAccount: DEVELOPER` config),
 * and until this AWS account has SES *production* access, any vendor whose
 * email isn't individually pre-verified in SES would never receive their
 * code and get locked out of login entirely. Re-enable once production
 * access is confirmed.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});
