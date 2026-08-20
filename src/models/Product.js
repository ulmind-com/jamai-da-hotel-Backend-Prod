const mongoose = require('mongoose');
const Counter = require('./Counter');

const productSchema = new mongoose.Schema(
    {
        customId: {
            type: String,
            unique: true,
        },
        name: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            required: true,
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: true,
        },
        imageURL: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ['Veg', 'Non-Veg'],
            required: true,
        },
        variants: [
            {
                name: { type: String, required: true }, // e.g., 'Half', 'Full'
                price: { type: Number, required: true },
            },
        ],
        isVegetarian: {
            type: Boolean,
            default: true,
        },
        hsnCode: {
            type: String,
            default: '',
        },
        cgst: {
            type: Number,
            default: 0, // Percentage
        },
        sgst: {
            type: Number,
            default: 0, // Percentage
        },
        igst: {
            type: Number,
            default: 0, // Percentage
        },
        // Discount System
        discountPercentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        discountExpiresAt: {
            type: Date,
            default: null
        }, // If null or past date, discount is invalid
        isAvailable: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

// Pre-save hook to generate customId
productSchema.pre('save', async function () {
    if (!this.isNew) return;

    try {
        const counter = await Counter.findOneAndUpdate(
            { id: 'productId' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );

        this.customId = `PROD-${counter.seq}`;
    } catch (error) {
        throw error;
    }
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
