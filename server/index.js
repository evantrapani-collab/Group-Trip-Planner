import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
// Bind to 0.0.0.0 so the server is reachable on all interfaces. Hosts like
// Render/Fly probe IPv4; Node's default bind can land on IPv6-only (`::`),
// which makes the platform think "no server is running."
const host = process.env.HOST || '0.0.0.0';

const app = createApp();

const server = app.listen(port, host, () => {
  console.log(`\n  ✈️  TripTogether running at http://${host}:${port}\n`);
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
