'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('node:crypto');

const env = require('./config/env');
const apiRoutes = require('./routes');
const rateLimit = require('./middleware/rate-limit');
const errorHandler = require('./middleware/error-handler');

const app = express();

const apiPrefix = '/api/v1';
const bodyLimit = env.bodyLimit || '1mb';
const allowedOrigins = Array.isArray(env.allowedOrigins)
  ? env.allowedOrigins
  : [];

if (env.trustProxy) {
  // Configure only for the known proxy topology; do not blindly trust all proxies.
  app.set('trust proxy', env.trustProxy);
}

app.disable('x-powered-by');

app.use(helmet());

app.use(cors({
  origin(origin, callback) {
    // Non-browser requests and same-origin requests may not include an Origin.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin is not allowed by CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  credentials: true,
  maxAge: 600
}));

app.use((req, res, next) => {
  const requestId = req.get('X-Request-Id') || crypto.randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({
  extended: false,
  limit: bodyLimit
}));

// The rate-limit middleware should apply limits per client and return 429
// responses using the shared error format.
app.use(apiPrefix, rateLimit);

app.use(apiPrefix, apiRoutes);

app.use((req, res, next) => {
  const error = new Error('Route not found.');
  error.status = 404;
  next(error);
});

app.use(errorHandler);

module.exports = app;
