import { defineBackend } from '@aws-amplify/backend';
import { StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
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


backend.notifySubmission.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'],
  })
);
