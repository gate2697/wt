/**
 * Native Plesk / Phusion Passenger startup file.
 *
 * In Plesk set:
 *   Application Root: the folder containing this file
 *   Document Root:    public
 *   Startup File:     server.cjs
 */
async function main() {
  try {
    await import('./src/passenger.js');
  } catch (error) {
    console.error('CB Ban Panel failed to start:', error);
    process.exitCode = 1;
  }
}

main();
