const express = require('express');
const router = express.Router();
const {
    getProducts,
    getAdminProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    applyDiscount,
    removeDiscount,
} = require('../controllers/productController');
const { protect, admin } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Menu
 *   description: Product and Menu management
 */

/**
 * @swagger
 * /api/menu:
 *   get:
 *     summary: Get all active products (Public)
 *     tags: [Menu]
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Search keyword
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category (ID or Name or CustomID)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by type (Veg/Non-Veg)
 *     responses:
 *       200:
 *         description: List of products
 *   post:
 *     summary: Create a new product
 *     tags: [Menu]
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
 *               - description
 *               - category
 *               - imageURL
 *               - type
 *               - isAvailable
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 description: Category ID or CustomID
 *               imageURL:
 *                 type: string
 *               type:
 *                 type: string
 *               isAvailable:
 *                 type: boolean
 *               variants:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     price:
 *                       type: number
 *     responses:
 *       201:
 *         description: Product created successfully
 *       401:
 *         description: Not authorized
 */
router.route('/').get(getProducts).post(protect, admin, createProduct);

/**
 * @swagger
 * /api/menu/admin:
 *   get:
 *     summary: Get ALL products (Admin - Active & Inactive)
 *     tags: [Menu]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all products
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.get('/admin', protect, admin, getAdminProducts);

/**
 * @swagger
 * /api/menu/{id}:
 *   get:
 *     summary: Get product by ID (ObjectId or CustomID)
 *     tags: [Menu]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID or CustomID
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Product not found
 *   put:
 *     summary: Update a product
 *     tags: [Menu]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID or CustomID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               discountPercentage:
 *                 type: number
 *                 default: 0
 *               discountExpiresAt:
 *                 type: string
 *                 format: date-time
 *               hsnCode:
 *                 type: string
 *                 description: HSN Code for GST
 *               cgst:
 *                 type: number
 *                 description: Central GST Percentage
 *               sgst:
 *                 type: number
 *                 description: State GST Percentage
 *               igst:
 *                 type: number
 *                 description: Integrated GST Percentage
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       404:
 *         description: Product not found
 *   delete:
 *     summary: Delete a product
 *     tags: [Menu]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID or CustomID
 *     responses:
 *       200:
 *         description: Product removed
 *       404:
 *         description: Product not found
 */
router.route('/:id')
    .get(getProductById)
    .put(protect, admin, updateProduct)
    .delete(protect, admin, deleteProduct);

/**
 * @swagger
 * /api/menu/{id}/discount:
 *   post:
 *     summary: Apply/Edit Discount on a Product
 *     tags: [Menu]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID or CustomID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - percentage
 *             properties:
 *               percentage:
 *                 type: number
 *                 description: Discount percentage (0-100)
 *               durationInMinutes:
 *                 type: number
 *                 description: Duration in minutes
 *               duration:
 *                 type: object
 *                 description: Duration object (alternative to durationInMinutes)
 *                 properties:
 *                   days:
 *                     type: number
 *                   hours:
 *                     type: number
 *                   minutes:
 *                     type: number
 *     responses:
 *       200:
 *         description: Discount applied
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Product not found
 *   delete:
 *     summary: Remove Discount from a Product
 *     tags: [Menu]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID or CustomID
 *     responses:
 *       200:
 *         description: Discount removed
 *       404:
 *         description: Product not found
 */
router.route('/:id/discount')
    .post(protect, admin, applyDiscount)
    .delete(protect, admin, removeDiscount);

module.exports = router;
