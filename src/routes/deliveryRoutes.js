const express = require('express');
const router = express.Router();
const { protect, deliveryStaff } = require('../middleware/authMiddleware');
const {
    getDeliveryOrders,
    getCompletedDeliveries,
    restrictToDeliveryTransitions,
} = require('../controllers/deliveryController');
const { updateOrderStatus } = require('../controllers/orderController');

// Everything here is for riders (and the management roles above them).
router.use(protect, deliveryStaff);

router.get('/orders', getDeliveryOrders);
router.get('/orders/completed', getCompletedDeliveries);

// Reuses the admin status controller so notifications and invoicing stay in
// one place; the guard limits riders to the delivery leg.
router.put('/orders/:id/status', restrictToDeliveryTransitions, updateOrderStatus);

module.exports = router;
