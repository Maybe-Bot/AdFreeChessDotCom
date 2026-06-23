import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from './config.js';
import { getDb } from './db/index.js';
import { authRouter } from './modules/auth/routes.js';
import { gamesRouter } from './modules/games/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { botsRouter } from './modules/bots/routes.js';
import { registerGameSocket } from './modules/games/socket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = join(__dirname, '../../web/dist');

const app = express();
const httpServer = createServer(app);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: '64kb' }));

app.use('/api/auth', authRouter);
app.use('/api/games', gamesRouter);
app.use('/api/users', usersRouter);
app.use('/api/bots', botsRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

// Serve the React SPA — static assets first, then catch-all for client-side routing
app.use(express.static(webDir));
app.get('*', (_req, res) => res.sendFile(join(webDir, 'index.html')));

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
registerGameSocket(wss);

getDb();

httpServer.listen(config.port, () => {
  console.log(`API running on http://localhost:${config.port}`);
});
