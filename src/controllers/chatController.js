const Chat = require('../models/Chat');
const User = require('../models/User');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Find or create a chat session for a user
const getOrCreateChat = async (userId, userName) => {
    let chat = await Chat.findOne({ user: userId }).sort({ createdAt: -1 });
    if (!chat) {
        chat = await Chat.create({ user: userId, userName });
    }
    return chat;
};

// Emit Socket.IO events if available
const emitChatEvent = (req, event, room, payload) => {
    const io = req.app.get('io');
    if (io) io.to(room).emit(event, payload);
};

// ─────────────────────────────────────────────────────────────────────────────
// USER CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Get or open user's own chat session
// @route   GET /api/chat
// @access  Private (User)
const getMyChat = async (req, res, next) => {
    try {
        const chat = await getOrCreateChat(req.user._id, req.user.name);
        res.json(chat);
    } catch (error) {
        next(error);
    }
};

// @desc    Force create a new chat session for user
// @route   POST /api/chat/create
// @access  Private (User)
const createNewChat = async (req, res, next) => {
    try {
        const chat = await Chat.create({ user: req.user._id, userName: req.user.name });
        res.status(201).json(chat);
    } catch (error) {
        next(error);
    }
};

// @desc    Send a message as a user
// @route   POST /api/chat/message
// @access  Private (User)
const sendMessageAsUser = async (req, res, next) => {
    try {
        const { text, images } = req.body;
        if ((!text || !text.trim()) && (!images || images.length === 0)) {
            res.status(400);
            throw new Error('Message text or image is required');
        }

        const chat = await getOrCreateChat(req.user._id, req.user.name);

        if (!chat.isOpen) {
            res.status(400);
            throw new Error('Chat is closed. Please start a new one.');
        }

        const newMessage = {
            sender: 'user',
            text: text ? text.trim() : '',
            images: images || [],
        };

        chat.messages.push(newMessage);
        chat.lastMessage = text && text.trim() ? text.trim() : 'Sent an image';
        chat.lastMessageAt = new Date();
        chat.unreadByAdmin += 1;

        await chat.save();

        const savedMsg = chat.messages[chat.messages.length - 1];

        // Emit to admin room
        emitChatEvent(req, 'chatMessage', 'admin_chat', {
            chatId: chat._id,
            userId: req.user._id,
            userName: req.user.name,
            message: savedMsg,
        });

        // Push Notification for Admins
        try {
            const { sendChatNotification } = require('../services/notificationService');
            const admins = await User.find({ role: 'Admin' }).select('_id');
            const adminIds = admins.map(a => a._id.toString());
            if (adminIds.length > 0) {
                const preview = text ? (text.length > 30 ? text.substring(0, 30) + '...' : text) : 'Sent an image';
                sendChatNotification(adminIds, req.user.name, preview).catch(e => console.error("Admin Chat Push Error:", e));
            }
        } catch (e) { console.error("Failed to push chat to admins:", e); }

        // Also emit to user's own room so multiple tabs stay in sync
        emitChatEvent(req, 'chatMessage', `chat_${chat._id}`, {
            chatId: chat._id,
            message: savedMsg,
        });

        res.status(201).json(savedMsg);
    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Get all chat sessions with latest message (Admin list view)
// @route   GET /api/chat/admin/all
// @access  Private (Admin)
const getAllChats = async (req, res, next) => {
    try {
        const chats = await Chat.find({})
            .populate('user', 'name email mobile profileImage')
            .select('user userName lastMessage lastMessageAt isOpen unreadByAdmin createdAt')
            .sort({ lastMessageAt: -1 });
        res.json(chats);
    } catch (error) {
        next(error);
    }
};

// @desc    Get full chat thread by chatId (Admin detailed view)
// @route   GET /api/chat/admin/:chatId
// @access  Private (Admin)
const getChatById = async (req, res, next) => {
    try {
        const chat = await Chat.findById(req.params.chatId).populate('user', 'name email mobile profileImage');
        if (!chat) {
            res.status(404);
            throw new Error('Chat not found');
        }

        // Mark all user messages as read
        let changed = false;
        chat.messages.forEach((msg) => {
            if (msg.sender === 'user' && !msg.isRead) {
                msg.isRead = true;
                changed = true;
            }
        });
        if (changed) {
            chat.unreadByAdmin = 0;
            await chat.save();
        }

        res.json(chat);
    } catch (error) {
        next(error);
    }
};

// @desc    Send a message as admin (reply to user)
// @route   POST /api/chat/admin/:chatId/message
// @access  Private (Admin)
const sendMessageAsAdmin = async (req, res, next) => {
    try {
        const { text, images } = req.body;
        if ((!text || !text.trim()) && (!images || images.length === 0)) {
            res.status(400);
            throw new Error('Message text or image is required');
        }

        const chat = await Chat.findById(req.params.chatId);
        if (!chat) {
            res.status(404);
            throw new Error('Chat not found');
        }

        const newMessage = {
            sender: 'admin',
            text: text ? text.trim() : '',
            images: images || [],
        };

        chat.messages.push(newMessage);
        chat.lastMessage = text && text.trim() ? text.trim() : 'Sent an image';
        chat.lastMessageAt = new Date();
        chat.unreadByUser += 1;

        await chat.save();

        const savedMsg = chat.messages[chat.messages.length - 1];

        // Emit to user's chat room
        emitChatEvent(req, 'chatMessage', `chat_${chat._id}`, {
            chatId: chat._id,
            message: savedMsg,
        });

        // Push Notification for User
        try {
            const { sendChatNotification } = require('../services/notificationService');
            if (chat.user) {
                const preview = text ? (text.length > 30 ? text.substring(0, 30) + '...' : text) : 'Sent an image';
                sendChatNotification([chat.user.toString()], 'Admin', preview).catch(e => console.error("User Chat Push Error:", e));
            }
        } catch (e) { console.error("Failed to push chat to user:", e); }

        // Also emit to admin room so other admin tabs stay in sync
        emitChatEvent(req, 'chatMessage', 'admin_chat', {
            chatId: chat._id,
            userId: chat.user,
            userName: chat.userName,
            message: savedMsg,
        });

        res.status(201).json(savedMsg);
    } catch (error) {
        next(error);
    }
};

// @desc    Mark all admin messages as read by user
// @route   PUT /api/chat/read
// @access  Private (User)
const markReadByUser = async (req, res, next) => {
    try {
        const chat = await Chat.findOne({ user: req.user._id });
        if (!chat) return res.json({ message: 'No chat found' });

        chat.messages.forEach((msg) => {
            if (msg.sender === 'admin') msg.isRead = true;
        });
        chat.unreadByUser = 0;
        await chat.save();

        res.json({ message: 'Marked as read' });
    } catch (error) {
        next(error);
    }
};

// @desc    Close a chat session (Admin)
// @route   PUT /api/chat/admin/:chatId/close
// @access  Private (Admin)
const closeChat = async (req, res, next) => {
    try {
        const chat = await Chat.findById(req.params.chatId);
        if (!chat) {
            res.status(404);
            throw new Error('Chat not found');
        }
        chat.isOpen = false;
        await chat.save();

        // Notify user that admin closed the chat
        emitChatEvent(req, 'chatClosed', `chat_${chat._id}`, {
            chatId: chat._id,
            message: 'This chat has been closed by admin.',
        });

        res.json({ message: 'Chat closed successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete / clear a chat thread (Admin)
// @route   DELETE /api/chat/admin/:chatId
// @access  Private (Admin)
const deleteChat = async (req, res, next) => {
    try {
        const chat = await Chat.findByIdAndDelete(req.params.chatId);
        if (!chat) {
            res.status(404);
            throw new Error('Chat not found');
        }
        res.json({ message: 'Chat deleted successfully' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getMyChat,
    createNewChat,
    sendMessageAsUser,
    getAllChats,
    getChatById,
    sendMessageAsAdmin,
    markReadByUser,
    closeChat,
    deleteChat,
};
