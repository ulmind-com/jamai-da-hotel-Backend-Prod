const express = require('express');
const router = express.Router();
const {
    getAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    reverseGeocode,
    selectAddress,
    getSelectedAddress,
} = require('../controllers/addressController');
const { protect } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Addresses
 *   description: User address management
 */

/**
 * @swagger
 * /api/users/addresses/reverse-geocode:
 *   get:
 *     summary: Reverse geocode lat/lng to address (for current location)
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *         description: Latitude
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *         description: Longitude
 *     responses:
 *       200:
 *         description: Address resolved from coordinates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 addressLine1:
 *                   type: string
 *                 addressLine2:
 *                   type: string
 *                 city:
 *                   type: string
 *                 state:
 *                   type: string
 *                 postalCode:
 *                   type: string
 *                 displayName:
 *                   type: string
 *                 coordinates:
 *                   type: object
 *                   properties:
 *                     lat:
 *                       type: number
 *                     lng:
 *                       type: number
 *       400:
 *         description: lat and lng are required
 *       401:
 *         description: Not authorized
 */
router.get('/reverse-geocode', protect, reverseGeocode);

/**
 * @swagger
 * /api/users/addresses/select:
 *   put:
 *     summary: Set the currently selected address (Navbar Location)
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               addressId:
 *                 type: string
 *                 description: ID of a saved address to select
 *               address:
 *                 type: object
 *                 description: Full address object (for Current Location)
 *                 properties:
 *                   addressLine1:
 *                     type: string
 *                   city:
 *                     type: string
 *                   coordinates:
 *                     type: object
 *                     properties:
 *                       lat:
 *                         type: number
 *                       lng:
 *                         type: number
 *     responses:
 *       200:
 *         description: Address selected successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 */
router.put('/select', protect, selectAddress);

/**
 * @swagger
 * /api/users/addresses/select:
 *   get:
 *     summary: Get the currently selected address (Navbar Location)
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Currently selected address retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 selectedAddress:
 *                   type: object
 *                   properties:
 *                     addressLine1:
 *                       type: string
 *                     city:
 *                       type: string
 *                     coordinates:
 *                       type: object
 *       401:
 *         description: Not authorized
 */
router.get('/select', protect, getSelectedAddress);

/**
 * @swagger
 * /api/users/addresses:
 *   get:
 *     summary: Get all saved addresses
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of saved addresses
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   type:
 *                     type: string
 *                     enum: [HOME, WORK, OTHER]
 *                   addressLine1:
 *                     type: string
 *                   addressLine2:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   postalCode:
 *                     type: string
 *                   mobile:
 *                     type: string
 *                   coordinates:
 *                     type: object
 *                     properties:
 *                       lat:
 *                         type: number
 *                       lng:
 *                         type: number
 *       401:
 *         description: Not authorized
 *   post:
 *     summary: Add a new address
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - addressLine1
 *               - city
 *               - state
 *               - postalCode
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [HOME, WORK, OTHER]
 *                 default: HOME
 *                 description: Address type
 *               addressLine1:
 *                 type: string
 *               addressLine2:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               postalCode:
 *                 type: string
 *               mobile:
 *                 type: string
 *                 description: Optional. Defaults to user mobile if not provided.
 *               coordinates:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lng:
 *                     type: number
 *     responses:
 *       201:
 *         description: Address added successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Not authorized
 */
router.route('/')
    .get(protect, getAddresses)
    .post(protect, addAddress);

/**
 * @swagger
 * /api/users/addresses/{id}:
 *   put:
 *     summary: Update an address
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Address ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [HOME, WORK, OTHER]
 *               addressLine1:
 *                 type: string
 *               addressLine2:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               postalCode:
 *                 type: string
 *               mobile:
 *                 type: string
 *               coordinates:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lng:
 *                     type: number
 *     responses:
 *       200:
 *         description: Address updated successfully
 *       404:
 *         description: Address not found
 *       401:
 *         description: Not authorized
 *   delete:
 *     summary: Delete an address
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Address ID
 *     responses:
 *       200:
 *         description: Address deleted successfully
 *       404:
 *         description: Address not found
 *       401:
 *         description: Not authorized
 */
router.route('/:id')
    .put(protect, updateAddress)
    .delete(protect, deleteAddress);

module.exports = router;
