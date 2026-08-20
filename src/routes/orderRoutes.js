const express = require('express');
const router = express.Router();
const {
    addOrderItems,
    getMyOrders,
    getOrders,
    updateOrderStatus,
    calcFee,
    getOrderById,
    cancelOrder, // Will implement next
    verifyOrderPayment,
    initiateCheckout,
    updatePaymentStatus,
    updatePreparationTime,
    getOrdersByStatus,
    getOrderStats
} = require('../controllers/orderController');
const { createPaymentOrder } = require('../controllers/paymentController');
const { protect, admin } = require('../middleware/authMiddleware');

const {
    orderValidationRules,
    validate,
} = require('../middleware/validationMiddleware');

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Order management and payment
 */

/**
 * @swagger
 * /api/orders/ws-docs:
 *   get:
 *     summary: "WebSocket: Real-time Order Status (Socket.IO)"
 *     tags: [Orders]
 *     description: |
 *       ## Real-time Order Tracking via Socket.IO
 *
 *       Connect to the server using Socket.IO and subscribe to order status updates.
 *
 *       ### Connection
 *       ```js
 *       const socket = io('http://localhost:5000');
 *       ```
 *
 *       ### Subscribe to an Order Room
 *       Emit `joinOrder` with the MongoDB Order ID to start receiving updates:
 *       ```js
 *       socket.emit('joinOrder', '6994eff7ec3a04191cc633c7');
 *       ```
 *
 *       ### Listen for Status Updates
 *       ```js
 *       socket.on('orderStatusUpdated', (data) => {
 *         console.log(data);
 *         // {
 *         //   orderId: '6994eff7ec3a04191cc633c7',
 *         //   customId: 'ORD-33',
 *         //   status: 'PREPARING',
 *         //   message: 'Your food is being prepared. 🍳',
 *         //   updatedAt: '2026-02-18T13:00:00.000Z'
 *         // }
 *       });
 *       ```
 *
 *       ### Status Flow
 *       `PLACED` → `ACCEPTED` → `PREPARING` → `OUT_FOR_DELIVERY` → `DELIVERED`
 *
 *       ### New Order Event (Admin Dashboard)
 *       ```js
 *       socket.on('newOrder', (order) => { ... });
 *       ```
 *     responses:
 *       200:
 *         description: WebSocket documentation (not a real HTTP endpoint)
 */

/**
 * @swagger
 * /api/orders/payment/create:
 *   post:
 *     summary: Initiate Checkout (Generate Razorpay Order)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     variant:
 *                       type: string
 *               deliveryAddress:
 *                 type: string
 *                 description: Address ID (Optional for calculation but good for fee)
 *               deliveryFee:
 *                 type: number
 *                 description: Delivery Fee if calculated earlier
 *     responses:
 *       200:
 *         description: Razorpay Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 razorpayOrderId:
 *                   type: string
 *                 amount:
 *                   type: number
 *                 currency:
 *                   type: string
 *                 totalAmount:
 *                   type: number
 *                 finalAmount:
 *                   type: number
 *       400:
 *         description: Bad request (Invalid items)
 *       401:
 *         description: Not authorized
 */

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Place a new order (After Payment for Online)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *               - finalAmount
 *               - deliveryAddress
 *               - paymentMethod
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product:
 *                       type: string
 *                     variant:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     price:
 *                       type: number
 *               totalAmount:
 *                 type: number
 *               totalTax:
 *                 type: number
 *               taxBreakdown:
 *                 type: object
 *                 properties:
 *                   cgstTotal:
 *                     type: number
 *                   sgstTotal:
 *                     type: number
 *                   igstTotal:
 *                     type: number
 *               discountApplied:
 *                 type: number
 *               finalAmount:
 *                 type: number
 *               deliveryAddress:
 *                 type: object
 *                 properties:
 *                    addressLine1:
 *                      type: string
 *                    city:
 *                      type: string
 *                    postalCode:
 *                      type: string
 *                    country:
 *                      type: string
 *                    mobile:
 *                      type: string
 *               paymentMethod:
 *                 type: string
 *                 enum: [COD, ONLINE]
 *               razorpayOrderId:
 *                 type: string
 *                 description: Required for ONLINE
 *               razorpayPaymentId:
 *                 type: string
 *                 description: Required for ONLINE
 *               razorpaySignature:
 *                 type: string
 *                 description: Required for ONLINE
 *     responses:
 *       201:
 *         description: Order placed successfully (PAID or COD PENDING)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 paymentStatus:
 *                   type: string
 *                   enum: [PENDING, PAID]
 *                 orderStatus:
 *                   type: string
 *       400:
 *         description: Payment details missing or Invalid Signature
 *       401:
 *         description: Not authorized
 */

