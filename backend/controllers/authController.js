// controllers/authController.js
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { query, queryOne } = require('../config/db');
const { v4: uuidv4 }      = require('uuid');
const {
  sendResetEmail,
  sendVerificationEmail,
} = require('../utils/mailer');
const { logPlatformEvent, getRequestMeta } = require('../utils/platformLogger');

const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const getBooleanSetting = async (key, fallback = true) => {
  try {
    const row = await queryOne(`SELECT value FROM platform_settings WHERE key = $1`, [key]);
    if (!row || row.value === undefined || row.value === null) return fallback;
    return String(row.value).toLowerCase() === 'true';
  } catch (_) {
    return fallback;
  }
};

// ── POST /api/auth/register ───────────────────────────────────
const register = async (req, res) => {
  const {
    name, email, password, phone, role,
    company_name, business_type, id_type, id_number,
    physical_address, event_types, expected_monthly_events,
    social_media, terms_agreed,
  } = req.body;
  const userRole = ['user', 'organizer'].includes(role) ? role : 'user';

  try {
    const existing = await queryOne(
      `SELECT id FROM users WHERE email = $1`, [email.toLowerCase()]
    );
    if (existing) {
      await logPlatformEvent({
        actorRole: 'guest',
        domain: 'auth',
        eventType: 'register_rejected_existing_email',
        entityType: 'user',
        summary: `Registration rejected for ${email.toLowerCase().trim()}`,
        severity: 'warning',
        payload: { email: email.toLowerCase().trim(), requested_role: userRole },
        ...getRequestMeta(req),
      }).catch(() => {});
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hashedPwd = await bcrypt.hash(password, 12);
    const userId    = uuidv4();

    // Generate email verification token
    const rawVerifyToken  = crypto.randomBytes(32).toString('hex');
    const verifyTokenHash = crypto.createHash('sha256').update(rawVerifyToken).digest('hex');
    const verifyExpires   = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await query(
      `INSERT INTO users
         (id, name, email, password, phone, role,
          email_verified, email_verify_token, email_verify_expires)
       VALUES ($1,$2,$3,$4,$5,$6, FALSE, $7, $8)`,
      [
        userId, name.trim(), email.toLowerCase().trim(),
        hashedPwd, phone || null, userRole,
        verifyTokenHash, verifyExpires,
      ]
    );

    if (userRole === 'organizer') {
      if (!terms_agreed) {
        return res.status(400).json({
          success: false,
          message: 'You must agree to the organizer terms and conditions',
        });
      }
      await query(
        `INSERT INTO organizers
           (id, user_id, company_name, business_type, id_type, id_number,
            physical_address, event_types, expected_monthly_events,
            social_media, terms_agreed, terms_agreed_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,NOW(),'pending')`,
        [
          uuidv4(), userId,
          (company_name || name).trim(),
          business_type    || 'individual',
          id_type          || 'national_id',
          id_number        || null,
          physical_address || null,
          event_types      || [],
          expected_monthly_events || null,
          social_media     || null,
        ]
      );
    }

    // Send verification email (non-blocking)
    const verifyUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/verify-email?token=${rawVerifyToken}`;
    setImmediate(() => {
      sendVerificationEmail({ to: email.toLowerCase().trim(), name: name.trim(), verifyUrl })
        .catch(e => console.error('[register] verify email error:', e.message));
    });

    const user  = await queryOne(`SELECT id, name, email, role FROM users WHERE id = $1`, [userId]);
    const token = signToken(user);

    await logPlatformEvent({
      actorUserId: user.id,
      actorRole: user.role,
      domain: 'auth',
      eventType: 'account_registered',
      entityType: 'user',
      entityId: user.id,
      summary: `Account registered for ${user.email}`,
      payload: { role: user.role, organizer_signup: userRole === 'organizer' },
      ...getRequestMeta(req),
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: userRole === 'organizer'
        ? 'Account created — please check your email to verify your address, then await admin approval'
        : 'Account created — please check your email to verify your address',
      token,
      email_verification_required: true,
      ...(process.env.NODE_ENV !== 'production' && { dev_verify_url: verifyUrl }),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('register:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/auth/login ──────────────────────────────────────
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await queryOne(
      `SELECT u.id, u.name, u.email, u.password, u.role, u.phone,
              u.is_active, u.email_verified,
              o.id AS organizer_id, o.company_name, o.status AS org_status, o.terms_agreed
       FROM users u
       LEFT JOIN organizers o ON o.user_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    if (!user || !(await bcrypt.compare(password, user.password))) {
      await logPlatformEvent({
        actorRole: 'guest',
        domain: 'auth',
        eventType: 'login_failed',
        entityType: 'user',
        summary: `Login failed for ${email.toLowerCase().trim()}`,
        severity: 'warning',
        payload: { email: email.toLowerCase().trim(), reason: 'invalid_credentials' },
        ...getRequestMeta(req),
      }).catch(() => {});
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    if (!user.is_active) {
      await logPlatformEvent({
        actorUserId: user.id,
        actorRole: user.role,
        domain: 'auth',
        eventType: 'login_blocked',
        entityType: 'user',
        entityId: user.id,
        summary: `Login blocked for disabled account ${user.email}`,
        severity: 'warning',
        payload: { reason: 'account_disabled' },
        ...getRequestMeta(req),
      }).catch(() => {});
      return res.status(403).json({ success: false, message: 'Account has been disabled' });
    }
    const enforceEmailVerification = await getBooleanSetting('security_enforce_email_verification', true);

    // Email verification gate — toggle controlled in Admin Settings.
    // Admin accounts are always allowed.
    if (enforceEmailVerification && !user.email_verified && user.role !== 'admin') {
      await logPlatformEvent({
        actorUserId: user.id,
        actorRole: user.role,
        domain: 'auth',
        eventType: 'login_blocked',
        entityType: 'user',
        entityId: user.id,
        summary: `Login blocked for unverified email ${user.email}`,
        severity: 'warning',
        payload: { reason: 'email_not_verified' },
        ...getRequestMeta(req),
      }).catch(() => {});
      return res.status(403).json({
        success: false,
        message: 'Please verify your email address before logging in. Check your inbox for the verification link.',
        email_not_verified: true,
        email:              user.email,
      });
    }
    if (user.role === 'organizer' && user.org_status === 'suspended') {
      await logPlatformEvent({
        actorUserId: user.id,
        actorRole: user.role,
        domain: 'auth',
        eventType: 'login_blocked',
        entityType: 'organizer',
        entityId: user.organizer_id,
        summary: `Login blocked for suspended organizer ${user.email}`,
        severity: 'warning',
        payload: { reason: 'organizer_suspended' },
        ...getRequestMeta(req),
      }).catch(() => {});
      return res.status(403).json({ success: false, message: 'Your organizer account has been suspended' });
    }
    if (user.role === 'organizer' && !user.terms_agreed) {
      const setting = await queryOne(
        `SELECT value FROM platform_settings WHERE key = 'terms_and_conditions'`
      );
      await logPlatformEvent({
        actorUserId: user.id,
        actorRole: user.role,
        domain: 'auth',
        eventType: 'login_blocked',
        entityType: 'organizer',
        entityId: user.organizer_id,
        summary: `Login blocked until organizer terms accepted for ${user.email}`,
        severity: 'warning',
        payload: { reason: 'terms_not_accepted' },
        ...getRequestMeta(req),
      }).catch(() => {});
      return res.status(403).json({
        success: false,
        message: 'Your organizer account is locked until you agree to the terms and conditions.',
        terms_lock: true,
        email: user.email,
        terms_and_conditions: setting?.value || '',
      });
    }

    const token = signToken(user);
    await logPlatformEvent({
      actorUserId: user.id,
      actorRole: user.role,
      domain: 'auth',
      eventType: 'login_succeeded',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.email} logged in`,
      payload: { role: user.role },
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.json({
      success: true,
      token,
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email,
        role:  user.role,
        phone: user.phone,
        organizer: user.organizer_id
          ? { id: user.organizer_id, company: user.company_name, status: user.org_status }
          : null,
      },
    });
  } catch (err) {
    console.error('login:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/auth/accept-organizer-terms ────────────────────
const acceptOrganizerTerms = async (req, res) => {
  const { email, password, terms_agreed } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }
  if (!terms_agreed) {
    return res.status(400).json({ success: false, message: 'You must agree to the terms' });
  }

  try {
    const user = await queryOne(
      `SELECT u.id, u.email, u.password, u.role, u.is_active,
              o.id AS organizer_id, o.terms_agreed
       FROM users u
       LEFT JOIN organizers o ON o.user_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account has been disabled' });
    }
    if (user.role !== 'organizer' || !user.organizer_id) {
      return res.status(403).json({ success: false, message: 'Only organizer accounts can accept these terms' });
    }

    if (!user.terms_agreed) {
      await query(
        `UPDATE organizers
         SET terms_agreed = TRUE, terms_agreed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [user.organizer_id]
      );
    }

    await logPlatformEvent({
      actorUserId: user.id,
      actorRole: 'organizer',
      domain: 'auth',
      eventType: 'organizer_terms_accepted',
      entityType: 'organizer',
      entityId: user.organizer_id,
      summary: `Organizer terms accepted for ${user.email}`,
      payload: {},
      ...getRequestMeta(req),
    }).catch(() => {});

    return res.json({
      success: true,
      message: 'Terms accepted successfully. You can now sign in.',
    });
  } catch (err) {
    console.error('acceptOrganizerTerms:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/auth/verify-email ───────────────────────────────
const verifyEmail = async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Verification token is required' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await queryOne(
      `SELECT id, name, email, role, email_verified
       FROM users
       WHERE email_verify_token = $1
         AND email_verify_expires > NOW()`,
      [tokenHash]
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Verification link is invalid or has expired. Request a new one below.',
        expired: true,
      });
    }
    if (user.email_verified) {
      return res.json({ success: true, message: 'Email already verified — you can log in.' });
    }

    await query(
      `UPDATE users
       SET email_verified       = TRUE,
           email_verify_token   = NULL,
           email_verify_expires = NULL,
           updated_at           = NOW()
       WHERE id = $1`,
      [user.id]
    );

    await logPlatformEvent({
      actorUserId: user.id,
      actorRole: user.role,
      domain: 'auth',
      eventType: 'email_verified',
      entityType: 'user',
      entityId: user.id,
      summary: `Email verified for ${user.email}`,
      payload: {},
      ...getRequestMeta(req),
    }).catch(() => {});

    return res.json({
      success: true,
      message: 'Email verified successfully — you can now log in.',
    });
  } catch (err) {
    console.error('verifyEmail:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/auth/resend-verification ───────────────────────
const resendVerification = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    const user = await queryOne(
      `SELECT id, name, email, email_verified FROM users WHERE email = $1 AND is_active = TRUE`,
      [email.toLowerCase().trim()]
    );

    // Always respond the same way to prevent email enumeration
    const genericResponse = {
      success: true,
      message: 'If that email is registered and unverified, a new link has been sent.',
    };

    if (!user || user.email_verified) {
      return res.json(genericResponse);
    }

    const rawToken   = crypto.randomBytes(32).toString('hex');
    const tokenHash  = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt  = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await query(
      `UPDATE users
       SET email_verify_token = $1, email_verify_expires = $2, updated_at = NOW()
       WHERE id = $3`,
      [tokenHash, expiresAt, user.id]
    );

    const verifyUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/verify-email?token=${rawToken}`;
    setImmediate(() => {
      sendVerificationEmail({ to: user.email, name: user.name, verifyUrl })
        .catch(e => console.error('[resendVerification] email error:', e.message));
    });

    await logPlatformEvent({
      actorUserId: user.id,
      actorRole: 'user',
      domain: 'auth',
      eventType: 'verification_email_resent',
      entityType: 'user',
      entityId: user.id,
      summary: `Verification email resent to ${user.email}`,
      payload: {},
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.json({
      ...genericResponse,
      ...(process.env.NODE_ENV !== 'production' && { dev_verify_url: verifyUrl }),
    });
  } catch (err) {
    console.error('resendVerification:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const user = await queryOne(
      `SELECT u.id, u.name, u.email, u.phone, u.role,
              u.email_verified, u.created_at,
              o.id AS organizer_id, o.company_name, o.status AS org_status, o.commission
       FROM users u
       LEFT JOIN organizers o ON o.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    return res.json({ success: true, user });
  } catch (err) {
    console.error('getMe:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── PUT /api/auth/profile ─────────────────────────────────────
const updateProfile = async (req, res) => {
  const { name, phone, current_password, new_password } = req.body;
  try {
    const user = await queryOne(`SELECT id, password FROM users WHERE id = $1`, [req.user.id]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const updates = [];
    const params  = [];

    if (name?.trim()) updates.push(`name = $${params.push(name.trim())}`);
    if (phone !== undefined) updates.push(`phone = $${params.push(phone || null)}`);

    if (new_password) {
      if (!current_password) {
        return res.status(400).json({ success: false, message: 'Current password is required to set a new one' });
      }
      if (new_password.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
      }
      const valid = await bcrypt.compare(current_password, user.password);
      if (!valid) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      }
      const hashed = await bcrypt.hash(new_password, 12);
      updates.push(`password = $${params.push(hashed)}`);
    }

    if (!updates.length) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    updates.push(`updated_at = NOW()`);
    params.push(req.user.id);

    const updated = await queryOne(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}
       RETURNING id, name, email, phone, role`,
      params
    );
    await logPlatformEvent({
      actorUserId: updated.id,
      actorRole: updated.role,
      domain: 'auth',
      eventType: new_password ? 'profile_and_password_updated' : 'profile_updated',
      entityType: 'user',
      entityId: updated.id,
      summary: `Profile updated for ${updated.email}`,
      payload: { changed_name: Boolean(name?.trim()), changed_phone: phone !== undefined, changed_password: Boolean(new_password) },
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.json({ success: true, message: 'Profile updated', user: updated });
  } catch (err) {
    console.error('updateProfile:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/auth/forgot-password ───────────────────────────
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await queryOne(
      `SELECT id, name, email FROM users WHERE email = $1 AND is_active = TRUE`,
      [email.toLowerCase().trim()]
    );

    const generic = {
      success: true,
      message: 'If that email is registered you will receive reset instructions',
    };

    if (!user) return res.json(generic);

    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await query(
      `UPDATE users SET reset_token = $1, reset_token_expires = $2, updated_at = NOW() WHERE id = $3`,
      [tokenHash, expiresAt, user.id]
    );

    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password?token=${rawToken}`;
    setImmediate(() => {
      sendResetEmail({ to: user.email, name: user.name, resetUrl })
        .catch(e => console.error('[forgotPassword] email error:', e.message));
    });

    await logPlatformEvent({
      actorUserId: user.id,
      actorRole: 'user',
      domain: 'auth',
      eventType: 'password_reset_requested',
      entityType: 'user',
      entityId: user.id,
      summary: `Password reset requested for ${user.email}`,
      payload: {},
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.json({
      ...generic,
      ...(process.env.NODE_ENV !== 'production' && { dev_reset_url: resetUrl }),
    });
  } catch (err) {
    console.error('forgotPassword:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/auth/reset-password ────────────────────────────
const resetPassword = async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ success: false, message: 'Token and new password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await queryOne(
      `SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW() AND is_active = TRUE`,
      [tokenHash]
    );
    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset token is invalid or has expired' });
    }

    const hashedPwd = await bcrypt.hash(password, 12);
    await query(
      `UPDATE users
       SET password = $1, reset_token = NULL, reset_token_expires = NULL, updated_at = NOW()
       WHERE id = $2`,
      [hashedPwd, user.id]
    );
    await logPlatformEvent({
      actorUserId: user.id,
      actorRole: 'user',
      domain: 'auth',
      eventType: 'password_reset_completed',
      entityType: 'user',
      entityId: user.id,
      summary: `Password reset completed for user ${user.id}`,
      severity: 'info',
      payload: {},
      ...getRequestMeta(req),
    }).catch(() => {});
    return res.json({ success: true, message: 'Password reset successfully — you can now log in' });
  } catch (err) {
    console.error('resetPassword:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  register, login, getMe, updateProfile,
  verifyEmail, resendVerification,
  acceptOrganizerTerms,
  forgotPassword, resetPassword,
};
