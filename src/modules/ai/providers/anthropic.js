import Anthropic from '@anthropic-ai/sdk';
import { AiProviderError } from '../../../lib/errors.js';
import { logger } from '../../../config/logger.js';

/**
 * Generates content using the Anthropic messages API.
 *
 * @param {{ systemPrompt: string, userPrompt: string, apiKey: string, model?: string }} params
 * @returns {Promise<{ content: string, tokensUsed: number }>}
 */
export async function generateAnthropic({
  systemPrompt,
  userPrompt,
  apiKey,
  model = 'claude-haiku-4-5',
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create(
      {
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      { signal: controller.signal },
    );

    const content = response.content[0]?.text ?? '';
    const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    logger.info({ model, tokensUsed }, 'anthropic generation complete');

    return { content, tokensUsed };
  } catch (err) {
    throw new AiProviderError(`Anthropic request failed: ${err.message}`, { cause: err });
  } finally {
    clearTimeout(timeoutId);
  }
}
