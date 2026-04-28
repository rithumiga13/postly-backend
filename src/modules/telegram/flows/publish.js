import prisma from '../../../lib/prisma.js';
import { generateForAll } from '../../ai/ai.service.js';
import { publishPost } from '../../posts/posts.service.js';
import {
  postTypeKeyboard,
  platformKeyboard,
  toneKeyboard,
  modelKeyboard,
  confirmKeyboard,
  PLATFORM_LABELS,
} from '../keyboards.js';

const PLATFORM_CHAR_LIMITS = {
  twitter: 280,
  linkedin: null,
  instagram: 2200,
  threads: 500,
};

const STATUS_EMOJI = {
  published: '✅',
  queued: '⏳',
  processing: '⏳',
  failed: '❌',
  cancelled: '🚫',
};

function isCancelCommand(ctx) {
  return /^\/cancel(@\w+)?(\s|$)/.test(ctx.message?.text?.trim() ?? '');
}

// Sends `prompt` with `keyboard`, then loops until a callback_query whose data
// passes `filter(data)` arrives. Returns that ctx, or null if /cancel received.
async function waitForButton(conversation, ctx, prompt, keyboard, filter) {
  await ctx.reply(prompt, { reply_markup: keyboard });
  while (true) {
    const update = await conversation.wait();
    if (isCancelCommand(update)) {
      await update.reply('Cancelled');
      return null;
    }
    if (update.callbackQuery) {
      const data = update.callbackQuery.data;
      if (!filter || filter(data)) return update;
      // Stale press from a previous step
      await update.answerCallbackQuery({ text: 'Please use the buttons for the current step.' });
      continue;
    }
    await update.reply('Please use the buttons above, or /cancel to abort.');
    await ctx.reply(prompt, { reply_markup: keyboard });
  }
}

