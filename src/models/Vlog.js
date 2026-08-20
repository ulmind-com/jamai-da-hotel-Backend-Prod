const mongoose = require('mongoose');

const vlogSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: '',
        },
        mediaUrl: {
            type: String,
            required: true,
        },
        mediaType: {
            type: String,
            enum: ['IMAGE', 'VIDEO'],
            required: true,
        },
        thumbnailUrl: {
            type: String,
            default: '', // Auto-generated or admin-uploaded
        },
        isPublished: {
            type: Boolean,
            default: true,
        },
        likes: {
            type: Number,
            default: 0,
        },
        views: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

const Vlog = mongoose.model('Vlog', vlogSchema);

module.exports = Vlog;
