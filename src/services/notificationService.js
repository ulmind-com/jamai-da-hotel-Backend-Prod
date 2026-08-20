const axios = require('axios');

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

/**
 * Helper to send push notification via OneSignal API
 */
const sendPushNotification = async (targetUserIds, header, message, data, options = {}) => {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.warn("OneSignal credentials missing, skipping push notification.");
    return;
  }

  // Filter out invalid targets
  const validTargets = targetUserIds.filter(id => id);
  if (validTargets.length === 0) return;

  const payload = {
    app_id: ONESIGNAL_APP_ID,
    target_channel: "push",
    include_aliases: {
      external_id: validTargets.map(id => String(id))
    },
    headings: { en: header },
    contents: { en: message },
    data: data || {},
    ...options
  };

  try {
    const response = await axios.post('https://onesignal.com/api/v1/notifications', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
      }
    });
    console.log(`Push notification sent to ${validTargets.length} users:`, response.data);
    return response.data;
  } catch (err) {
    console.error("OneSignal Error:", err.response ? err.response.data : err.message);
  }
};

/**
 * Specialized Notification Senders
 */
const sendAdminOrderNotification = async (adminIds, orderId) => {
  return await sendPushNotification(
    adminIds,
    "🚨 NEW ORDER ALERT!",
    `Order #${String(orderId).slice(-6)} has been placed! Don't keep them waiting, chef! 👨‍🍳🔥`,
    { orderId, type: 'NEW_ORDER' },
    {
      // Custom category explicitly defined with OneSignal UUID
      android_channel_id: process.env.ONESIGNAL_ADMIN_CHANNEL_ID,
      android_sound: "admin_loud",
      ios_sound: "admin_loud.wav",
      // These options ensure the notification pops up heads-up directly
      priority: 10,
      android_visibility: 1
    }
  );
};

const sendOrderStatusNotification = async (userId, status, orderId) => {
  const statusMessages = {
    'ACCEPTED': {
      title: "✅ Order Confirmed!",
      body: "Woohoo! We've accepted your order. Our chefs are firing up the stoves now! 🍳🔥"
    },
    'PREPARING': {
      title: "🧑‍🍳 Sizzling in the Kitchen!",
      body: "Your delicious food is currently being prepared with love! Hang tight! 🥘✨"
    },
    'OUT_FOR_DELIVERY': {
      title: "🚀 Out for Delivery!",
      body: "Knock knock! Your hunger savior is on the way with your hot meal! 🏍️💨"
    },
    'DELIVERED': {
      title: "🍱 Grab Your Fork!",
      body: "Your order has been safely delivered! Bon Appétit! Don't forget to rate us! 🌟🍽️"
    },
    'CANCELLED': {
      title: "❌ Order Cancelled",
      body: "Oops! We're sorry, but your order couldn't be processed this time. 😔 Refund initiated if paid!"
    }
  };
  
  const content = statusMessages[status] || { title: "📦 Order Update", body: `Your order status changed to ${status}` };
  
  return await sendPushNotification(
    [userId],
    content.title,
    content.body,
    { orderId, type: 'ORDER_UPDATE' },
    {
      android_channel_id: process.env.ONESIGNAL_ORDER_CHANNEL_ID,
      android_sound: "order_update",
      ios_sound: "order_update.wav",
      priority: 10
    }
  );
};

const sendChatNotification = async (targetUserIds, senderName, messageText) => {
  const targets = Array.isArray(targetUserIds) ? targetUserIds : [targetUserIds];
  return await sendPushNotification(
    targets,
    `💬 Message from ${senderName}`,
    `"${messageText.length > 50 ? messageText.slice(0, 50) + '...' : messageText}"`,
    { type: 'CHAT_MESSAGE' },
    {
      android_channel_id: process.env.ONESIGNAL_CHAT_CHANNEL_ID,
      android_sound: "chat_alert",
      ios_sound: "chat_alert.wav",
      priority: 10
    }
  );
};

module.exports = {
  sendPushNotification,
  sendAdminOrderNotification,
  sendOrderStatusNotification,
  sendChatNotification
};
