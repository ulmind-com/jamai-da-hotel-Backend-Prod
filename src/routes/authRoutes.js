const express = require('express');
const router = express.Router();
const {
    registerUser,
    authUser,
    sendSignupOtp,
    verifySignupOtp,
    forgotPassword,
    resetPassword,
} = require('../controllers/authController');

const {
    registerValidationRules,
    validate,
} = require('../middleware/validationMiddleware');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication management
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - mobile
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               mobile:
 *                 type: string
 *               address:
 *                 type: object
 *                 properties:
 *                   addressLine1:
 *                     type: string
 *                   city:
 *                     type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Invalid input or user already exists
 */
router.post('/register', registerValidationRules(), validate, registerUser);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user & get token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid email or password
 */
router.post('/login', authUser);

// ── OTP-verified signup flow ──
// Step 1: request an email OTP; Step 2: verify it for a signup token; then /register.
router.post('/send-otp', sendSignupOtp);
router.post('/verify-otp', verifySignupOtp);

// ── Forgot / reset password flow ──
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