export async function publishFlow(conversation, ctx) {
  const chatId = String(ctx.from?.id);

  const user = await conversation.external(() =>
    prisma.user.findFirst({ where: { telegramChatId: chatId } }),
  );

  if (!user) {
    await ctx.reply(
      "Your Telegram account isn't linked to Postly yet.\n\n" +
        '1. Register via the API: POST /api/auth/register\n' +
        '2. Then run here: /link <email> <password>',
    );
    return;
  }

  // ── Step 1: Post type ──────────────────────────────────────────────────────
  const postTypeCtx = await waitForButton(
    conversation,
    ctx,
    'What type of post is this?',
    postTypeKeyboard(),
    (d) => d.startsWith('postType:'),
  );
  if (!postTypeCtx) return;
  const postType = postTypeCtx.callbackQuery.data.replace('postType:', '');
  await postTypeCtx.answerCallbackQuery();

  // ── Step 2: Platforms (reply keyboard multi-select) ───────────────────────
  const VALID_PLATFORM_MAP = {
    twitter: 'twitter',
    linkedin: 'linkedin',
    instagram: 'instagram',
    threads: 'threads',
  };

  await ctx.reply(
    'Which platforms? (tap to toggle, hit ✓ Done when ready)',
    { reply_markup: platformKeyboard() },
  );

  let selectedPlatforms = [];

  while (true) {
    const update = await conversation.wait();
    if (isCancelCommand(update)) {
      await update.reply('Cancelled', { reply_markup: { remove_keyboard: true } });
      return;
    }

    const text = update.message?.text?.trim();
    if (!text) {
      await update.reply('Please use the keyboard, or type a platform name, or type done.');
      continue;
    }

    // Normalize: lowercase + strip non-word chars so "✓ Done" → "done", "Twitter" → "twitter"
    const normalized = text.toLowerCase().replace(/[^\w]/g, '');

    if (normalized === 'done') {
      if (selectedPlatforms.length === 0) {
        await update.reply('Select at least one platform first!');
        continue;
      }
      await update.reply(
        `Platforms locked in: ${selectedPlatforms.map((p) => PLATFORM_LABELS[p]).join(', ')}`,
        { reply_markup: { remove_keyboard: true } },
      );
      break;
    }

    const platform = VALID_PLATFORM_MAP[normalized];
    if (!platform) {
      await update.reply(
        `"${text}" isn't a recognised platform. Type twitter, linkedin, instagram, threads, or done.`,
      );
      continue;
    }

    selectedPlatforms = selectedPlatforms.includes(platform)
      ? selectedPlatforms.filter((x) => x !== platform)
      : [...selectedPlatforms, platform];

    const display = selectedPlatforms.length
      ? selectedPlatforms.map((p) => `✅ ${PLATFORM_LABELS[p]}`).join('  ')
      : '(none)';
    await update.reply(`Toggled. Now selected: ${display}`);
  }

  // ── Step 3: Tone ─────────────────────────────────────────────────────────
  const toneCtx = await waitForButton(
    conversation,
    ctx,
    'What tone?',
    toneKeyboard(),
    (d) => d.startsWith('tone:'),
  );
  if (!toneCtx) return;
  const tone = toneCtx.callbackQuery.data.replace('tone:', '');
  await toneCtx.answerCallbackQuery();

  // ── Step 4: AI model ──────────────────────────────────────────────────────
  const modelCtx = await waitForButton(
    conversation,
    ctx,
    'Which AI model?',
    modelKeyboard(),
    (d) => d.startsWith('model:'),
  );
  if (!modelCtx) return;
  const model = modelCtx.callbackQuery.data.replace('model:', '');
  await modelCtx.answerCallbackQuery();

  // ── Step 5: Idea (text, ≤500 chars) ───────────────────────────────────────
  async function collectIdea() {
    await ctx.reply('Tell me the idea — keep it brief. Max 500 chars.');
    while (true) {
      const update = await conversation.wait();
      if (isCancelCommand(update)) {
        await update.reply('Cancelled');
        return null;
      }
      if (!update.message?.text) {
        await update.reply('Please send a text message with your idea, or /cancel to abort.');
        continue;
      }
      const text = update.message.text.trim();
      if (text.length > 500) {
        await update.reply(`That's ${text.length} chars — please keep it under 500 and try again.`);
        continue;
      }
      return text;
    }
  }

  let idea = await collectIdea();
  if (!idea) return;

  // ── Step 6: Generate + preview ────────────────────────────────────────────
  let generated = null;
  let modelUsed = null;

  async function generate() {
    await ctx.reply('Generating your content... ⚙️');
    try {
      const result = await conversation.external(() =>
        generateForAll({
          userId: user.id,
          idea,
          postType,
          platforms: selectedPlatforms,
          tone,
          language: 'en',
          model,
        }),
      );
      generated = result.generated;
      modelUsed = result.model_used;
      return true;
    } catch (err) {
      await ctx.reply(
        `Couldn't generate content right now: ${err.message ?? 'Unknown error'}\n\nUse /post to try again.`,
      );
      return false;
    }
  }

  async function showPreviews() {
    for (const platform of selectedPlatforms) {
      const g = generated[platform];
      if (!g) continue;
      const limit = PLATFORM_CHAR_LIMITS[platform];
      const charInfo = limit ? `(${g.char_count} / ${limit} chars)` : `(${g.char_count} chars)`;
      await ctx.reply(
        `📱 ${PLATFORM_LABELS[platform] ?? platform} ${charInfo}:\n\n${g.content}`,
      );
    }
  }

  if (!(await generate())) return;
  await showPreviews();

  // ── Step 7: Confirm / edit / cancel ───────────────────────────────────────
  while (true) {
    const confirmCtx = await waitForButton(
      conversation,
      ctx,
      'Confirm and post?',
      confirmKeyboard(),
      (d) => d.startsWith('confirm:'),
    );
    if (!confirmCtx) return;

    const action = confirmCtx.callbackQuery.data.replace('confirm:', '');
    await confirmCtx.answerCallbackQuery();

    if (action === 'cancel') {
      await ctx.reply('Cancelled');
      return;
    }

    if (action === 'edit') {
      idea = await collectIdea();
      if (!idea) return;
      if (!(await generate())) return;
      await showPreviews();
      continue;
    }

    if (action === 'post') {
      await ctx.reply("Publishing... I'll update you in a moment. ⏳");

      let post;
      try {
        const result = await conversation.external(() =>
          publishPost(user.id, {
            idea,
            generated,
            postType,
            tone,
            language: 'en',
            modelUsed,
          }),
        );
        post = result.post;
      } catch (err) {
        await ctx.reply(`Failed to queue post: ${err.message ?? 'Unknown error'}`);
        return;
      }

      // Brief wait then report status
      await conversation.external(() => new Promise((r) => setTimeout(r, 6000)));

      const updated = await conversation.external(() =>
        prisma.post.findUnique({
          where: { id: post.id },
          include: { platformPosts: true },
        }),
      );

      const rows = (updated?.platformPosts ?? post.platformPosts).map((pp) => {
        const emoji = STATUS_EMOJI[pp.status] ?? '⏳';
        const extra = pp.errorMessage ? ` — ${pp.errorMessage}` : '';
        return `${emoji} ${PLATFORM_LABELS[pp.platform] ?? pp.platform}: ${pp.status}${extra}`;
      });

      await ctx.reply(`Publishing results:\n\n${rows.join('\n')}`);
      return;
    }
  }
}
