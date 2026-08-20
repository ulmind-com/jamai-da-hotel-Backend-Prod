const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = await User.findById(decoded.id).select('-password');
            console.log(`[AuthMiddleware] User: ${req.user ? req.user.email : 'null'}, Role: ${req.user ? req.user.role : 'N/A'}`);

            next();
        } catch (error) {
            console.error(error);
            res.status(401);
            throw new Error('Not authorized, token failed'); // Will be caught by error handler
        }
    }

    if (!token) {
        res.status(401);
        throw new Error('Not authorized, no token'); // Will be caught by error handler
    }
};

const admin = (req, res, next) => {
    if (req.user && req.user.role === 'Admin') {
        next();
    } else {
        res.status(401);
        throw new Error('Not authorized as an admin');
    }
};

// Allows both Admin and Manager (used for POS / offline operations).
const staff = (req, res, next) => {
    if (req.user && (req.user.role === 'Admin' || req.user.role === 'Manager')) {
        next();
    } else {
        res.status(401);
        throw new Error('Not authorized. Staff access required.');
    }
};

// Allows Admin, Manager and Waiter (KOT-only staff for taking orders).
const kotStaff = (req, res, next) => {
    if (req.user && ['Admin', 'Manager', 'Waiter'].includes(req.user.role)) {
        next();
    } else {
        res.status(401);
        throw new Error('Not authorized. Staff access required.');
    }
};

module.exports = { protect, admin, staff, kotStaff };
