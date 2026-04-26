import * as aiService from './ai.service.js';

export async function generateContent(req, res) {
  const { idea, post_type, platforms, tone, language, model } = req.body;

  const result = await aiService.generateForAll({
    userId: req.user.sub,
    idea,
    postType: post_type,
    platforms,
    tone,
    language,
    model,
  });

  return res.json({ data: result, meta: {}, error: null });
}
