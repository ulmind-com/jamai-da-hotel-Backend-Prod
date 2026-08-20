const mongoose = require('mongoose');

// A section / area of the restaurant that groups tables
// (e.g. "Ground Floor", "AC Hall", "Rooftop").
const tableCategorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            default: '',
        },
        sortOrder: {
            type: Number,
            default: 0,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('TableCategory', tableCategorySchema);
