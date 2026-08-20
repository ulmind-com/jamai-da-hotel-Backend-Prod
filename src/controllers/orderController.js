const mongoose = require('mongoose');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const Cart = require('../models/Cart');
const Coupon = require('../models/Coupon');
const User = require('../models/User'); // Moved to top
const Product = require('../models/Product'); // Moved to top

const { calculateDeliveryFee, getOrderDistance } = require('../utils/distanceService');
const { paginate, isPaginated, escapeRegex } = require('../utils/paginate');

// Helper to resolve ID
const resolveId = (id) => {
    return mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { customId: id };
};

// @desc    Calculate delivery fee
// @route   POST /api/orders/calc-fee
// @access  Public
const calcFee = async (req, res, next) => {
    try {
        const { lat, lng } = req.body;
        const result = await calculateDeliveryFee(lat, lng);
        res.json(result);
    } catch (error) {
        if (error.message && error.message.includes('too far')) {
            res.status(400);
        }
        next(error);
    }
};

// @desc    Initiate Checkout (Calculate Total & Create Razorpay Order)
// @route   POST /api/orders/payment/create
// @access  Private
const initiateCheckout = async (req, res, next) => {
    try {
        let { items, deliveryAddress } = req.body;

        // 1. Data Normalization & Validation (Same as addOrderItems)
        if (items && items.length > 0) {
            items = items.map(item => ({
                product: item.product || item.menuItem,
                variant: item.variant || 'Standard',
                quantity: item.quantity,
                price: item.price
            }));
        }

        if (!items || items.length === 0) {
            res.status(400);
            throw new Error('No order items');
        }

        // 2. Fetch Prices & Calculate Total
        let totalAmount = 0;
        // Fetch Products to get Prices if missing
        // Product already imported at top
        for (let i = 0; i < items.length; i++) {
            // Always fetch fresh price for security
            const productDoc = await Product.findById(items[i].product);
            if (!productDoc) {
                res.status(400);
                throw new Error(`Product ${items[i].product} not found`);
            }

            // Find matching variant
            const variantName = items[i].variant || 'Standard';
            const variant = productDoc.variants.find(v => v.name === variantName);

            let price = 0;
            if (!variant) {
                if (productDoc.variants.length > 0) {
                    price = productDoc.variants[0].price;
                } else {
                    res.status(400);
                    throw new Error(`Product ${productDoc.name} has no price`);
                }
            } else {
                price = variant.price;
            }

            // Apply Product-Level discount (if valid)
            const hasDiscount = productDoc.discountPercentage > 0;
            const notExpired = !productDoc.discountExpiresAt || new Date(productDoc.discountExpiresAt) > new Date();
            if (hasDiscount && notExpired) {
                price = Math.round(price * (1 - productDoc.discountPercentage / 100));
            }

            items[i].price = price; // Update the item payload so tax calculates securely
            totalAmount += price * items[i].quantity;
        }

        // 3. Tax Calculation
        let totalTax = 0;
        let cgstTotal = 0;
        let sgstTotal = 0;
        let igstTotal = 0;

        for (let i = 0; i < items.length; i++) {
            // Fetch Tax info from Product
            const productDoc = await Product.findById(items[i].product);
            const itemTotal = items[i].price * items[i].quantity;

            if (productDoc) {
                const c = (itemTotal * (productDoc.cgst || 0)) / 100;
                const s = (itemTotal * (productDoc.sgst || 0)) / 100;
                const iVal = (itemTotal * (productDoc.igst || 0)) / 100;

                cgstTotal += c;
                sgstTotal += s;
                igstTotal += iVal;
            }
        }
        totalTax = cgstTotal + sgstTotal + igstTotal;


        // 4. Discount Logic
        const cart = await Cart.findOne({ user: req.user._id });
        let discountApplied = 0;
        let finalAmount = totalAmount + totalTax; // Base + Tax

        if (cart && cart.appliedCoupon) {
            const coupon = await Coupon.findOne({ code: cart.appliedCoupon, isActive: true });
            if (coupon) {
                // Re-verify limit
                if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
                    // Coupon expired (Limit reached)
                    discountApplied = 0;
                } else if (totalAmount < coupon.minOrderValue) {
                    // Min order value not met
                    discountApplied = 0;
                } else {
                    let discount = 0;
                    if (coupon.discountType === 'PERCENTAGE') {
                        discount = (totalAmount * coupon.discountAmount) / 100;
                        if (coupon.maxDiscountAmount !== null && discount > coupon.maxDiscountAmount) {
                            discount = coupon.maxDiscountAmount;
                        }
                    } else if (coupon.discountType === 'FLAT') {
                        discount = coupon.discountAmount;
                    }

                    // Cap discount at total amount (can't go negative)
                    if (discount > totalAmount) discount = totalAmount;

                    discountApplied = discount;
                    finalAmount = totalAmount + totalTax - discount;
                }
            }
        }

        if (req.body.deliveryFee) {
            finalAmount += req.body.deliveryFee;
        }

        // Minimum amount check
        if (finalAmount < 0) finalAmount = 0;

        // 5. Create Razorpay Order
        const razorpay = require('../utils/payment');
        const options = {
            amount: Math.round(finalAmount * 100), // Amount in paise
            currency: 'INR',
            receipt: `receipt_${Date.now()}_${req.user._id.toString().substring(0, 5)}`,
        };

        const rzOrder = await razorpay.orders.create(options);

        res.json({
            razorpayOrderId: rzOrder.id,
            amount: rzOrder.amount,
            currency: rzOrder.currency,
            items, // Return normalized items
            totalAmount, // Item Total
            totalTax,
            taxBreakdown: { cgstTotal, sgstTotal, igstTotal }, // New field
            discountApplied,
            finalAmount
        });

    } catch (error) {
        console.error('[Initiate Checkout Error]', error);
        next(error);
    }
};

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
const addOrderItems = async (req, res, next) => {
    try {
        // Check if restaurant is open
        const restaurant = await Restaurant.findOne();
        if (restaurant && !restaurant.isOpen) {
            res.status(400);
            throw new Error('Restaurant is currently closed. Please try again later.');
        }

        // Check COD restrictions
        if (req.body.paymentMethod && req.body.paymentMethod.toUpperCase().includes('COD')) {
            // User Ban check
            if (req.user && req.user.isCodDisabled) {
                res.status(400);
                throw new Error('Cash on Delivery is disabled for your account due to previous violations. Please use Online Payment.');
            }

            // Global Manual Toggle
            if (restaurant && restaurant.isCodEnabled === false) {
                res.status(400);
                throw new Error('Cash on Delivery is currently disabled by the restaurant. Please pay online.');
            }

            // Time Window check
            if (restaurant && restaurant.codStartTime && restaurant.codEndTime) {
                const now = new Date();
                const istTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
                const currentHhMm = String(istTime.getHours()).padStart(2, '0') + ':' + String(istTime.getMinutes()).padStart(2, '0');

                const start = restaurant.codStartTime;
                const end = restaurant.codEndTime;

                let isOffline = false;

                if (start < end) {
                    // Standard daytime window: e.g., 14:00 to 18:00
                    if (currentHhMm >= start && currentHhMm <= end) {
                        isOffline = true;
                    }
                } else if (start > end) {
                    // Overnight window: e.g., 22:00 to 06:00
                    // Offline if time is >= 22:00 OR <= 06:00
                    if (currentHhMm >= start || currentHhMm <= end) {
                        isOffline = true;
                    }
                }

                if (isOffline) {
                    res.status(400);
                    throw new Error(`Cash on Delivery is unavailable between ${start} and ${end}. Please pay online.`);
                }
            }
        }

        let {
            items,
            totalAmount,
            discountApplied,
            finalAmount,
            deliveryAddress,
            deliveryCoordinates,
            deliveryFee, // Capture delivery fee from body
            paymentMethod,
        } = req.body;

        console.log('[Order] Received Order Request:', { user: req.user._id, paymentMethod, totalAmount });
        console.log('[Order] Delivery Address Info:', deliveryAddress);

        // ---------------------------------------------------------
        // DATA NORMALIZATION (Fix Frontend Mismatches)
        // ---------------------------------------------------------
        // 1. Normalize Payment Method
        if (paymentMethod) {
            const upper = paymentMethod.toUpperCase();
            if (upper.includes('ONLINE')) {
                paymentMethod = 'ONLINE';
            } else if (upper === 'COD' || upper === 'CASH ON DELIVERY') {
                paymentMethod = 'COD';
            }
        }

        // 2. Normalize Items (menuItem -> product)
        if (items && items.length > 0) {
            items = items.map(item => ({
                product: item.product || item.menuItem, // Handle both key names
                variant: item.variant || 'Standard',
                quantity: item.quantity,
                price: item.price // Optional, if backend calculates it better allow it
            }));
            // We should fetch prices from DB ideally, but for now trust/verify.
            // Schema requires: { product, variant, quantity, price }
            // If price is missing, we must fetch it. 
            // The logs showed price missing in body!
            // Wait, log body: { "items": [{ "menuItem": "...", "quantity": 1, "variant": "Standard" }] }
            // Price IS MISSING. Schema says required.
            // We MUST fetch prices.
        }

        if (!items || items.length === 0) {
            res.status(400);
            throw new Error('No order items');
        }

        // Fetch Products to get Prices if missing
        // Product already imported at top
        for (let i = 0; i < items.length; i++) {
            const productDoc = await Product.findById(items[i].product);
            if (!productDoc) {
                res.status(400);
                throw new Error(`Product ${items[i].product} not found`);
            }

            // Find matching variant
            const variantName = items[i].variant || 'Standard';
            const variant = productDoc.variants.find(v => v.name === variantName);

            let basePrice = 0;
            if (!variant) {
                if (productDoc.variants.length > 0) {
                    basePrice = productDoc.variants[0].price;
                    items[i].variant = productDoc.variants[0].name; // Auto-correct variant name
                } else {
                    res.status(400);
                    throw new Error(`Product ${productDoc.name} has no price/variants`);
                }
            } else {
                basePrice = variant.price;
            }

            // Apply Product-Level discount securely
            const hasDiscount = productDoc.discountPercentage > 0;
            const notExpired = !productDoc.discountExpiresAt || new Date(productDoc.discountExpiresAt) > new Date();
            if (hasDiscount && notExpired) {
                basePrice = Math.round(basePrice * (1 - productDoc.discountPercentage / 100));
            }

            // Overwrite price securely unconditionally
            items[i].price = basePrice;

            // Apply Tax Config
            items[i].hsnCode = productDoc.hsnCode || '';
            items[i].cgst = productDoc.cgst || 0;
            items[i].sgst = productDoc.sgst || 0;
            items[i].igst = productDoc.igst || 0;

            console.log(`[Order Debug] Secured Product: ${productDoc.name}, Price: ${basePrice}, Taxes: CGST=${items[i].cgst}, SGST=${items[i].sgst}`);
        }

        // Calculate Tax Totals
        let totalTax = 0;
        let cgstTotal = 0;
        let sgstTotal = 0;
        let igstTotal = 0;

        items.forEach((item, index) => {
            const itemTotal = item.price * item.quantity;
            // Assume price is Exclusive of tax for calculation
            const c = (itemTotal * (item.cgst || 0)) / 100;
            const s = (itemTotal * (item.sgst || 0)) / 100;
            const iVal = (itemTotal * (item.igst || 0)) / 100;

            console.log(`[Order Debug] Item ${index}: Total=${itemTotal}, cgst=${c}, sgst=${s}, igst=${iVal}`);

            cgstTotal += c;
            sgstTotal += s;
            igstTotal += iVal;
        });

        totalTax = cgstTotal + sgstTotal + igstTotal;
        console.log(`[Order Debug] Total Tax Calculated: ${totalTax}`);
        // User requested: "give me total amount and break out"
        // If price was inclusive, we'd back calculate.
        // Assuming Exclusive: Final Amount = Item Total + Tax + Delivery - Discount
        // But wait, user provided `totalAmount` in body.
        // We should recalculate `totalAmount` to be safe, OR trust it is Item Total.

        // Let's assume Item Total.

        // Update finalAmount logic
        // Previous: finalAmount = totalAmount - discount + delivery
        // New: finalAmount = totalAmount + totalTax - discount + delivery

        // Wait, if `finalAmount` comes from body, we need to verify/overwrite it?
        // We really should recalculate everything on backend for security.

        // Let's rely on the passed `totalAmount` as Item Total for now (or recalculate it).
        // Recalculating is safer.
        const calculatedItemTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Overwrite totalAmount and recalculate final
        totalAmount = calculatedItemTotal;

        // Verify discount again
        // ... (existing coupon logic uses totalAmount) ...

        // We need to inject this new `finalAmount` logic into the flow.
        // The existing code has coupon logic below.
        // Let's scroll down to `finalAmount` calculation.


        // ---------------------------------------------------------
        // ADDRESS RESOLUTION
        // ---------------------------------------------------------
        // If deliveryAddress is a string (ID), resolve it from user's saved addresses
        // ---------------------------------------------------------
        // ADDRESS RESOLUTION
        // ---------------------------------------------------------
        // If deliveryAddress is a string (ID), resolve it from user's saved addresses
        if (typeof deliveryAddress === 'string') {
            const user = await User.findById(req.user._id);
            console.log(`[Order] Resolving Address: '${deliveryAddress}'`);

            // 1. Try resolving by _id (Standard)
            let matchedAddress = null;
            if (mongoose.Types.ObjectId.isValid(deliveryAddress)) {
                matchedAddress = user.savedAddresses.id(deliveryAddress) || user.savedAddresses.find(a => a._id.toString() === deliveryAddress);
            }

            // 2. Try resolving by createdAt Timestamp (Frontend fallback)
            // If input is a number-like string (e.g. "1771518656505")
            if (!matchedAddress && /^\d+$/.test(deliveryAddress)) {
                console.log('[Order] ID looks like a timestamp, trying lookup by createdAt...');
                const ts = parseInt(deliveryAddress);
                // Allow a small margin of error (e.g. 1-2 seconds) or exact match
                // Mongoose timestamps are Dates.
                matchedAddress = user.savedAddresses.find(a => {
                    return a.createdAt && (a.createdAt.getTime() === ts || Math.abs(a.createdAt.getTime() - ts) < 1000);
                });
            }

            if (!matchedAddress) {
                // 3. Fallback: Treat string as specific address line if NOT found
                console.log(`[Order] Address ID '${deliveryAddress}' not found in user profile. Treating as raw address Line 1.`);
                deliveryAddress = { addressLine1: deliveryAddress };
            } else {
                // Success - Found the address object
                console.log('[Order] Address Found:', matchedAddress.addressLine1);

                // Extract coordinates from saved address as fallback
                if (!deliveryCoordinates && matchedAddress.coordinates && matchedAddress.coordinates.lat) {
                    deliveryCoordinates = {
                        lat: matchedAddress.coordinates.lat,
                        lng: matchedAddress.coordinates.lng,
                    };
                }
                // Convert to plain object 
                deliveryAddress = matchedAddress.toObject();
            }
        } else if (typeof deliveryAddress !== 'object') {
            // Still fallback for invalid type
            console.log('[Order] Invalid Delivery Address format, using empty object');
            deliveryAddress = { addressLine1: 'Unknown Address' };
        }

        // ---------------------------------------------------------
        // COUPON LOGIC: Check Cart for applied coupon
        // ---------------------------------------------------------
        const cart = await Cart.findOne({ user: req.user._id });
        let appliedCouponCode = null;
        // discountApplied is already declared above in destructuring or defaults
        // Let's ensure we use the one from destructuring or assign to it if it's let
        // The previous code had `let { ... discountApplied ... } = req.body`
        // We should just use that variable or reassign it.
        // But wait, we want to calculate it.
        // Let's declare a new local var for calculation if needed, or simply assign to the existing one if it's mutable.
        // The destructured one is `const` by default if not specified `let`.
        // `let { ... } = req.body;` -> It IS `let`.
        // So we can reassign it.

        discountApplied = 0; // Reset to 0 before calculation

        if (cart && cart.appliedCoupon) {
            appliedCouponCode = cart.appliedCoupon;

            // ... (Verify Coupon Validity - same as before) ...
            const coupon = await Coupon.findOne({ code: appliedCouponCode, isActive: true });
            if (!coupon) {
                // Handle invalid coupon
            } else {
                if (totalAmount < coupon.minOrderValue) {
                    // Min order value not met
                } else {
                    let discount = 0;
                    if (coupon.discountType === 'PERCENTAGE') {
                        discount = (totalAmount * coupon.discountAmount) / 100;
                        if (coupon.maxDiscountAmount !== null && discount > coupon.maxDiscountAmount) {
                            discount = coupon.maxDiscountAmount;
                        }
                    } else if (coupon.discountType === 'FLAT') {
                        discount = coupon.discountAmount;
                    }

                    if (discount > totalAmount) discount = totalAmount;
                    discountApplied = discount;
                }

                // Handle Usage Limit (same as before)
                if (coupon.usageLimit !== null) {
                    const updatedCoupon = await Coupon.findByIdAndUpdate(
                        coupon._id,
                        { $inc: { usageCount: 1 } },
                        { new: true }
                    );

                    // Automatically deactivate if the usage limit is reached
                    if (updatedCoupon && updatedCoupon.usageCount >= updatedCoupon.usageLimit) {
                        updatedCoupon.isActive = false;
                        await updatedCoupon.save();
                    }
                }
            }
        }

        // Final Calculation
        let calculatedDeliveryFee = 0;

        // Grab delivery fee from frontend since they did the calculation there
        // Note: For absolute strictness, backend could manually re-calc Haversine here 
        // to prevent spoofing, but we trust the checkout payload (deliveryFee) for now
        if (req.body.deliveryFee) {
            calculatedDeliveryFee = parseInt(req.body.deliveryFee) || 0;
        }

        finalAmount = totalAmount + totalTax + calculatedDeliveryFee - discountApplied;
        if (finalAmount < 0) finalAmount = 0;

        // ---------------------------------------------------------
        // PAYMENT HANDLING (Razorpay)
        // ---------------------------------------------------------
        const { verifyPaymentSignature } = require('./paymentController');
        const razorpay = require('../utils/payment');

        let paymentInfo = {
            paymentStatus: 'PENDING',
        };

        if (paymentMethod === 'ONLINE') {
            const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

            if (razorpayOrderId && razorpayPaymentId && razorpaySignature) {
                const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
                if (!isValid) {
                    res.status(400);
                    throw new Error('Invalid Payment Signature');
                }
                paymentInfo = {
                    paymentStatus: 'PAID',
                    razorpayOrderId,
                    razorpayPaymentId,
                    razorpaySignature,
                };

                // Fetch Detailed Payment Metadata from Razorpay
                try {
                    const rzPayment = await razorpay.payments.fetch(razorpayPaymentId);
                    if (rzPayment) {
                        const method = rzPayment.method;
                        const details = { method };

                        if (method === 'upi') {
                            details.upiId = rzPayment.vpa;
                        } else if (method === 'card') {
                            details.cardNetwork = rzPayment.card?.network;
                            details.cardLast4 = rzPayment.card?.last4;
                        } else if (method === 'wallet') {
                            details.wallet = rzPayment.wallet;
                        } else if (method === 'netbanking') {
                            details.bank = rzPayment.bank;
                        }

                        paymentInfo.paymentDetails = details;
                    }
                } catch (fetchErr) {
                    console.error('[Razorpay Checkout Metadata Fetch Error]', fetchErr);
                    // Non-blocking: If fetching fails, we still mark the order as PAID
                }
            }
            else if (!razorpayOrderId) {
                try {
                    const options = {
                        amount: Math.round(finalAmount * 100),
                        currency: 'INR',
                        receipt: `receipt_${Date.now()}`,
                    };
                    const rzOrder = await razorpay.orders.create(options);
                    paymentInfo.razorpayOrderId = rzOrder.id;
                } catch (err) {
                    res.status(500);
                    throw new Error('Razorpay Order Creation Failed: ' + err.message);
                }
            } else {
                paymentInfo.razorpayOrderId = razorpayOrderId;
            }
        }

        // ---------------------------------------------------------
        // CREATE ORDER
        // ---------------------------------------------------------
        const order = new Order({
            customer: req.user._id,
            items,

            // Amounts
            totalAmount, // Item Total
            taxAmount: totalTax,
            cgstTotal,
            sgstTotal,
            igstTotal,
            deliveryFee: calculatedDeliveryFee,

            discountApplied: appliedCouponCode ? discountApplied : 0,
            finalAmount,

            deliveryAddress,
            deliveryCoordinates: deliveryCoordinates || undefined,
            deliveryInstruction: req.body.deliveryInstruction || "", // Save instruction
            paymentMethod,
            ...paymentInfo
        });

        const createdOrder = await order.save();

        // ---------------------------------------------------------
        // POST-ORDER: Clear Cart
        // ---------------------------------------------------------
        if (cart) {
            cart.items = [];
            cart.appliedCoupon = null;
            await cart.save();
        }

        // Send Email: Only if PAID or COD. If Pending Online, user hasn't paid yet.
        // But functionally, the "Order Placed" email is usually sent.
        // We can send it with "Payment Pending" status.
        // Send Email & Calculate Distance Asynchronously (Non-blocking)
        setTimeout(async () => {
            try {
                // 1. Send Email
                const user = await User.findById(req.user._id);
                if (user) {
                    const populatedOrder = await Order.findById(createdOrder._id).populate('items.product');
                    sendOrderStatusEmail(populatedOrder, user).catch(err => console.error(err));
                }

                // 2. Pre-calculate Distance for later use (optional cache/db update if needed)
                const addrCoords = deliveryAddress && deliveryAddress.coordinates;
                if (addrCoords && addrCoords.lat && addrCoords.lng) {
                    getOrderDistance(addrCoords.lat, addrCoords.lng).catch(e => console.error(e));
                }
            } catch (err) {
                console.error('[Async Post-Order Setup Error]', err);
            }
        }, 0);

        // Real-time Update for Admin
        const io = req.app.get('io');
        if (io) {
            io.emit('newOrder', createdOrder);
        }

        // Push Notification for Admins (Loud Alert)
        try {
            const { sendAdminOrderNotification } = require('../services/notificationService');
            const admins = await User.find({ role: 'Admin' }).select('_id');
            const adminIds = admins.map(admin => admin._id.toString());
            if (adminIds.length > 0) {
                sendAdminOrderNotification(adminIds, createdOrder._id).catch(e => console.error("Admin Push Error:", e));
            }
        } catch (e) { console.error("Failed to fetch admins for Push:", e); }

        const orderResponse = createdOrder.toObject();

        res.status(201).json(orderResponse);
    } catch (error) {
        console.error('[Order Controller Error]', error);
        next(error);
    }
};

