import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { EventBridgeHandler } from 'aws-lambda';
import { ReceiptParseError, parseReceiptImage } from '../lib/bedrock';
import { listCategories } from '../repositories/categories';
import { markFailed, markParsed } from '../repositories/receipts';

const s3 = new S3Client({});

/** Keys are written as `receipts/<userId>/<receiptId>`. */
export function parseKey(key: string): { userId: string; receiptId: string } | null {
  const parts = key.split('/');
  const [prefix, userId, receiptId] = parts;

  return parts.length === 3 && prefix === 'receipts' && userId && receiptId
    ? { userId, receiptId }
    : null;
}

interface ObjectCreated {
  bucket: { name: string };
  object: { key: string };
}

/**
 * Runs when a receipt image lands in S3. Failures are recorded on the receipt
 * rather than thrown, so the user sees why instead of watching a spinner — and
 * so Lambda does not retry work the model will reject the same way twice.
 */
export const handler: EventBridgeHandler<'Object Created', ObjectCreated, void> = async (event) => {
  const { key } = event.detail.object;
  const parsed = parseKey(key);

  if (!parsed) {
    console.error('Ignoring object with an unexpected key', key);
    return;
  }

  const { userId, receiptId } = parsed;

  try {
    const object = await s3.send(
      new GetObjectCommand({ Bucket: event.detail.bucket.name, Key: key }),
    );
    const image = await object.Body?.transformToByteArray();

    if (!image) {
      throw new ReceiptParseError('The uploaded image was empty');
    }

    const categories = await listCategories(userId);
    const result = await parseReceiptImage(
      image,
      object.ContentType ?? 'image/jpeg',
      categories.map(({ id, name }) => ({ id, name })),
    );

    await markParsed(userId, receiptId, result);
  } catch (error) {
    // Only blame the image when the model actually looked at it. Anything else
    // is our problem, and saying "try a clearer photo" would send the user off
    // retaking pictures of a perfectly good receipt.
    const message =
      error instanceof ReceiptParseError
        ? error.message
        : 'Receipt scanning is unavailable right now. Please try again later.';

    console.error('Receipt parsing failed', { receiptId, error });
    await markFailed(userId, receiptId, message);
  }
};
