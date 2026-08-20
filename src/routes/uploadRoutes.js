const express = require('express');
const router = express.Router();
const { upload, uploadImage, uploadVideoMulter, uploadVideo } = require('../controllers/uploadController');
const { protect, admin } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Uploads
 *   description: File upload management
 */

/**
 * @swagger
 * /api/upload:
 *   post:
 *     summary: Upload an image (Profile or Product)
 *     description: Upload an image file. Returns the URL. Authenticated users can use this for profile pictures; Admins for products.
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *       400:
 *         description: Image upload failed
 *       401:
 *         description: Not authorized
 */
router.post('/', protect, upload.single('image'), uploadImage);

/**
 * @swagger
 * /api/upload/video:
 *   post:
 *     summary: Upload a video to Cloudinary (Admin)
 *     description: Accepts multipart/form-data with field name `video`. Returns the Cloudinary URL. Max 50MB. Use the returned URL to add to hero videos via POST /api/restaurant/videos.
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - video
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *                 description: Video file (mp4, webm, mov — max 50MB)
 *     responses:
 *       200:
 *         description: Video uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: Cloudinary video URL to use in POST /api/restaurant/videos
 *                 message:
 *                   type: string
 *       400:
 *         description: Video upload failed
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.post('/video', protect, admin, uploadVideoMulter.single('video'), uploadVideo);

module.exports = router;
