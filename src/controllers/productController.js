const mongoose = require('mongoose'); // Import mongoose
const Product = require('../models/Product');
const Category = require('../models/Category');

// Helper to resolve ID (ObjectId or customId)
const resolveId = (id) => {
    return mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { customId: id };
};

// Shared helper to enrich a product with discount info
const enrichProductWithDiscount = (product) => {
    const p = typeof product.toObject === 'function' ? product.toObject() : { ...product };
    const now = new Date();
    const isDiscountActive = p.discountPercentage > 0 && p.discountExpiresAt && new Date(p.discountExpiresAt) > now;

    if (isDiscountActive) {
        p.hasDiscount = true;
        // Set top-level originalPrice and discounted price (from first variant)
        const firstVariant = p.variants?.[0];
        if (firstVariant) {
            p.originalPrice = firstVariant.price; // original stored price
            p.price = Math.round(firstVariant.price * (1 - p.discountPercentage / 100)); // discounted
        }
        p.variants = p.variants.map(v => ({
            ...v,
            originalPrice: v.price,
            price: Math.round(v.price * (1 - p.discountPercentage / 100)),
            discountedPrice: Math.round(v.price * (1 - p.discountPercentage / 100))
        }));
    } else {
        p.hasDiscount = false;
        p.discountPercentage = 0;
        p.discountExpiresAt = null;
    }
    return p;
};

// @desc    Get all active products with filters (Public)
// @route   GET /api/menu
// @access  Public
const getProducts = async (req, res, next) => {
    try {
        const { keyword, category, type } = req.query;
        let query = { isAvailable: true };

        if (keyword) {
            query.$or = [
                { name: { $regex: keyword, $options: 'i' } },
                { description: { $regex: keyword, $options: 'i' } }
            ];
        }

        if (type) {
            query.type = type;
        }

        if (category) {
            // Check if category is ID or Name
            // If valid ObjectId or starts with 'CAT-', treat as ID lookup
            // Otherwise name lookup
            let categoryQuery;
            if (mongoose.Types.ObjectId.isValid(category)) {
                categoryQuery = { _id: category };
            } else if (category.startsWith('CAT-')) {
                categoryQuery = { customId: category };
            } else {
                categoryQuery = { name: { $regex: new RegExp(`^${category}$`, 'i') } };
            }

            const categoryDoc = await Category.findOne(categoryQuery);

            if (categoryDoc) {
                query.category = categoryDoc._id; // Product stores category _id reference
            } else {
                return res.json([]);
            }
        }

        const products = await Product.find(query).populate('category', 'name customId');

        // Transform products to include dynamic discount info
        const enrichedProducts = products.map(product => enrichProductWithDiscount(product));

        res.json(enrichedProducts);
    } catch (error) {
        next(error);
    }
};

// @desc    Get all products (Admin - Active & Inactive)
// @route   GET /api/admin/menu
// @access  Private/Admin
const getAdminProducts = async (req, res, next) => {
    try {
        const products = await Product.find({}).populate('category', 'name customId');
        res.json(products);
    } catch (error) {
        next(error);
    }
};

