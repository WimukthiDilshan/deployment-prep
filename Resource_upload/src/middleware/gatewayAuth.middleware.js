const DEFAULT_GATEWAY_SHARED_SECRET = "resource_gateway_secret_2026";

const ensureGatewayAccess = (req, res, next) => {
  const gatewaySecret =
    process.env.GATEWAY_SHARED_SECRET || DEFAULT_GATEWAY_SHARED_SECRET;
  const incomingSecret = req.headers["x-gateway-secret"];

  if (!gatewaySecret || incomingSecret !== gatewaySecret) {
    return res.status(403).json({
      success: false,
      message: "Direct access forbidden. Use API Gateway.",
    });
  }

  return next();
};

module.exports = ensureGatewayAccess;
