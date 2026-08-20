const Review = require('../models/Review');
const Order = require('../models/Order');
const { paginate, isPaginated } = require('../utils/paginate');

// @desc    Create new review
// @route   POST /api/reviews
// @access  Private
const createReview = async (req, res, next) => {
    try {
        const { rating, comment, orderId } = req.body;

        const order = await Order.findById(orderId);

        if (!order) {
            res.status(404);
            throw new Error('Order not found');
        }

        // Check if order is delivered
        if (order.orderStatus !== 'DELIVERED') {
            res.status(400);
            throw new Error('You can only review delivered orders');
        }

        // Check if user matches order customer
        if (order.customer.toString() !== req.user._id.toString()) {
            res.status(401);
            throw new Error('Not authorized to review this order');
        }

        // Check if already reviewed
        const alreadyReviewed = await Review.findOne({ order: orderId });
        if (alreadyReviewed) {
            res.status(400);
            throw new Error('Order already reviewed');
        }

        const review = await Review.create({
            user: req.user._id,
            order: orderId,
            rating: Number(rating),
            comment,
        });

        // Update order with review reference
        order.review = review._id;
        await order.save();

        res.status(201).json(review);
    } catch (error) {
        next(error);
    }
};

// @desc    Get review stats
// @route   GET /api/reviews/stats
// @access  Public
const getReviewStats = async (req, res, next) => {
    try {
        const stats = await Review.aggregate([
            {
                $group: {
                    _id: null,
                    averageRating: { $avg: '$rating' },
                    totalReviews: { $sum: 1 },
                },
            },
        ]);

        const recentReviews = await Review.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name');

        res.json({
            averageRating: stats[0] ? stats[0].averageRating.toFixed(1) : 0,
            totalReviews: stats[0] ? stats[0].totalReviews : 0,
            recentReviews,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all reviews (Admin)
// @route   GET /api/reviews/admin
// @access  Private/Admin
const getAllReviews = async (req, res, next) => {
    try {
        const populate = [
            { path: 'user', select: 'name email profileImage' },
            {
                path: 'order',
                select: 'customId finalAmount items',
                populate: { path: 'items.product', select: 'name imageURL' },
            },
        ];

        if (isPaginated(req)) {
            const result = await paginate(Review, { req, query: {}, sort: { createdAt: -1 }, populate });
            return res.json(result);
        }

        const reviews = await Review.find({})
            .populate('user', 'name email profileImage')
            .populate({
                path: 'order',
                select: 'customId finalAmount items',
                populate: { path: 'items.product', select: 'name imageURL' },
            })
            .sort({ createdAt: -1 });
        res.json(reviews);
    } catch (error) {
        next(error);
    }
};

// @desc    Get logged in user's reviews
// @route   GET /api/reviews/my-reviews
// @access  Private
const getUserReviews = async (req, res, next) => {
    try {
        const reviews = await Review.find({ user: req.user._id })
            .populate({
                path: 'order',
                select: 'customId items createdAt',
                populate: {
                    path: 'items.product',
                    select: 'name imageURL'
                }
            })
            .sort({ createdAt: -1 });
        res.json(reviews);
    } catch (error) {
        next(error);
    }
};

module.exports = { createReview, getReviewStats, getAllReviews, getUserReviews };
