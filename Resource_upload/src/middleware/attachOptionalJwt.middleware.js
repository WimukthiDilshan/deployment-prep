const jwt = require("jsonwebtoken");

/**
 * Attaches req.user when a valid JWT is present. Never blocks the request.
 */
const attachOptionalJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return next();

  const secret = process.env.JWT_SECRET || "fallback_secret_key";
  jwt.verify(token, secret, (err, decoded) => {
    if (!err && decoded) {
      req.user = decoded;
    }
    return next();
  });
};

module.exports = attachOptionalJwt;
