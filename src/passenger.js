import http from 'node:http';
import { createApp } from './app.js';
import { closePool } from './db/database.js';

// Never run migrations or wait for MySQL here: Passenger must be able to start
// the web process even when the database is temporarily unavailable or has not
// been migrated yet.
//
// Passenger auto-installs its request handler on the first HTTP server that
// calls listen(). In this Plesk build, PORT is not exported to the wrapper, so
// use an ephemeral port when Passenger is present. Passenger replaces that
// listener with its managed Unix socket; the numeric port is irrelevant there.
const inPassenger = process.env.IN_PASSENGER === '1' || Boolean(process.env.PASSENGER_APP_ENV);
const passengerPort = process.env.PORT || (inPassenger ? 0 : 3000);

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
