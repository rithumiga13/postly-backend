import { getDecryptedKey } from '../aiKeys/aiKeys.service.js';
import { generateOpenAI } from './providers/openai.js';
import { generateAnthropic } from './providers/anthropic.js';
import { buildSystemPrompt } from './prompts/system.js';
import { AppError, AiProviderError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

// Character and hashtag constraints per platform.
const PLATFORM_LIMITS = {
  twitter:   { maxChars: 280,  minChars: null, minHashtags: 2,  maxHashtags: 3  },
  linkedin:  { maxChars: null, minChars: 800,  minHashtags: 3,  maxHashtags: 5  },
  instagram: { maxChars: 2200, minChars: null, minHashtags: 10, maxHashtags: 15 },
  threads:   { maxChars: 500,  minChars: null, minHashtags: 0,  maxHashtags: 2  },
};

/**
 * Enforces platform-specific rules on generated content.
 * - Trims trailing whitespace.
 * - Truncates to maxChars if the content exceeds the platform limit.
 * - Extracts and counts hashtags.
 *
 * This function never throws — it always returns a best-effort result.
 * Callers are responsible for logging warnings about out-of-range content.
 *
 * @param {'twitter' | 'linkedin' | 'instagram' | 'threads'} platform
 * @param {string} content - raw content returned by the AI provider
 * @returns {{ content: string, char_count: number, hashtags: string[] }}
 */
export function enforcePlatformRules(platform, content) {
  const limits = PLATFORM_LIMITS[platform];
  let text = content.trimEnd();

  if (limits.maxChars !== null && text.length > limits.maxChars) {
    text = text.slice(0, limits.maxChars - 1) + '…';
  }

  const hashtags = text.match(/#\w+/g) ?? [];
  const charCount = text.length;

  return { content: text, char_count: charCount, hashtags };
}

/**
 * Builds the user-facing prompt from the idea and post type.
 *
 * @param {string} idea
 * @param {string} postType
 * @returns {string}
 */
function buildUserPrompt(idea, postType) {
  return `Write a ${postType} post about the following:\n\n${idea}`;
}

/**
 * Generates platform-specific content for every requested platform in parallel.
 *
 * Key-resolution order:
 *  1. User's own encrypted key from the database (via aiKeys service).
 *  2. Platform-level fallback from environment variables (OPENAI_API_KEY / ANTHROPIC_API_KEY).
 *  3. If still null → throw AppError with code "no_api_key" (HTTP 400).
 *
 * Known trade-off: if any single platform call fails, the entire request fails.
 * Partial success (returning whichever platforms succeeded) is a possible future
 * improvement, but adds response-shape complexity not warranted at this stage.
 *
 * @param {{ userId: string, idea: string, postType: string, platforms: string[],
 *           tone: string, language: string, model: 'openai' | 'anthropic' }} params
 */
export async function generateForAll({ userId, idea, postType, platforms, tone, language, model }) {
  // ── 1. Resolve API key ───────────────────────────────────────────────────────
  let apiKey = await getDecryptedKey(userId, model);
  let keySource = 'user';

  if (!apiKey) {
    apiKey = model === 'openai' ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;
    keySource = 'platform';
  }

  if (!apiKey) {
    throw new AppError(
      `No API key available for provider "${model}". Add one via PUT /user/ai-keys or set the environment variable.`,
      400,
      'no_api_key',
    );
  }

  logger.info({ model, keySource }, 'resolved api key source');

  // ── 2. Pick provider and model name ─────────────────────────────────────────
  const generate = model === 'openai' ? generateOpenAI : generateAnthropic;
  const modelName = model === 'openai' ? env.OPENAI_MODEL : env.ANTHROPIC_MODEL;

  const userPrompt = buildUserPrompt(idea, postType);

  // ── 3. Run all platform calls in parallel ───────────────────────────────────
  const platformResults = await Promise.all(
    platforms.map(async (platform) => {
      const systemPrompt = buildSystemPrompt({ platform, postType, tone, language });

      let providerResult;
      try {
        providerResult = await generate({ systemPrompt, userPrompt, apiKey, model: modelName });
      } catch (err) {
        // Re-throw with platform context so the caller knows which one failed.
        throw new AiProviderError(
          `Generation failed for platform "${platform}": ${err.message}`,
          { cause: err },
        );
      }

      const enforced = enforcePlatformRules(platform, providerResult.content);

      // Warn if LinkedIn is drastically short — model may have misbehaved.
      const limits = PLATFORM_LIMITS[platform];
      if (limits.minChars !== null && enforced.char_count < limits.minChars) {
        logger.warn(
          { platform, charCount: enforced.char_count, minChars: limits.minChars },
          'generated content is shorter than the platform minimum — returning as-is',
        );
      }

      return { platform, enforced, tokensUsed: providerResult.tokensUsed };
    }),
  );

  // ── 4. Aggregate results ─────────────────────────────────────────────────────
  const generated = {};
  let totalTokens = 0;

  for (const { platform, enforced, tokensUsed } of platformResults) {
    generated[platform] = enforced;
    totalTokens += tokensUsed;
  }

  return {
    generated,
    model_used: modelName,
    tokens_used: totalTokens,
  };
}
