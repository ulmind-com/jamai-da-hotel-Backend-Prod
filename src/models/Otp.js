const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const otpSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            index: true,
            lowercase: true,
            trim: true,
        },
        otp: {
            type: String, // hashed
            required: true,
        },
        purpose: {
            type: String,
            enum: ['signup'],
            default: 'signup',
        },
        attempts: {
            type: Number,
            default: 0,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

// TTL index — MongoDB auto-deletes the document once expiresAt passes.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compare a plaintext OTP against the stored hash.
otpSchema.methods.matchOtp = async function (enteredOtp) {
    return bcrypt.compare(enteredOtp, this.otp);
};

module.exports = mongoose.model('Otp', otpSchema);
