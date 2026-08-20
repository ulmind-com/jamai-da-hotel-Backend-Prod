/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Order reviews and ratings
 */

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     summary: Add a review for an order
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - rating
 *               - comment
 *             properties:
 *               orderId:
 *                 type: string
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *     responses:
 *       201:
 *         description: Review added
 *       400:
 *         description: Order not delivered or already reviewed
 *       401:
 *         description: Not authorized
 */

/**
 * @swagger
 * /api/reviews/stats:
 *   get:
 *     summary: Get review statistics
 *     tags: [Reviews]
 *     responses:
 *       200:
 *         description: Review stats and recent reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 averageRating:
 *                   type: number
 *                 totalReviews:
 *                   type: number
 *                 recentReviews:
 *                   type: array
 *                   items:
 *                     type: object
 */
