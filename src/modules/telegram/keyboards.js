import { InlineKeyboard } from 'grammy';

export function postTypeKeyboard() {
  return new InlineKeyboard()
    .text('Announcement', 'postType:announcement').text('Thread', 'postType:thread').row()
    .text('Story', 'postType:story').text('Promotional', 'postType:promotional').row()
    .text('Educational', 'postType:educational').text('Opinion', 'postType:opinion');
}

const PLATFORM_ORDER = ['twitter', 'linkedin', 'instagram', 'threads'];

export const PLATFORM_LABELS = {
  twitter: 'Twitter/X',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  threads: 'Threads',
};

export function platformKeyboard(selected = []) {
  const kb = new InlineKeyboard();
  for (let i = 0; i < PLATFORM_ORDER.length; i += 2) {
    const left = PLATFORM_ORDER[i];
    const right = PLATFORM_ORDER[i + 1];
    const lLabel = (selected.includes(left) ? '✅ ' : '[ ] ') + PLATFORM_LABELS[left];
    const rLabel = right ? (selected.includes(right) ? '✅ ' : '[ ] ') + PLATFORM_LABELS[right] : null;
    if (rLabel) {
      kb.text(lLabel, `platform:${left}`).text(rLabel, `platform:${right}`).row();
    } else {
      kb.text(lLabel, `platform:${left}`).row();
    }
  }
  kb.text('✓ Done', 'done_platforms');
  return kb;
}

export function toneKeyboard() {
  return new InlineKeyboard()
    .text('Professional', 'tone:professional').text('Casual', 'tone:casual').row()
    .text('Witty', 'tone:witty').text('Authoritative', 'tone:authoritative').row()
    .text('Friendly', 'tone:friendly');
}

export function modelKeyboard() {
  return new InlineKeyboard()
    .text('GPT-4o (OpenAI)', 'model:openai').row()
    .text('Claude Sonnet (Anthropic)', 'model:anthropic');
}

export function confirmKeyboard() {
  return new InlineKeyboard()
    .text('✅ Post Now', 'confirm:post')
    .text('✏️ Edit Idea', 'confirm:edit')
    .text('❌ Cancel', 'confirm:cancel');
}
