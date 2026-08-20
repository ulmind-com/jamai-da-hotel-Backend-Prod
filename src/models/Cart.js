const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true, // One cart per user
        },
        items: [
            {
                product: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Product',
                    required: true,
                },
                variant: {
                    type: String,
                    required: true, // e.g., 'Half', 'Full', 'Standard'
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1,
                    default: 1,
                },
                price: {
                    type: Number,
                    required: true,
                },
                imageURL: {
                    type: String,
                },
                name: {
                    type: String,
                },
            },
        ],
        totalPrice: {
            type: Number,
            default: 0,
        },
        appliedCoupon: {
            type: String, // Store coupon code
            default: null
        },
    },
    {
        timestamps: true,
    }
);

// Calculate total price before saving
cartSchema.pre('save', async function () {
    this.totalPrice = this.items.reduce((total, item) => {
        return total + item.price * item.quantity;
    }, 0);
});

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;
