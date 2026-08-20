const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true, // e.g., 'orderId', 'productId', 'categoryId'
    },
    seq: {
        type: Number,
        default: 1000, // Start from 1000 for better readability
    },
});

const Counter = mongoose.model('Counter', counterSchema);

module.exports = Counter;