router.route('/orders').post(protect, orderValidationRules(), validate, addOrderItems);

// Register initiateCheckout route matches the Swagger at top
router.route('/orders/payment/create').post(protect, initiateCheckout);

/**
 * @swagger
 * /api/orders/verify:
 *   post:
 *     summary: Verify Razorpay Payment for existing order
 *     tags: [Orders]
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
 *               - razorpayPaymentId
 *               - razorpaySignature
 *             properties:
 *               orderId:
 *                 type: string
 *               razorpayPaymentId:
 *                 type: string
 *               razorpaySignature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment Verified, Order Updated to PAID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 paymentStatus:
 *                   type: string
 *                   example: PAID
 *                 razorpayPaymentId:
 *                   type: string
 *       400:
 *         description: Invalid Signature or Order already paid
 *       404:
 *         description: Order not found
 */
router.route('/orders/verify').post(protect, verifyOrderPayment);

/**
 * @swagger
 * /api/orders/my-orders:
 *   get:
 *     summary: Get logged-in user's orders
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's orders
 *       401:
 *         description: Not authorized
 */
router.route('/orders/my-orders').get(protect, getMyOrders);

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Get order by ID (ObjectId or CustomID)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID or CustomID
 *     responses:
 *       200:
 *         description: Order details
 *       404:
 *         description: Order not found
 *       401:
 *         description: Not authorized
 */
router.route('/orders/:id').get(protect, getOrderById);

/**
 * @swagger
 * /api/orders/calc-fee:
 *   post:
 *     summary: Calculate delivery fee
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lat
 *               - lng
 *             properties:
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *     responses:
 *       200:
 *         description: Delivery fee calculated successfully
 *       400:
 *         description: Location too far
 */
router.route('/orders/calc-fee').post(calcFee);

/**
 * @swagger
 * /api/admin/orders:
 *   get:
 *     summary: Get all orders (Admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all orders
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.route('/admin/orders').get(protect, admin, getOrders);
// NOTE: must be registered BEFORE '/admin/orders/:status' so "stats" isn't treated as a status
router.route('/admin/orders/stats').get(protect, admin, getOrderStats);

/**
 * @swagger
 * /api/admin/orders/{status}:
 *   get:
 *     summary: Get orders by status (Admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PLACED, ACCEPTED, PREPARING, OUT_FOR_DELIVERY, DELIVERED, CANCELLED]
 *         description: Order Status
 *     responses:
 *       200:
 *         description: List of orders with status
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.route('/admin/orders/:status').get(protect, admin, getOrdersByStatus);

/**
 * @swagger
 * /api/admin/orders/{id}/status:
 *   put:
 *     summary: Update order status (Admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID or CustomID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACCEPTED, PREPARING, OUT_FOR_DELIVERY, DELIVERED, CANCELLED]
 *     responses:
 *       200:
 *         description: Order status updated
 *       400:
 *         description: Invalid status transition
 *       404:
 *         description: Order not found
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */

/**
 * @swagger
 * /api/orders/{id}/cancel:
 *   post:
 *     summary: "Cancel order (User: < 3 mins, Admin: Any time)"
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 *       400:
 *         description: Cancellation failed (Time expired or invalid status)
 *       401:
 *         description: Not authorized
 */
router.route('/orders/:id/cancel').post(protect, cancelOrder);
router.route('/admin/orders/:id/cancel').post(protect, admin, cancelOrder);

router.route('/admin/orders/:id/status').put(protect, admin, updateOrderStatus);

/**
 * @swagger
 * /api/admin/orders/{id}/payment-status:
 *   put:
 *     summary: Update payment status (Admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID or CustomID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentStatus
 *             properties:
 *               paymentStatus:
 *                 type: string
 *                 enum: [PENDING, PAID, FAILED]
 *     responses:
 *       200:
 *         description: Payment status updated
 *       400:
 *         description: Invalid status
 *       404:
 *         description: Order not found
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.route('/admin/orders/:id/payment-status').put(protect, admin, updatePaymentStatus);

/**
 * @swagger
 * /api/admin/orders/{id}/preparation-time:
 *   put:
 *     summary: Update order preparation time (Admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID or CustomID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - preparationTime
 *             properties:
 *               preparationTime:
 *                 type: number
 *                 description: Estimated preparation time in minutes
 *     responses:
 *       200:
 *         description: Preparation time updated
 *       400:
 *         description: Invalid preparation time
 *       404:
 *         description: Order not found
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.route('/admin/orders/:id/preparation-time').put(protect, admin, updatePreparationTime);

module.exports = router;
