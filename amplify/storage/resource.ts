import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'vendorAssets',
  access: (allow) => ({
    // Authenticated vendors can upload their own logo.
    // The {entity_id} token maps to the authenticated user's identity ID.
    // Guests can read (so logos display on the public contact form).
    'logos/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.guest.to(['read']),
      allow.authenticated.to(['read']),
    ],
  }),
});
