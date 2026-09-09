import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { passwordReset } from '../functions/password-reset/resource';

const schema = a.schema({
  Vendor: a
    .model({
      fullName: a.string().required(),
      companyName: a.string().required(),
      email: a.string().required(),
      phone: a.string().required(),
      websiteUrl: a.string().default(''),
      vendorId: a.string().required(),
      logoKey: a.string(),
      description: a.string().required(),
      products: a.string().array(),
      brandColor: a.string(),
    })
    .authorization((allow) => [
      allow.owner(),
    ]),

  Event: a
    .model({
      name: a.string().required(),
      slug: a.string().required(),
      vendorId: a.string(),
      eventUrl: a.string(),
      venue: a.string(),
      startDate: a.date(),
      endDate: a.date(),
      vendorCompanyName: a.string(),
      vendorDescription: a.string(),
      vendorProducts: a.string().array(),
      vendorLogoKey: a.string(),
      vendorPhone: a.string(),
      vendorContactEmail: a.string(),
      vendorBrandColor: a.string(),
    })
    .authorization((allow) => [
      allow.publicApiKey().to(['read']),
      allow.ownerDefinedIn('vendorId').identityClaim('sub').to(['create', 'read', 'update', 'delete']),
    ]),

  Submission: a
    .model({
      name: a.string().required(),
      email: a.string().required(),
      phone: a.string().required(),
      consent: a.boolean().required(),
      submittedAt: a.datetime(),
      eventId: a.id(),
      eventName: a.string(),
      vendorId: a.string(),
      vendorCompanyName: a.string(),
      vendorDescription: a.string(),
      vendorProducts: a.string().array(),
      vendorPhone: a.string(),
      vendorContactEmail: a.string(),
      comment: a.string(),
    })
    .authorization((allow) => [
      allow.publicApiKey().to(['create']),
      allow.ownerDefinedIn('vendorId').identityClaim('sub').to(['read', 'delete']),
    ]),

  // Custom password-reset flow — see functions/password-reset/resource.ts for
  // why Cognito's own ForgotPassword can't be used here (email MFA blocks it).
  requestPasswordReset: a
    .mutation()
    .arguments({ email: a.string().required() })
    .returns(a.boolean())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(passwordReset)),

  confirmPasswordReset: a
    .mutation()
    .arguments({
      email: a.string().required(),
      code: a.string().required(),
      newPassword: a.string().required(),
    })
    .returns(a.boolean())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(passwordReset)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});
