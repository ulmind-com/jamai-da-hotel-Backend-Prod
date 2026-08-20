const { Resend } = require('resend');

const sendOrderConfirmation = async (email, order) => {
    try {
        const resend = new Resend(process.env.RESEND_API_KEY);

        const output = `
      <h3>Thank you for your order!</h3>
      <p>Your order has been placed successfully.</p>
      <h3>Order Details</h3>
      <ul>
        <li>Order ID: ${order._id}</li>
        <li>Total Amount: ₹${order.finalAmount}</li>
        <li>Payment Method: ${order.paymentMethod}</li>
      </ul>
      <h3>Items</h3>
      <ul>
        ${order.items
                .map(
                    (item) =>
                        `<li>${item.variant} - Quantity: ${item.quantity} - Price: ₹${item.price}</li>`
                )
                .join('')}
      </ul>
      <p>We are preparing your food!</p>
    `;

        const { data, error } = await resend.emails.send({
            from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
            to: email, // list of receivers
            subject: 'Order Confirmation', // Subject line
            html: output, // html body
        });

        if (error) {
            console.error('Error sending email:', error);
            return;
        }

        console.log('Message sent: %s', data?.id);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};

module.exports = { sendOrderConfirmation };
