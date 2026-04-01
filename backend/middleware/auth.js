// middleware/auth.js
// JWT verification with shared-cache support.
//
// Why cache?
// Every authenticated API call previously did a database SELECT to verify
// the user still exists and is active. Under load (500 concurrent users)
// this means 2,500+ identical DB reads per second for zero new information.
// We now cache the user record for 60 seconds per user_id. Redis is used when
// configured so multiple app instances share the same auth cache; otherwise we
// fall back to the local in-process Map.
//
// Security properties preserved:
//  - A disabled account (is_active = false) takes at most 60 seconds to
//    propagate. For immediate effect, increase JWT expiry and call
//    clearUserCache(userId) after an admin disables an account.
//  - The JWT signature is still verified on every request (CPU-cheap).
//  - Cache entries expire and are cleaned up automatically.

const jwt    = require('jsonwebtoken');
const { queryOne } = require('../config/db');
const { getJson, setJson, del } = require('../config/redis');

// ── In-process user cache ─────────────────────────────────────
const USER_CACHE_TTL = 60 * 1000; // 60 seconds
const userCache      = new Map();  // userId → { user, expiresAt }
const userCacheKey = (userId) => `auth:user:${userId}`;

function getCachedUser(userId) {
  const entry = userCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    userCache.delete(userId);
    return null;
  }
  return entry.user;
}

function setCachedUser(userId, user) {
  userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL });
}

async function getSharedCachedUser(userId) {
  return getJson(userCacheKey(userId));
}

async function setSharedCachedUser(userId, user) {
  return setJson(userCacheKey(userId), user, Math.ceil(USER_CACHE_TTL / 1000));
}

// Exported so admin routes can invalidate immediately after disable/enable
function clearUserCache(userId) {
  if (userId) {
    userCache.delete(userId);
    del(userCacheKey(userId)).catch(() => {});
  } else {
    userCache.clear();
  }
}

// Sweep expired entries every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of userCache.entries()) {
    if (now > entry.expiresAt) userCache.delete(id);
  }
}, 5 * 60 * 1000);

// ── authenticate middleware ───────────────────────────────────
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Try cache first
    let user = getCachedUser(decoded.id);
    if (!user) {
      user = await getSharedCachedUser(decoded.id);
      if (user) setCachedUser(decoded.id, user);
    }

    if (!user) {
      // Cache miss — hit the database and populate cache
      user = await queryOne(
        `SELECT u.id, u.name, u.email, u.role, u.is_active,
                o.status AS organizer_status, o.terms_agreed
         FROM users u
         LEFT JOIN organizers o ON o.user_id = u.id
         WHERE u.id = $1`,
        [decoded.id]
      );
      if (user) {
        setCachedUser(decoded.id, user);
        setSharedCachedUser(decoded.id, user).catch(() => {});
      }
    }

    if (!user)           return res.status(401).json({ success: false, message: 'User not found' });
    if (!user.is_active) return res.status(403).json({ success: false, message: 'Account disabled' });
    if (user.role === 'organizer' && user.organizer_status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Organizer account suspended' });
    }
    if (user.role === 'organizer' && !user.terms_agreed) {
      return res.status(403).json({
        success: false,
        message: 'Organizer account locked: terms and conditions must be agreed.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// ── Role guards ───────────────────────────────────────────────
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }
  next();
};

const requireAdmin     = requireRole('admin');
const requireOrganizer = requireRole('organizer', 'admin');
const requireUser      = requireRole('user', 'organizer', 'admin');

module.exports = {
  authenticate, requireRole,
  requireAdmin, requireOrganizer, requireUser,
  clearUserCache,
};
