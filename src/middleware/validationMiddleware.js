const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.error('[Validation Error] Route:', req.originalUrl);
        console.error('[Validation Error] Body:', JSON.stringify(req.body, null, 2));
        console.error('[Validation Error] Errors:', errors.array());
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

const registerValidationRules = () => {
    return [
        body('name').notEmpty().withMessage('Name is required'),
        body('email').isEmail().withMessage('Please include a valid email'),
        body('password')
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters'),
        body('mobile')
            .isLength({ min: 10, max: 15 })
            .withMessage('Mobile number must be between 10 and 15 digits'),
    ];
};

const orderValidationRules = () => {
    return [
        body('items')
            .isArray({ min: 1 })
            .withMessage('Order items must be a non-empty array'),
        // Frontend sends 'menuItem', Backend expects 'product'. 
        // We will validate that EITHER product OR menuItem exists.
        body('items.*').custom((item) => {
            if (!item.product && !item.menuItem) {
                throw new Error('Product ID (product or menuItem) is required');
            }
            return true;
        }),
        body('items.*.quantity')
            .isInt({ min: 1 })
            .withMessage('Quantity must be at least 1'),
        body('totalAmount').isNumeric().withMessage('Total amount must be a number'),
        body('finalAmount').isNumeric().withMessage('Final amount must be a number'),
        body('deliveryAddress').notEmpty().withMessage('Delivery address is required'),
        // Relax payment method validation to allow case-insensitive check in controller
        body('paymentMethod')
            .custom((val) => {
                const normalized = val ? val.toUpperCase() : '';
                // Map 'ONLINE PAYMENT' or 'ONLINE' -> ONLINE
                if (normalized === 'COD' || normalized === 'CASH ON DELIVERY' || normalized.includes('ONLINE')) {
                    return true;
                }
                throw new Error('Invalid payment method');
            }),
    ];
};

module.exports = {
    validate,
    registerValidationRules,
    orderValidationRules,
};
