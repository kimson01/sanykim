// routes/organisers.js — Public organiser profiles
const router = require('express').Router();
const { getOrgProfile } = require('../controllers/organizerProfileController');
const { param }         = require('express-validator');
const { validate }      = require('../middleware/validate');

// GET /api/organisers/:slug — public profile, no auth
router.get('/:slug',
  [param('slug').trim().notEmpty().matches(/^[a-z0-9-]+$/).withMessage('Invalid slug')],
  validate,
  getOrgProfile
);

module.exports = router;
