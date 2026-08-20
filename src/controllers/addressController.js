const User = require('../models/User');
const https = require('https');

// @desc    Get logged-in user's addresses
// @route   GET /api/users/addresses
// @access  Private
const getAddresses = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        res.json(user.savedAddresses);
    } catch (error) {
        next(error);
    }
};

// @desc    Add a new address
// @route   POST /api/users/addresses
// @access  Private
const addAddress = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        const { type, addressLine1, addressLine2, city, state, postalCode, mobile, coordinates } = req.body;

        if (!addressLine1 || !city || !state || !postalCode) {
            res.status(400);
            throw new Error('addressLine1, city, state, and postalCode are required');
        }

        const newAddress = {
            type: type || 'HOME',
            addressLine1,
            addressLine2,
            city,
            state,
            postalCode,
            mobile: mobile || user.mobile,
            coordinates: coordinates || undefined
        };

        user.savedAddresses.push(newAddress);
        await user.save();

        res.status(201).json(user.savedAddresses);
    } catch (error) {
        next(error);
    }
};

// @desc    Update an address
// @route   PUT /api/users/addresses/:id
// @access  Private
const updateAddress = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        const address = user.savedAddresses.id(req.params.id);

        if (!address) {
            res.status(404);
            throw new Error('Address not found');
        }

        const { type, addressLine1, addressLine2, city, state, postalCode, mobile, coordinates } = req.body;

        if (type) address.type = type;
        if (addressLine1) address.addressLine1 = addressLine1;
        if (addressLine2 !== undefined) address.addressLine2 = addressLine2;
        if (city) address.city = city;
        if (state) address.state = state;
        if (postalCode) address.postalCode = postalCode;
        if (mobile) address.mobile = mobile;
        if (coordinates) address.coordinates = coordinates;

        await user.save();
        res.json(user.savedAddresses);
    } catch (error) {
        next(error);
    }
};

// @desc    Delete an address
// @route   DELETE /api/users/addresses/:id
// @access  Private
const deleteAddress = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        const address = user.savedAddresses.id(req.params.id);
        if (!address) {
            res.status(404);
            throw new Error('Address not found');
        }

        user.savedAddresses.pull({ _id: req.params.id });
        await user.save();

        res.json({ message: 'Address removed', addresses: user.savedAddresses });
    } catch (error) {
        next(error);
    }
};

// @desc    Reverse geocode lat/lng to a human-readable address
// @route   GET /api/users/addresses/reverse-geocode?lat=xx&lng=yy
// @access  Private
const reverseGeocode = async (req, res, next) => {
    try {
        const { lat, lng } = req.query;

        if (!lat || !lng) {
            res.status(400);
            throw new Error('lat and lng query parameters are required');
        }

        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;

        https.get(url, { headers: { 'User-Agent': 'FoodDeliveryApp/1.0' } }, (apiRes) => {
            let data = '';
            apiRes.on('data', (chunk) => { data += chunk; });
            apiRes.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json || json.error) {
                        return res.status(400).json({ message: 'Could not resolve location' });
                    }

                    const addr = json.address || {};
                    const result = {
                        addressLine1: [addr.road, addr.neighbourhood, addr.suburb].filter(Boolean).join(', '),
                        addressLine2: addr.village || addr.town || '',
                        city: addr.city || addr.town || addr.village || addr.county || '',
                        state: addr.state || '',
                        postalCode: addr.postcode || '',
                        displayName: json.display_name,
                        coordinates: { lat: parseFloat(lat), lng: parseFloat(lng) }
                    };

                    res.json(result);
                } catch (e) {
                    next(e);
                }
            });
        }).on('error', (e) => next(e));

    } catch (error) {
        next(error);
    }
};

// @desc    Select an address (Saved or Current)
// @route   PUT /api/users/addresses/select
// @access  Private
const selectAddress = async (req, res, next) => {
    try {
        const { addressId, address } = req.body;
        const user = await User.findById(req.user._id);

        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        let selected = null;

        if (addressId) {
            // Case 1: Select from Saved Addresses
            const saved = user.savedAddresses.id(addressId);
            if (!saved) {
                res.status(404);
                throw new Error('Address not found in saved list');
            }
            // Create a snapshot
            selected = {
                addressLine1: saved.addressLine1,
                addressLine2: saved.addressLine2,
                city: saved.city,
                state: saved.state,
                postalCode: saved.postalCode,
                mobile: saved.mobile,
                type: saved.type,
                coordinates: saved.coordinates,
            };
        } else if (address) {
            // Case 2: Custom/Current Location
            // Validating required fields
            if (!address.addressLine1 || !address.city || !address.coordinates) {
                res.status(400);
                throw new Error('Incomplete address details');
            }
            selected = {
                addressLine1: address.addressLine1,
                addressLine2: address.addressLine2 || '',
                city: address.city,
                state: address.state || '',
                postalCode: address.postalCode || '',
                mobile: address.mobile || user.mobile,
                type: address.type || 'OTHER',
                coordinates: address.coordinates,
            };
        } else {
            res.status(400);
            throw new Error('Please provide addressId OR address object');
        }

        user.selectedAddress = selected;
        await user.save();

        res.json({ message: 'Address selected successfully', selectedAddress: user.selectedAddress });
    } catch (error) {
        next(error);
    }
};

// @desc    Get the currently selected address (Navbar Location)
// @route   GET /api/users/addresses/select
// @access  Private
const getSelectedAddress = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        // Return selectedAddress, or null/empty object if not set
        res.json({ selectedAddress: user.selectedAddress || null });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    reverseGeocode,
    selectAddress,
    getSelectedAddress, // Export new function
};
