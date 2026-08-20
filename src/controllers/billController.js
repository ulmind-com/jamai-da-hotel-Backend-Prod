const PosBill = require('../models/PosBill');
const Kot = require('../models/Kot');
const Table = require('../models/Table');
const Product = require('../models/Product');

// Merge items from the given KOTs (by product+variant) and enrich with tax rates.
const aggregateKotItems = async (kots) => {
    const map = new Map();
    for (const kot of kots) {
        for (const it of kot.items) {
            const key = `${it.product}__${it.variant}`;
            if (map.has(key)) {
                map.get(key).quantity += it.quantity;
            } else {
                map.set(key, {
                    product: it.product,
                    name: it.name,
                    variant: it.variant,
                    price: it.price,
                    quantity: it.quantity,
                });
            }
        }
    }
    const items = Array.from(map.values());
    // Pull current tax rates from products.
    for (const item of items) {
        const product = item.product ? await Product.findById(item.product).select('cgst sgst igst') : null;
        item.cgst = product?.cgst || 0;
        item.sgst = product?.sgst || 0;
        item.igst = product?.igst || 0;
        item.lineTotal = item.price * item.quantity;
    }
    return items;
};

// Compute money fields, mirroring the existing POS tax/discount logic.
const computeTotals = (items, discountType, discountValue) => {
    let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;
    for (const it of items) {
        const lineTotal = it.price * it.quantity;
        subtotal += lineTotal;
        cgstTotal += (lineTotal * (it.cgst || 0)) / 100;
        sgstTotal += (lineTotal * (it.sgst || 0)) / 100;
        igstTotal += (lineTotal * (it.igst || 0)) / 100;
    }
    const taxAmount = cgstTotal + sgstTotal + igstTotal;
    const subtotalWithTax = subtotal + taxAmount;

    let discountAmount = 0;
    if (discountType === 'FLAT' && discountValue > 0) {
        discountAmount = Math.min(discountValue, subtotalWithTax);
    } else if (discountType === 'PERCENTAGE' && discountValue > 0) {
        discountAmount = Math.min((subtotalWithTax * discountValue) / 100, subtotalWithTax);
    }
    discountAmount = Math.round(discountAmount * 100) / 100;
    const total = Math.ceil(subtotalWithTax - discountAmount);

    return {
        subtotal: Math.round(subtotal * 100) / 100,
        cgstTotal: Math.round(cgstTotal * 100) / 100,
        sgstTotal: Math.round(sgstTotal * 100) / 100,
        igstTotal: Math.round(igstTotal * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        discountAmount,
        total,
    };
};

// @desc  Generate a bill for a table from its open KOT(s)
// @route POST /api/pos/bills
const generateBill = async (req, res, next) => {
    try {
        const { tableId, kotIds, discountType, discountValue } = req.body;

        const table = await Table.findById(tableId).populate('category', 'name');
        if (!table) {
            res.status(400);
            throw new Error('Please select a valid table');
        }
        if (table.status !== 'occupied') {
            res.status(400);
            throw new Error('Only an occupied table can be billed.');
        }

        // Gather the open KOTs for this table (optionally restricted to kotIds).
        const kotFilter = { table: table._id, status: 'open' };
        if (Array.isArray(kotIds) && kotIds.length) kotFilter._id = { $in: kotIds };
        const kots = await Kot.find(kotFilter);
        if (kots.length === 0) {
            res.status(400);
            throw new Error('No open KOT found for this table.');
        }

        const items = await aggregateKotItems(kots);
        const dType = ['FLAT', 'PERCENTAGE'].includes(discountType) ? discountType : 'NONE';
        const dValue = dType === 'NONE' ? 0 : Number(discountValue) || 0;
        const totals = computeTotals(items, dType, dValue);

        const bill = await PosBill.create({
            table: table._id,
            tableName: table.name,
            sectionName: table.category?.name || '',
            kots: kots.map((k) => k._id),
            kotNumbers: kots.map((k) => k.kotNumber),
            items,
            discountType: dType,
            discountValue: dValue,
            ...totals,
            createdBy: req.user?._id,
        });

        // Mark KOTs billed, move table to dirty and attach the pending bill.
        await Kot.updateMany({ _id: { $in: kots.map((k) => k._id) } }, { status: 'billed' });
        table.status = 'dirty';
        table.activeKot = null;
        table.activeBill = bill._id;
        await table.save();

        const populated = await PosBill.findById(bill._id).populate('createdBy', 'name role');
        res.status(201).json(populated);
    } catch (error) {
        next(error);
    }
};

// @desc  List bills (default: settlement_pending). Optional date range + status.
// @route GET /api/pos/bills
const getBills = async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.from || req.query.to) {
            filter.createdAt = {};
            if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
            if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
        }
        const bills = await PosBill.find(filter)
            .populate('createdBy', 'name role')
            .populate('settledBy', 'name role')
            .sort({ createdAt: -1 });
        res.json(bills);
    } catch (error) {
        next(error);
    }
};

