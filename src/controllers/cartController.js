const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');

// Helper: Haversine distance formula (fallback)
function getStraightLineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// Fetch exact road distance using OSRM API (matches Frontend UI accurately)
async function getDrivingDistanceInKm(lat1, lon1, lat2, lon2) {
    try {
        // Construct API URL. Note: OSRM uses lon,lat coordinates instead of lat,lon.
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;

        // Use native fetch to get routing
        const response = await fetch(osrmUrl);
        if (!response.ok) {
            throw new Error(`OSRM API error: ${response.status}`);
        }

        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
            // Distance is in meters, return in km
            return data.routes[0].distance / 1000;
        }
    } catch (error) {
        console.error("OSRM Route API failed, falling back to straight-line distance:", error.message);
    }

    // Fallback if API fails or no routes
    return getStraightLineDistance(lat1, lon1, lat2, lon2);
}

// Helper to calculate cart totals with Tax
const calculateCartTotals = async (cart) => {
    let itemsTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;

    // We need strict product details for tax
    // Assuming cart.items is populated with product
    // If not fully populated with cgst/sgst, we might need to fetch.
    // getCart populates 'name imageURL price'. We need to populate tax fields too.

    // Iterate and calculate
    const enrichedItems = [];

    for (const item of cart.items) {
        let product = item.product;
        // If product is just ID, fetch it (should be populated mainly)
        if (!product.cgst && product.toString().length === 24) {
            product = await Product.findById(product);
        }

        const quantity = item.quantity;
        const price = item.price; // Price at time of add (or current if updated)
        const itemTotal = price * quantity;

        itemsTotal += itemTotal;

        if (product) {
            const c = (itemTotal * (product.cgst || 0)) / 100;
            const s = (itemTotal * (product.sgst || 0)) / 100;
            const iVal = (itemTotal * (product.igst || 0)) / 100;

            cgstTotal += c;
            sgstTotal += s;
            igstTotal += iVal;

            // We can optionally add tax info to item result if needed by frontend
        }
    }

    const totalTax = cgstTotal + sgstTotal + igstTotal;
    // const finalTotal = itemsTotal + totalTax; // + Delivery - Discount (handled in bill API?)
    // Cart API usually returns just the cart state. 
    // The user wants "total should be with cgst...".
    // So we should return these values.

    return {
        itemsTotal,
        totalTax,
        taxBreakdown: { cgstTotal, sgstTotal, igstTotal },
        totalPrice: itemsTotal, // Keep existing field compatibility
        finalTotal: itemsTotal + totalTax
    };
};

