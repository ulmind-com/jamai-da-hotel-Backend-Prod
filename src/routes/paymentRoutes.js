const express = require('express');
const router = express.Router();
const {
    createPaymentOrder,
    verifyPayment,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Payment management
 */

/**
 * @swagger
 * /api/payment/create-order:
 *   post:
 *     summary: Create Razorpay Order
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount in smallest currency unit (e.g., paise for INR)
 *     responses:
 *       200:
 *         description: Razorpay order created successfully
 *       400:
 *         description: Amount is required
 *       401:
 *         description: Not authorized
 */
router.post('/create-order', protect, createPaymentOrder);

/**
 * @swagger
 * /api/payment/verify:
 *   post:
 *     summary: Verify Razorpay Payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - razorpay_order_id
 *               - razorpay_payment_id
 *               - razorpay_signature
 *               - orderId
 *             properties:
 *               razorpay_order_id:
 *                 type: string
 *               razorpay_payment_id:
 *                 type: string
 *               razorpay_signature:
 *                 type: string
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment verified successfully
 *       400:
 *         description: Invalid signature
 *       404:
 *         description: Order not found
 *       401:
 *         description: Not authorized
 */
router.post('/verify', protect, verifyPayment);

module.exports = router;
