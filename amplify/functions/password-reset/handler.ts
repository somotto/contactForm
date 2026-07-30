import type { AppSyncResolverEvent } from 'aws-lambda';
import { randomInt, createHash } from 'crypto';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const cognito = new CognitoIdentityProviderClient({});
const dynamo = new DynamoDBClient({});
const ses = new SESClient({});

const USER_POOL_ID = process.env.USER_POOL_ID as string;
const TABLE_NAME = process.env.RESET_CODES_TABLE_NAME as string;
const SENDER_EMAIL = process.env.SES_SENDER_EMAIL;

const CODE_TTL_SECONDS = 10 * 60;
const MIN_RESEND_INTERVAL_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

type RequestArgs = { email: string };
type ConfirmArgs = { email: string; code: string; newPassword: string };

export const handler = async (
  event: AppSyncResolverEvent<RequestArgs | ConfirmArgs>
): Promise<boolean> => {
  switch (event.info.fieldName) {
    case 'requestPasswordReset':
      return requestPasswordReset((event.arguments as RequestArgs).email);
    case 'confirmPasswordReset': {
      const { email, code, newPassword } = event.arguments as ConfirmArgs;
      return confirmPasswordReset(email, code, newPassword);
    }
    default:
      throw new Error(`Unsupported field: ${event.info.fieldName}`);
  }
};

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

async function requestPasswordReset(email: string): Promise<boolean> {
  if (!SENDER_EMAIL) {
    throw new Error('SES_SENDER_EMAIL is not configured.');
  }

  let userStatus: string | undefined;
  try {
    const user = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: email })
    );
    userStatus = user.UserStatus;
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'UserNotFoundException') {
      throw new Error('NoAccountFound');
    }
    throw err;
  }

  if (userStatus !== 'CONFIRMED') {
    throw new Error('AccountNotConfirmed');
  }

  const existing = await dynamo.send(
    new GetItemCommand({ TableName: TABLE_NAME, Key: marshall({ email }) })
  );
  if (existing.Item) {
    const record = unmarshall(existing.Item) as { createdAt: number };
    if (record.createdAt > Date.now() - MIN_RESEND_INTERVAL_MS) {
      throw new Error('TooManyRequests');
    }
  }

  const code = randomInt(100000, 999999).toString();
  const now = Date.now();

  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall({
        email,
        codeHash: hashCode(code),
        createdAt: now,
        expiresAt: Math.floor(now / 1000) + CODE_TTL_SECONDS,
        attempts: 0,
      }),
    })
  );

  await ses.send(
    new SendEmailCommand({
      Source: SENDER_EMAIL,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: 'Your password reset code' },
        Body: {
          Text: {
            Data: `Your password reset code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
          },
        },
      },
    })
  );

  return true;
}

async function confirmPasswordReset(
  email: string,
  code: string,
  newPassword: string
): Promise<boolean> {
  const result = await dynamo.send(
    new GetItemCommand({ TableName: TABLE_NAME, Key: marshall({ email }) })
  );
  if (!result.Item) {
    throw new Error('CodeExpiredOrInvalid');
  }

  const record = unmarshall(result.Item) as {
    codeHash: string;
    expiresAt: number;
    attempts: number;
  };

  if (record.expiresAt * 1000 < Date.now()) {
    await dynamo.send(
      new DeleteItemCommand({ TableName: TABLE_NAME, Key: marshall({ email }) })
    );
    throw new Error('CodeExpiredOrInvalid');
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await dynamo.send(
      new DeleteItemCommand({ TableName: TABLE_NAME, Key: marshall({ email }) })
    );
    throw new Error('TooManyAttempts');
  }

  if (hashCode(code) !== record.codeHash) {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: marshall({ email }),
        UpdateExpression: 'SET attempts = attempts + :one',
        ExpressionAttributeValues: marshall({ ':one': 1 }),
      })
    );
    throw new Error('CodeMismatch');
  }

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: newPassword,
      Permanent: true,
    })
  );

  await dynamo.send(
    new DeleteItemCommand({ TableName: TABLE_NAME, Key: marshall({ email }) })
  );

  return true;
}
