import type { DynamoDBStreamHandler } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({});
const senderEmail = process.env.SES_SENDER_EMAIL;

export const handler: DynamoDBStreamHandler = async (event) => {
  if (!senderEmail) {
    console.error('SES_SENDER_EMAIL is not set — skipping confirmation emails.');
    return;
  }

  for (const record of event.Records) {
    if (record.eventName !== 'INSERT' || !record.dynamodb?.NewImage) continue;

    const submission = unmarshall(
      record.dynamodb.NewImage as Parameters<typeof unmarshall>[0]
    );

    try {
      await sendConfirmationEmail(submission);
    } catch (err) {
      console.error('Failed to send confirmation email for submission', submission.id, err);
    }
  }
};

async function sendConfirmationEmail(submission: Record<string, unknown>) {
  const toEmail = submission.email as string;
  if (!toEmail) return;

  const eventName = (submission.eventName as string) || 'the event';
  const vendorCompanyName = (submission.vendorCompanyName as string) || '';
  const vendorDescription = (submission.vendorDescription as string) || '';
  const vendorPhone = (submission.vendorPhone as string) || '';
  const vendorContactEmail = (submission.vendorContactEmail as string) || '';

  const contactLine = [vendorPhone, vendorContactEmail].filter(Boolean).join(' · ');

  const bodyLines = [
    `Hi ${submission.name || ''},`,
    '',
    `Thanks for registering at ${eventName}${vendorCompanyName ? ` with ${vendorCompanyName}` : ''}.`,
    vendorDescription ? `\n${vendorCompanyName || 'The vendor'}: ${vendorDescription}` : '',
    contactLine ? `\nYou can reach them at: ${contactLine}` : '',
  ].filter(Boolean);

  await ses.send(new SendEmailCommand({
    Source: senderEmail,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: `Thanks for registering — ${eventName}` },
      Body: { Text: { Data: bodyLines.join('\n') } },
    },
  }));
}
