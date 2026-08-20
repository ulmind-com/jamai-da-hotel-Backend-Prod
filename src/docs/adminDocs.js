/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Administrative functions
 */

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get admin dashboard statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalSales:
 *                   type: number
 *                 totalOrders:
 *                   type: number
 *                 totalUsers:
 *                   type: number
 *                 categorySales:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       totalSales:
 *                         type: number
 *       401:
 *         description: Not authorized/Admin only
 */