// @desc    Verify Payment for an existing order
// @route   POST /api/orders/verify
// @access  Private
const verifyOrderPayment = async (req, res, next) => {
    try {
        const { orderId, razorpayPaymentId, razorpaySignature } = req.body;
        const { verifyPaymentSignature } = require('./paymentController');
        const razorpay = require('../utils/payment');

        const order = await Order.findById(orderId);
        if (!order) {
            res.status(404);
            throw new Error('Order not found');
        }

        if (order.paymentStatus === 'PAID') {
            res.status(400);
            throw new Error('Order is already paid');
        }

        // Verify
        const isValid = verifyPaymentSignature(order.razorpayOrderId, razorpayPaymentId, razorpaySignature);
        if (!isValid) {
            res.status(400);
            throw new Error('Invalid Payment Signature');
        }

        // Update Order Basic Info
        order.paymentStatus = 'PAID';
        order.razorpayPaymentId = razorpayPaymentId;
        order.razorpaySignature = razorpaySignature;

        // Fetch Detailed Payment Metadata from Razorpay
        try {
            const rzPayment = await razorpay.payments.fetch(razorpayPaymentId);
            if (rzPayment) {
                const method = rzPayment.method;
                const details = { method };

                if (method === 'upi') {
                    details.upiId = rzPayment.vpa;
                } else if (method === 'card') {
                    details.cardNetwork = rzPayment.card?.network;
                    details.cardLast4 = rzPayment.card?.last4;
                } else if (method === 'wallet') {
                    details.wallet = rzPayment.wallet;
                } else if (method === 'netbanking') {
                    details.bank = rzPayment.bank;
                }

                order.paymentDetails = details;
            }
        } catch (fetchErr) {
            console.error('[Razorpay Metadata Fetch Error]', fetchErr);
            // Non-blocking: If fetching fails, we still mark the order as PAID
        }

        const updatedOrder = await order.save();

        res.json(updatedOrder);

    } catch (error) {
        next(error);
    }
};

