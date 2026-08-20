const Kot = require('../models/Kot');
const Table = require('../models/Table');
const Product = require('../models/Product');

// Resolve incoming [{ product, variant, quantity }] into snapshotted KOT items
// (name + price pulled from the product / chosen variant).
const buildItems = async (rawItems) => {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        const e = new Error('At least one item is required');
        e.statusCode = 400;
        throw e;
    }
    const items = [];
    for (const raw of rawItems) {
        const qty = Number(raw.quantity);
        if (!raw.product || !qty || qty < 1) {
            const e = new Error('Each item needs a product and a quantity of at least 1');
            e.statusCode = 400;
            throw e;
        }
        const product = await Product.findById(raw.product);
        if (!product) {
            const e = new Error('One of the selected products no longer exists');
            e.statusCode = 400;
            throw e;
        }
        // Pick the requested variant, else the first, else a bare Standard.
        let variant = null;
        if (raw.variant && product.variants?.length) {
            variant = product.variants.find((v) => v.name === raw.variant) || null;
        }
        if (!variant && product.variants?.length) variant = product.variants[0];

        items.push({
            product: product._id,
            name: product.name,
            variant: variant ? variant.name : 'Standard',
            price: variant ? variant.price : 0,
            quantity: qty,
        });
    }
    return items;
};

// @desc  List KOTs (default: open ones), for the POS/KOT terminal
// @route GET /api/pos/kots
const getKots = async (req, res, next) => {
    try {
        const filter = {};
        filter.status = req.query.status || 'open';
        if (req.query.table) filter.table = req.query.table;
        const kots = await Kot.find(filter)
            .populate({ path: 'table', select: 'name category status', populate: { path: 'category', select: 'name' } })
            .populate('createdBy', 'name role')
            .sort({ createdAt: -1 });
        res.json(kots);
    } catch (error) {
        next(error);
    }
};

// @desc  Get a single KOT
// @route GET /api/pos/kots/:id
const getKotById = async (req, res, next) => {
    try {
        const kot = await Kot.findById(req.params.id)
            .populate({ path: 'table', select: 'name category', populate: { path: 'category', select: 'name' } })
            .populate('createdBy', 'name role');
        if (!kot) {
            res.status(404);
            throw new Error('KOT not found');
        }
        res.json(kot);
    } catch (error) {
        next(error);
    }
};

// @desc  Create a KOT for an available table (marks the table occupied)
// @route POST /api/pos/kots
const createKot = async (req, res, next) => {
    try {
        const { tableId, items, notes } = req.body;

        const table = await Table.findById(tableId);
        if (!table) {
            res.status(400);
            throw new Error('Please select a valid table');
        }
        if (table.status !== 'available') {
            res.status(400);
            throw new Error(
                table.status === 'occupied'
                    ? 'This table is already occupied. Edit its existing KOT to add items.'
                    : 'This table needs to be cleaned before it can be used.'
            );
        }

        const builtItems = await buildItems(items);

        const kot = await Kot.create({
            table: table._id,
            items: builtItems,
            notes: notes || '',
            createdBy: req.user?._id,
        });

        table.status = 'occupied';
        table.activeKot = kot._id;
        await table.save();

        const populated = await Kot.findById(kot._id)
            .populate({ path: 'table', select: 'name category status', populate: { path: 'category', select: 'name' } })
            .populate('createdBy', 'name role');
        res.status(201).json(populated);
    } catch (error) {
        if (error.statusCode) res.status(error.statusCode);
        next(error);
    }
};

// @desc  Update an open KOT's items / notes
// @route PUT /api/pos/kots/:id
const updateKot = async (req, res, next) => {
    try {
        const { items, notes } = req.body;
        const kot = await Kot.findById(req.params.id);
        if (!kot) {
            res.status(404);
            throw new Error('KOT not found');
        }
        if (kot.status !== 'open') {
            res.status(400);
            throw new Error('This KOT has already been billed and cannot be edited.');
        }
        if (items !== undefined) kot.items = await buildItems(items);
        if (notes !== undefined) kot.notes = notes;
        kot.updatedBy = req.user?._id;
        await kot.save();

        const populated = await Kot.findById(kot._id)
            .populate({ path: 'table', select: 'name category status', populate: { path: 'category', select: 'name' } })
            .populate('createdBy', 'name role');
        res.json(populated);
    } catch (error) {
        if (error.statusCode) res.status(error.statusCode);
        next(error);
    }
};

// @desc  Delete an open KOT (frees its table)
// @route DELETE /api/pos/kots/:id
const deleteKot = async (req, res, next) => {
    try {
        const kot = await Kot.findById(req.params.id);
        if (!kot) {
            res.status(404);
            throw new Error('KOT not found');
        }
        if (kot.status !== 'open') {
            res.status(400);
            throw new Error('A billed KOT cannot be deleted.');
        }

        // Free the table this KOT was occupying.
        const table = await Table.findById(kot.table);
        if (table && String(table.activeKot) === String(kot._id)) {
            table.status = 'available';
            table.activeKot = null;
            await table.save();
        }

        await kot.deleteOne();
        res.json({ message: 'KOT deleted and table freed' });
    } catch (error) {
        next(error);
    }
};

module.exports = { getKots, getKotById, createKot, updateKot, deleteKot };
