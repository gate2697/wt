import http from 'node:http';
import { createApp } from './app.js';
import { closePool } from './db/database.js';

// Plesk/Passenger provides PORT. Never run migrations or wait for MySQL here:
// Passenger must be able to start the web process even when the database is
// temporarily unavailable or has not been migrated yet.
const passengerPort = process.env.PORT;
if (!passengerPort) {
  throw new Error(
    'Plesk/Passenger did not provide process.env.PORT. Set server.cjs as the Application Startup File and restart the Node.js app from Plesk.'
  );
}

const app = createApp();
const server = http.createServer(app);

server.listen(passengerPort, () => {
  console.log(`CB Ban Panel started under Plesk/Passenger on port ${passengerPort}.`);
});

server.on('error', (error) => {
  console.error('Passenger HTTP server error:', error);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  server.close(async () => {
    try {
      await closePool();
    } catch (error) {
      console.error('Database shutdown error:', error);
    }
    process.exit(0);
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
