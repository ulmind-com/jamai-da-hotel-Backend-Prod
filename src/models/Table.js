const mongoose = require('mongoose');

// A physical dining table belonging to a TableCategory (section).
// Status lifecycle: available -> occupied (KOT created) -> dirty (bill generated) -> available (settled).
const TABLE_STATUSES = ['available', 'occupied', 'dirty'];

const tableSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TableCategory',
            required: true,
        },
        capacity: {
            type: Number,
            default: 4,
        },
        status: {
            type: String,
            enum: TABLE_STATUSES,
            default: 'available',
        },
        // The KOT currently occupying this table (one active KOT per table).
        activeKot: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Kot',
            default: null,
        },
        // The bill awaiting settlement (set when a bill is generated).
        activeBill: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PosBill',
            default: null,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Table', tableSchema);
module.exports.TABLE_STATUSES = TABLE_STATUSES;
