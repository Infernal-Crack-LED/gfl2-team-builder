/**
 * Discord bot entry point.
 *
 * This is a placeholder that keeps the process alive until Railway sends
 * SIGTERM. Replace it with real discord.js initialization (login, event
 * handlers, command registration, etc.) when the bot is implemented.
 */

console.log('[bot] starting');

process.on('SIGTERM', () => {
  console.log('[bot] SIGTERM received, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[bot] SIGINT received, shutting down');
  process.exit(0);
});
