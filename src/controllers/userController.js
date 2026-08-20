const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const { paginate, isPaginated, escapeRegex } = require('../utils/paginate');

// Helper to resolve ID
const resolveId = (id) => {
    return mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { customId: id };
};

// @desc    Get user profile & order stats
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id).select('-password');

        if (user) {
            // Fetch recent 3 orders for summary
            const recentOrders = await Order.find({ customer: req.user._id })
                .sort({ createdAt: -1 })
                .limit(3);

            res.json({
                user,
                recentOrders,
            });
        } else {
            res.status(404);
            throw new Error('User not found');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);

        if (user) {
            user.name = req.body.name || user.name;
            user.mobile = req.body.mobile || user.mobile;

            // Update profile image if provided (allow empty string to remove)
            if (req.body.profileImage !== undefined) {
                user.profileImage = req.body.profileImage;
            }

            // Update address if provided
            if (req.body.address) {
                if (user.savedAddresses.length > 0) {
                    Object.assign(user.savedAddresses[0], req.body.address);
                } else {
                    user.savedAddresses.push(req.body.address);
                }
            }

            if (req.body.password) {
                user.password = req.body.password;
            }

            const updatedUser = await user.save();

            res.json({
                _id: updatedUser._id,
                customId: updatedUser.customId,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                mobile: updatedUser.mobile,
                profileImage: updatedUser.profileImage, // Return updated image URL
                savedAddresses: updatedUser.savedAddresses,
                token: req.headers.authorization.split(' ')[1], // Return same token
            });
        } else {
            res.status(404);
            throw new Error('User not found');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res, next) => {
    try {
        const { search } = req.query;
        const query = {};
        if (search && String(search).trim()) {
            const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
            query.$or = [{ name: rx }, { email: rx }, { mobile: rx }];
        }

        if (isPaginated(req)) {
            const result = await paginate(User, { req, query, sort: { createdAt: -1 }, select: '-password' });
            return res.json(result);
        }

        const users = await User.find(query);
        res.json(users);
    } catch (error) {
        next(error);
    }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = async (req, res, next) => {
    try {
        const user = await User.findOne(resolveId(req.params.id)).select('-password');
        if (user) {
            res.json(user);
        } else {
            res.status(404);
            throw new Error('User not found');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res, next) => {
    try {
        const user = await User.findOne(resolveId(req.params.id));
        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }
        // Protect the admin account: never let the last admin be removed.
        if (user.role === 'Admin') {
            const adminCount = await User.countDocuments({ role: 'Admin' });
            if (adminCount <= 1) {
                res.status(400);
                throw new Error('Cannot delete the only admin account.');
            }
        }
        await user.deleteOne();
        res.json({ message: 'User removed' });
    } catch (error) {
        next(error);
    }
};

// @desc    Create a staff user (Manager/Admin) — no OTP, admin only
// @route   POST /api/users
// @access  Private/Admin
const createStaffUser = async (req, res, next) => {
    try {
        const { name, password, mobile, role } = req.body;
        const email = (req.body.email || '').toLowerCase().trim();

        if (!name || !email || !password || !mobile) {
            res.status(400);
            throw new Error('Name, email, password and mobile are all required');
        }
        if (String(password).length < 6) {
            res.status(400);
            throw new Error('Password must be at least 6 characters');
        }
        const finalRole = ['Manager', 'Admin', 'Customer', 'Waiter'].includes(role) ? role : 'Manager';

        const exists = await User.findOne({ email });
        if (exists) {
            res.status(400);
            throw new Error('A user with this email already exists');
        }

        const user = await User.create({ name, email, password, mobile, role: finalRole });
        res.status(201).json({
            _id: user._id,
            customId: user.customId,
            name: user.name,
            email: user.email,
            role: user.role,
            mobile: user.mobile,
            isActive: user.isActive,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update user (Admin)
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res, next) => {
    try {
        const user = await User.findOne(resolveId(req.params.id));

        if (user) {
            user.name = req.body.name || user.name;
            user.email = req.body.email || user.email;
            user.role = req.body.role || user.role;
            user.isActive = req.body.isActive !== undefined ? req.body.isActive : user.isActive;
            user.isCodDisabled = req.body.isCodDisabled !== undefined ? req.body.isCodDisabled : user.isCodDisabled;

            const updatedUser = await user.save();

            res.json({
                _id: updatedUser._id,
                customId: updatedUser.customId,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                isActive: updatedUser.isActive,
                isCodDisabled: updatedUser.isCodDisabled,
            });
        } else {
            res.status(404);
            throw new Error('User not found');
        }
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getUserProfile,
    updateUserProfile,
    getUsers,
    getUserById,
    deleteUser,
    updateUser,
    createStaffUser,
};
