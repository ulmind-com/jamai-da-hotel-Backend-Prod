const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
    createVlog,
    getAllVlogsAdmin,
    getPublicVlogs,
    updateVlog,
    deleteVlog,
    incrementView,
} = require('../controllers/vlogController');

// Public routes
router.get('/', getPublicVlogs);
router.put('/:id/view', incrementView);

// Admin routes
router.get('/admin', protect, admin, getAllVlogsAdmin);
router.post('/', protect, admin, createVlog);
router.put('/:id', protect, admin, updateVlog);
router.delete('/:id', protect, admin, deleteVlog);

module.exports = router;
