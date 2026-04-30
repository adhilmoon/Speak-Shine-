import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET environment variable is not set.");
  process.exit(1);
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  // Also accept token from query string (needed for SSE EventSource)
  const queryToken = req.query?.token;
  const raw = header?.startsWith("Bearer ") ? header.split(" ")[1] : queryToken;

  if (!raw) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    const decoded = jwt.verify(raw, JWT_SECRET);
    
    // Ensure it's an access token (not refresh token)
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({ error: "Invalid token type" });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    // Check if token expired
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
}