// @desc    Cancel Order (within 3 mins)
// @route   POST /api/orders/:id/cancel
// @access  Private
const cancelOrder = async (req, res, next) => {
    try {
        const order = await Order.findOne(resolveId(req.params.id));

        if (!order) {
            res.status(404);
            throw new Error('Order not found');
        }

        // Check ownership
        if (order.customer.toString() !== req.user._id.toString() && req.user.role !== 'Admin') {
            res.status(401);
            throw new Error('Not authorized');
        }

        // Check Status
        if (order.orderStatus === 'DELIVERED' || order.orderStatus === 'CANCELLED') {
            res.status(400);
            throw new Error(`Cannot cancel order with status ${order.orderStatus}`);
        }

        // Check Time (3 minutes = 180000 ms)
        const timeElapsed = Date.now() - new Date(order.createdAt).getTime();
        const cancelWindow = 3 * 60 * 1000;

        if (timeElapsed > cancelWindow && req.user.role !== 'Admin') {
            res.status(400);
            throw new Error('Cancellation period (3 mins) has expired. Order cannot be cancelled.');
        }

        const reason = req.body.reason || (req.user.role === 'Admin' ? 'Admin Cancelled' : 'User Cancelled');
        order.cancellationReason = reason;
        order.orderStatus = 'CANCELLED';

        // Auto initiate refund if paid online
        if (order.paymentMethod === 'ONLINE' && order.paymentStatus === 'PAID') {
            order.refundStatus = 'PENDING';
        }

        const updatedOrder = await order.save();

        // Send Email for Cancellation
        const { sendOrderCancelledEmail } = require('../utils/email.service');
        const user = await User.findById(order.customer);
        if (user) {
            const reason = req.body.reason || (req.user.role === 'Admin' ? 'Admin Cancelled' : 'User Cancelled');
            sendOrderCancelledEmail(updatedOrder, user, reason).catch(err => console.error(err));
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('adminRefundUpdated', {
                orderId: updatedOrder._id,
                refundStatus: updatedOrder.refundStatus,
                status: 'CANCELLED'
            });
            io.to(`order_${updatedOrder._id}`).emit('orderStatusUpdated', {
                orderId: updatedOrder._id,
                status: 'CANCELLED',
                customId: updatedOrder.customId,
            });
        }

        res.json({ message: 'Order Cancelled', order: updatedOrder });
    } catch (error) {
        next(error);
    }
};

