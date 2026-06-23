const PLACEHOLDER_SECRETS = new Set(['change-me-in-production', 'dev-secret-change-in-prod', '']);

const jwtSecret = process.env.JWT_SECRET ?? '';
if (process.env.NODE_ENV === 'production' && PLACEHOLDER_SECRETS.has(jwtSecret)) {
  console.error('FATAL: JWT_SECRET must be set to a strong secret in production');
  process.exit(1);
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: jwtSecret || 'dev-secret-change-in-prod',
  databasePath: process.env.DATABASE_PATH ?? './chess.db',
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:3001',
};
