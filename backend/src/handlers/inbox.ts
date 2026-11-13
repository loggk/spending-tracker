import { getAuthenticatedUser } from '../lib/auth';
import { errorResponse, jsonResponse } from '../lib/http';
import { router } from '../lib/router';
import { ingestAliasSchema, parseBody, transactionInputSchema } from '../lib/validation';
import { getAliasForUser, putAlias } from '../repositories/ingest-aliases';
import { putMapping } from '../repositories/merchant-mappings';
import { deletePending, getPending, listPending } from '../repositories/pending-transactions';
import { createTransaction } from '../repositories/transactions';

/**
 * Empty until a receiving domain is configured. The review queue is useful on
 * its own, so the rest of these routes work either way — only handing out an
 * address needs somewhere for mail to arrive.
 */
const ingestDomain = (): string => process.env['INGEST_DOMAIN'] ?? '';

const toAddress = (token: string): string => `tx-${token}@${ingestDomain()}`;

const NOT_CONFIGURED = 'Email ingestion is not configured for this deployment';

export const handler = router({
  'GET /inbox': async (event) => {
    const { userId } = getAuthenticatedUser(event);

    return jsonResponse(200, { pending: await listPending(userId) });
  },

  /**
   * Accepts an inbox row. The transaction is built from the request, not from
   * what was parsed, because the user can edit every field before confirming —
   * so this is the same validation a hand-entered transaction gets.
   *
   * Confirming also records the merchant's category, which is what makes the
   * next alert from that merchant arrive already categorised.
   */
  'POST /inbox/{id}/confirm': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const id = event.pathParameters?.['id'] ?? '';

    const pending = await getPending(userId, id);
    if (!pending) {
      return errorResponse(404, 'That inbox item is no longer there');
    }

    const input = parseBody(transactionInputSchema, event.body);
    const transaction = await createTransaction(userId, input);

    await putMapping(userId, pending.merchantSanitized, input.categoryId);
    await deletePending(userId, id);

    return jsonResponse(201, { transaction });
  },

  'DELETE /inbox/{id}': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const removed = await deletePending(userId, event.pathParameters?.['id'] ?? '');

    return removed ? { statusCode: 204 } : errorResponse(404, 'That inbox item is no longer there');
  },

  'GET /ingest-alias': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const alias = ingestDomain() === '' ? null : await getAliasForUser(userId);

    // Null rather than generating one on read: an address only exists once the
    // user asks for it, so a GET never writes.
    return jsonResponse(
      200,
      alias === null
        ? null
        : {
            address: toAddress(alias.token),
            ...(alias.forwardFrom !== undefined && { forwardFrom: alias.forwardFrom }),
            createdAt: alias.createdAt,
          },
    );
  },

  'POST /ingest-alias': async (event) => {
    const { userId } = getAuthenticatedUser(event);

    if (ingestDomain() === '') {
      return errorResponse(503, NOT_CONFIGURED);
    }

    const input = parseBody(ingestAliasSchema, event.body);

    const alias = await putAlias(userId, {
      forwardFrom: input.forwardFrom,
      rotate: input.rotate,
    });

    return jsonResponse(200, {
      address: toAddress(alias.token),
      ...(alias.forwardFrom !== undefined && { forwardFrom: alias.forwardFrom }),
      createdAt: alias.createdAt,
    });
  },
});
