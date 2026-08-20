const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
        },
        name: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            required: true,
        },
        discountType: {
            type: String,
            enum: ['PERCENTAGE', 'FLAT'],
            required: true,
        },
        discountAmount: {
            type: Number,
            required: true,
            min: 0
        },
        maxDiscountAmount: {
            type: Number,
            default: null, // Null means no limit for percentage
        },
        minOrderValue: {
            type: Number,
            default: 0,
        },
        validFrom: {
            type: Date,
            required: true,
        },
        validUntil: {
            type: Date,
            required: true,
        },
        usageLimit: {
            type: Number, // Global limit
            default: null,
        },
        usageCount: {
            type: Number,
            default: 0,
        },
        userUsageLimit: {
            type: Number, // Limit per user
            default: 1,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isBroadcasted: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;
