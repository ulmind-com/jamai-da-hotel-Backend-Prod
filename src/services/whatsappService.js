const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');

let client;
let isReady = false;

const initialize = async () => {
    console.log('[WhatsApp] Initializing Client with RemoteAuth...');

    const store = new MongoStore({ mongoose: mongoose });

    client = new Client({
        authStrategy: new RemoteAuth({
            clientId: 'foodie-client', // Explicit ID to prevent 'undefined' in path
            store: store,
            dataPath: './.wwebjs_auth', // Force a local path instead of temp
            backupSyncIntervalMs: 300000
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ],
            authTimeoutMs: 60000,
            // executablePath is collected from environment variables in Docker
            // Do NOT set it manually here for local dev unless needed.
        }
    });

    client.on('qr', (qr) => {
        console.log('[WhatsApp] QR RECEIVED. Scan this with your phone:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('[WhatsApp] Client is READY!');
        isReady = true;
    });

    client.on('remote_session_saved', () => {
        console.log('[WhatsApp] Remote session saved to DB.');
    });

    client.on('auth_failure', (msg) => {
        console.error('[WhatsApp] Auth Failure:', msg);
    });

    client.on('disconnected', (reason) => {
        console.log('[WhatsApp] Client was disconnected:', reason);
        isReady = false;
    });

    try {
        await client.initialize();
    } catch (err) {
        console.error('[WhatsApp] Initialization Error:', err.message);
    }
};

// Helper to sanitize and get Number ID
const getWhatsAppId = async (phone) => {
    if (!isReady) {
        console.warn('[WhatsApp] Client not ready. Cannot resolve number.');
        return null;
    }
    try {
        let sanitized_number = phone.toString().replace(/\D/g, '');
        if (sanitized_number.length === 10) {
            sanitized_number = '91' + sanitized_number;
        }
        const numberId = await client.getNumberId(sanitized_number);
        return numberId ? numberId._serialized : null;
    } catch (error) {
        console.error('[WhatsApp] Error identifying number:', error);
        return null;
    }
};

const sendStatusUpdate = async (phone, order, status) => {
    try {
        if (!phone) return;

        const chatId = await getWhatsAppId(phone);
        if (!chatId) {
            console.error(`[WhatsApp] Number not registered: ${phone}`);
            return;
        }

        const customerName = order.customer ? order.customer.name : 'Foodie';
        const customId = order.customId || order._id;
        const itemCount = order.items.length;
        const amount = order.finalAmount;

        // Emoji Map & Pro Messages
        const statusConfig = {
            'PLACED': { emoji: '📝', title: 'Order Placed', desc: 'We have received your order.' },
            'ACCEPTED': { emoji: '👨‍🍳', title: 'Order Accepted', desc: 'The kitchen has started preparing your meal.' },
            'PREPARING': { emoji: '🔥', title: 'Cooking Now', desc: 'Your food is getting sizzled & spice!' },
            'OUT_FOR_DELIVERY': { emoji: '🛵', title: 'Out for Delivery', desc: 'Our rider is zooming towards you.' },
            'DELIVERED': { emoji: '✅', title: 'Delivered', desc: 'Enjoy your delicious meal! 😋' },
            'CANCELLED': { emoji: '❌', title: 'Order Cancelled', desc: 'We are sorry for the inconvenience.' }
        };

        const config = statusConfig[status] || { emoji: '🔔', title: 'Status Update', desc: 'Check your order status.' };

        const message = `*${config.emoji} ${config.title}*
        
Hey *${customerName}*! 👋
Your order *#${customId}* is updated.

*Current Status:* ${status}
_${config.desc}_

📦 *Order Details:*
• Items: ${itemCount}
• Total: *₹${amount}*

👇 Track your order here:
[Link to App]

_Thanks for choosing us!_ 🍔`;

        await client.sendMessage(chatId, message);
        console.log(`[WhatsApp] Status update sent to ${chatId}`);

    } catch (error) {
        console.error('[WhatsApp] Error in sendStatusUpdate:', error);
    }
};

const sendInvoice = async (phone, order, pdfBuffer = null) => {
    try {
        if (!phone) return;

        const chatId = await getWhatsAppId(phone);
        if (!chatId) {
            console.error(`[WhatsApp] Number not registered for invoice: ${phone}`);
            return;
        }

        const customerName = order.customer ? order.customer.name : 'Foodie';
        const customId = order.customId || order._id;
        const totalAmount = order.finalAmount;

        const message = `✅ *Order Delivered Successfully!*

Dear *${customerName}*, 
Hope you enjoy the meal! 🥘

🧾 *INVOICE SUMMARY*
━━━━━━━━━━━━━━━━━━━━
🆔 *Order #:* ${customId}
📅 *Date:* ${new Date().toLocaleDateString('en-IN')}
💰 *Grand Total:* *₹${totalAmount}*
━━━━━━━━━━━━━━━━━━━━

${pdfBuffer ? '📎 *Invoice PDF attached below.*' : ''}

Rate us on the app! ⭐⭐⭐⭐⭐`;

        await client.sendMessage(chatId, message);
        console.log(`[WhatsApp] Invoice text sent to ${chatId}`);

        // Send PDF if available
        if (pdfBuffer) {
            console.log(`[WhatsApp] Sending PDF Invoice for ${customId} (Size: ${pdfBuffer.length} bytes)...`);

            // Add a LONGER delay (5s) to prevent rate limiting/ordering issues
            await new Promise(resolve => setTimeout(resolve, 5000));

            try {
                // Ensure it's a Buffer
                if (!Buffer.isBuffer(pdfBuffer)) {
                    console.log('[WhatsApp] Converting PDF to Buffer...');
                    pdfBuffer = Buffer.from(pdfBuffer);
                }

                // Convert to Base64 and clean it
                const base64Data = pdfBuffer.toString('base64');

                // MessageMedia expects: mimetype, data (base64), filename
                const media = new MessageMedia('application/pdf', base64Data, `Invoice-${customId}.pdf`);

                await client.sendMessage(chatId, media, { caption: `Invoice-${customId}` });
                console.log(`[WhatsApp] PDF Invoice sent to ${chatId}`);
            } catch (mediaError) {
                console.error(`[WhatsApp] Failed to send PDF media to ${chatId}:`, mediaError);
            }
        }

    } catch (error) {
        console.error('[WhatsApp] Error in sendInvoice:', error);
    }
};

module.exports = {
    initialize,
    sendStatusUpdate,
    sendInvoice
};
