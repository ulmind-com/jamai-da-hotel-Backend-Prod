const dotenv = require('dotenv');
// Load env vars
dotenv.config();

const app = require('./src/app');
const connectDB = require('./src/config/db');
const http = require('http');
const { Server } = require('socket.io');

// Connect to Database
if (process.env.NODE_ENV !== 'test') {
    connectDB().then(() => {
        // Initialize Scheduler
        const { rescheduleCouponBlasts, initRestaurantCron } = require('./src/utils/schedulerUtils');
        rescheduleCouponBlasts();
        initRestaurantCron();

        // Initialize WhatsApp Service
        // ── DISABLED: whatsapp-web.js + puppeteer consumes too much memory on hosting.
        // Re-enable by uncommenting the two lines below (needs Chrome/Docker runtime).
        // const whatsappService = require('./src/services/whatsappService');
        // whatsappService.initialize();
    });
}

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins for now, restrict in production
        methods: ['GET', 'POST'],
    },
});

// Store io instance in app to use in controllers
app.set('io', io);

io.on('connection', (socket) => {
    console.log('New client connected: ' + socket.id);

    // ── Order Tracking ─────────────────────────────────────────────────────
    socket.on('joinOrder', (orderId) => {
        socket.join(`order_${orderId}`);
        console.log(`Socket ${socket.id} joined room order_${orderId}`);
    });

    // ── Chat: User joins their own chat room ────────────────────────────────
    socket.on('joinChat', (chatId) => {
        socket.join(`chat_${chatId}`);
        console.log(`Socket ${socket.id} joined chat room chat_${chatId}`);
    });

    // ── Chat: Admin joins global admin room to receive all user messages ────
    socket.on('joinAdminChat', () => {
        socket.join('admin_chat');
        console.log(`Admin socket ${socket.id} joined admin_chat room`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

if (process.env.NODE_ENV !== 'test') {
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
