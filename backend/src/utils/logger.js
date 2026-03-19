'use strict';

const morgan = require('morgan');

const morganLogger = morgan(
  process.env.NODE_ENV === 'production' ? 'combined' : 'dev'
);

module.exports = { morganLogger };
