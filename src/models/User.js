const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Counter = require('./Counter');

const userSchema = new mongoose.Schema(
    {
        customId: {
            type: String,
            unique: true,
        },
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        password: {
            type: String,
            required: true,
        },
        mobile: {
            type: String,
            required: true,
        },
        profileImage: {
            type: String, // URL to the uploaded image
            default: '',
        },
        role: {
            type: String,
            enum: ['Customer', 'Admin', 'Manager', 'Delivery'],
            default: 'Customer',
        },
        savedAddresses: {
            type: [
                new mongoose.Schema({
                    type: {
                        type: String,
                        enum: ['HOME', 'WORK', 'OTHER'],
                    },
                    addressLine1: String,
                    addressLine2: String,
                    city: String,
                    state: String,
                    postalCode: String,
                    mobile: String,
                    coordinates: {
                        lat: Number,
                        lng: Number
                    }
                }, { timestamps: true })
            ],
            default: [],
        },
        selectedAddress: {
            addressLine1: String,
            addressLine2: String,
            city: String,
            state: String,
            postalCode: String,
            country: String,
            mobile: String,
            type: {
                type: String, // 'HOME', 'WORK', 'OTHER', 'CURRENT_LOCATION'
            },
            coordinates: {
                lat: Number,
                lng: Number,
            },
        },
        isCodDisabled: {
            type: Boolean, // Used to ban users from using COD
            default: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        // ── Password reset (forgot-password flow) ──
        resetPasswordToken: {
            type: String,
            select: false,
        },
        resetPasswordExpire: {
            type: Date,
            select: false,
        },
    },
    {
        timestamps: true,
    }
);

// Pre-save hook to generate customId
userSchema.pre('save', async function () {
    if (this.isNew) {
        try {
            console.log('[Model:User] Generating CustomID...');
            const counter = await Counter.findOneAndUpdate(
                { id: 'userId' },
                { $inc: { seq: 1 } },
                { new: true, upsert: true }
            );

            this.customId = `USR-${counter.seq}`;
            console.log(`[Model:User] CustomID Generated: ${this.customId}`);
        } catch (error) {
            console.error('[Model:User] CustomID Generation Error:', error);
            throw error;
        }
    }
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Encrypt password using bcrypt
userSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
        throw error;
    }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
