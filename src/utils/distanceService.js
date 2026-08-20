const geolib = require('geolib');
const Restaurant = require('../models/Restaurant');

/**
 * Calculate distance in km between two lat/lng points (Fallback straight line).
 */
const getDistanceKm = (lat1, lng1, lat2, lng2) => {
    const distanceInMeters = geolib.getDistance(
        { latitude: parseFloat(lat1), longitude: parseFloat(lng1) },
        { latitude: parseFloat(lat2), longitude: parseFloat(lng2) }
    );
    return distanceInMeters / 1000;
};

/**
 * Fetch exact road distance using OSRM API (matches Frontend UI accurately)
 */
async function getDrivingDistanceInKm(lat1, lng1, lat2, lng2) {
    try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`;
        const response = await fetch(osrmUrl);
        if (!response.ok) throw new Error(`OSRM API error: ${response.status}`);

        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
            return data.routes[0].distance / 1000;
        }
    } catch (error) {
        console.error("OSRM Route API failed, falling back to straight-line distance:", error.message);
    }
    return getDistanceKm(lat1, lng1, lat2, lng2);
}

/**
 * Calculate delivery fee based on user coords.
 * Uses restaurant location from DB if available, falls back to env vars.
 */
const calculateDeliveryFee = async (userLat, userLng) => {
    if (!userLat || !userLng) {
        throw new Error('User coordinates are required');
    }

    // Get restaurant location from DB (dynamic)
    const restaurant = await Restaurant.findOne();
    let restaurantLat = process.env.RESTAURANT_LAT;
    let restaurantLng = process.env.RESTAURANT_LNG;

    if (restaurant && restaurant.location && restaurant.location.lat && restaurant.location.lng) {
        restaurantLat = restaurant.location.lat;
        restaurantLng = restaurant.location.lng;
    }

    if (!restaurantLat || !restaurantLng) {
        throw new Error('Restaurant location not configured');
    }

    const distanceInKm = await getDrivingDistanceInKm(restaurantLat, restaurantLng, userLat, userLng);
    const deliveryRadius = (restaurant && restaurant.deliveryRadius) || 10;

    let deliveryCharge = 0;
    let deliverable = true;

    if (distanceInKm <= 5) {
        deliveryCharge = 30;
    } else if (distanceInKm <= deliveryRadius) {
        deliveryCharge = 60;
    } else {
        deliverable = false;
        throw new Error(`Location is too far for delivery (>${deliveryRadius}km)`);
    }

    return {
        distance: `${distanceInKm.toFixed(2)} km`,
        distanceKm: parseFloat(distanceInKm.toFixed(2)),
        deliveryCharge,
        deliverable,
    };
};

/**
 * Calculate distance between restaurant and a delivery address (for order display).
 * Returns null if restaurant or user coords are not available.
 */
const getOrderDistance = async (userLat, userLng) => {
    if (!userLat || !userLng) return null;

    const restaurant = await Restaurant.findOne();
    let restaurantLat = process.env.RESTAURANT_LAT;
    let restaurantLng = process.env.RESTAURANT_LNG;

    if (restaurant && restaurant.location && restaurant.location.lat && restaurant.location.lng) {
        restaurantLat = restaurant.location.lat;
        restaurantLng = restaurant.location.lng;
    }

    if (!restaurantLat || !restaurantLng) return null;

    const distanceInKm = await getDrivingDistanceInKm(restaurantLat, restaurantLng, userLat, userLng);
    return `${distanceInKm.toFixed(2)} km`;
};

module.exports = { calculateDeliveryFee, getOrderDistance, getDistanceKm, getDrivingDistanceInKm };
