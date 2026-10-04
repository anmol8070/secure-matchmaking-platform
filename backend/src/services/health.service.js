/**
 * Health service — business logic lives in services, not controllers.
 */
function getStatus() {
  return {
    success: true,
    message: 'API is running',
  };
}

module.exports = { getStatus };
