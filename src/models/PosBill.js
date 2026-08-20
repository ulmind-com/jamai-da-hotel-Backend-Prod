const mongoose = require('mongoose');
const Counter = require('./Counter');

const billItemSchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        variant: { type: String, default: 'Standard' },
        price: Number,
        quantity: Number,
        cgst: { type: Number, default: 0 },
        sgst: { type: Number, default: 0 },
        igst: { type: Number, default: 0 },
        lineTotal: Number, // price * quantity (pre-tax)
    },
    { _id: false }
);

// An offline (dine-in) bill generated from one or more KOTs.
// Lifecycle: settlement_pending (bill generated) -> settled (payment recorded).
const posBillSchema = new mongoose.Schema(
    {
        billNumber: { type: String, unique: true },
        table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },
        tableName: String,      // snapshot (table may be renamed/deleted later)
        sectionName: String,    // snapshot
        kots: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Kot' }],
        kotNumbers: [String],   // snapshot for printing
        items: [billItemSchema],

        subtotal: { type: Number, default: 0 },     // pre-tax sum of line totals
        taxAmount: { type: Number, default: 0 },
        cgstTotal: { type: Number, default: 0 },
        sgstTotal: { type: Number, default: 0 },
        igstTotal: { type: Number, default: 0 },

        discountType: { type: String, enum: ['NONE', 'FLAT', 'PERCENTAGE'], default: 'NONE' },
        discountValue: { type: Number, default: 0 },
        discountAmount: { type: Number, default: 0 },

        total: { type: Number, default: 0 }, // final payable

        status: {
            type: String,
            enum: ['settlement_pending', 'settled'],
            default: 'settlement_pending',
        },
        paymentMethod: { type: String, enum: ['CASH', 'UPI', 'CARD', null], default: null },
        customerName: { type: String, default: '' },
        customerPhone: { type: String, default: '' },

        // Audit
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },   // who generated the bill
        settledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },   // who settled it
        settledAt: { type: Date, default: null },

        // Deletion requires admin approval when requested by a Manager.
        deleteRequest: {
            requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            requestedByName: String,
            requestedAt: Date,
            reason: String,
            status: { type: String, enum: ['pending', 'rejected'], default: undefined },
        },
    },
    { timestamps: true }
);

posBillSchema.pre('save', async function () {
    if (!this.isNew) return;
    try {
        const counter = await Counter.findOneAndUpdate(
            { id: 'billId' },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.billNumber = `BILL-${counter.seq}`;
    } catch (error) {
        throw error;
    }
});

module.exports = mongoose.model('PosBill', posBillSchema);
