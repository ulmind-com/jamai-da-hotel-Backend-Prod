const mongoose = require('mongoose');
const Counter = require('./Counter');

// A Kitchen Order Ticket. One open KOT per table at a time.
// Prices are snapshotted internally (for billing) but never shown on the kitchen ticket.
const kotItemSchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: { type: String, required: true },
        variant: { type: String, default: 'Standard' },
        price: { type: Number, default: 0 }, // internal — not printed on the KOT
        quantity: { type: Number, required: true, min: 1 },
    },
    { _id: false }
);

const kotSchema = new mongoose.Schema(
    {
        kotNumber: { type: String, unique: true },
        table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
        items: {
            type: [kotItemSchema],
            validate: [(v) => Array.isArray(v) && v.length > 0, 'A KOT must have at least one item'],
        },
        status: {
            type: String,
            enum: ['open', 'billed'],
            default: 'open',
        },
        notes: { type: String, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

// Auto-generate a readable KOT number.
kotSchema.pre('save', async function () {
    if (!this.isNew) return;
    try {
        const counter = await Counter.findOneAndUpdate(
            { id: 'kotId' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.kotNumber = `KOT-${counter.seq}`;
    } catch (error) {
        throw error;
    }
});

module.exports = mongoose.model('Kot', kotSchema);
