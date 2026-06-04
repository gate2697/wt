/**
 * Plesk / Phusion Passenger startup file.
 *
 * Set this file as the Plesk "Application Startup File".
 * Passenger provides process.env.PORT and manages the application lifecycle.
 * This CommonJS wrapper safely loads the ES module application on Plesk.
 */
async function main() {
  try {
    await import('./src/passenger.js');
  } catch (error) {
    console.error('CB Ban Panel failed to start under Passenger:', error);
    process.exitCode = 1;
  }
}

main();
