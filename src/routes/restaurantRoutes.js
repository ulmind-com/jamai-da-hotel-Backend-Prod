const express = require('express');
const router = express.Router();
const {
    getRestaurant,
    updateRestaurant,
    setRestaurantLocation,
    getHeroVideos,
    addHeroVideo,
    deleteHeroVideo,
} = require('../controllers/restaurantController');
const { protect, admin } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Restaurant
 *   description: Restaurant settings and status
 */

/**
 * @swagger
 * /api/restaurant:
 *   get:
 *     summary: Get restaurant info and status
 *     tags: [Restaurant]
 *     responses:
 *       200:
 *         description: Restaurant info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 isOpen:
 *                   type: boolean
 *                 address:
 *                   type: string
 *                 deliveryRadius:
 *                   type: number
 *                 logo:
 *                   type: string
 *                 mobile:
 *                   type: string
 *                   description: Restaurant contact number
 *                 location:
 *                   type: object
 *                   properties:
 *                     lat:
 *                       type: number
 *                     lng:
 *                       type: number
 *   put:
 *     summary: Update restaurant settings (Admin)
 *     tags: [Restaurant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isOpen:
 *                 type: boolean
 *               name:
 *                 type: string
 *               address:
 *                 type: string
 *               deliveryRadius:
 *                 type: number
 *               logo:
 *                 type: string
 *               mobile:
 *                 type: string
 *                 description: Restaurant contact mobile number
 *               gstIn:
 *                 type: string
 *               fssaiLicense:
 *                 type: string
 *               location:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lng:
 *                     type: number
 *     responses:
 *       200:
 *         description: Updated successfully
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.route('/')
    .get(getRestaurant)
    .put(protect, admin, updateRestaurant);

/**
 * @swagger
 * /api/restaurant/location:
 *   put:
 *     summary: Set restaurant GPS location (Admin - for map picker)
 *     tags: [Restaurant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lat
 *               - lng
 *             properties:
 *               lat:
 *                 type: number
 *                 description: Latitude from map picker or geolocation
 *               lng:
 *                 type: number
 *                 description: Longitude from map picker or geolocation
 *               address:
 *                 type: string
 *                 description: Optional human-readable address label
 *     responses:
 *       200:
 *         description: Location updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 location:
 *                   type: object
 *                   properties:
 *                     lat:
 *                       type: number
 *                     lng:
 *                       type: number
 *                 address:
 *                   type: string
 *       400:
 *         description: lat and lng are required
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.put('/location', protect, admin, setRestaurantLocation);

/**
 * @swagger
 * /api/restaurant/videos:
 *   get:
 *     summary: Get all hero videos
 *     tags: [Restaurant]
 *     description: Returns an array of up to 3 Cloudinary video URLs for the homepage hero section. Public endpoint.
 *     responses:
 *       200:
 *         description: List of hero video URLs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 videos:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["https://res.cloudinary.com/.../video1.mp4"]
 *   post:
 *     summary: Add a hero video URL (Admin, max 3)
 *     tags: [Restaurant]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Adds a Cloudinary video URL to the hero videos list. Maximum 3 videos.
 *       **Workflow:** First upload the video via `POST /api/upload/video` to get the URL, then call this endpoint.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 description: Cloudinary video URL from POST /api/upload/video
 *                 example: "https://res.cloudinary.com/.../food-delivery-videos/abc123.mp4"
 *     responses:
 *       201:
 *         description: Video added. Returns updated videos array.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 videos:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Max 3 videos limit reached or missing URL
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.route('/videos')
    .get(getHeroVideos)
    .post(protect, admin, addHeroVideo);

/**
 * @swagger
 * /api/restaurant/videos/{index}:
 *   delete:
 *     summary: Delete a hero video by index (Admin)
 *     tags: [Restaurant]
 *     security:
 *       - bearerAuth: []
 *     description: Removes the video at the given 0-based array index. After deletion, remaining videos shift down.
 *     parameters:
 *       - in: path
 *         name: index
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 2
 *         description: "0-based index of the video to delete (0, 1, or 2)"
 *     responses:
 *       200:
 *         description: Video deleted. Returns updated videos array.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 videos:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Invalid index
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.delete('/videos/:index', protect, admin, deleteHeroVideo);

module.exports = router;
