const express = require('express');
const router = express.Router();
const { protect, staff, admin, kotStaff } = require('../middleware/authMiddleware');
const {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getTables,
    createTable,
    updateTable,
    deleteTable,
    updateTableStatus,
} = require('../controllers/tableController');
const {
    getKots,
    getKotById,
    createKot,
    updateKot,
    deleteKot,
} = require('../controllers/kotController');
const {
    generateBill,
    getBills,
    getBillById,
    settleBill,
    deleteBill,
    requestBillDelete,
    rejectBillDelete,
} = require('../controllers/billController');
const { getReport, emailReport, getPosDashboard, getPending } = require('../controllers/posReportController');

// All POS routes require authentication. Waiters (kotStaff) can read tables and
// manage KOTs; management/billing/reports stay Admin/Manager (staff) only.
router.use(protect);

// ── Table sections ──
router.route('/table-categories')
    .get(kotStaff, getCategories)
    .post(staff, createCategory);
router.route('/table-categories/:id')
    .put(staff, updateCategory)
    .delete(staff, deleteCategory);

// ── Tables ──
router.route('/tables')
    .get(kotStaff, getTables)
    .post(staff, createTable);
router.route('/tables/:id')
    .put(staff, updateTable)
    .delete(staff, deleteTable);
router.put('/tables/:id/status', staff, updateTableStatus);

// ── KOT (Kitchen Order Tickets) — waiters included ──
router.route('/kots')
    .get(kotStaff, getKots)
    .post(kotStaff, createKot);
router.route('/kots/:id')
    .get(kotStaff, getKotById)
    .put(kotStaff, updateKot)
    .delete(kotStaff, deleteKot);

// ── Bills (generate + settlement) — staff only ──
router.route('/bills')
    .get(staff, getBills)
    .post(staff, generateBill);
router.get('/bills/:id', staff, getBillById);
router.put('/bills/:id/settle', staff, settleBill);
router.post('/bills/:id/request-delete', staff, requestBillDelete);
router.delete('/bills/:id', admin, deleteBill);
router.put('/bills/:id/reject-delete', admin, rejectBillDelete);

// ── Reports & dashboard summary — staff only ──
router.get('/report', staff, getReport);
router.post('/report/email', staff, emailReport);
router.get('/dashboard', staff, getPosDashboard);

// ── Pending summary (for reminder popups) — kotStaff ──
router.get('/pending', kotStaff, getPending);

module.exports = router;
