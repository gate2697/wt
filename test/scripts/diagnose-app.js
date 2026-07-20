try {
  await import('../src/app.js');
  console.log('PASS  application modules import successfully');
  console.log(`PASS  application root — ${process.cwd()}`);
  console.log(`INFO  Passenger PORT — ${process.env.PORT ? 'provided' : 'not provided to the npm runner (expected outside Passenger)'}`);
} catch (error) {
  console.error('FAIL  application modules could not be loaded');
  console.error(error?.stack || error);
  process.exitCode = 1;
}
