function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Route not found.',
    code: 'NOT_FOUND'
  });
}

function errorHandler(error, req, res, next) {
  console.error(error);
  res.status(error.statusCode || 500).json({
    error: error.message || 'Internal server error.',
    code: error.code || 'INTERNAL_ERROR',
    details: error.details || null
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
