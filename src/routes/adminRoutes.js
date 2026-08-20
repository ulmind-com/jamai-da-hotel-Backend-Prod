const express = require('express');
const router = express.Router();
const { getDashboardStats, getAnalytics, getMapAnalytics, createPOSOrder, getPOSOrders, processRefund } = require('../controllers/adminController');
const { protect, admin, staff } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin dashboard and management
 */

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get Admin Dashboard Stats
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalRevenue:
 *                   type: number
 *                 todaysRevenue:
 *                   type: number
 *                   description: Revenue for today (IST)
 *                 todaysOrders:
 *                   type: number
 *                   description: Total number of non-cancelled orders today (IST)
 *                 totalOrders:
 *                   type: number
 *                 topSellingItems:
 *                   type: array
 *                   items:
 *                     type: object
 *                 recentOrders:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.get('/dashboard', protect, staff, getDashboardStats);

/**
 * @swagger
 * /api/admin/analytics:
 *   get:
 *     summary: Get Advanced Analytics (Custom Date Range)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start Date (ISO 8601) - Defaults to Today Start
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End Date (ISO 8601) - Defaults to Today End
 *     responses:
 *       200:
 *         description: Analytics data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period:
 *                   type: object
 *                   properties:
 *                     startDate:
 *                       type: string
 *                     endDate:
 *                       type: string
 *                 revenue:
 *                   type: number
 *                   description: Total Revenue from PAID orders
 *                 paidOrdersCount:
 *                   type: number
 *                 totalOrders:
 *                   type: number
 *                 newUsersCount:
 *                   type: number
 *                 newUsers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                       mobile:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                 topItems:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       totalSold:
 *                         type: number
 *                       revenue:
 *                         type: number
 *                 statusBreakdown:
 *                   type: object
 *                   additionalProperties:
 *                     type: number
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.get('/analytics', protect, staff, getAnalytics);

/**
 * @swagger
 * /api/admin/analytics/map:
 *   get:
 *     summary: Get Map Analytics (Spatial Order Visualization)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *         description: Start Date (Optional)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *         description: End Date (Optional)
 *     responses:
 *       200:
 *         description: Coordinates retrieved successfully
 */
router.get('/analytics/map', protect, staff, getMapAnalytics);

// POS Routes
router.post('/pos/create', protect, admin, createPOSOrder);
router.get('/pos/orders', protect, admin, getPOSOrders);

// Refund Routes
router.put('/orders/:id/refund', protect, admin, processRefund);

module.exports = router;
