/**
 * @swagger
 * tags:
 *   name: Coupons
 *   description: Coupon code management
 */

/**
 * @swagger
 * /api/coupons:
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
 *               - name
 *               - discountPercent
 *               - expiry
 *             properties:
 *               name:
 *                 type: string
 *                 description: Coupon code (e.g., WELCOME50)
 *               discountPercent:
 *                 type: number
 *               expiry:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Coupon created
 *       400:
 *         description: Bad request
 *       401:
 *         description: Not authorized
 */

/**
 * @swagger
 * /api/coupons/validate:
 *   post:
 *     summary: Validate a coupon code
 *     tags: [Coupons]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - coupon
 *             properties:
 *               coupon:
 *                 type: string
 *     responses:
 *       200:
 *         description: Coupon valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: string
 *                 discountPercent:
 *                   type: number
 *                 expiry:
 *                   type: string
 *       400:
 *         description: Invalid or expired coupon
 */
