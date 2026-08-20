const Razorpay = require('razorpay');
const crypto = require('crypto');
const razorpay = require('../utils/payment'); // Import authorized instance

// @desc    Create Razorpay Order
// @route   POST /api/payment/create
// @access  Private
const createPaymentOrder = async (req, res, next) => {
    try {
        const { amount } = req.body; // Amount in INR 
        // Note: Razorpay expects amount in paise (multiply by 100)

        const options = {
            amount: amount * 100,
            currency: 'INR',
            receipt: `receipt_${Date.now()}`,
        };

        const order = await razorpay.orders.create(options);

        res.json({
            id: order.id,
            currency: order.currency,
            amount: order.amount,
        });
    } catch (error) {
        next(error);
    }
};

// Utility to verify signature
const verifyPaymentSignature = (orderId, paymentId, signature) => {
    const generated_signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(orderId + '|' + paymentId)
        .digest('hex');

    return generated_signature === signature;
};

module.exports = {
    createPaymentOrder,
    verifyPaymentSignature,
};
