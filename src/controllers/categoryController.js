const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { enrichProductWithDiscount } = require('./productController');

// Helper to resolve ID (ObjectId or customId)
const resolveId = (id) => {
    return mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { customId: id };
};

// @desc    Get all categories (With populated products option?)
// @route   GET /api/categories
// @access  Public
const getCategories = async (req, res, next) => {
    try {
        const { includeMenu } = req.query; // ?includeMenu=true
        const categories = await Category.find({ isActive: true });

        if (includeMenu === 'true') {
            // For each category, fetch active products
            // This can be N+1 query issue, but for limited categories it's fine.
            // Or use aggregation.
            const categoriesWithMenu = await Promise.all(categories.map(async (cat) => {
                const products = await Product.find({ category: cat._id, isAvailable: true });
                return { ...cat.toObject(), products };
            }));
            return res.json(categoriesWithMenu);
        }

        res.json(categories);
    } catch (error) {
        next(error);
    }
};

// @desc    Get single category by ID
// @route   GET /api/categories/:id
// @access  Public
const getCategoryById = async (req, res, next) => {
    try {
        const category = await Category.findOne(resolveId(req.params.id));
        if (category) {
            const products = await Product.find({ category: category._id, isAvailable: true });
            // Enrich products with discount data
            const enrichedProducts = products.map(p => enrichProductWithDiscount(p));
            res.json({ ...category.toObject(), products: enrichedProducts });
        } else {
            res.status(404);
            throw new Error('Category not found');
        }
    } catch (error) {
        next(error);
    }
}


// @desc    Create a category
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = async (req, res, next) => {
    try {
        const { name, imageURL } = req.body;

        const categoryExists = await Category.findOne({ name });

        if (categoryExists) {
            res.status(400);
            throw new Error('Category already exists');
        }

        const category = await Category.create({
            name,
            imageURL,
        });

        res.status(201).json(category);
    } catch (error) {
        next(error);
    }
};

// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private/Admin
const updateCategory = async (req, res, next) => {
    try {
        const { name, imageURL, isActive } = req.body;
        const category = await Category.findOne(resolveId(req.params.id));

        if (category) {
            category.name = name || category.name;
            category.imageURL = imageURL || category.imageURL;
            category.isActive = isActive !== undefined ? isActive : category.isActive;

            const updatedCategory = await category.save();
            res.json(updatedCategory);
        } else {
            res.status(404);
            throw new Error('Category not found');
        }
    } catch (error) {
        next(error);
    }
}

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = async (req, res, next) => {
    try {
        const category = await Category.findOneAndDelete(resolveId(req.params.id));
        if (category) {
            res.json({ message: 'Category removed' });
        } else {
            res.status(404);
            throw new Error('Category not found');
        }
    } catch (error) {
        next(error);
    }
}

module.exports = { getCategories, getCategoryById, createCategory, updateCategory, deleteCategory };
