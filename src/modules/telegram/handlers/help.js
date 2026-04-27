export async function handleHelp(ctx) {
  await ctx.reply(
    'Postly commands:\n\n' +
      '/start — greet and check link status\n' +
      '/link <email> <password> — link your Postly account\n' +
      '/post — create and publish content\n' +
      '/status — view your last 5 posts\n' +
      '/accounts — list connected social accounts\n' +
      '/help — show this message\n' +
      '/cancel — cancel any active conversation',
  );
}
