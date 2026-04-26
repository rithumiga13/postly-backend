import OpenAI from 'openai';
import { AiProviderError } from '../../../lib/errors.js';
import { logger } from '../../../config/logger.js';

/**
 * Generates content using the OpenAI chat completions API.
 *
 * @param {{ systemPrompt: string, userPrompt: string, apiKey: string, model?: string }} params
 * @returns {Promise<{ content: string, tokensUsed: number }>}
 */
export async function generateOpenAI({
  systemPrompt,
  userPrompt,
  apiKey,
  model = 'gpt-4o-mini',
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      { signal: controller.signal },
    );

    const content = response.choices[0]?.message?.content ?? '';
    const tokensUsed = response.usage?.total_tokens ?? 0;

    logger.info({ model, tokensUsed }, 'openai generation complete');

    return { content, tokensUsed };
  } catch (err) {
    throw new AiProviderError(`OpenAI request failed: ${err.message}`, { cause: err });
  } finally {
    clearTimeout(timeoutId);
  }
}
