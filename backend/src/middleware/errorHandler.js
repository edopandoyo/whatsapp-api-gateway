'use strict';

// 404 handler — dipasang SEBELUM errorHandler
const notFoundHandler = (req, res, _next) => {
  res.status(404).json({
    success: false,
    error:   `Route tidak ditemukan: ${req.method} ${req.originalUrl}`,
  });
};

// Global error handler — dipasang PALING AKHIR (4 parameter)
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  // Log error stack di non-production
  if (process.env.NODE_ENV !== 'production') {
    console.error('[ErrorHandler]', err);
  } else {
    console.error('[ErrorHandler]', err.message);
  }

  const statusCode = err.statusCode || err.status || 500;

  // Jangan bocorkan detail error internal ke client di production
  const message =
    statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'Terjadi kesalahan internal server.'
      : err.message || 'Terjadi kesalahan internal server.';

  res.status(statusCode).json({
    success: false,
    error:   message,
  });
};

module.exports = { notFoundHandler, errorHandler };
