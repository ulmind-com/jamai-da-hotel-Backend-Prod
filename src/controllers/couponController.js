const Coupon = require('../models/Coupon');
const User = require('../models/User');
const schedule = require('node-schedule');
const { sendCouponBroadcast } = require('../utils/email.service');
const { scheduleCouponBlast, cancelCouponBlast } = require('../utils/schedulerUtils');

// @desc    Create a coupon
// @route   POST /api/coupons
// @access  Private/Admin
const createCoupon = async (req, res, next) => {
    try {
        let {
            code,
            name,
            description,
            discountType,
            discountAmount,
            discountPercent, // Accept this field
            minOrderValue,
            validFrom,
            validUntil,
            usageLimit,
            userUsageLimit,
        } = req.body;

        // Map discountPercent to discountAmount if provided for PERCENTAGE type
        if (discountType === 'PERCENTAGE' && discountPercent !== undefined) {
            discountAmount = discountPercent;
        }

        // basic validation
        if (new Date(validFrom) < new Date() && Math.abs(new Date(validFrom) - new Date()) > 60000) {
            // Allow if it's "just now" (within 1 min tolerance), else block past dates? 
            // Actually, standard practice: validFrom can be in the past (active immediately).
            // But for scheduling email, if it's in the past, we should send immediately.
        }

        if (new Date(validUntil) <= new Date(validFrom)) {
            res.status(400);
            throw new Error('End date must be after start date');
        }

        const couponExists = await Coupon.findOne({ code });

        if (couponExists) {
            res.status(400);
            throw new Error('Coupon already exists');
        }

        const coupon = await Coupon.create({
            code,
            name,
            description,
            discountType,
            discountAmount,
            minOrderValue,
            validFrom,
            validUntil,
            usageLimit,
            userUsageLimit,
        });

        // Scheduling Logic
        const startDate = new Date(validFrom);
        const now = new Date();

        const scheduleEmailBlast = async () => {
            console.log(`Starting Coupon Blast for ${coupon.code}`);
            try {
                const users = await User.find({}, 'email name');
                const chunkSize = 50;

                for (let i = 0; i < users.length; i += chunkSize) {
                    const chunk = users.slice(i, i + chunkSize);
                    // Updated to use the new template function
                    const promises = chunk.map(user => sendCouponBroadcast(user, coupon));
                    await Promise.all(promises);
                    console.log(`Sent batch ${i / chunkSize + 1}`);
                }
                console.log("Coupon Blast Sent Successfully");
            } catch (err) {
                console.error("Error in Coupon Blast:", err);
            }
        };

        // If validFrom is in the past (or close to now), send immediately.
        // let's say "close to now" is within last 1 minute or future is less than 1 min away?
        // Simpler: If startDate <= now, send immediately.
        if (startDate <= now) {
            scheduleEmailBlast(); // Run async, don't await blocking response
        } else {
            // Schedule it
            schedule.scheduleJob(startDate, scheduleEmailBlast);
            console.log(`Coupon blast scheduled for ${startDate}`);
        }

        res.status(201).json(coupon);
    } catch (error) {
        next(error);
    }
};

