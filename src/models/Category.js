const mongoose = require('mongoose');
const Counter = require('./Counter');

const categorySchema = new mongoose.Schema(
    {
        customId: {
            type: String,
            unique: true,
        },
        name: {
            type: String,
            required: true,
            unique: true,
        },
        imageURL: {
            type: String,
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

// Pre-save hook to generate customId
categorySchema.pre('save', async function () {
    if (!this.isNew) return;

    try {
        const counter = await Counter.findOneAndUpdate(
            { id: 'categoryId' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );

        this.customId = `CAT-${counter.seq}`;
    } catch (error) {
        throw error;
    }
});

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
