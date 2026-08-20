const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { paginate, isPaginated } = require('../utils/paginate');

// @desc    Get Admin Dashboard Stats
// @route   GET /api/admin/dashboard
// @access  Private/Admin
// Helper to get IST Start and End of Day (in UTC Date objects)
const getISTDateRange = (specificDate = new Date()) => {
    // 1. Get current time in IST
    // We explicitly convert to IST string, then parse back
    const istString = specificDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const istDate = new Date(istString);

    // 2. Set to Start of Day (00:00:00)
    const startIST = new Date(istDate);
    startIST.setHours(0, 0, 0, 0);

    // 3. Set to End of Day (23:59:59)
    const endIST = new Date(istDate);
    endIST.setHours(23, 59, 59, 999);

    // 4. Convert BACK to UTC by subtracting the offset (5h 30m)
    // Actually, since we created 'startIST' from a string like "2/18/2026, 10:00:00 PM",
    // JS assumes that 'startIST' is in *Local System Time* (which might be UTC).
    // But conceptually, 'startIST' holds the correct *value* for IST clock.
    // Wait, the safest way is to use generic date manipulation.

    // Better approach:
    // Create Date from UTC, offset by -5.5 hours? No.

    // Let's stick to simple offset math.
    const offset = 5.5 * 60 * 60 * 1000;

    // Current UTC time
    const nowUTC = specificDate.getTime();
    // Current IST time = UTC + 5.5
    const nowIST = nowUTC + offset;

    // Start of Day in IST (number)
    const startISTTime = new Date(nowIST).setUTCHours(0, 0, 0, 0);
    const endISTTime = new Date(nowIST).setUTCHours(23, 59, 59, 999);

    // Convert back to absolute UTC for DB Query
    // DB stores UTC. So if IST is 00:00, UTC is -5:30.
    const startQuery = new Date(startISTTime - offset);
    const endQuery = new Date(endISTTime - offset);

    return { start: startQuery, end: endQuery };
};

