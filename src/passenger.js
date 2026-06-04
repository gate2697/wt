import http from 'node:http';
import { createApp } from './app.js';
import { migrate } from './db/migrate.js';
import { closePool } from './db/database.js';
import { validateProductionConfig } from './config.js';

// Passenger supplies PORT using reverse port binding. There is intentionally no
// fallback port because this build is designed to run only through Plesk.
const passengerPort = process.env.PORT;
if (!passengerPort) {
  throw new Error('Plesk/Passenger did not provide process.env.PORT. Set app.js as the Plesk Application Startup File and start it using Restart App, not npm run start.');
}

validateProductionConfig();
await migrate();

const app = createApp();
const server = http.createServer(app);

server.listen(passengerPort, () => {
  console.log(`CB Ban Panel is running under Plesk/Passenger on the Passenger-managed socket.`);
});

server.on('error', (error) => {
  console.error('Passenger HTTP server error:', error);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; closing database connections.`);
  server.close(async () => {
    try { await closePool(); } catch (error) { console.error('Database shutdown error:', error); }
    process.exit(0);
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
