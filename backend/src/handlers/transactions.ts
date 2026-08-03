import { getAuthenticatedUser } from '../lib/auth';
import { errorResponse, jsonResponse } from '../lib/http';
import { router } from '../lib/router';
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from '../repositories/transactions';
import {
  listTransactionsQuerySchema,
  parseBody,
  parseInput,
  transactionInputSchema,
} from '../lib/validation';

export const handler = router({
  'GET /transactions': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const query = parseInput(listTransactionsQuerySchema, event.queryStringParameters ?? {});

    return jsonResponse(200, { transactions: await listTransactions(userId, query) });
  },

  'POST /transactions': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const input = parseBody(transactionInputSchema, event.body);

    return jsonResponse(201, await createTransaction(userId, input));
  },

  'PUT /transactions/{id}': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const id = event.pathParameters?.['id'] ?? '';
    const input = parseBody(transactionInputSchema, event.body);
    const updated = await updateTransaction(userId, id, input);

    return updated ? jsonResponse(200, updated) : errorResponse(404, 'Transaction not found');
  },

  'DELETE /transactions/{id}': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const id = event.pathParameters?.['id'] ?? '';

    return (await deleteTransaction(userId, id))
      ? { statusCode: 204 }
      : errorResponse(404, 'Transaction not found');
  },
});
