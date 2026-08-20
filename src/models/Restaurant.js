const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema(
    {
        isOpen: {
            type: Boolean,
            default: true,
        },
        openingTime: {
            type: String,
            default: "10:00", // HH:mm format
        },
        closingTime: {
            type: String,
            default: "22:00",
        },
        isCodEnabled: {
            type: Boolean,
            default: true,
        },
        codStartTime: {
            type: String,
            default: "00:00", // Start of offline window
        },
        codEndTime: {
            type: String,
            default: "00:00", // End of offline window
        },
        name: {
            type: String,
            default: 'My Restaurant',
        },
        address: {
            type: String,
        },
        location: {
            lat: Number,
            lng: Number,
        },
        deliveryRadius: {
            type: Number,
            default: 10, // km
        },
        freeDeliveryRadius: {
            type: Number,
            default: 2, // km
        },
        chargePerKm: {
            type: Number,
            default: 10, // ₹
        },
        gstIn: {
            type: String,
            default: null,
        },
        fssaiLicense: {
            type: String,
            default: null,
        },
        logo: {
            type: String,
            default: null, // URL to logo
        },
        mobile: {
            type: String,
            default: null, // Contact number for the restaurant
        },
        heroVideos: {
            type: [String],
            default: [],
            validate: {
                validator: function (arr) {
                    return arr.length <= 3;
                },
                message: 'Maximum 3 hero videos allowed',
            },
        },
    },
    {
        timestamps: true,
    }
);

// Singleton pattern: ensure only one document exists??
// Or just handle it in controller.

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

module.exports = Restaurant;
