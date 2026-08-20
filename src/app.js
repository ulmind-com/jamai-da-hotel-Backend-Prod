const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const helmet = require('helmet');
// Rate limit import removed

// Initialize app
const app = express();

// --- CORS Configuration (Universal Access) ---
const corsOptions = {
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Note: Boolean true with origin '*' might fail in some strict browsers unless origin is echoed.
    // For true universal access with credentials, we would dynamic return origin. 
    // But per request "Allow '*'", we set it here.
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Fallback Manual CORS Headers (Just in case)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Security Middleware
app.use(helmet());
// Rate limiting removed as per request

// Middleware
app.use(express.json());
// app.use(cors()); // Removed original simple config
app.use(morgan('dev'));
app.use(morgan('dev'));

// Swagger Route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const couponRoutes = require('./routes/couponRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
// const paymentRoutes = require('./routes/paymentRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const restaurantRoutes = require('./routes/restaurantRoutes');
const chatRoutes = require('./routes/chatRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

app.use('/api/auth', authRoutes);
app.use('/api/users/addresses', require('./routes/addressRoutes')); // New Address API
app.use('/api/users', userRoutes);
app.use('/api/restaurant', restaurantRoutes);
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/categories', categoryRoutes);
app.use('/api/menu', productRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pos', require('./routes/posRoutes'));
// app.use('/api/payment', paymentRoutes); // Deprecated: Integrated into orderRoutes
app.use('/api/upload', uploadRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/vlogs', require('./routes/vlogRoutes'));

app.get('/', (req, res) => {
    res.send('API is running...');
});

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

module.exports = app;
