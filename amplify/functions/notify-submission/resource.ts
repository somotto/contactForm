import { defineFunction } from '@aws-amplify/backend';

// Sends a confirmation email to attendees after they submit the public contact
// form. Triggered by the Submission table's DynamoDB Stream (see backend.ts) —
// not called synchronously from the guest-facing form, so email delivery
// problems never block or fail a submission.
export const notifySubmission = defineFunction({
  name: 'notify-submission',
  entry: './handler.ts',
  timeoutSeconds: 30,
  environment: {
    // Must be a verified SES sender identity (email or domain) in the same
    // region as the backend (us-east-1). Set this before deploying, e.g.:
    //   SES_SENDER_EMAIL=you@yourdomain.com npx ampx sandbox
    SES_SENDER_EMAIL: process.env.SES_SENDER_EMAIL ?? '',
  },
});
