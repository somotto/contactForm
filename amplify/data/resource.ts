import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Vendor: a
    .model({
      fullName: a.string().required(),
      companyName: a.string().required(),
      email: a.string().required(),
      phone: a.string().required(),
      websiteUrl: a.string(),
      vendorId: a.string().required(),
    })
    .authorization((allow) => [
      allow.owner(),
    ]),

  Event: a
    .model({
      name: a.string().required(),
      vendorId: a.string().required(),
      eventUrl: a.string(),
      startDate: a.date(),
      endDate: a.date(),
    })
    .authorization((allow) => [
      allow.guest().to(['read']),
      allow.authenticated().to(['create', 'read', 'update', 'delete']),
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
    })
    .authorization((allow) => [
      allow.guest().to(['create']),
      allow.authenticated().to(['read', 'delete']),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool',
  },
});