// @desc    Get single product by ID (ObjectId or CustomId)
// @route   GET /api/menu/:id
// @access  Public
const getProductById = async (req, res, next) => {
    try {
        const product = await Product.findOne(resolveId(req.params.id)).populate('category', 'name customId');

        if (product) {
            // Enrich with discount info (same as menu listing)
            const enriched = enrichProductWithDiscount(product);
            res.json(enriched);
        } else {
            res.status(404);
            throw new Error('Product not found');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Create a product
// @route   POST /api/menu
// @access  Private/Admin
const createProduct = async (req, res, next) => {
    try {
        const {
            name,
            description,
            category,
            imageURL,
            type,
            variants,
            isAvailable,
            hsnCode, cgst, sgst, igst
        } = req.body;

        // Resolve Category ID if customId provided
        let categoryId = category;
        if (category && !mongoose.Types.ObjectId.isValid(category)) {
            const cat = await Category.findOne({ customId: category });
            if (cat) categoryId = cat._id;
            else if (!cat) {
                // Try finding by name just in case or fail? 
                // Let's assume input is ID. Validate existence.
                res.status(400);
                throw new Error('Invalid Category ID');
            }
        }


        const product = new Product({
            name,
            description,
            category: categoryId,
            imageURL,
            type,
            variants,
            isAvailable,
            hsnCode, cgst: cgst || 0, sgst: sgst || 0, igst: igst || 0
        });

        const createdProduct = await product.save();
        res.status(201).json(createdProduct);
    } catch (error) {
        next(error);
    }
};

// @desc    Update a product
// @route   PUT /api/menu/:id
// @access  Private/Admin
const updateProduct = async (req, res, next) => {
    try {
        const {
            name,
            description,
            category,
            imageURL,
            type,
            variants,
            isAvailable,
            hsnCode, cgst, sgst, igst
        } = req.body;

        const product = await Product.findOne(resolveId(req.params.id));

        if (product) {
            product.name = name || product.name;
            product.description = description || product.description;
            if (category) {
                // Resolve category if changing
                let categoryId = category;
                if (!mongoose.Types.ObjectId.isValid(category)) {
                    const cat = await Category.findOne({ customId: category });
                    if (cat) categoryId = cat._id;
                }
                product.category = categoryId;
            }
            product.imageURL = imageURL || product.imageURL;
            product.type = type || product.type;
            product.variants = variants || product.variants;
            product.isAvailable =
                isAvailable !== undefined ? isAvailable : product.isAvailable;

            if (hsnCode !== undefined) product.hsnCode = hsnCode;
            if (cgst !== undefined) product.cgst = cgst;
            if (sgst !== undefined) product.sgst = sgst;
            if (igst !== undefined) product.igst = igst;

            const updatedProduct = await product.save();
            res.json(updatedProduct);
        } else {
            res.status(404);
            throw new Error('Product not found');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Delete a product
// @route   DELETE /api/menu/:id
// @access  Private/Admin
const deleteProduct = async (req, res, next) => {
    try {
        const product = await Product.findOneAndDelete(resolveId(req.params.id));

        if (product) {
            res.json({ message: 'Product removed' });
        } else {
            res.status(404);
            throw new Error('Product not found');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Apply Discount to Product
// @route   POST /api/menu/:id/discount
// @access  Private/Admin
const applyDiscount = async (req, res, next) => {
    try {
        const { percentage, durationInMinutes, duration } = req.body;
        const product = await Product.findOne(resolveId(req.params.id));

        if (!product) {
            res.status(404);
            throw new Error('Product not found');
        }

        // Validate percentage
        if (percentage < 0 || percentage > 100) {
            res.status(400);
            throw new Error('Percentage must be between 0 and 100');
        }

        let expiryDate = null;

        // Calculate Expiry
        if (durationInMinutes) {
            expiryDate = new Date(Date.now() + durationInMinutes * 60 * 1000);
        } else if (duration) {
            // duration: { days: 0, hours: 2, minutes: 30 }
            const { days = 0, hours = 0, minutes = 0 } = duration;
            const totalMinutes = (days * 24 * 60) + (hours * 60) + parseInt(minutes);
            if (totalMinutes > 0) {
                expiryDate = new Date(Date.now() + totalMinutes * 60 * 1000);
            }
        }

        if (!expiryDate) {
            res.status(400);
            throw new Error('Please provide valid duration (durationInMinutes number OR duration object {days, hours, minutes})');
        }

        product.discountPercentage = percentage;
        product.discountExpiresAt = expiryDate;

        await product.save();

        // Return enriched product
        const enriched = product.toObject();
        enriched.hasDiscount = true;
        enriched.discountedPrice = product.variants.map(v => ({
            name: v.name,
            originalPrice: v.price,
            discountedPrice: Math.round(v.price * (1 - percentage / 100))
        }));

        res.json({ message: 'Discount applied', product: enriched });
    } catch (error) {
        next(error);
    }
};

// @desc    Remove Discount from Product
// @route   DELETE /api/menu/:id/discount
// @access  Private/Admin
const removeDiscount = async (req, res, next) => {
    try {
        const product = await Product.findOne(resolveId(req.params.id));

        if (!product) {
            res.status(404);
            throw new Error('Product not found');
        }

        product.discountPercentage = 0;
        product.discountExpiresAt = null;

        await product.save();

        res.json({ message: 'Discount removed', product });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getProducts,
    getAdminProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    applyDiscount,
    removeDiscount,
    enrichProductWithDiscount
};