// @desc    Get Admin Dashboard Stats
// @route   GET /api/admin/dashboard
// @access  Private/Admin
const getDashboardStats = async (req, res, next) => {
    try {
        // 1. Total Revenue (All Time)
        const revenue = await Order.aggregate([
            {
                $match: {
                    orderStatus: { $ne: 'CANCELLED' },
                    $or: [{ paymentStatus: 'PAID' }, { orderStatus: 'DELIVERED' }],
                },
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$finalAmount' },
                },
            },
        ]);

        // 2. Today's Revenue & Orders Count (IST)
        const { start: startToday, end: endToday } = getISTDateRange();

        // Parallelize today's aggregation
        const [todaysRevenueAgg, todaysOrdersCount] = await Promise.all([
            Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startToday, $lte: endToday },
                        orderStatus: { $ne: 'CANCELLED' },
                        $or: [{ paymentStatus: 'PAID' }, { orderStatus: 'DELIVERED' }],
                    },
                },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$finalAmount' },
                    },
                },
            ]),
            Order.countDocuments({
                createdAt: { $gte: startToday, $lte: endToday },
                orderStatus: { $ne: 'CANCELLED' }
            })
        ]);

        // 3. Total Orders Count (Non-cancelled)
        const totalOrders = await Order.countDocuments({ orderStatus: { $ne: 'CANCELLED' } });

        // 3b. Settled offline POS bills (new POS system) — add to revenue for consistency.
        const PosBill = require('../models/PosBill');
        const [posBillTotalAgg, posBillTodayAgg] = await Promise.all([
            PosBill.aggregate([{ $match: { status: 'settled' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
            PosBill.aggregate([{ $match: { status: 'settled', settledAt: { $gte: startToday, $lte: endToday } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
        ]);
        const posBillTotal = posBillTotalAgg[0] ? posBillTotalAgg[0].total : 0;
        const posBillToday = posBillTodayAgg[0] ? posBillTodayAgg[0].total : 0;

        // 4. Top Selling Items
        const topSellingItems = await Order.aggregate([
            { $match: { orderStatus: { $ne: 'CANCELLED' } } },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.product',
                    totalQuantity: { $sum: '$items.quantity' },
                },
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 3 }, // Top 3
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'productDetails',
                },
            },
            {
                $project: {
                    _id: 1,
                    totalQuantity: 1,
                    name: { $arrayElemAt: ['$productDetails.name', 0] },
                    imageURL: { $arrayElemAt: ['$productDetails.imageURL', 0] },
                },
            },
        ]);

        // 5. Recent 5 Orders
        const recentOrders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('customer', 'name');

        res.json({
            totalRevenue: (revenue[0] ? revenue[0].totalRevenue : 0) + posBillTotal,
            todaysRevenue: (todaysRevenueAgg[0] ? todaysRevenueAgg[0].revenue : 0) + posBillToday,
            totalOrders,
            todaysOrders: todaysOrdersCount,
            topSellingItems,
            recentOrders,
        });
    } catch (error) {
        next(error);
    }
};

// Helper to interpret a date string as IST and convert to UTC Date
const parseDateAsIST = (dateStr, isEndOfDay = false) => {
    // If it's a full ISO string with timezone (e.g. 2026-02-18T10:00:00+05:30), rely on Date constructor
    if (dateStr.includes('+') || dateStr.endsWith('Z')) {
        return new Date(dateStr);
    }

    // If it's a simple date string (YYYY-MM-DD) or datetime without offset
    // We assume the user meant this time IN IST.
    // E.g. "2026-02-18" -> 2026-02-18 00:00:00 IST

    const dateObj = new Date(dateStr);

    // If invalid
    if (isNaN(dateObj.getTime())) return new Date(); // Fallback?

    if (isEndOfDay) {
        // Set to 23:59:59.999 "Local" (which we treat as IST)
        dateObj.setHours(23, 59, 59, 999);
    } else {
        // Set to 00:00:00.000
        dateObj.setHours(0, 0, 0, 0);
    }

    // Now, dateObj holds the correct "Clock Time" but in the Server's timezone (likely UTC/Local).
    // The user MEANT this clock time to be IST.
    // IST is UTC + 5:30. 
    // So 00:00 IST = previous day 18:30 UTC.
    // If Server interprets "2026-02-18 00:00" as UTC, we need to subtract 5.5 hours to get the actual UTC timestamp of 00:00 IST.

    // HOWEVER, if the server itself is in IST (which metadata says it is), 
    // then 'new Date("2026-02-18")' MIGHT already be 00:00 IST (UTC-5.5).
    // Let's rely on the offset manually to be safe and server-agnostic/consistent.

    // 1. Get the Timestamp of the "Clock Time" assuming it was UTC
    // We use getUTC* methods to reconstruct the "Clock Time" integers
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const day = dateObj.getDate();
    const hours = dateObj.getHours();
    const minutes = dateObj.getMinutes();
    const seconds = dateObj.getSeconds();

    // 2. Create a UTC date with these exact components
    const utcRepresentation = Date.UTC(year, month, day, hours, minutes, seconds);

    // 3. Subtract 5.5 hours (IST Offset) to get the actual Point-in-Time
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const actualTimestamp = utcRepresentation - istOffsetMs;

    return new Date(actualTimestamp);
};

// @desc    Get Advanced Analytics (Custom Date Range)
// @route   GET /api/admin/analytics
// @access  Private/Admin
const getAnalytics = async (req, res, next) => {
    try {
        let { startDate, endDate } = req.query;
        let start, end;

        // Default to Today (IST) if no dates provided
        if (!startDate || !endDate) {
            const range = getISTDateRange();
            start = range.start;
            end = range.end;
        } else {
            // Respect provided dates but interpret them as IST
            // e.g. startDate="2026-02-18" -> 00:00 IST
            // endDate="2026-02-18" -> 23:59 IST (if we treat endDate as inclusive whole day? Usually analytics range is inclusive)
            // If the user sends "2026-02-18" for both, they expect the full day.

            // Note: If frontend sends full ISO timestamps, our helper might strip time if we just use setHours(0,0,0,0).
            // But usually custom range picker sends YYYY-MM-DD.
            // Let's assume startDate is Start of that day, endDate is End of that day.

            start = parseDateAsIST(startDate, false);
            end = parseDateAsIST(endDate, true); // Treat endDate as end of that day (inclusive)
        }

        // 1. Revenue
        const revenueStats = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: start, $lte: end },
                    orderStatus: { $ne: 'CANCELLED' },
                    $or: [{ paymentStatus: 'PAID' }, { orderStatus: 'DELIVERED' }]
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$finalAmount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // 2. Total Orders (Volume) - Non-cancelled
        const totalOrders = await Order.countDocuments({
            createdAt: { $gte: start, $lte: end },
            orderStatus: { $ne: 'CANCELLED' }
        });

        // 2b. Settled offline POS bills in range — add to revenue for consistency.
        const PosBillAn = require('../models/PosBill');
        const posBillRangeAgg = await PosBillAn.aggregate([
            { $match: { status: 'settled', settledAt: { $gte: start, $lte: end } } },
            { $group: { _id: null, total: { $sum: '$total' } } },
        ]);
        const posBillRange = posBillRangeAgg[0] ? posBillRangeAgg[0].total : 0;

        // 3. New Signups (Details)
        const newUsers = await User.find({
            createdAt: { $gte: start, $lte: end },
            role: 'Customer'
        }).select('name email mobile createdAt profileImage').sort({ createdAt: -1 });

        // 4. Top Selling Items (in this period)
        const topItems = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: start, $lte: end },
                    orderStatus: { $ne: 'CANCELLED' }
                }
            },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.product',
                    totalSold: { $sum: '$items.quantity' },
                    revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            {
                $project: {
                    _id: 1,
                    name: { $arrayElemAt: ['$product.name', 0] },
                    totalSold: 1,
                    revenue: 1,
                    imageURL: { $arrayElemAt: ['$product.imageURL', 0] }
                }
            }
        ]);

        // 5. Order Status Breakdown
        const statusBreakdownAgg = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: '$orderStatus',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Ensure all statuses are present
        const allStatuses = ['PLACED', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
        const statusBreakdown = {};
        allStatuses.forEach(s => statusBreakdown[s] = 0);

        statusBreakdownAgg.forEach(item => {
            statusBreakdown[item._id] = item.count;
        });

        res.json({
            period: { startDate: start, endDate: end },
            revenue: (revenueStats[0] ? revenueStats[0].totalRevenue : 0) + posBillRange,
            paidOrdersCount: revenueStats[0] ? revenueStats[0].count : 0,
            totalOrders,
            newUsersCount: newUsers.length,
            newUsers: newUsers,
            topItems,
            statusBreakdown
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Create a new POS (Offline) Order
// @route   POST /api/admin/pos/create
// @access  Private/Admin
const createPOSOrder = async (req, res, next) => {
    try {
        const { items, customerName, customerMobile, paymentMethod, discountType, discountValue } = req.body;

        if (!items || items.length === 0) {
            res.status(400);
            throw new Error('No order items provided');
        }

        let totalAmount = 0;
        let cgstTotal = 0;
        let sgstTotal = 0;
        let igstTotal = 0;

        // Verify and process items against the DB
        for (let i = 0; i < items.length; i++) {
            const productDoc = await Product.findById(items[i].product);
            if (!productDoc) {
                res.status(400);
                throw new Error(`Product not found: ${items[i].product}`);
            }

            const variantName = items[i].variant || 'Standard';
            const variant = productDoc.variants.find(v => v.name === variantName);
            const price = variant ? variant.price : (productDoc.variants[0]?.price || 0);

            if (price === 0) {
                res.status(400);
                throw new Error(`Invalid price for product ${productDoc.name}`);
            }

            items[i].price = price; // Ensure verified price
            const itemTotal = price * items[i].quantity;
            totalAmount += itemTotal;

            // Taxes
            const c = (itemTotal * (productDoc.cgst || 0)) / 100;
            const s = (itemTotal * (productDoc.sgst || 0)) / 100;
            const iVal = (itemTotal * (productDoc.igst || 0)) / 100;

            items[i].cgst = productDoc.cgst;
            items[i].sgst = productDoc.sgst;
            items[i].igst = productDoc.igst;

            cgstTotal += c;
            sgstTotal += s;
            igstTotal += iVal;
        }

        const taxAmount = cgstTotal + sgstTotal + igstTotal;
        const subtotalWithTax = totalAmount + taxAmount;

        // Calculate discount
        let discountAmount = 0;
        if (discountType === 'FLAT' && discountValue > 0) {
            discountAmount = Math.min(discountValue, subtotalWithTax); // Can't discount more than total
        } else if (discountType === 'PERCENTAGE' && discountValue > 0) {
            discountAmount = Math.min((subtotalWithTax * discountValue) / 100, subtotalWithTax);
        }
        discountAmount = Math.round(discountAmount * 100) / 100; // Round to 2 decimals

        const finalAmount = Math.ceil(subtotalWithTax - discountAmount);

        // Map items exactly as the schema requires
        const orderItems = items.map(item => ({
            product: item.product,
            variant: item.variant || 'Standard',
            quantity: item.quantity,
            price: item.price,
            cgst: item.cgst,
            sgst: item.sgst,
            igst: item.igst
        }));

        const newOrder = new Order({
            orderType: 'POS',
            items: orderItems,
            totalAmount,
            taxAmount,
            cgstTotal,
            sgstTotal,
            igstTotal,
            discountApplied: discountAmount,
            discountType: discountType || 'NONE',
            discountValue: discountValue || 0,
            deliveryFee: 0,
            finalAmount,
            paymentMethod: paymentMethod || 'CASH',
            paymentStatus: 'PAID',
            orderStatus: 'DELIVERED', // Automatically fulfilled
            customerName: customerName || 'Walk-in Customer',
            customerMobile: customerMobile || '',
        });

        const createdOrder = await newOrder.save();

        res.status(201).json(createdOrder);
    } catch (error) {
        next(error);
    }
};

// @desc    Get all POS (Offline) Orders
// @route   GET /api/admin/pos/orders
// @access  Private/Admin
const getPOSOrders = async (req, res, next) => {
    try {
        const query = { orderType: 'POS' };
        const populate = [{ path: 'items.product', select: 'name imageURL isVeg type' }];

        if (isPaginated(req)) {
            const result = await paginate(Order, { req, query, sort: { createdAt: -1 }, populate });
            return res.json(result);
        }

        const posOrders = await Order.find(query)
            .populate('items.product', 'name imageURL isVeg type')
            .sort({ createdAt: -1 });
        res.json(posOrders);
    } catch (error) {
        next(error);
    }
};

// @desc    Get Geo-Spatial Analytics (Orders on Map)
// @route   GET /api/admin/analytics/map
// @access  Private/Admin
const getMapAnalytics = async (req, res, next) => {
    try {
        let { startDate, endDate } = req.query;
        let start, end;

        if (startDate && endDate) {
            start = parseDateAsIST(startDate, false);
            end = parseDateAsIST(endDate, true);
        }

        const matchStage = {
            'deliveryCoordinates.lat': { $exists: true, $ne: null },
            'deliveryCoordinates.lng': { $exists: true, $ne: null },
        };

        if (start && end) {
            matchStage.createdAt = { $gte: start, $lte: end };
        }

        const orders = await Order.find(matchStage)
            .select('deliveryCoordinates finalAmount orderStatus createdAt customId')
            .populate('customer', 'name mobile profileImage')
            .sort({ createdAt: -1 })
            .limit(2000); // 2000 nodes is heavy but viable for map

        const mapData = orders.map(o => ({
            id: o._id,
            customId: o.customId || o._id.toString().slice(-6).toUpperCase(),
            lat: o.deliveryCoordinates.lat,
            lng: o.deliveryCoordinates.lng,
            amount: o.finalAmount || 0,
            status: o.orderStatus,
            customerName: o.customer ? o.customer.name : 'Unknown',
            customerMobile: o.customer ? o.customer.mobile : 'N/A',
            customerImage: o.customer ? o.customer.profileImage : '',
            createdAt: o.createdAt,
        }));

        res.json(mapData);
    } catch (error) {
        next(error);
    }
};

// @desc    Process a Pending Refund
// @route   PUT /api/admin/orders/:id/refund
// @access  Private/Admin
const processRefund = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const query = require('mongoose').Types.ObjectId.isValid(orderId) ? { _id: orderId } : { customId: orderId };

        const order = await Order.findOne(query);

        if (!order) {
            res.status(404);
            throw new Error('Order not found');
        }

        if (order.refundStatus === 'PROCESSED') {
            res.status(400);
            throw new Error('Refund already processed');
        }

        const isEligible = order.orderStatus === 'CANCELLED' &&
            order.paymentMethod === 'ONLINE' &&
            order.paymentStatus === 'PAID';

        if (order.refundStatus === 'NO_REFUND' && !isEligible) {
            res.status(400);
            throw new Error('Order is not eligible for a refund');
        }



        order.refundStatus = 'PROCESSED';
        order.refundProcessedAt = new Date();

        const updatedOrder = await order.save();

        // Emit real-time status update to order room and admin room
        const io = req.app.get('io');
        if (io) {
            io.to(`order_${updatedOrder._id}`).emit('refundStatusUpdated', {
                orderId: updatedOrder._id,
                customId: updatedOrder.customId,
                refundStatus: 'PROCESSED',
                refundProcessedAt: updatedOrder.refundProcessedAt,
            });
            // Emit globally so admin dashboards catch it too
            io.emit('adminRefundUpdated', {
                orderId: updatedOrder._id,
                refundStatus: 'PROCESSED',
            });
        }

        res.json(updatedOrder);

    } catch (error) {
        next(error);
    }
};

module.exports = { getDashboardStats, getAnalytics, getMapAnalytics, createPOSOrder, getPOSOrders, processRefund };
