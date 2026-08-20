const Order = require('../models/Order');

// Statuses a rider needs to see: on the way, plus what the kitchen is about to
// hand over. POS walk-in bills never get delivered, so they stay out.
const ACTIVE_STATUSES = ['ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY'];

// Riders may only move an order along the delivery leg — nothing else.
const ALLOWED_TRANSITIONS = ['OUT_FOR_DELIVERY', 'DELIVERED'];

// @desc  Orders waiting to go out or already on the road
// @route GET /api/delivery/orders
const getDeliveryOrders = async (req, res, next) => {
    try {
        const orders = await Order.find({
            orderType: { $ne: 'POS' },
            orderStatus: { $in: ACTIVE_STATUSES },
        })
            .sort({ createdAt: 1 }) // oldest first — those are the ones running late
            .populate('customer', 'name mobile customId')
            .populate('items.product', 'name')
            .populate('deliveredBy', 'name');

        res.json(orders);
    } catch (error) {
        next(error);
    }
};

// @desc  Orders this rider delivered today (their own run sheet)
// @route GET /api/delivery/orders/completed
const getCompletedDeliveries = async (req, res, next) => {
    try {
        const since = new Date();
        since.setHours(0, 0, 0, 0);

        const filter = {
            orderType: { $ne: 'POS' },
            orderStatus: 'DELIVERED',
            updatedAt: { $gte: since },
        };
        // Riders see only their own; management sees everyone's.
        if (req.user?.role === 'Delivery') filter.deliveredBy = req.user._id;

        const orders = await Order.find(filter)
            .sort({ updatedAt: -1 })
            .populate('customer', 'name mobile customId')
            .populate('deliveredBy', 'name');

        res.json(orders);
    } catch (error) {
        next(error);
    }
};

// Gate for PUT /api/delivery/orders/:id/status. Keeps riders inside the
// delivery leg, then hands over to the shared updateOrderStatus controller so
// customer emails, push notifications and the invoice all still fire.
const restrictToDeliveryTransitions = (req, res, next) => {
    if (!ALLOWED_TRANSITIONS.includes(req.body?.status)) {
        res.status(400);
        return next(
            new Error('Riders can only mark an order out for delivery or delivered.')
        );
    }
    next();
};

module.exports = {
    getDeliveryOrders,
    getCompletedDeliveries,
    restrictToDeliveryTransitions,
};
