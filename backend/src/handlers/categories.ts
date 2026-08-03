import { getAuthenticatedUser } from '../lib/auth';
import { errorResponse, jsonResponse } from '../lib/http';
import { router } from '../lib/router';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../repositories/categories';
import { categoryInputSchema, parseBody } from '../lib/validation';

export const handler = router({
  'GET /categories': async (event) => {
    const { userId } = getAuthenticatedUser(event);

    return jsonResponse(200, { categories: await listCategories(userId) });
  },

  'POST /categories': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const input = parseBody(categoryInputSchema, event.body);

    return jsonResponse(201, await createCategory(userId, input));
  },

  'PUT /categories/{id}': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const id = event.pathParameters?.['id'] ?? '';
    const input = parseBody(categoryInputSchema, event.body);
    const updated = await updateCategory(userId, id, input);

    return updated ? jsonResponse(200, updated) : errorResponse(404, 'Category not found');
  },

  'DELETE /categories/{id}': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const id = event.pathParameters?.['id'] ?? '';

    return (await deleteCategory(userId, id))
      ? { statusCode: 204 }
      : errorResponse(404, 'Category not found');
  },
});
