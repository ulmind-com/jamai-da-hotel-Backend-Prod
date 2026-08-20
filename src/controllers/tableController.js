const TableCategory = require('../models/TableCategory');
const Table = require('../models/Table');
const { TABLE_STATUSES } = require('../models/Table');

// ─── Table Categories (sections) ────────────────────────────

// @desc  List all sections
// @route GET /api/pos/table-categories
const getCategories = async (req, res, next) => {
    try {
        const categories = await TableCategory.find().sort({ sortOrder: 1, createdAt: 1 });
        // Attach table counts for convenience.
        const withCounts = await Promise.all(
            categories.map(async (c) => {
                const total = await Table.countDocuments({ category: c._id });
                return { ...c.toObject(), tableCount: total };
            })
        );
        res.json(withCounts);
    } catch (error) {
        next(error);
    }
};

// @desc  Create a section
// @route POST /api/pos/table-categories
const createCategory = async (req, res, next) => {
    try {
        const { name, description, sortOrder } = req.body;
        if (!name || !name.trim()) {
            res.status(400);
            throw new Error('Section name is required');
        }
        const category = await TableCategory.create({
            name: name.trim(),
            description: description || '',
            sortOrder: sortOrder || 0,
            createdBy: req.user?._id,
        });
        res.status(201).json(category);
    } catch (error) {
        next(error);
    }
};

// @desc  Update a section
// @route PUT /api/pos/table-categories/:id
const updateCategory = async (req, res, next) => {
    try {
        const { name, description, sortOrder } = req.body;
        const category = await TableCategory.findById(req.params.id);
        if (!category) {
            res.status(404);
            throw new Error('Section not found');
        }
        if (name !== undefined) category.name = name.trim();
        if (description !== undefined) category.description = description;
        if (sortOrder !== undefined) category.sortOrder = sortOrder;
        await category.save();
        res.json(category);
    } catch (error) {
        next(error);
    }
};

// @desc  Delete a section (only if it has no tables)
// @route DELETE /api/pos/table-categories/:id
const deleteCategory = async (req, res, next) => {
    try {
        const tableCount = await Table.countDocuments({ category: req.params.id });
        if (tableCount > 0) {
            res.status(400);
            throw new Error('Cannot delete a section that still has tables. Remove its tables first.');
        }
        const category = await TableCategory.findByIdAndDelete(req.params.id);
        if (!category) {
            res.status(404);
            throw new Error('Section not found');
        }
        res.json({ message: 'Section deleted' });
    } catch (error) {
        next(error);
    }
};

// ─── Tables ─────────────────────────────────────────────────

// @desc  List tables (optionally filtered by category)
// @route GET /api/pos/tables
const getTables = async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.category) filter.category = req.query.category;
        if (req.query.status) filter.status = req.query.status;
        const tables = await Table.find(filter)
            .populate('category', 'name')
            .sort({ createdAt: 1 });
        res.json(tables);
    } catch (error) {
        next(error);
    }
};

// @desc  Create a table
// @route POST /api/pos/tables
const createTable = async (req, res, next) => {
    try {
        const { name, category, capacity } = req.body;
        if (!name || !name.trim()) {
            res.status(400);
            throw new Error('Table name/number is required');
        }
        const section = await TableCategory.findById(category);
        if (!section) {
            res.status(400);
            throw new Error('A valid section is required');
        }
        const table = await Table.create({
            name: name.trim(),
            category,
            capacity: capacity || 4,
            createdBy: req.user?._id,
        });
        const populated = await table.populate('category', 'name');
        res.status(201).json(populated);
    } catch (error) {
        next(error);
    }
};

// @desc  Update a table
// @route PUT /api/pos/tables/:id
const updateTable = async (req, res, next) => {
    try {
        const { name, category, capacity } = req.body;
        const table = await Table.findById(req.params.id);
        if (!table) {
            res.status(404);
            throw new Error('Table not found');
        }
        if (name !== undefined) table.name = name.trim();
        if (capacity !== undefined) table.capacity = capacity;
        if (category !== undefined) {
            const section = await TableCategory.findById(category);
            if (!section) {
                res.status(400);
                throw new Error('A valid section is required');
            }
            table.category = category;
        }
        await table.save();
        const populated = await table.populate('category', 'name');
        res.json(populated);
    } catch (error) {
        next(error);
    }
};

// @desc  Delete a table (only when free)
// @route DELETE /api/pos/tables/:id
const deleteTable = async (req, res, next) => {
    try {
        const table = await Table.findById(req.params.id);
        if (!table) {
            res.status(404);
            throw new Error('Table not found');
        }
        if (table.status === 'occupied' || table.activeKot || table.activeBill) {
            res.status(400);
            throw new Error('Cannot delete a table that is in use. Settle its bill first.');
        }
        await table.deleteOne();
        res.json({ message: 'Table deleted' });
    } catch (error) {
        next(error);
    }
};

// @desc  Manually set a table's status (e.g. mark a dirty table clean)
// @route PUT /api/pos/tables/:id/status
const updateTableStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!TABLE_STATUSES.includes(status)) {
            res.status(400);
            throw new Error('Invalid table status');
        }
        const table = await Table.findById(req.params.id);
        if (!table) {
            res.status(404);
            throw new Error('Table not found');
        }
        // Guard: don't let a manual override strand an active KOT/bill.
        if (status === 'available' && (table.activeKot || table.activeBill)) {
            res.status(400);
            throw new Error('This table still has an active KOT or unsettled bill.');
        }
        table.status = status;
        await table.save();
        res.json(table);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getTables,
    createTable,
    updateTable,
    deleteTable,
    updateTableStatus,
};
