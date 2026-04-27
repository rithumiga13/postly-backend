import { TwitterApi } from 'twitter-api-v2';
import { env } from '../../../config/env.js';
import { AppError } from '../../../lib/errors.js';

export function getTwitterClient() {
  return {
    async post(content, { accessToken, refreshToken, handle }) {
      if (!env.TWITTER_API_KEY || !env.TWITTER_API_SECRET) {
        throw new AppError('Twitter API credentials not configured', 503, 'twitter_not_configured');
      }
      if (!accessToken || !refreshToken) {
        throw new AppError('Twitter user tokens not available', 503, 'twitter_not_configured');
      }
      // accessToken  = OAuth1 user access token
      // refreshToken = OAuth1 access token secret (stored in refreshTokenEnc)
      const client = new TwitterApi({
        appKey: env.TWITTER_API_KEY,
        appSecret: env.TWITTER_API_SECRET,
        accessToken,
        accessSecret: refreshToken,
      });
      const { data } = await client.v2.tweet(content);
      return {
        externalId: data.id,
        url: `https://x.com/${handle ?? 'i'}/status/${data.id}`,
      };
    },
  };
}
