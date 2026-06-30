import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Event: a
    .model({
      name: a.string().required(),
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
      event: a.belongsTo('Event', 'eventId'),
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