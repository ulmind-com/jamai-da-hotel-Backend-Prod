const mongoose = require('mongoose');
const Counter = require('./Counter');

const orderSchema = new mongoose.Schema(
    {
        customId: {
            type: String,
            unique: true,
        },
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: false, // Optional for POS Walk-in orders
        },
        customerName: { type: String }, // For POS Walk-in
        customerMobile: { type: String }, // For POS Walk-in
        orderType: {
            type: String,
            enum: ['ONLINE', 'POS'],
            default: 'ONLINE',
        },
        items: [
            {
                product: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Product',
                    required: true,
                },
                variant: {
                    type: String, // e.g. 'Half', 'Full', or just 'Standard'
                    required: true,
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1,
                },
                price: {
                    type: Number, // Price at time of order
                    required: true,
                },
                cgst: Number,
                sgst: Number,
                igst: Number,
                hsnCode: String,
            },
        ],
        totalAmount: {
            type: Number,
            required: true,
        },
        discountApplied: {
            type: Number,
            default: 0,
        },
        discountType: {
            type: String,
            enum: ['FLAT', 'PERCENTAGE', 'NONE'],
            default: 'NONE',
        },
        discountValue: {
            type: Number,
            default: 0,
        },
        finalAmount: {
            type: Number,
            required: true,
        },
        // Tax Breakdowns
        taxAmount: { type: Number, default: 0 },
        cgstTotal: { type: Number, default: 0 },
        sgstTotal: { type: Number, default: 0 },
        igstTotal: { type: Number, default: 0 },
        deliveryFee: { type: Number, default: 0 },
        deliveryAddress: {
            addressLine1: String,
            addressLine2: String,
            city: String,
            state: String,
            postalCode: String,
            country: String,
            mobile: String,
        },
        // GPS coordinates for the delivery location (used for map display)
        deliveryCoordinates: {
            lat: Number,
            lng: Number,
        },
        paymentMethod: {
            type: String,
            // Expanded to include POS offline payment methods
            enum: ['COD', 'ONLINE', 'CASH', 'UPI', 'CARD'],
            required: true,
        },
        paymentStatus: {
            type: String,
            enum: ['PENDING', 'PAID', 'FAILED'], // Added FAILED
            default: 'PENDING',
        },
        razorpayOrderId: {
            type: String,
        },
        razorpayPaymentId: {
            type: String,
        },
        razorpaySignature: {
            type: String,
        },
        review: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Review'
        },
        orderStatus: {
            type: String,
            enum: [
                'PLACED',
                'ACCEPTED',
                'PREPARING',
                'OUT_FOR_DELIVERY',
                'DELIVERED',
                'CANCELLED',
            ],
            default: 'PLACED',
        },
        cancellationReason: {
            type: String, // Reason for cancellation (User or Admin provided)
        },
        preparationTime: {
            type: Number, // Estimated preparation time in minutes (Admin provided)
        },
        deliveryInstruction: {
            type: String, // Special instructions from user (e.g. "Leave at door", "Dont ring bell")
        },
        refundStatus: {
            type: String,
            enum: ['NO_REFUND', 'PENDING', 'PROCESSED'],
            default: 'NO_REFUND'
        },
        refundProcessedAt: {
            type: Date
        },
        paymentDetails: {
            method: { type: String },
            upiId: { type: String },
            cardNetwork: { type: String },
            cardLast4: { type: String },
            wallet: { type: String },
            bank: { type: String }
        }
    },
    {
        timestamps: true,
    }
);

const crypto = require('crypto');

// Pre-save hook to generate customId
orderSchema.pre('save', async function () {
    if (!this.isNew) return;

    let isUnique = false;
    while (!isUnique) {
        // Generate a secure 8-character uppercase alphanumeric string
        const randomStr = crypto.randomBytes(4).toString('hex').toUpperCase();
        const candidateId = `ORD-${randomStr}`;

        const existingOrder = await mongoose.models.Order.findOne({ customId: candidateId });
        if (!existingOrder) {
            this.customId = candidateId;
            isUnique = true;
        }
    }
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
