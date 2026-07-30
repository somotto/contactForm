import { defineBackend } from '@aws-amplify/backend';
import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, StreamViewType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Function as LambdaFunction, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CfnUserPool } from 'aws-cdk-lib/aws-cognito';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { notifySubmission } from './functions/notify-submission/resource';
import { passwordReset } from './functions/password-reset/resource';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/
 */
const backend = defineBackend({
  auth,
  data,
  storage,
  notifySubmission,
  passwordReset,
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

// Backing store for password-reset codes (see functions/password-reset/resource.ts).
// Provisioned directly via CDK rather than as an a.model() in data/resource.ts so
// it's never reachable through the GraphQL API under any auth mode — only the
// passwordReset Lambda can read/write it, via the IAM grant below. TTL on
// expiresAt lets DynamoDB clean up expired codes automatically.
const resetCodesTable = new Table(backend.passwordReset.resources.lambda, 'PasswordResetCodesTable', {
  partitionKey: { name: 'email', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'expiresAt',
  removalPolicy: RemovalPolicy.DESTROY,
});
resetCodesTable.grantReadWriteData(backend.passwordReset.resources.lambda);

backend.passwordReset.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['cognito-idp:AdminGetUser', 'cognito-idp:AdminSetUserPassword'],
    resources: [backend.auth.resources.userPool.userPoolArn],
  })
);

backend.passwordReset.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'],
  })
);

// Use the L2 addEnvironment() API, not the L1 cfnResources.cfnFunction.environment
// property — defineFunction's own `environment: { SES_SENDER_EMAIL }` (resource.ts)
// is applied to the L2 construct and only rendered into the L1 property lazily at
// synth time. Reading and overwriting cfnFunction.environment directly here ran
// before that sync happened and silently wiped SES_SENDER_EMAIL from the deployed
// function (confirmed via `aws lambda get-function-configuration` showing only
// USER_POOL_ID/RESET_CODES_TABLE_NAME present). addEnvironment() merges instead.
const passwordResetFunction = backend.passwordReset.resources.lambda as LambdaFunction;
passwordResetFunction.addEnvironment('USER_POOL_ID', backend.auth.resources.userPool.userPoolId);
passwordResetFunction.addEnvironment('RESET_CODES_TABLE_NAME', resetCodesTable.tableName);
