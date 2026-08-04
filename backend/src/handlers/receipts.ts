import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getAuthenticatedUser } from '../lib/auth';
import { errorResponse, jsonResponse } from '../lib/http';
import { router } from '../lib/router';
import { confirmReceiptSchema, parseBody } from '../lib/validation';
import { createReceipt, getReceipt } from '../repositories/receipts';
import { createTransactions } from '../repositories/transactions';

const s3 = new S3Client({});

const bucketName = (): string => {
  const name = process.env['RECEIPTS_BUCKET'];
  if (!name) {
    throw new Error('RECEIPTS_BUCKET environment variable is not set');
  }
  return name;
};

/** Long enough to upload a photo over a slow connection, short enough to expire. */
const UPLOAD_URL_TTL_SECONDS = 300;

export const handler = router({
  // Hands back a URL the browser uploads to directly, so image bytes never pass
  // through the API. The key embeds the user id, which the parser reads back.
  'POST /receipts': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const { id, s3Key } = await createReceipt(
      userId,
      (receiptId) => `receipts/${userId}/${receiptId}`,
    );

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: bucketName(), Key: s3Key }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );

    return jsonResponse(201, { receiptId: id, uploadUrl });
  },

  'GET /receipts/{id}': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const receipt = await getReceipt(userId, event.pathParameters?.['id'] ?? '');

    return receipt ? jsonResponse(200, receipt) : errorResponse(404, 'Receipt not found');
  },

  // The user reviews and edits what the model read, so the confirmed items are
  // taken from the request rather than from the stored parse.
  'POST /receipts/{id}/confirm': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const id = event.pathParameters?.['id'] ?? '';

    const receipt = await getReceipt(userId, id);
    if (!receipt) {
      return errorResponse(404, 'Receipt not found');
    }

    const { items } = parseBody(confirmReceiptSchema, event.body);
    const created = await createTransactions(userId, items);

    return jsonResponse(201, { transactions: created });
  },
});