// @desc    Get user's cart
// @route   GET /api/cart
// @access  Private
const getCart = async (req, res, next) => {
    try {
        let cart = await Cart.findOne({ user: req.user._id }).populate('items.product', 'name imageURL price cgst sgst igst hsnCode');

        if (!cart) {
            cart = await Cart.create({ user: req.user._id, items: [] });
            return res.json({ ...cart.toObject(), totalTax: 0, taxBreakdown: {}, finalTotal: 0 });
        }

        const totals = await calculateCartTotals(cart);

        // Return cart + calculated totals
        res.json({
            ...cart.toObject(),
            ...totals
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
const addToCart = async (req, res, next) => {
    try {
        const { productId, quantity } = req.body;

        const product = await Product.findById(productId);
        if (!product) {
            res.status(404);
            throw new Error('Product not found');
        }

        // Auto-select first variant as default
        let selectedVariantName = 'Standard';
        let selectedVariantPrice = 0;

        if (req.body.variant) {
            selectedVariantName = req.body.variant;
        } else if (product.variants && product.variants.length > 0) {
            selectedVariantName = product.variants[0].name;
            selectedVariantPrice = product.variants[0].price;
        } else {
            res.status(400);
            throw new Error('Product has no variants configuration');
        }

        // Re-verify price if user passed variant OR using default
        const variantObj = product.variants.find(v => v.name === selectedVariantName);
        if (variantObj) {
            selectedVariantPrice = variantObj.price;
        } else {
            res.status(400);
            throw new Error('Invalid variant');
        }

        let cart = await Cart.findOne({ user: req.user._id });

        if (!cart) {
            cart = new Cart({ user: req.user._id, items: [] });
        }

        // Check for active discount
        const now = new Date();
        const isDiscountActive = product.discountPercentage > 0 && product.discountExpiresAt && new Date(product.discountExpiresAt) > now;

        let finalPrice = selectedVariantPrice;
        if (isDiscountActive) {
            finalPrice = Math.round(selectedVariantPrice * (1 - product.discountPercentage / 100));
        }

        // Check if item already exists in cart with same variant
        const existingItemIndex = cart.items.findIndex(
            (item) => item.product.toString() === productId && item.variant === selectedVariantName
        );

        if (existingItemIndex > -1) {
            // Update quantity
            cart.items[existingItemIndex].quantity += quantity || 1;
            // Update price just in case it changed (e.g. discount applied recently)
            cart.items[existingItemIndex].price = finalPrice;
        } else {
            // Add new item
            cart.items.push({
                product: productId,
                variant: selectedVariantName,
                quantity: quantity || 1,
                price: finalPrice,
                name: product.name,
                imageURL: product.imageURL
            });
        }

        await cart.save();
        cart = await Cart.findOne({ user: req.user._id }).populate('items.product', 'name imageURL price cgst sgst igst');

        const totals = await calculateCartTotals(cart);
        res.json({ ...cart.toObject(), ...totals });

    } catch (error) {
        next(error);
    }
};

// @desc    Update cart item quantity
// @route   PUT /api/cart/:itemId
// @access  Private
const updateCartItem = async (req, res, next) => {
    try {
        const { quantity } = req.body; // New quantity
        const cart = await Cart.findOne({ user: req.user._id });

        if (!cart) {
            res.status(404);
            throw new Error('Cart not found');
        }

        const targetId = req.params.itemId;

        // 1. Try Cart Item ID (_id)
        let itemIndex = cart.items.findIndex((item) => item._id.toString() === targetId);

        // 2. Try Product ID (product)
        if (itemIndex === -1) {
            itemIndex = cart.items.findIndex((item) => item.product.toString() === targetId);
        }

        // 3. Try Product Custom ID
        if (itemIndex === -1) {
            const product = await Product.findOne({ customId: targetId });
            if (product) {
                itemIndex = cart.items.findIndex((item) => item.product.toString() === product._id.toString());
            }
        }

        if (itemIndex > -1) {
            if (quantity <= 0) {
                // Remove item if quantity is 0 or less
                cart.items.splice(itemIndex, 1);
            } else {
                cart.items[itemIndex].quantity = quantity;
            }
            await cart.save();
            const updatedCart = await Cart.findOne({ user: req.user._id }).populate('items.product', 'name imageURL price cgst sgst igst');
            const totals = await calculateCartTotals(updatedCart);
            res.json({ ...updatedCart.toObject(), ...totals });
        } else {
            // Debugging Info in Error
            const availableIds = cart.items.map(i => `Item:${i._id} / Prod:${i.product}`);
            res.status(404);
            throw new Error(`Item '${targetId}' not found in cart. Available: ${availableIds.join(', ')}`);
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Remove item from cart
// @route   DELETE /api/cart/:itemId
// @access  Private
const removeFromCart = async (req, res, next) => {
    try {
        const cart = await Cart.findOne({ user: req.user._id });

        if (!cart) {
            res.status(404);
            throw new Error('Cart not found');
        }

        // Try identifying item to remove by item ID or product ID
        let itemIndex = cart.items.findIndex((item) => item._id.toString() === req.params.itemId);

        if (itemIndex === -1) {
            itemIndex = cart.items.findIndex((item) => item.product.toString() === req.params.itemId);
        }

        if (itemIndex > -1) {
            cart.items.splice(itemIndex, 1);
            await cart.save();
            const updatedCart = await Cart.findOne({ user: req.user._id }).populate('items.product', 'name imageURL price cgst sgst igst');
            const totals = await calculateCartTotals(updatedCart);
            res.json({ ...updatedCart.toObject(), ...totals });
        } else {
            res.status(404);
            throw new Error('Item not found in cart');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private
const clearCart = async (req, res, next) => {
    try {
        const cart = await Cart.findOne({ user: req.user._id });
        if (cart) {
            cart.items = [];
            cart.appliedCoupon = null; // Also clear coupon
            await cart.save();
        }
        res.json({ message: 'Cart cleared', items: [], totalTax: 0, finalTotal: 0 });
    } catch (error) {
        next(error);
    }
};

// @desc    Apply coupon to cart
// @route   POST /api/cart/coupon
// @access  Private
const applyCouponToCart = async (req, res, next) => {
    try {
        const { code } = req.body;
        const cart = await Cart.findOne({ user: req.user._id });

        if (!cart || cart.items.length === 0) {
            res.status(400);
            throw new Error('Cart is empty');
        }

        const coupon = await Coupon.findOne({ code, isActive: true });

        if (!coupon) {
            res.status(404);
            throw new Error('Invalid or inactive coupon');
        }

        // Check Usage Limit explicitly
        if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
            res.status(400);
            throw new Error('Coupon has expired (Usage Limit Exceeded)');
        }

        // Validate dates
        const now = new Date();
        if (now < coupon.validFrom || now > coupon.validUntil) {
            res.status(400);
            throw new Error('Coupon is expired or not yet valid');
        }

        // Validate Min Order
        if (cart.totalPrice < coupon.minOrderValue) {
            res.status(400);
            throw new Error(`Minimum order value of ₹${coupon.minOrderValue} required`);
        }

        cart.appliedCoupon = code;
        await cart.save();

        res.json({ message: 'Coupon applied', coupon: code, cart });
    } catch (error) {
        next(error);
    }
};

// @desc    Remove coupon from cart
// @route   DELETE /api/cart/coupon
// @access  Private
const removeCouponFromCart = async (req, res, next) => {
    try {
        const cart = await Cart.findOne({ user: req.user._id });
        if (cart) {
            cart.appliedCoupon = null;
            await cart.save();
        }
        res.json({ message: 'Coupon removed', cart });
    } catch (error) {
        next(error);
    }
};

// @desc    Calculate cart bill with coupon
// @route   GET /api/cart/bill
// @access  Private
// @desc    Calculate cart bill with coupon
// @route   GET /api/cart/bill
// @access  Private
const getCartBill = async (req, res, next) => {
    try {
        const { lat, lng } = req.query;
        const cart = await Cart.findOne({ user: req.user._id }).populate('items.product', 'name price cgst sgst igst hsnCode');

        if (!cart) {
            return res.json({
                itemsTotal: 0,
                shipping: 0,
                discount: 0,
                totalTax: 0,
                taxBreakdown: { cgstTotal: 0, sgstTotal: 0, igstTotal: 0 }, // Add Breakdown
                finalTotal: 0,
                coupon: null
            });
        }

        // Use helper to get tax and item totals
        const { itemsTotal, totalTax, taxBreakdown } = await calculateCartTotals(cart);

        let discount = 0;
        let couponDetails = null;

        if (cart.appliedCoupon) {
            const coupon = await Coupon.findOne({ code: cart.appliedCoupon, isActive: true });

            if (coupon) {
                const now = new Date();
                // Check validity: Date + Min Order Value
                if (now >= coupon.validFrom && now <= coupon.validUntil && itemsTotal >= coupon.minOrderValue) {
                    if (coupon.discountType === 'PERCENTAGE') {
                        discount = (itemsTotal * coupon.discountAmount) / 100;
                        if (coupon.maxDiscountAmount !== null && discount > coupon.maxDiscountAmount) {
                            discount = coupon.maxDiscountAmount;
                        }
                    } else if (coupon.discountType === 'FLAT') {
                        discount = coupon.discountAmount;
                    }

                    if (discount > itemsTotal) discount = itemsTotal;

                    couponDetails = {
                        code: coupon.code,
                        name: coupon.name,
                        discountType: coupon.discountType,
                        discountAmount: coupon.discountAmount
                    };
                }
            }
        }

        let shipping = 0;

        // Calculate Delivery Fee if coordinates are provided
        if (lat && lng) {
            const userLat = parseFloat(lat);
            const userLng = parseFloat(lng);

            if (!isNaN(userLat) && !isNaN(userLng)) {
                let restaurant = await Restaurant.findOne();
                if (restaurant && restaurant.location?.lat && restaurant.location?.lng) {
                    let distanceKm = await getDrivingDistanceInKm(
                        restaurant.location.lat,
                        restaurant.location.lng,
                        userLat,
                        userLng
                    );

                    // Round distance to exactly 1 decimal place (e.g. 7.84 -> 7.8) to match human expectations
                    distanceKm = Math.round(distanceKm * 10) / 10;

                    const freeRadius = restaurant.freeDeliveryRadius || 0;
                    const perKmCharge = restaurant.chargePerKm || 0;

                    if (distanceKm > freeRadius) {
                        // User wants to charge for the ENTIRE distance if they are outside the free radius
                        // (e.g. 5.3km total = 5.3 * 10 = ₹53, NOT 5.3 - 1.0)
                        shipping = Math.round(distanceKm * perKmCharge);
                    }
                }
            }
        }

        const finalTotal = itemsTotal + totalTax + shipping - discount;

        res.json({
            itemsTotal,
            shipping,
            discount,
            totalTax,         // Add Tax
            taxBreakdown,     // Add Breakdown
            finalTotal: finalTotal > 0 ? finalTotal : 0,
            appliedCoupon: couponDetails
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Reorder items from a past order
// @route   POST /api/cart/reorder
// @access  Private
const reorder = async (req, res, next) => {
    try {
        console.log('[Reorder] Request received');
        const { orderId } = req.body;

        if (!orderId) {
            console.error('[Reorder] No orderId provided');
            res.status(400);
            throw new Error('Order ID is required');
        }

        console.log(`[Reorder] Fetching order: ${orderId}`);
        const order = await Order.findById(orderId).populate('items.product');

        if (!order) {
            console.error('[Reorder] Order not found');
            res.status(404);
            throw new Error('Order not found');
        }

        // Verify ownership
        if (order.customer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            console.error('[Reorder] Unauthorized access');
            res.status(401);
            throw new Error('Not authorized to reorder this order');
        }

        console.log('[Reorder] Fetching/Creating cart');
        let cart = await Cart.findOne({ user: req.user._id });
        if (!cart) {
            cart = new Cart({ user: req.user._id, items: [] });
        }

        // Strategy: Clear cart and add valid items
        cart.items = [];
        cart.appliedCoupon = null;

        const now = new Date();
        console.log(`[Reorder] Processing ${order.items.length} items from order`);

        for (const item of order.items) {
            if (!item.product) {
                console.log('[Reorder] Skipping item with null product ref');
                continue;
            }

            const productId = item.product._id || item.product;
            console.log(`[Reorder] Processing product: ${productId}`);
            const product = await Product.findById(productId);

            if (product && product.isAvailable) {
                // Determine current price (check discounts)
                let price = 0;

                if (item.variant) {
                    const variantFound = product.variants.find(v => v.name === item.variant);
                    if (variantFound) price = variantFound.price;
                }

                // Fallback to first variant if specific variant not found
                if (!price && product.variants.length > 0) {
                    price = product.variants[0].price;
                    console.log(`[Reorder] Variant '${item.variant}' not found/priced, using default: ${price}`);
                }

                if (!price) {
                    console.log(`[Reorder] No valid price found for product ${product.name}`);
                    continue;
                }

                // Check discount
                const isDiscountActive = product.discountPercentage > 0 && product.discountExpiresAt && new Date(product.discountExpiresAt) > now;
                if (isDiscountActive) {
                    const original = price;
                    price = Math.round(price * (1 - product.discountPercentage / 100));
                    console.log(`[Reorder] Applying discount: ${original} -> ${price}`);
                }

                cart.items.push({
                    product: product._id,
                    variant: item.variant || product.variants[0].name,
                    quantity: item.quantity,
                    price: price,
                    name: product.name,
                    imageURL: product.imageURL
                });
            } else {
                console.log(`[Reorder] Product ${productId} is unavailable or not found`);
            }
        }

        console.log('[Reorder] Saving cart');
        await cart.save();
        cart = await Cart.findOne({ user: req.user._id }).populate('items.product', 'name imageURL price cgst sgst igst hsnCode');

        console.log('[Reorder] Success');

        // Calculate totals for response
        const totals = await calculateCartTotals(cart);

        res.json({ message: 'Cart updated from past order', cart: { ...cart.toObject(), ...totals } });
    } catch (error) {
        console.error('[Reorder] Error:', error);
        next(error);
    }
};

// @desc    Get recommendations based on cart categories
// @route   GET /api/cart/recommendations
// @access  Private
const getCartRecommendations = async (req, res, next) => {
    try {
        const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');

        if (!cart || cart.items.length === 0) {
            // If cart is empty, return empty keys or maybe popular items?
            // For now, based on requirements, return empty
            return res.json([]);
        }

        // 1. Get Categories from Cart Items
        const categoryIds = new Set();
        const cartProductIds = new Set();

        cart.items.forEach(item => {
            if (item.product) {
                cartProductIds.add(item.product._id);
                if (item.product.category) {
                    categoryIds.add(item.product.category);
                }
            }
        });

        if (categoryIds.size === 0) {
            return res.json([]);
        }

        // 2. Fetch 3 Random Products from these categories, excluding current cart items
        const recommendations = await Product.aggregate([
            {
                $match: {
                    category: { $in: Array.from(categoryIds) },
                    _id: { $nin: Array.from(cartProductIds) },
                    isAvailable: true
                }
            },
            { $sample: { size: 3 } },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            { $unwind: '$category' } // Flatten category array
        ]);

        // Enrich with discount info (Standard Logic)
        const now = new Date();
        const enrichedRecs = recommendations.map(product => {
            // Check if discount is active
            const isDiscountActive = product.discountPercentage > 0 && product.discountExpiresAt && new Date(product.discountExpiresAt) > now;

            if (isDiscountActive) {
                product.hasDiscount = true;
                product.variants = product.variants.map(v => ({
                    ...v,
                    originalPrice: v.price,
                    price: Math.round(v.price * (1 - product.discountPercentage / 100)),
                    discountedPrice: Math.round(v.price * (1 - product.discountPercentage / 100))
                }));
            } else {
                product.hasDiscount = false;
                product.discountPercentage = 0;
            }
            return product;
        });

        res.json(enrichedRecs);

    } catch (error) {
        next(error);
    }
};

module.exports = {
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    applyCouponToCart,
    removeCouponFromCart,
    getCartBill,
    reorder,
    getCartRecommendations
};
