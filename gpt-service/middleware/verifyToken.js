const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(403)
      .json({ message: "No token provided. Access denied." });
  }

  const secret = process.env.JWT_SECRET || "fallback_secret_key";

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Unauthorized. Invalid token." });
    }
    req.user = decoded;
    next();
  });
};

module.exports = verifyToken;
