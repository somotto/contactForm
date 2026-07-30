import { defineFunction } from '@aws-amplify/backend';

// Backs the requestPasswordReset/confirmPasswordReset custom mutations
// (data/resource.ts). Cognito's own ForgotPassword/ConfirmForgotPassword APIs
// can't be used here: when a user pool has email MFA enabled (auth/resource.ts),
// Cognito reserves the email channel for MFA and refuses to also use it for
// account-recovery code delivery — ForgotPassword throws InvalidParameterException
// ("no registered/verified email or phone_number") even for confirmed, verified
// accounts, since no vendor has a verified phone number either. This function
// reimplements the same code-then-confirm flow ourselves: generate a code,
// email it via SES, then on confirmation call AdminSetUserPassword directly.
export const passwordReset = defineFunction({
  name: 'password-reset',
  entry: './handler.ts',
  timeoutSeconds: 15,
  environment: {
    SES_SENDER_EMAIL: process.env.SES_SENDER_EMAIL ?? '',
  },
});
