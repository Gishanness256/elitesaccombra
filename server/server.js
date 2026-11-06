'use strict';

const app = require('./app');
const env = require('./config/env');
const database = require('./config/database');

const port = Number(env.port || process.env.PORT || 3000);
const host = env.host || process.env.HOST || '0.0.0.0';
const shutdownTimeoutMs = Number(env.shutdownTimeoutMs) || 10000;

const server = app.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
});

let shuttingDown = false;

function closeDatabase() {
  if (typeof database.close === 'function') {
    return database.close();
  }

  if (database.pool && typeof database.pool.end === 'function') {
    return database.pool.end();
  }

  if (typeof database.end === 'function') {
    return database.end();
  }

  return Promise.resolve();
}

function shutdown(signal, exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received; shutting down.`);

  const timeout = setTimeout(() => {
    console.error('Graceful shutdown timed out; forcing exit.');
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    process.exit(1);
  }, shutdownTimeoutMs);

  // The timer should not keep the process alive after shutdown completes.
  timeout.unref();

  server.close(async (serverError) => {
    if (serverError) {
      console.error('Error closing HTTP server:', serverError);
      exitCode = 1;
    }

    try {
      await closeDatabase();
    } catch (databaseError) {
      console.error('Error closing database connections:', databaseError);
      exitCode = 1;
    } finally {
      clearTimeout(timeout);
      process.exitCode = exitCode;
    }
  });
}

server.on('error', (error) => {
  console.error('HTTP server error:', error);
  process.exitCode = 1;
});

process.on('SIGINT', () => shutdown('SIGINT', 0));
process.on('SIGTERM', () => shutdown('SIGTERM', 0));

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  shutdown('unhandledRejection', 1);
});
