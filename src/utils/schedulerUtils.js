const schedule = require('node-schedule');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const { sendCouponBroadcast } = require('./email.service');

// Store active jobs to cancel them if needed (key: coupon code)
const scheduledJobs = {};

const scheduleCouponBlast = (coupon) => {
    // Cancel existing job if any
    if (scheduledJobs[coupon.code]) {
        scheduledJobs[coupon.code].cancel();
        console.log(`Cancelled existing scheduled blast for ${coupon.code}`);
        delete scheduledJobs[coupon.code];
    }

    if (coupon.isBroadcasted) {
        console.log(`Coupon ${coupon.code} already broadcasted. Skipping schedule.`);
        return;
    }

    const startDate = new Date(coupon.validFrom);
    const now = new Date();

    const executeBlast = async () => {
        console.log(`Executing Coupon Blast for ${coupon.code}`);
        try {
            const users = await User.find({}, 'email name');
            const chunkSize = 50;

            for (let i = 0; i < users.length; i += chunkSize) {
                const chunk = users.slice(i, i + chunkSize);
                const promises = chunk.map(user => sendCouponBroadcast(user, coupon));
                await Promise.all(promises);
                console.log(`Sent batch ${i / chunkSize + 1} for ${coupon.code}`);
            }
            console.log(`Coupon Blast Sent Successfully for ${coupon.code}`);

            // Mark as broadcasted
            coupon.isBroadcasted = true;
            await coupon.save();

            // Allow re-scheduling only if manually reset later, but for now job is done
            delete scheduledJobs[coupon.code];

        } catch (err) {
            console.error(`Error in Coupon Blast for ${coupon.code}:`, err);
        }
    };

    if (startDate <= now) {
        console.log(`Coupon ${coupon.code} start time passed. Sending immediately.`);
        executeBlast();
    } else {
        const job = schedule.scheduleJob(startDate, executeBlast);
        scheduledJobs[coupon.code] = job;
        console.log(`Scheduled blast for ${coupon.code} at ${startDate}`);
    }
};

const cancelCouponBlast = (couponCode) => {
    if (scheduledJobs[couponCode]) {
        scheduledJobs[couponCode].cancel();
        delete scheduledJobs[couponCode];
        console.log(`Cancelled scheduled blast for ${couponCode}`);
    }
};

const rescheduleCouponBlasts = async () => {
    try {
        const now = new Date();
        const pendingCoupons = await Coupon.find({
            isActive: true, // Only schedule if active
            isBroadcasted: false,
            validUntil: { $gt: now }
        });

        console.log(`Found ${pendingCoupons.length} pending coupon blasts to reschedule.`);
        pendingCoupons.forEach(coupon => scheduleCouponBlast(coupon));

    } catch (error) {
        console.error('Error rescheduling coupon blasts:', error);
    }
};

const initRestaurantCron = () => {
    // Run every minute
    schedule.scheduleJob('* * * * *', async () => {
        try {
            const restaurant = await Restaurant.findOne();
            if (!restaurant) return;

            if (!restaurant.openingTime || !restaurant.closingTime) return;

            // Get current IST time in HH:mm format
            const now = new Date();
            const istTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
            const currentHhMm = String(istTime.getHours()).padStart(2, '0') + ':' + String(istTime.getMinutes()).padStart(2, '0');

            // Toggle logic directly matched to minute to allow manual overrides in between
            if (currentHhMm === restaurant.openingTime && !restaurant.isOpen) {
                console.log(`[Auto-Schedule] Opening restaurant at ${currentHhMm}`);
                restaurant.isOpen = true;
                await restaurant.save();

                // Optional: broadcast to sockets if you have global state tracking it here
            } else if (currentHhMm === restaurant.closingTime && restaurant.isOpen) {
                console.log(`[Auto-Schedule] Closing restaurant at ${currentHhMm}`);
                restaurant.isOpen = false;
                await restaurant.save();
            }
        } catch (error) {
            console.error('[Auto-Schedule] Error checking restaurant hours:', error);
        }
    });
    console.log('[Scheduler] Restaurant Auto-Open/Close Cron Initialized');
};

module.exports = { rescheduleCouponBlasts, scheduleCouponBlast, cancelCouponBlast, initRestaurantCron };
