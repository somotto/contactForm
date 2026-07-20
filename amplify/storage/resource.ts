import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'vendorAssets',
  access: (allow) => ({
    // Each vendor can only read/write their own folder
    'logos/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.guest.to(['read']),           // public guests can read logos to display on the form
      allow.authenticated.to(['read']),
    ],
  }),
});
