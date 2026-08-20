const express = require('express');
const router = express.Router();
const {
    getMyChat,
    createNewChat,
    sendMessageAsUser,
    getAllChats,
    getChatById,
    sendMessageAsAdmin,
    markReadByUser,
    closeChat,
    deleteChat,
} = require('../controllers/chatController');
const { protect, admin } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Real-time customer ↔ admin chat support
 */

// ─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET EVENTS DOCUMENTATION (Informational Swagger Endpoint)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/chat/ws-docs:
 *   get:
 *     summary: "WebSocket: Real-time Chat Events (Socket.IO)"
 *     tags: [Chat]
 *     description: |
 *       ## Real-time Chat via Socket.IO
 *
 *       ### Connection
 *       ```js
 *       const socket = io('http://localhost:5000');
 *       ```
 *
 *       ### User — Join their own chat room
 *       ```js
 *       socket.emit('joinChat', chatId); // chatId from GET /api/chat
 *       ```
 *
 *       ### Admin — Join the global admin room
 *       ```js
 *       socket.emit('joinAdminChat'); // Joins 'admin_chat' room
 *       ```
 *
 *       ### Listen for new messages (both user & admin)
 *       ```js
 *       socket.on('chatMessage', (data) => {
 *         // data: { chatId, message: { _id, sender, text, isRead, createdAt } }
 *         // For admin: data also includes { userId, userName }
 *         playNotificationSound(); // Trigger sound here
 *         renderMessage(data.message);
 *       });
 *       ```
 *
 *       ### Listen for chat closed event (User side)
 *       ```js
 *       socket.on('chatClosed', (data) => {
 *         // data: { chatId, message: 'This chat has been closed by admin.' }
 *       });
 *       ```
 *
 *       ### Sound Notification
 *       Play a sound whenever `chatMessage` event fires.
 *       Use the Web Audio API or an `<audio>` element in your frontend.
 *
 *     responses:
 *       200:
 *         description: WebSocket documentation (not a real HTTP endpoint)
 */

// ─────────────────────────────────────────────────────────────────────────────
// USER ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/chat:
 *   get:
 *     summary: Get or open my chat session
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     description: Returns the user's existing chat thread (or creates one). Use the returned `_id` as `chatId` for Socket.IO `joinChat`.
 *     responses:
 *       200:
 *         description: Chat session object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chat'
 *       401:
 *         description: Not authorized
 */
router.get('/', protect, getMyChat);

/**
 * @swagger
 * /api/chat/create:
 *   post:
 *     summary: Force create a new chat session
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     description: Creates a fresh chat session, ignoring any currently open or closed sessions.
 *     responses:
 *       201:
 *         description: Chat session created
 */
router.post('/create', protect, createNewChat);

/**
 * @swagger
 * /api/chat/message:
 *   post:
 *     summary: Send a message (User → Admin)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 example: "Hello, I have an issue with my order"
 *     responses:
 *       201:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         description: Empty message or chat is closed
 *       401:
 *         description: Not authorized
 */
router.post('/message', protect, sendMessageAsUser);

/**
 * @swagger
 * /api/chat/read:
 *   put:
 *     summary: Mark admin messages as read (User)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Marked as read
 *       401:
 *         description: Not authorized
 */
router.put('/read', protect, markReadByUser);

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/chat/admin/all:
 *   get:
 *     summary: Get all chat sessions (Admin list view)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     description: Returns a summary list of all user chats, sorted by latest activity. Use `unreadByAdmin` to show badge counts.
 *     responses:
 *       200:
 *         description: Array of chat summaries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   userName:
 *                     type: string
 *                   lastMessage:
 *                     type: string
 *                   lastMessageAt:
 *                     type: string
 *                     format: date-time
 *                   isOpen:
 *                     type: boolean
 *                   unreadByAdmin:
 *                     type: number
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.get('/admin/all', protect, admin, getAllChats);

/**
 * @swagger
 * /api/chat/admin/{chatId}:
 *   get:
 *     summary: Get full chat thread by ID (Admin)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     description: Returns full message history. Automatically marks all user messages as read and resets `unreadByAdmin` to 0.
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *     responses:
 *       200:
 *         description: Full chat object with all messages
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chat'
 *       404:
 *         description: Chat not found
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 *   delete:
 *     summary: Delete a chat thread (Admin)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chat deleted successfully
 *       404:
 *         description: Chat not found
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.get('/admin/:chatId', protect, admin, getChatById);
router.delete('/admin/:chatId', protect, admin, deleteChat);

/**
 * @swagger
 * /api/chat/admin/{chatId}/message:
 *   post:
 *     summary: Send a reply message (Admin → User)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 example: "Hi! We are looking into your order right now."
 *     responses:
 *       201:
 *         description: Reply sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         description: Empty message
 *       404:
 *         description: Chat not found
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.post('/admin/:chatId/message', protect, admin, sendMessageAsAdmin);

/**
 * @swagger
 * /api/chat/admin/{chatId}/close:
 *   put:
 *     summary: Close a chat session (Admin)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     description: Marks chat as closed and emits `chatClosed` event to the user via Socket.IO.
 *     responses:
 *       200:
 *         description: Chat closed successfully
 *       404:
 *         description: Chat not found
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Not authorized as admin
 */
router.put('/admin/:chatId/close', protect, admin, closeChat);

// ─────────────────────────────────────────────────────────────────────────────
// SWAGGER SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * components:
 *   schemas:
 *     Message:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         sender:
 *           type: string
 *           enum: [user, admin]
 *         text:
 *           type: string
 *         isRead:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *     Chat:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         user:
 *           type: string
 *           description: User ObjectId (or populated user object)
 *         userName:
 *           type: string
 *         messages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Message'
 *         isOpen:
 *           type: boolean
 *         lastMessage:
 *           type: string
 *         lastMessageAt:
 *           type: string
 *           format: date-time
 *         unreadByAdmin:
 *           type: number
 *         unreadByUser:
 *           type: number
 *         createdAt:
 *           type: string
 *           format: date-time
 */

module.exports = router;
