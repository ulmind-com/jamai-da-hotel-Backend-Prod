const Restaurant = require('../models/Restaurant');

// Helper to get the single restaurant instance
const getRestaurantInstance = async () => {
    let restaurant = await Restaurant.findOne();
    if (!restaurant) {
        restaurant = await Restaurant.create({ name: 'My Restaurant' });
    }
    return restaurant;
};

// @desc    Get restaurant info and status
// @route   GET /api/restaurant
// @access  Public
const getRestaurant = async (req, res, next) => {
    try {
        const restaurant = await getRestaurantInstance();
        res.json(restaurant);
    } catch (error) {
        next(error);
    }
};

// @desc    Update restaurant info (including Open/Close status)
// @route   PUT /api/restaurant
// @access  Private/Admin
const updateRestaurant = async (req, res, next) => {
    try {
        const { isOpen, openingTime, closingTime, isCodEnabled, codStartTime, codEndTime, name, address, location, deliveryRadius, freeDeliveryRadius, chargePerKm, gstIn, fssaiLicense, logo, mobile } = req.body;
        const restaurant = await getRestaurantInstance();

        restaurant.isOpen = isOpen !== undefined ? isOpen : restaurant.isOpen;
        restaurant.openingTime = openingTime || restaurant.openingTime;
        restaurant.closingTime = closingTime || restaurant.closingTime;

        if (isCodEnabled !== undefined) restaurant.isCodEnabled = isCodEnabled;
        if (codStartTime !== undefined) restaurant.codStartTime = codStartTime;
        if (codEndTime !== undefined) restaurant.codEndTime = codEndTime;
        restaurant.name = name || restaurant.name;
        restaurant.address = address || restaurant.address;
        if (location) restaurant.location = location;
        restaurant.deliveryRadius = deliveryRadius !== undefined ? deliveryRadius : restaurant.deliveryRadius;
        restaurant.freeDeliveryRadius = freeDeliveryRadius !== undefined ? freeDeliveryRadius : restaurant.freeDeliveryRadius;
        restaurant.chargePerKm = chargePerKm !== undefined ? chargePerKm : restaurant.chargePerKm;
        restaurant.gstIn = gstIn || restaurant.gstIn; // Update GST
        restaurant.fssaiLicense = fssaiLicense || restaurant.fssaiLicense; // Update FSSAI
        restaurant.logo = logo || restaurant.logo; // Update Logo
        restaurant.mobile = mobile || restaurant.mobile; // Update Mobile

        const updatedRestaurant = await restaurant.save();
        res.json(updatedRestaurant);
    } catch (error) {
        next(error);
    }
};

// @desc    Set restaurant location (lat/lng) - Admin
// @route   PUT /api/restaurant/location
// @access  Private/Admin
const setRestaurantLocation = async (req, res, next) => {
    try {
        const { lat, lng, address } = req.body;

        if (!lat || !lng) {
            res.status(400);
            throw new Error('lat and lng are required');
        }

        const restaurant = await getRestaurantInstance();
        restaurant.location = { lat: parseFloat(lat), lng: parseFloat(lng) };
        if (address) restaurant.address = address;

        const updated = await restaurant.save();

        res.json({
            message: 'Restaurant location updated successfully',
            location: updated.location,
            address: updated.address,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get hero videos
// @route   GET /api/restaurant/videos
// @access  Public
const getHeroVideos = async (req, res, next) => {
    try {
        const restaurant = await getRestaurantInstance();
        res.json({ videos: restaurant.heroVideos || [] });
    } catch (error) {
        next(error);
    }
};

// @desc    Add a hero video URL (max 3)
// @route   POST /api/restaurant/videos
// @access  Private/Admin
const addHeroVideo = async (req, res, next) => {
    try {
        const { url } = req.body;
        if (!url || !url.trim()) {
            res.status(400);
            throw new Error('Video URL is required');
        }

        const restaurant = await getRestaurantInstance();

        if (restaurant.heroVideos.length >= 3) {
            res.status(400);
            throw new Error('Maximum 3 hero videos allowed. Delete one before adding a new one.');
        }

        restaurant.heroVideos.push(url.trim());
        const updated = await restaurant.save();
        res.status(201).json({ videos: updated.heroVideos });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete a hero video by index
// @route   DELETE /api/restaurant/videos/:index
// @access  Private/Admin
const deleteHeroVideo = async (req, res, next) => {
    try {
        const index = parseInt(req.params.index);
        const restaurant = await getRestaurantInstance();

        if (isNaN(index) || index < 0 || index >= restaurant.heroVideos.length) {
            res.status(400);
            throw new Error(`Invalid index. Valid range: 0 to ${restaurant.heroVideos.length - 1}`);
        }

        restaurant.heroVideos.splice(index, 1);
        const updated = await restaurant.save();
        res.json({ message: 'Video deleted successfully', videos: updated.heroVideos });
    } catch (error) {
        next(error);
    }
};

module.exports = { getRestaurant, updateRestaurant, setRestaurantLocation, getHeroVideos, addHeroVideo, deleteHeroVideo };
