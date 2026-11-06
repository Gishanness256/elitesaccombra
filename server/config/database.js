'use strict';

const { Pool } = require('pg');
const env = require('./env');

const config = env.database || {};
const poolOptions = {
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true
};

if (config.url) {
  poolOptions.connectionString = config.url;
} else {
  poolOptions.host = config.host;
  poolOptions.port = config.port;
  poolOptions.database = config.name;
  poolOptions.user = config.user;
  poolOptions.password = config.password;
}

if (config.ssl) {
  // Require a valid server certificate when TLS is enabled.
  poolOptions.ssl = { rejectUnauthorized: true };
}

const pool = new Pool(poolOptions);

pool.on('error', (error) => {
  // Idle client errors are emitted by pg's pool. Do not log connection details.
  console.error('Unexpected error from an idle database client:', error.message);
});

/**
 * Run a parameterized SQL query using the shared connection pool.
 *
 * @param {string} text SQL statement.
 * @param {Array<*>} [params] Query parameters.
 * @returns {Promise<import('pg').QueryResult>}
 */
function query(text, params = []) {
  if (typeof text !== 'string' || !text.trim()) {
    return Promise.reject(new TypeError('Database query must be a non-empty SQL string.'));
  }

  return pool.query(text, params);
}

/**
 * Execute work inside a transaction.
 *
 * The callback receives a checked-out pg client. Use parameterized queries
 * (client.query(sql, values)) inside the callback.
 *
 * @param {(client: import('pg').PoolClient) => Promise<*>} work
 * @returns {Promise<*>}
 */
async function transaction(work) {
  if (typeof work !== 'function') {
    throw new TypeError('Database transaction requires a callback.');
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const result = await work(client);

    await client.query('COMMIT');
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Database rollback failed:', rollbackError.message);
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check that the database is reachable.
 *
 * @returns {Promise<boolean>}
 */
async function ping() {
  await pool.query('SELECT 1');
  return true;
}

/**
 * Close the pool and its open connections.
 *
 * @returns {Promise<void>}
 */
function close() {
  return pool.end();
}

module.exports = {
  pool,
  query,
  transaction,
  ping,
  close
};
