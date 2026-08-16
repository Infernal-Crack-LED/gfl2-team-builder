function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  // Optional: when set, slash commands register instantly to this one guild
  // (great for development). When omitted, commands register globally.
  guildId: process.env.DISCORD_GUILD_ID,
} as const;
