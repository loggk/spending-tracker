import { getAuthenticatedUser } from '../lib/auth';
import { jsonResponse } from '../lib/http';
import { router } from '../lib/router';
import { runAssistantChat } from '../lib/assistant';
import { assistantChatSchema, parseBody } from '../lib/validation';

export const handler = router({
  'POST /assistant/chat': async (event) => {
    const { userId } = getAuthenticatedUser(event);
    const { messages } = parseBody(assistantChatSchema, event.body);

    const result = await runAssistantChat(userId, messages);
    return jsonResponse(200, result);
  },
});
