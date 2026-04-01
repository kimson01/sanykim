// routes/auth.js
const router = require('express').Router();
const {
  register, login, getMe, updateProfile,
  verifyEmail, resendVerification,
  acceptOrganizerTerms,
  forgotPassword, resetPassword,
} = require('../controllers/authController');
const { authenticate }                        = require('../middleware/auth');
const { registerRules, loginRules, validate } = require('../middleware/validate');
const { body }                                = require('express-validator');

const forgotRules = [
  body('email').trim().isEmail().withMessage('Valid email is required'),
];
const resetRules = [
  body('token').trim().notEmpty().withMessage('Token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];
const profileRules = [
  body('name').optional().trim().isLength({ min: 1, max: 150 }),
  body('phone').optional({ nullable: true, checkFalsy: true })
    .matches(/^\+?[\d\s\-()\\.]{7,20}$/).withMessage('Invalid phone number'),
  body('new_password').optional().isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters'),
];
const verifyRules = [
  body('token').trim().notEmpty().withMessage('Token is required'),
];
const resendRules = [
  body('email').trim().isEmail().withMessage('Valid email is required'),
];
const acceptTermsRules = [
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  body('terms_agreed').custom(v => v === true).withMessage('You must agree to the terms'),
];

router.post('/register',             registerRules, validate, register);
router.post('/login',                loginRules,    validate, login);
router.get ('/me',                   authenticate,  getMe);
router.put ('/profile',              authenticate,  profileRules, validate, updateProfile);
router.post('/verify-email',         verifyRules,   validate, verifyEmail);
router.post('/resend-verification',  resendRules,   validate, resendVerification);
router.post('/accept-organizer-terms', acceptTermsRules, validate, acceptOrganizerTerms);
router.post('/forgot-password',      forgotRules,   validate, forgotPassword);
router.post('/reset-password',       resetRules,    validate, resetPassword);

module.exports = router;
