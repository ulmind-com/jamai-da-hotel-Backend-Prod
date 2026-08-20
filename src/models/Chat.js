const mongoose = require('mongoose');

// Sub-schema for individual messages within a chat session
const messageSchema = new mongoose.Schema(
    {
        sender: {
            type: String,
            enum: ['user', 'admin'],
            required: true,
        },
        text: {
            type: String,
            default: '',
        },
        images: {
            type: [String],
            default: [],
        },
        isRead: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// Main chat session schema (one per user)
const chatSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        userName: {
            type: String, // Denormalised for quick display in admin panel
            required: true,
        },
        messages: [messageSchema],
        isOpen: {
            type: Boolean,
            default: true, // Admin can close the chat
        },
        lastMessage: {
            type: String,
            default: '',
        },
        lastMessageAt: {
            type: Date,
            default: Date.now,
        },
        unreadByAdmin: {
            type: Number,
            default: 0,
        },
        unreadByUser: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;
