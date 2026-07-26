import { defineBackend } from '@aws-amplify/backend';
import { Stack } from 'aws-cdk-lib';
import { StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CfnUserPool } from 'aws-cdk-lib/aws-cognito';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { notifySubmission } from './functions/notify-submission/resource';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/
 */
const backend = defineBackend({
  auth,
  data,
  storage,
  notifySubmission,
});

// Enable a stream on the Submission table so notifySubmission can be triggered by it.

const submissionTable = backend.data.resources.tables['Submission'];
backend.data.resources.cfnResources.amplifyDynamoDbTables['Submission'].streamSpecification = {
  streamViewType: StreamViewType.NEW_IMAGE,
};

// Amplify's `senders.email.fromEmail` (auth/resource.ts) makes Cognito build its
// SES SourceArn from the literal from-address (identity/no-reply@theeventconnector.com),
// which requires that exact address to complete its own SES click-through
// verification — domain verification doesn't cover it. Override the L1 resource to
// point at the domain identity ARN instead (CDK supports this via UserPoolEmail's
// `sesVerifiedDomain`, but Amplify Gen 2's simplified `senders.email` doesn't expose it),
// since the domain itself is fully SES-verified and any address under it is valid to send from.
const senderEmail = process.env.SES_SENDER_EMAIL;
if (senderEmail) {
  const senderDomain = senderEmail.split('@')[1];
  const cfnUserPool = backend.auth.resources.cfnResources.cfnUserPool;
  cfnUserPool.emailConfiguration = {
    ...(cfnUserPool.emailConfiguration as CfnUserPool.EmailConfigurationProperty),
    sourceArn: Stack.of(cfnUserPool).formatArn({
      service: 'ses',
      resource: 'identity',
      resourceName: senderDomain,
    }),
  };
}


backend.notifySubmission.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'],
  })
);