// @desc  Get a single bill
// @route GET /api/pos/bills/:id
const getBillById = async (req, res, next) => {
    try {
        const bill = await PosBill.findById(req.params.id)
            .populate('createdBy', 'name role')
            .populate('settledBy', 'name role');
        if (!bill) {
            res.status(404);
            throw new Error('Bill not found');
        }
        res.json(bill);
    } catch (error) {
        next(error);
    }
};

// @desc  Settle a pending bill (record payment) and free the table
// @route PUT /api/pos/bills/:id/settle
const settleBill = async (req, res, next) => {
    try {
        const { paymentMethod, customerName, customerPhone } = req.body;
        if (!['CASH', 'UPI', 'CARD'].includes(paymentMethod)) {
            res.status(400);
            throw new Error('Select a valid payment method (Cash / UPI / Card)');
        }

        const bill = await PosBill.findById(req.params.id);
        if (!bill) {
            res.status(404);
            throw new Error('Bill not found');
        }
        if (bill.status === 'settled') {
            res.status(400);
            throw new Error('This bill has already been settled.');
        }

        bill.paymentMethod = paymentMethod;
        bill.customerName = customerName || '';
        bill.customerPhone = customerPhone || '';
        bill.status = 'settled';
        bill.settledBy = req.user?._id;
        bill.settledAt = new Date();
        await bill.save();

        // Free the table.
        if (bill.table) {
            const table = await Table.findById(bill.table);
            if (table && String(table.activeBill) === String(bill._id)) {
                table.status = 'available';
                table.activeBill = null;
                await table.save();
            }
        }

        const populated = await PosBill.findById(bill._id)
            .populate('createdBy', 'name role')
            .populate('settledBy', 'name role');
        res.json(populated);
    } catch (error) {
        next(error);
    }
};

// Free the bill's table (if still attached) and delete the bill.
const doDeleteBill = async (bill) => {
    if (bill.table) {
        const table = await Table.findById(bill.table);
        if (table && String(table.activeBill) === String(bill._id)) {
            table.status = 'available';
            table.activeBill = null;
            await table.save();
        }
    }
    await bill.deleteOne();
};

// @desc  Delete a bill directly (Admin only)
// @route DELETE /api/pos/bills/:id
const deleteBill = async (req, res, next) => {
    try {
        const bill = await PosBill.findById(req.params.id);
        if (!bill) {
            res.status(404);
            throw new Error('Bill not found');
        }
        await doDeleteBill(bill);
        res.json({ message: 'Bill deleted' });
    } catch (error) {
        next(error);
    }
};

// @desc  Request bill deletion. Admin -> deletes now; Manager -> pending approval.
// @route POST /api/pos/bills/:id/request-delete
const requestBillDelete = async (req, res, next) => {
    try {
        const bill = await PosBill.findById(req.params.id);
        if (!bill) {
            res.status(404);
            throw new Error('Bill not found');
        }

        // Admins delete immediately.
        if (req.user?.role === 'Admin') {
            await doDeleteBill(bill);
            return res.json({ message: 'Bill deleted', deleted: true });
        }

        // Managers raise a request for admin approval.
        bill.deleteRequest = {
            requestedBy: req.user?._id,
            requestedByName: req.user?.name,
            requestedAt: new Date(),
            reason: req.body.reason || '',
            status: 'pending',
        };
        await bill.save();
        res.json({ message: 'Delete request sent to admin for approval', deleted: false });
    } catch (error) {
        next(error);
    }
};

// @desc  Reject a pending delete request (Admin only)
// @route PUT /api/pos/bills/:id/reject-delete
const rejectBillDelete = async (req, res, next) => {
    try {
        const bill = await PosBill.findById(req.params.id);
        if (!bill) {
            res.status(404);
            throw new Error('Bill not found');
        }
        bill.deleteRequest = undefined;
        await bill.save();
        res.json({ message: 'Delete request rejected' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    generateBill,
    getBills,
    getBillById,
    settleBill,
    deleteBill,
    requestBillDelete,
    rejectBillDelete,
};
