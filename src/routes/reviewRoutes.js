const express = require('express');
const router = express.Router();
const {
    createReview,
    getReviewStats,
    getAllReviews,
    getUserReviews,
} = require('../controllers/reviewController');
const { protect, admin } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Review management
 */

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     summary: Create a new review
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
 *             properties:
 *               orderId:
 *                 type: string
 *               rating:
 *                 type: number
 *               comment:
 *                 type: string
 *     responses:
 *       201:
 *         description: Review created successfully
 *       400:
 *         description: Order not delivered or already reviewed
 *       401:
 *         description: Not authorized
 */
router.route('/').post(protect, createReview);

/**
 * @swagger
 * /api/reviews/stats:
 *   get:
 *     summary: Get review statistics
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Review stats retrieved successfully
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.route('/stats').get(protect, admin, getReviewStats);

/**
 * @swagger
 * /api/reviews/admin:
 *   get:
 *     summary: Get all reviews (Admin)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all reviews
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.route('/admin').get(protect, admin, getAllReviews);

/**
 * @swagger
 * /api/reviews/my-reviews:
 *   get:
 *     summary: Get logged in user's reviews
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's reviews
 *       401:
 *         description: Not authorized
 */
router.route('/my-reviews').get(protect, getUserReviews);

module.exports = router;
