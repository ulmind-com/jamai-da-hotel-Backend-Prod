const express = require('express');
const router = express.Router();
const {
    createCoupon,
    validateCoupon,
    getCoupons,
    updateCoupon,
    deleteCoupon,
} = require('../controllers/couponController');
const { protect, admin } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Coupons
 *   description: Coupon management
 */

/**
 * @swagger
 * /api/coupons:
 *   get:
 *     summary: Get all coupons (Admin see all, User see active)
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of coupons
 *   post:
 *     summary: Create a new coupon (Admin)
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - name
 *               - discountType
 *               - discountAmount
 *               - minOrderValue
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *                 description: Display name of the coupon
 *               description:
 *                 type: string
 *               discountType:
 *                 type: string
 *                 enum: [PERCENTAGE, FLAT]
 *               discountAmount:
 *                 type: number
 *                 description: Amount for FLAT or Value for PERCENTAGE
 *               discountPercent:
 *                 type: number
 *                 description: Alias for discountAmount when type is PERCENTAGE
 *               maxDiscountAmount:
 *                 type: number
 *                 description: Max discount cap for PERCENTAGE coupons
 *               minOrderValue:
 *                 type: number
 *               validFrom:
 *                 type: string
 *                 format: date-time
 *               validUntil:
 *                 type: string
 *                 format: date-time
 *               usageLimit:
 *                 type: number
 *               userUsageLimit:
 *                 type: number
 *     responses:
 *       201:
 *         description: Coupon created successfully
 *       400:
 *         description: Coupon already exists or invalid data
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.route('/')
    .get(protect, getCoupons)
    .post(protect, admin, createCoupon);

/**
 * @swagger
 * /api/coupons/{id}:
 *   put:
 *     summary: Update a coupon (Admin)
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Coupon ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               discountType:
 *                 type: string
 *                 enum: [PERCENTAGE, FLAT]
 *               discountAmount:
 *                 type: number
 *               discountPercent:
 *                 type: number
 *               maxDiscountAmount:
 *                 type: number
 *               minOrderValue:
 *                 type: number
 *               validFrom:
 *                 type: string
 *               validUntil:
 *                 type: string
 *               usageLimit:
 *                 type: number
 *               userUsageLimit:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Coupon updated
 *       404:
 *         description: Coupon not found
 *   delete:
 *     summary: Delete a coupon (Admin)
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Coupon ID
 *     responses:
 *       200:
 *         description: Coupon removed
 *       404:
 *         description: Coupon not found
 */
router.route('/:id')
    .put(protect, admin, updateCoupon)
    .delete(protect, admin, deleteCoupon);

/**
 * @swagger
 * /api/coupons/validate:
 *   post:
 *     summary: Validate a coupon
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - cartValue
 *             properties:
 *               code:
 *                 type: string
 *               cartValue:
 *                 type: number
 *     responses:
 *       200:
 *         description: Coupon is valid
 *       404:
 *         description: Invalid coupon code
 *       400:
 *         description: Coupon expired or conditions not met
 */
router.post('/validate', protect, validateCoupon);

module.exports = router;