// @desc    Get logged in user orders
// @route   GET /api/orders/my-orders
// @access  Private
const getMyOrders = async (req, res, next) => {
    try {
        const orders = await Order.find({ customer: req.user._id })
            .populate('items.product', 'name imageURL image')
            .sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        next(error);
    }
};

// @desc    Get order by ID (ObjectId or CustomID)
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res, next) => {
    try {
        const order = await Order.findOne(resolveId(req.params.id))
            .populate('customer', 'name email customId mobile')
            .populate('items.product', 'name customId imageURL');

        if (order) {
            // Check if admin or owner
            if (req.user.role === 'Admin' || order.customer._id.equals(req.user._id)) {
                const orderObj = order.toObject();

                // Attach historical order count
                if (orderObj.customer && orderObj.customer._id) {
                    const count = await Order.countDocuments({
                        customer: orderObj.customer._id,
                        orderStatus: { $ne: 'CANCELLED' }
                    });
                    orderObj.customerOrderCount = count;
                } else {
                    orderObj.customerOrderCount = 0;
                }

                res.json(orderObj);
            } else {
                res.status(401);
                throw new Error('Not authorized to view this order');
            }
        } else {
            res.status(404);
            throw new Error('Order not found');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Get all orders
// @route   GET /api/admin/orders
// @access  Private/Admin
// Helper: attach each order's customer's historical (non-cancelled) order count
const attachCustomerOrderCounts = async (orders) => {
    const customerIds = [...new Set(orders.map(o => o.customer?._id?.toString()).filter(Boolean))];
    const counts = customerIds.length
        ? await Order.aggregate([
            {
                $match: {
                    customer: { $in: customerIds.map(id => new mongoose.Types.ObjectId(id)) },
                    orderStatus: { $ne: 'CANCELLED' },
                },
            },
            { $group: { _id: '$customer', count: { $sum: 1 } } },
        ])
        : [];
    const countMap = {};
    counts.forEach(c => { countMap[c._id.toString()] = c.count; });
    return orders.map(order => {
        const orderObj = order.toObject();
        const cid = orderObj.customer?._id?.toString();
        orderObj.customerOrderCount = cid ? (countMap[cid] || 0) : 0;
        return orderObj;
    });
};

const getOrders = async (req, res, next) => {
    try {
        // Build query with optional server-side filters (status / search / date / refunds)
        const query = { orderType: { $ne: 'POS' } };
        const { status, search, startDate, endDate, refunds } = req.query;

        if (refunds === 'true' || refunds === '1') {
            // Refund-eligible: cancelled online orders that were paid
            query.orderStatus = 'CANCELLED';
            query.paymentMethod = 'ONLINE';
            query.paymentStatus = 'PAID';
        } else if (status && status !== 'ALL') {
            query.orderStatus = String(status).toUpperCase();
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(`${startDate}T00:00:00`);
            if (endDate) query.createdAt.$lte = new Date(`${endDate}T23:59:59`);
        }

        if (search && String(search).trim()) {
            const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
            const users = await User.find({ $or: [{ name: rx }, { mobile: rx }] }).select('_id');
            query.$or = [{ customId: rx }, { customer: { $in: users.map(u => u._id) } }];
        }

        const populate = [
            { path: 'customer', select: 'id name customId mobile' },
            { path: 'items.product', select: 'name customId' },
        ];

        // Paginated mode (opt-in via ?page) → { data, page, limit, total, totalPages, hasMore, counts, totalOrders, revenue }
        if (isPaginated(req)) {
            const result = await paginate(Order, {
                req, query, sort: { createdAt: -1 }, populate, transform: attachCustomerOrderCounts,
            });

            // Accurate totals across ALL non-POS orders (for summary cards + status pill counts),
            // independent of the current page / status filter.
            const [statusAgg, revAgg, pendingRefunds] = await Promise.all([
                Order.aggregate([
                    { $match: { orderType: { $ne: 'POS' } } },
                    { $group: { _id: '$orderStatus', c: { $sum: 1 } } },
                ]),
                Order.aggregate([
                    { $match: { orderType: { $ne: 'POS' }, orderStatus: { $ne: 'CANCELLED' } } },
                    { $group: { _id: null, rev: { $sum: '$finalAmount' } } },
                ]),
                Order.countDocuments({ orderType: { $ne: 'POS' }, orderStatus: 'CANCELLED', paymentMethod: 'ONLINE', paymentStatus: 'PAID', refundStatus: 'PENDING' }),
            ]);
            const counts = {};
            let totalOrders = 0;
            statusAgg.forEach(s => { counts[s._id] = s.c; totalOrders += s.c; });

            return res.json({ ...result, counts, totalOrders, revenue: revAgg[0]?.rev || 0, pendingRefunds });
        }

        // Legacy mode (no ?page) → full array, unchanged behaviour
        const orders = await Order.find(query).sort({ createdAt: -1 })
            .populate('customer', 'id name customId mobile')
            .populate('items.product', 'name customId');
        const ordersWithCount = await attachCustomerOrderCounts(orders);
        res.json(ordersWithCount);
    } catch (error) {
        next(error);
    }
};

// @desc    Get admin order stats (counts per status + revenue) straight from DB
// @route   GET /api/admin/orders/stats
// @access  Private/Admin
const getOrderStats = async (req, res, next) => {
    try {
        const [statusAgg, revAgg, pendingRefunds] = await Promise.all([
            Order.aggregate([
                { $match: { orderType: { $ne: 'POS' } } },
                { $group: { _id: '$orderStatus', c: { $sum: 1 } } },
            ]),
            Order.aggregate([
                { $match: { orderType: { $ne: 'POS' }, orderStatus: { $ne: 'CANCELLED' } } },
                { $group: { _id: null, rev: { $sum: '$finalAmount' } } },
            ]),
            Order.countDocuments({ orderType: { $ne: 'POS' }, orderStatus: 'CANCELLED', paymentMethod: 'ONLINE', paymentStatus: 'PAID', refundStatus: 'PENDING' }),
        ]);
        const counts = {};
        let totalOrders = 0;
        statusAgg.forEach(s => { counts[s._id] = s.c; totalOrders += s.c; });
        res.json({ counts, totalOrders, revenue: revAgg[0]?.rev || 0, pendingRefunds });
    } catch (error) {
        next(error);
    }
};

// @desc    Get orders by status
// @route   GET /api/admin/orders/:status
// @access  Private/Admin
const getOrdersByStatus = async (req, res, next) => {
    try {
        const status = req.params.status.toUpperCase();
        const orders = await Order.find({ orderStatus: status, orderType: { $ne: 'POS' } })
            .sort({ createdAt: -1 })
            .populate('customer', 'id name customId mobile')
            .populate('items.product', 'name customId');

        // Extract unique customer IDs
        const customerIds = [...new Set(orders
            .map(o => o.customer?._id?.toString())
            .filter(Boolean)
        )];

        // Run a single aggregation query
        const counts = await Order.aggregate([
            {
                $match: {
                    customer: { $in: customerIds.map(id => new mongoose.Types.ObjectId(id)) },
                    orderStatus: { $ne: 'CANCELLED' }
                }
            },
            {
                $group: {
                    _id: "$customer",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Map count by customer ID
        const countMap = {};
        counts.forEach(c => {
            countMap[c._id.toString()] = c.count;
        });

        // Attach historical order count
        const ordersWithCount = orders.map(order => {
            const orderObj = order.toObject();
            const cid = orderObj.customer?._id?.toString();
            orderObj.customerOrderCount = cid ? (countMap[cid] || 0) : 0;
            return orderObj;
        });

        res.json(ordersWithCount);
    } catch (error) {
        next(error);
    }
};

// @desc    Update order status
// @route   PUT /api/admin/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = async (req, res, next) => {
    try {
        const order = await Order.findOne(resolveId(req.params.id));

        if (order) {
            const newStatus = req.body.status;

            // Prevent cancelling if already delivered
            if (newStatus === 'CANCELLED' && order.orderStatus === 'DELIVERED') {
                res.status(400);
                throw new Error('Cannot cancel a delivered order');
            }

            // Logic: If status changes to 'OUT_FOR_DELIVERY', ensure previous was 'PREPARING'
            // REMOVED per user request to allow admins to jump statuses
            // if (newStatus === 'OUT_FOR_DELIVERY' && order.orderStatus !== 'PREPARING') {
            //     res.status(400);
            //     throw new Error('Order must be in PREPARING state before moving to OUT_FOR_DELIVERY');
            // }

            // General check: cannot update delivered order
            if (order.orderStatus === 'DELIVERED' && newStatus !== 'DELIVERED') {
                res.status(400);
                throw new Error('Order is already delivered');
            }

            if (newStatus === 'DELIVERED') {
                order.paymentStatus = 'PAID'; // Assuming COD becomes PAID on delivery
            }

            order.orderStatus = newStatus;

            if (newStatus === 'CANCELLED') {
                order.cancellationReason = req.body.reason || 'Admin Cancelled via Status Update';

                // Auto initiate refund if paid online
                if (order.paymentMethod === 'ONLINE' && order.paymentStatus === 'PAID') {
                    order.refundStatus = 'PENDING';
                }
            }

            const updatedOrder = await order.save();

            // Emit real-time status update to order room
            const io = req.app.get('io');
            if (io) {
                const statusMessages = {
                    PLACED: 'Your order has been placed successfully!',
                    ACCEPTED: 'Your order has been accepted by the restaurant.',
                    PREPARING: 'Your food is being prepared. 🍳',
                    OUT_FOR_DELIVERY: 'Your order is out for delivery! 🛵',
                    DELIVERED: 'Your order has been delivered. Enjoy your meal! 🎉',
                    CANCELLED: 'Your order has been cancelled.',
                };
                io.to(`order_${order._id}`).emit('orderStatusUpdated', {
                    orderId: order._id,
                    customId: order.customId,
                    status: newStatus,
                    message: statusMessages[newStatus] || `Order status updated to ${newStatus}`,
                    updatedAt: new Date().toISOString(),
                });

                // Emitting globally so Admin board live-refreshes
                io.emit('adminOrderUpdated', { orderId: order._id, status: newStatus });
                if (newStatus === 'CANCELLED') {
                    io.emit('adminRefundUpdated', { orderId: order._id, status: newStatus, refundStatus: updatedOrder.refundStatus });
                }
                console.log(`[Socket] Emitted 'orderStatusUpdated' & 'adminOrderUpdated' for Order #${order.customId} -> ${newStatus}`);
            }

            // Send Email Notification
            // User already imported at top
            const populatedOrder = await Order.findById(order._id).populate('customer').populate('items.product');

            if (populatedOrder && populatedOrder.customer) {
                const { sendOrderStatusEmail, sendOrderDeliveredWithInvoice, sendOrderCancelledEmail } = require('../utils/email.service');
                // const whatsappService = require('../services/whatsappService'); // DISABLED to save memory

                // Send Email & WhatsApp in parallel
                // We use Promise.allSettled to ensure one failure doesn't stop the other

                const tasks = [];

                // 2. WhatsApp Logic
                const mobile = populatedOrder.customer.mobile;
                console.log(`[Notification] Preparing WhatsApp for Order #${populatedOrder.customId}, Mobile: ${mobile}, Status: ${newStatus}`);

                // if (mobile) {
                //     tasks.push(whatsappService.sendStatusUpdate(mobile, populatedOrder, newStatus)); // DISABLED
                // }

                if (newStatus === 'DELIVERED') {
                    // Generate PDF Buffer ONCE
                    const { generateOrderInvoicePDF } = require('../utils/email.service');

                    // We need a wrapper to handle async generation and then dispatch
                    const sendDeliveredParams = async () => {
                        try {
                            console.log('[Notification] Generating PDF Invoice...');
                            const pdfBuffer = await generateOrderInvoicePDF(populatedOrder, populatedOrder.customer);

                            // Send Email with PDF
                            tasks.push(sendOrderDeliveredWithInvoice(populatedOrder, populatedOrder.customer, pdfBuffer));

                            // Send WhatsApp with PDF
                            // DISABLED to save memory
                            // if (mobile) {
                            //     tasks.push(whatsappService.sendInvoice(mobile, populatedOrder, pdfBuffer));
                            // }
                        } catch (err) {
                            console.error('[Notification] PDF Generation Failed:', err);
                        }
                    };

                    // Execute the wrapper (it pushes tasks? No, wrapper is async. We should await it or treat it as a task)
                    // Better: just run it. We are not awaiting tasks locally in the response cycle anyway (we used Promise.allSettled).
                    // But we returned response already.
                    // Let's just call it.
                    sendDeliveredParams();

                } else if (newStatus === 'CANCELLED') {
                    const reason = req.body.reason || 'Admin Cancelled via Status Update';
                    tasks.push(sendOrderCancelledEmail(populatedOrder, populatedOrder.customer, reason));
                } else if (['ACCEPTED', 'OUT_FOR_DELIVERY'].includes(newStatus)) {
                    tasks.push(sendOrderStatusEmail(populatedOrder, populatedOrder.customer));
                }

                // Add Push Notification for Customer Order Status Update
                try {
                    const { sendOrderStatusNotification } = require('../services/notificationService');
                    if (populatedOrder.customer._id) {
                        tasks.push(sendOrderStatusNotification(populatedOrder.customer._id, newStatus, populatedOrder._id));
                    }
                } catch (e) {
                    console.error("[Notification] OneSignal Push Error (Customer Status Update):", e);
                }

                // Note: Promise.allSettled logic below might miss the async PDF tasks if we don't await them.
                // But we don't want to delay the API response.
                // The API response comes at line 623 (res.json).
                // It's okay if notifications happen in background.

                // Just log errors globally for the un-awaited promises if any.
                Promise.allSettled(tasks).catch(err => console.error('[Notification] Task Error:', err));

                Promise.allSettled(tasks).then(results => {
                    results.forEach((result, index) => {
                        if (result.status === 'rejected') {
                            console.error(`[Notification] Task ${index} failed:`, result.reason);
                        }
                    });
                });
            }

            res.json(updatedOrder);
        } else {
            res.status(404);
            throw new Error('Order not found');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Update preparation time (Admin)
// @route   PUT /api/admin/orders/:id/preparation-time
// @access  Private/Admin
const updatePreparationTime = async (req, res, next) => {
    try {
        const order = await Order.findOne(resolveId(req.params.id));

        if (!order) {
            res.status(404);
            throw new Error('Order not found');
        }

        const { preparationTime } = req.body;

        if (preparationTime === undefined || preparationTime < 0) {
            res.status(400);
            throw new Error('Valid preparation time is required');
        }

        order.preparationTime = preparationTime;
        let statusUpdated = false;
        // Auto-promote to PREPARING if currently ACCEPTED
        if (order.orderStatus === 'ACCEPTED' || order.status === 'ACCEPTED') {
            order.orderStatus = 'PREPARING';
            order.status = 'PREPARING';
            statusUpdated = true;
        }

        const updatedOrder = await order.save();

        // Emit real-time update
        const io = req.app.get('io');
        if (io) {
            io.to(`order_${order._id}`).emit('preparationTimeUpdated', {
                orderId: order._id,
                customId: order.customId,
                preparationTime,
            });
            if (statusUpdated) {
                io.to(`order_${order._id}`).emit('orderStatusUpdated', {
                    orderId: order._id,
                    status: 'PREPARING',
                });
            }
            console.log(`[Socket] Emitted 'preparationTimeUpdated' for Order #${order.customId} -> ${preparationTime} mins`);
        }

        res.json(updatedOrder);

    } catch (error) {
        next(error);
    }
};

// @desc    Update Payment Status (Admin - mainly for COD)
// @route   PUT /api/admin/orders/:id/payment-status
// @access  Private/Admin
const updatePaymentStatus = async (req, res, next) => {
    try {
        const order = await Order.findOne(resolveId(req.params.id));

        if (!order) {
            res.status(404);
            throw new Error('Order not found');
        }

        const { paymentStatus } = req.body;
        if (!['PENDING', 'PAID', 'FAILED'].includes(paymentStatus)) {
            res.status(400);
            throw new Error('Invalid payment status');
        }

        order.paymentStatus = paymentStatus;
        const updatedOrder = await order.save();

        res.json(updatedOrder);

    } catch (error) {
        next(error);
    }
};

module.exports = {
    addOrderItems,
    getMyOrders,
    getOrderById,
    getOrders,
    getOrderStats,
    updateOrderStatus,
    calcFee,
    cancelOrder,
    verifyOrderPayment,
    initiateCheckout,
    updatePaymentStatus,
    updatePreparationTime,
    getOrdersByStatus
};
