const Vlog = require('../models/Vlog');
const { paginate, isPaginated } = require('../utils/paginate');

// @desc    Create a new Vlog/Post
// @route   POST /api/vlogs
// @access  Private/Admin
const createVlog = async (req, res, next) => {
    try {
        const { title, description, mediaUrl, mediaType, thumbnailUrl } = req.body;

        if (!title || !mediaUrl || !mediaType) {
            res.status(400);
            throw new Error('Title, mediaUrl, and mediaType are required');
        }

        const vlog = await Vlog.create({
            title,
            description: description || '',
            mediaUrl,
            mediaType,
            thumbnailUrl: thumbnailUrl || '',
            isPublished: true,
        });

        res.status(201).json(vlog);
    } catch (error) {
        next(error);
    }
};

// @desc    Get all Vlogs (Admin - includes unpublished)
// @route   GET /api/vlogs/admin
// @access  Private/Admin
const getAllVlogsAdmin = async (req, res, next) => {
    try {
        if (isPaginated(req)) {
            const result = await paginate(Vlog, { req, query: {}, sort: { createdAt: -1 } });
            return res.json(result);
        }
        const vlogs = await Vlog.find({}).sort({ createdAt: -1 });
        res.json(vlogs);
    } catch (error) {
        next(error);
    }
};

// @desc    Get published Vlogs (Public - user facing)
// @route   GET /api/vlogs
// @access  Public
const getPublicVlogs = async (req, res, next) => {
    try {
        const vlogs = await Vlog.find({ isPublished: true }).sort({ createdAt: -1 });
        res.json(vlogs);
    } catch (error) {
        next(error);
    }
};

// @desc    Update a Vlog
// @route   PUT /api/vlogs/:id
// @access  Private/Admin
const updateVlog = async (req, res, next) => {
    try {
        const vlog = await Vlog.findById(req.params.id);
        if (!vlog) {
            res.status(404);
            throw new Error('Vlog not found');
        }

        const { title, description, mediaUrl, mediaType, thumbnailUrl, isPublished } = req.body;

        vlog.title = title || vlog.title;
        vlog.description = description !== undefined ? description : vlog.description;
        vlog.mediaUrl = mediaUrl || vlog.mediaUrl;
        vlog.mediaType = mediaType || vlog.mediaType;
        vlog.thumbnailUrl = thumbnailUrl !== undefined ? thumbnailUrl : vlog.thumbnailUrl;
        vlog.isPublished = isPublished !== undefined ? isPublished : vlog.isPublished;

        const updated = await vlog.save();
        res.json(updated);
    } catch (error) {
        next(error);
    }
};

// @desc    Delete a Vlog
// @route   DELETE /api/vlogs/:id
// @access  Private/Admin
const deleteVlog = async (req, res, next) => {
    try {
        const vlog = await Vlog.findById(req.params.id);
        if (!vlog) {
            res.status(404);
            throw new Error('Vlog not found');
        }
        await vlog.deleteOne();
        res.json({ message: 'Vlog removed successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Increment view count
// @route   PUT /api/vlogs/:id/view
// @access  Public
const incrementView = async (req, res, next) => {
    try {
        const vlog = await Vlog.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } },
            { new: true }
        );
        if (!vlog) {
            res.status(404);
            throw new Error('Vlog not found');
        }
        res.json({ views: vlog.views });
    } catch (error) {
        next(error);
    }
};

module.exports = { createVlog, getAllVlogsAdmin, getPublicVlogs, updateVlog, deleteVlog, incrementView };
