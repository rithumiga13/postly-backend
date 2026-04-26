import { twitterRules } from './twitter.js';
import { linkedinRules } from './linkedin.js';
import { instagramRules } from './instagram.js';
import { threadsRules } from './threads.js';

const platformRules = {
  twitter: twitterRules,
  linkedin: linkedinRules,
  instagram: instagramRules,
  threads: threadsRules,
};

/**
 * Builds the system prompt for a given platform, post type, tone, and language.
 *
 * LinkedIn tone override: LinkedIn always receives a professional tone regardless
 * of the caller-supplied `tone`. This is a deliberate product decision — casual
 * or witty tones consistently underperform on LinkedIn's professional audience.
 *
 * @param {{ platform: string, postType: string, tone: string, language: string }} params
 * @returns {string}
 */
export function buildSystemPrompt({ platform, postType, tone, language }) {
  // LinkedIn tone override: professional tone is enforced regardless of the requested tone.
  // All other platforms respect the caller's tone choice.
  const effectiveTone = platform === 'linkedin' ? 'professional' : tone;
  const toneNote =
    platform === 'linkedin' && tone !== 'professional'
      ? ` (LinkedIn requires professional tone — the requested "${tone}" tone has been overridden.)`
      : '';

  return [
    'You are a senior social media copywriter who specialises in creating high-performing, platform-native content.',
    '',
    platformRules[platform],
    '',
    `Tone: Write in a ${effectiveTone} tone.${toneNote}`,
    `Post type: ${postType}.`,
    '',
    `Language: Write the post in ${language}. Keep hashtags in English.`,
    '',
    'Output format: Return ONLY the post content. No preamble, no explanation, no quotes around the post.',
  ].join('\n');
}
