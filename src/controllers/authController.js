const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Otp = require('../models/Otp');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

const {
    sendWelcomeEmail,
    sendOtpEmail,
    sendPasswordResetEmail,
} = require('../utils/email.service');

const CLIENT_URL = () =>
    (process.env.CLIENT_URL || 'https://haldiacloudkitchen.in').replace(/\/$/, '');

// @desc    Send an OTP to verify email before signup
// @route   POST /api/auth/send-otp
// @access  Public
const sendSignupOtp = async (req, res, next) => {
    try {
        const email = (req.body.email || '').toLowerCase().trim();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            res.status(400);
            throw new Error('Please provide a valid email address');
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            res.status(400);
            throw new Error('An account with this email already exists. Please sign in instead.');
        }

        // Generate a 6-digit OTP and store its hash.
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const salt = await bcrypt.genSalt(10);
        const otpHash = await bcrypt.hash(otp, salt);

        await Otp.findOneAndUpdate(
            { email, purpose: 'signup' },
            {
                email,
                otp: otpHash,
                purpose: 'signup',
                attempts: 0,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
            },
            { upsert: true, new: true }
        );

        await sendOtpEmail(email, otp);

        res.json({ message: 'A verification code has been sent to your email.' });
    } catch (error) {
        next(error);
    }
};

// @desc    Verify the signup OTP and return a short-lived signup token
// @route   POST /api/auth/verify-otp
// @access  Public
const verifySignupOtp = async (req, res, next) => {
    try {
        const email = (req.body.email || '').toLowerCase().trim();
        const { otp } = req.body;

        if (!email || !otp) {
            res.status(400);
            throw new Error('Email and OTP are required');
        }

        const record = await Otp.findOne({ email, purpose: 'signup' });

        if (!record || record.expiresAt < Date.now()) {
            if (record) await record.deleteOne();
            res.status(400);
            throw new Error('This code has expired. Please request a new one.');
        }

        if (record.attempts >= 5) {
            await record.deleteOne();
            res.status(400);
            throw new Error('Too many incorrect attempts. Please request a new code.');
        }

        const isMatch = await record.matchOtp(String(otp).trim());
        if (!isMatch) {
            record.attempts += 1;
            await record.save();
            res.status(400);
            throw new Error('Invalid verification code. Please try again.');
        }

        // OTP correct — consume it and issue a short-lived signup token.
        await record.deleteOne();

        const signupToken = jwt.sign(
            { email, purpose: 'signup' },
            process.env.JWT_SECRET,
            { expiresIn: '20m' }
        );

        res.json({ signupToken, message: 'Email verified successfully.' });
    } catch (error) {
        next(error);
    }
};

// @desc    Register a new user (requires a valid signup token from OTP verification)
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res, next) => {
    try {
        const { name, password, mobile, address, signupToken } = req.body;
        const email = (req.body.email || '').toLowerCase().trim();

        // Require a verified-email signup token.
        if (!signupToken) {
            res.status(400);
            throw new Error('Email verification required. Please verify your email first.');
        }

        let decoded;
        try {
            decoded = jwt.verify(signupToken, process.env.JWT_SECRET);
        } catch (e) {
            res.status(400);
            throw new Error('Your verification session has expired. Please verify your email again.');
        }

        if (decoded.purpose !== 'signup' || decoded.email !== email) {
            res.status(400);
            throw new Error('Email verification mismatch. Please verify your email again.');
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            res.status(400);
            throw new Error('User already exists');
        }

        const userData = { name, email, password, mobile };

        if (address && Object.keys(address).length > 0) {
            userData.savedAddresses = [address];
        }

        const user = await User.create(userData);

        // Send Welcome Email (fire-and-forget)
        sendWelcomeEmail(user).catch((err) => console.error(err));

        if (user) {
            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                mobile: user.mobile,
                token: generateToken(user._id),
            });
        } else {
            res.status(400);
            throw new Error('Invalid user data');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const authUser = async (req, res, next) => {
    try {
        const email = (req.body.email || '').toLowerCase().trim();
        const { password } = req.body;

        const user = await User.findOne({ email });

        if (user && (await user.matchPassword(password))) {
            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                mobile: user.mobile,
                token: generateToken(user._id),
            });
        } else {
            res.status(401);
            throw new Error('Invalid email or password');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Send a password reset link to the user's email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res, next) => {
    try {
        const email = (req.body.email || '').toLowerCase().trim();

        if (!email) {
            res.status(400);
            throw new Error('Please provide your email address');
        }

        const user = await User.findOne({ email });

        // Always respond success to avoid leaking which emails are registered.
        if (user) {
            const resetToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto
                .createHash('sha256')
                .update(resetToken)
                .digest('hex');

            user.resetPasswordToken = hashedToken;
            user.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            await user.save({ validateBeforeSave: false });

            const resetUrl = `${CLIENT_URL()}/reset-password?token=${resetToken}`;

            try {
                await sendPasswordResetEmail(user, resetUrl);
            } catch (mailErr) {
                console.error('[forgotPassword] Email send failed:', mailErr);
                // Roll back the token so a broken email doesn't lock the user out silently.
                user.resetPasswordToken = undefined;
                user.resetPasswordExpire = undefined;
                await user.save({ validateBeforeSave: false });
                res.status(500);
                throw new Error('Could not send reset email. Please try again later.');
            }
        }

        res.json({
            message: 'If an account exists for that email, a password reset link has been sent.',
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Reset password using the token from the email link
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res, next) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            res.status(400);
            throw new Error('Token and new password are required');
        }

        if (String(password).length < 6) {
            res.status(400);
            throw new Error('Password must be at least 6 characters');
        }

        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpire: { $gt: Date.now() },
        }).select('+resetPasswordToken +resetPasswordExpire');

        if (!user) {
            res.status(400);
            throw new Error('This reset link is invalid or has expired. Please request a new one.');
        }

        user.password = password; // hashed by the pre-save hook
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        res.json({ message: 'Your password has been reset successfully. You can now sign in.' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    registerUser,
    authUser,
    sendSignupOtp,
    verifySignupOtp,
    forgotPassword,
    resetPassword,
};
