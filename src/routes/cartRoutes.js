const express = require('express');
const router = express.Router();
const {
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    applyCouponToCart,
    removeCouponFromCart,
    getCartBill,
    reorder,
    getCartRecommendations
} = require('../controllers/cartController');
const { protect } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: Shopping Cart management
 */

/**
 * @swagger
 * /api/cart:
 *   get:
 *     summary: Get user's cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's cart
 *       401:
 *         description: Not authorized
 *   post:
 *     summary: Add item to cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - quantity
 *             properties:
 *               productId:
 *                 type: string
 *               variant:
 *                 type: string
 *                 description: Optional. Defaults to first variant if not provided.
 *               quantity:
 *                 type: number
 *     responses:
 *       200:
 *         description: Updated cart
 *   delete:
 *     summary: Clear cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared
 */
router.route('/')
    .get(protect, getCart)
    .post(protect, addToCart)
    .delete(protect, clearCart);

/**
 * @swagger
 * /api/cart/bill:
 *   get:
 *     summary: Calculate total bill with coupon
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bill Calculation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 itemsTotal:
 *                   type: number
 *                 shipping:
 *                   type: number
 *                 discount:
 *                   type: number
 *                 finalTotal:
 *                   type: number
 *                 appliedCoupon:
 *                   type: object
 */
router.get('/bill', protect, getCartBill);

/**
 * @swagger
 * /api/cart/coupon:
 *   post:
 *     summary: Apply coupon to cart
 *     tags: [Cart]
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
 *             properties:
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Coupon applied successfully
 *       400:
 *         description: Invalid coupon or requirements not met
 *       404:
 *         description: Coupon not found
 *   delete:
 *     summary: Remove coupon from cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Coupon removed successfully
 */
router.post('/coupon', protect, applyCouponToCart);
router.delete('/coupon', protect, removeCouponFromCart);

/**
 * @swagger
 * /api/cart/{itemId}:
 *   put:
 *     summary: Update cart item quantity
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cart Item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: number
 *     responses:
 *       200:
 *         description: Updated cart
 *   delete:
 *     summary: Remove item from cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cart Item ID
 *     responses:
 *       200:
 *         description: Updated cart
 */
router.route('/:itemId')
    .put(protect, updateCartItem)
    .delete(protect, removeFromCart);

/**
 * @swagger
 * /api/cart/reorder:
 *   post:
 *     summary: Reorder items from a past order (Clears current cart)
 *     tags: [Cart]
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
 *             properties:
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cart updated with reordered items
 *       404:
 *         description: Order not found
 *       401:
 *         description: Not authorized
 */
router.route('/reorder').post(protect, reorder);

/**
 * @swagger
 * /api/cart/recommendations:
 *   get:
 *     summary: Get product recommendations based on cart items
 *     description: Returns up to 3 random products from the same categories as items currently in the cart.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of recommended products
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Product'
 *       401:
 *         description: Not authorized
 */
router.get('/recommendations', protect, getCartRecommendations);

module.exports = router;