// @desc    Validate a coupon
// @route   POST /api/coupons/validate
// @access  Private
const validateCoupon = async (req, res, next) => {
    try {
        const { code, cartValue } = req.body;
        const coupon = await Coupon.findOne({ code, isActive: true });

        if (!coupon) {
            res.status(404);
            throw new Error('Invalid or inactive coupon code');
        }

        const currentDate = new Date();
        if (currentDate < coupon.validFrom || currentDate > coupon.validUntil) {
            res.status(400);
            throw new Error('Coupon is expired or not yet valid');
        }

        if (coupon.usageLimit !== null && coupon.usageLimit <= 0) {
            res.status(400);
            throw new Error('Coupon global usage limit exceeded');
        }

        // Min Order Value check
        if (cartValue < coupon.minOrderValue) {
            res.status(400);
            throw new Error(`Minimum order value of ₹${coupon.minOrderValue} required`);
        }

        // Logic to calculate discount
        let discount = 0;
        if (coupon.discountType === 'PERCENTAGE') {
            discount = (cartValue * coupon.discountAmount) / 100;
            // Optional: Cap the max discount amount if needed (not in requirements but good practice)
        } else {
            discount = coupon.discountAmount;
        }

        res.json({
            code: coupon.code,
            name: coupon.name,
            discountType: coupon.discountType,
            discountAmount: coupon.discountAmount,
            discountPercent: coupon.discountType === 'PERCENTAGE' ? coupon.discountAmount : undefined,
            discount: discount,
            valid: true
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all coupons
// @route   GET /api/coupons
// @access  Private
const getCoupons = async (req, res, next) => {
    try {
        let query = {};

        // If not admin, show only active and valid coupons
        if (req.user.role !== 'Admin') {
            const now = new Date();
            query = {
                isActive: true,
                validFrom: { $lte: now },
                validUntil: { $gte: now },
            };
        }

        const coupons = await Coupon.find(query).sort({ validUntil: 1 }).lean(); // Use lean for performance & modification

        // Transform response to include discountPercent
        const formattedCoupons = coupons.map(coupon => ({
            ...coupon,
            discountPercent: coupon.discountType === 'PERCENTAGE' ? coupon.discountAmount : undefined
        }));

        res.json(formattedCoupons);
    } catch (error) {
        next(error);
    }
};

// @desc    Update a coupon
// @route   PUT /api/coupons/:id
// @access  Private/Admin
// @desc    Update a coupon
// @route   PUT /api/coupons/:id
// @access  Private/Admin
const updateCoupon = async (req, res, next) => {
    try {
        const coupon = await Coupon.findById(req.params.id);

        if (!coupon) {
            res.status(404);
            throw new Error('Coupon not found');
        }

        // Update fields
        let {
            code,
            name,
            description,
            discountType,
            discountAmount,
            discountPercent, // Accept this
            minOrderValue,
            validFrom,
            validUntil,
            usageLimit,
            userUsageLimit,
            isActive
        } = req.body;

        // Map discountPercent if provided
        if ((discountType === 'PERCENTAGE' || coupon.discountType === 'PERCENTAGE') && discountPercent !== undefined) {
            discountAmount = discountPercent;
        }

        // Check if important fields changed to trigger reschedule
        const oldValidFrom = new Date(coupon.validFrom).getTime();
        const newValidFrom = validFrom ? new Date(validFrom).getTime() : oldValidFrom;
        const oldIsActive = coupon.isActive;
        const newIsActive = isActive !== undefined ? isActive : oldIsActive;

        coupon.code = code || coupon.code;
        coupon.name = name || coupon.name;
        coupon.description = description || coupon.description;
        coupon.discountType = discountType || coupon.discountType;
        coupon.discountAmount = discountAmount !== undefined ? discountAmount : coupon.discountAmount;
        coupon.minOrderValue = minOrderValue || coupon.minOrderValue;
        coupon.validFrom = validFrom || coupon.validFrom;
        coupon.validUntil = validUntil || coupon.validUntil;
        coupon.usageLimit = usageLimit !== undefined ? usageLimit : coupon.usageLimit;
        coupon.userUsageLimit = userUsageLimit !== undefined ? userUsageLimit : coupon.userUsageLimit;

        if (isActive !== undefined) {
            coupon.isActive = isActive;
        }

        // If date changed or reactivated, reset broadcast status to allow re-sending? 
        // User requested: "when do edit and change date time for active it also send email"
        // So we assume if validFrom is changed, we treat it as a new event if it hasn't happened yet or even if it has.
        // But to avoid spam, maybe only if validFrom is updated to a future date?
        // Let's reset isBroadcasted to false if validFrom changes effectively.
        if (newValidFrom !== oldValidFrom) {
            coupon.isBroadcasted = false;
        }

        // If reactivating, maybe we want to send it?
        if (newIsActive === true && oldIsActive === false && !coupon.isBroadcasted) {
            // Will be picked up by scheduler
        }

        const updatedCoupon = await coupon.save();

        if (updatedCoupon.isActive) {
            scheduleCouponBlast(updatedCoupon);
        } else {
            cancelCouponBlast(updatedCoupon.code);
        }

        res.json(updatedCoupon);



        res.json(updatedCoupon);
    } catch (error) {
        next(error);
    }
};

// @desc    Delete a coupon
// @route   DELETE /api/coupons/:id
// @access  Private/Admin
const deleteCoupon = async (req, res, next) => {
    try {
        const coupon = await Coupon.findById(req.params.id);

        if (!coupon) {
            res.status(404);
            throw new Error('Coupon not found');
        }

        await coupon.deleteOne();
        res.json({ message: 'Coupon removed' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createCoupon,
    validateCoupon,
    getCoupons,
    updateCoupon,
    deleteCoupon
};
