const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Storage
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'food-delivery-app',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    },
});

const upload = multer({ storage: storage });

// ── Video Storage (Cloudinary) ─────────────────────────────────────────────
const videoStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'food-delivery-videos',
        resource_type: 'video',
        allowed_formats: ['mp4', 'webm', 'mov'],
    },
});

const uploadVideoMulter = multer({
    storage: videoStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
});

// @desc    Upload Image
// @route   POST /api/upload
// @access  Private/Admin
const uploadImage = (req, res) => {
    if (req.file) {
        res.json({
            url: req.file.path,
            message: 'Image uploaded successfully',
        });
    } else {
        res.status(400);
        throw new Error('Image upload failed');
    }
};

// @desc    Upload Video to Cloudinary
// @route   POST /api/upload/video
// @access  Private/Admin
const uploadVideo = (req, res) => {
    if (req.file) {
        res.json({
            url: req.file.path,
            message: 'Video uploaded successfully',
        });
    } else {
        res.status(400);
        throw new Error('Video upload failed. Make sure to send field name: video');
    }
};

module.exports = { upload, uploadImage, uploadVideoMulter, uploadVideo };
