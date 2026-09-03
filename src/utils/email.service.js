const { Resend } = require('resend');
const hbs = require('handlebars');
const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const Restaurant = require('../models/Restaurant');
const { formatDate, formatDateTime, formatOrderDate } = require('./datetime');

// Resend wants attachment content as a base64 string, so every caller's
// content has to be converted here rather than at each call site.
//
// Puppeteer's page.pdf() returns a Uint8Array, not a Buffer. Passing that
// through String() yields "37,80,68,70,..." — the bytes as decimal text —
// which Resend happily accepts and decodes as base64, producing a file full
// of noise with no %PDF header. That is silent: the send succeeds and the
// attachment is ruined. So convert every binary shape explicitly and only
// treat a genuine string as ready-made base64.
const toBase64 = (content) => {
  if (Buffer.isBuffer(content)) return content.toString('base64');
  if (content instanceof ArrayBuffer) return Buffer.from(content).toString('base64');
  // Uint8Array and friends: respect the view's own offset and length.
  if (ArrayBuffer.isView(content)) {
    return Buffer.from(content.buffer, content.byteOffset, content.byteLength).toString('base64');
  }
  if (typeof content === 'string') return content;
  throw new Error(`Unsupported attachment content type: ${Object.prototype.toString.call(content)}`);
};

const normaliseAttachments = (attachments = []) =>
  (Array.isArray(attachments) ? attachments : [])
    .filter((att) => att && att.content)
    .map((att) => {
      const content = toBase64(att.content);

      // A corrupt PDF is invisible until someone opens it, so check the magic
      // bytes here where we can still shout about it.
      if (att.filename?.toLowerCase().endsWith('.pdf')) {
        const head = Buffer.from(content.slice(0, 8), 'base64').toString('latin1');
        if (!head.startsWith('%PDF')) {
          console.error(`[email] "${att.filename}" is not a valid PDF (starts with ${JSON.stringify(head)}) — dropping the attachment rather than sending a broken file.`);
          return null;
        }
      }

      return { filename: att.filename, content };
    })
    .filter(Boolean);

const compileTemplate = async (templateName, data) => {
  const filePath = path.join(__dirname, 'emailTemplates', `${templateName}.hbs`);
  const html = await fs.readFile(filePath, 'utf-8');
  return hbs.compile(html)(data);
};

const generateInvoicePDF = async (htmlContent) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(htmlContent);
  const pdfBuffer = await page.pdf({ format: 'A4' });
  await browser.close();
  return pdfBuffer;
};

const sendEmail = async (to, subject, templateName, data, attachments = []) => {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const html = await compileTemplate(templateName, data);

    const formattedAttachments = normaliseAttachments(attachments);

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev', // Ensure you use a verified domain here in production e.g. 'orders@yourdomain.com'
      to,
      subject,
      html,
      attachments: formattedAttachments.length > 0 ? formattedAttachments : undefined,
    };

    const { data: responseData, error } = await resend.emails.send(mailOptions);

    if (error) {
      console.error(`Error sending email to ${to}:`, error);
      return;
    }
    
    console.log(`Email '${subject}' sent to ${to}. Resend ID: ${responseData?.id}`);
  } catch (error) {
    console.error(`Exception sending email to ${to}:`, error);
  }
};

const sendWelcomeEmail = async (user) => {
  await sendEmail(user.email, 'Welcome to Jamai Da Hotel & Restaurant! 🍔', 'welcome', {
    name: user.name,
    year: new Date().getFullYear(),
  });
};

// ── Signup OTP verification email ──
const sendOtpEmail = async (email, otp) => {
  await sendEmail(email, `Your verification code is ${otp}`, 'otp', {
    otp,
    year: new Date().getFullYear(),
  });
};

// ── Generic raw-HTML email (used for reports, etc.), optional attachments ──
const sendRawEmail = async (to, subject, html, attachments = []) => {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const payload = {
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to,
      subject,
      html,
    };
    const formattedAttachments = normaliseAttachments(attachments);
    if (formattedAttachments.length > 0) {
      payload.attachments = formattedAttachments;
    }
    const { data, error } = await resend.emails.send(payload);
    if (error) {
      console.error(`Error sending raw email to ${to}:`, error);
      throw new Error(error.message || 'Email send failed');
    }
    console.log(`Raw email '${subject}' sent to ${to}. Resend ID: ${data?.id}`);
    return data;
  } catch (err) {
    console.error('sendRawEmail failed:', err);
    throw err;
  }
};

// ── Forgot-password reset link email ──
const sendPasswordResetEmail = async (user, resetUrl) => {
  await sendEmail(user.email, 'Reset your password 🔐', 'reset_password', {
    name: user.name,
    resetUrl,
    year: new Date().getFullYear(),
  });
};

const sendCouponBroadcast = async (user, coupon) => {
  const restaurant = await Restaurant.findOne();

  const formattedDate = formatDate(coupon.validFrom, { day: 'numeric', month: 'short' });
  const formattedExpiry = formatDate(coupon.validUntil, { day: 'numeric', month: 'short', year: 'numeric' });

  const discountSymbol = coupon.discountType === 'FLAT' ? '₹' : '%';
  const colorClass = coupon.discountType === 'FLAT' ? 'bg-yellow' : 'bg-teal';

  const discountText = coupon.discountType === 'FLAT'
    ? `₹${coupon.discountAmount}`
    : `${coupon.discountAmount}%`;

  await sendEmail(user.email, `🎉 Flash Sale! Use Code ${coupon.code}`, 'coupon', {
    couponCode: coupon.code,
    discountAmount: coupon.discountAmount,
    discountSymbol,
    discountText,
    discountType: coupon.discountType === 'FLAT' ? 'Flat Discount' : 'Discount',
    minOrderValue: coupon.minOrderValue,
    validUntil: formattedExpiry,
    code: coupon.code,
    colorClass,
    logo: restaurant ? restaurant.logo : 'https://placehold.co/100x100?text=Logo', // Fallback
    restaurantName: restaurant ? restaurant.name : 'Jamai Da Hotel & Restaurant'
  });
};

const sendOrderStatusEmail = async (order, user) => {
  const currentStatus = order.orderStatus;

  // SKIP emails for these statuses as per user request
  if (['PREPARING', 'OUT_FOR_DELIVERY'].includes(currentStatus)) {
    console.log(`[Email] Skipping email for status: ${currentStatus}`);
    return;
  }

  const restaurant = await Restaurant.findOne();

  // Format Date
  const orderDate = formatOrderDate(order.createdAt);

  // Prepare Items with Images
  const orderItems = order.items.map(item => ({
    name: item.product ? item.product.name : 'Item',
    image: item.product ? item.product.imageURL : null, // Add Image
    quantity: item.quantity,
    price: item.price.toFixed(2),
    total: (item.price * item.quantity).toFixed(2),
    variant: item.variant
  }));

  // Template Selection
  let templateName = 'status'; // Fallback
  let subject = `Order Status: ${currentStatus}`;

  if (currentStatus === 'PLACED') {
    templateName = 'order_placed';
    subject = `Order Placed Successfully! 🥘`;
  } else if (currentStatus === 'ACCEPTED') {
    templateName = 'order_accepted';
    subject = `Restaurant Accepted Your Order! 👨‍🍳`;
  } else if (currentStatus === 'DELIVERED') {
    // Handled by sendOrderDeliveredWithInvoice, but just in case
    return;
  }

  await sendEmail(user.email, subject, templateName, {
    orderId: order.customId || order._id,
    customerName: user.name,
    orderDate,
    currentStatus,
    items: orderItems,

    // Billing
    subtotal: order.totalAmount.toFixed(2),
    tax: order.taxAmount.toFixed(2),
    deliveryFee: (order.deliveryFee || 0).toFixed(2),
    packaging: (order.packagingTotal || 0) > 0 ? (order.packagingTotal).toFixed(2) : '',
    discount: (order.discountApplied || 0).toFixed(2),
    total: order.finalAmount.toFixed(2),

    // Address
    deliveryAddress: typeof order.deliveryAddress === 'object' ?
      `${order.deliveryAddress.addressLine1}, ${order.deliveryAddress.city || ''}` : order.deliveryAddress,

    // Restaurant Info
    restaurantName: restaurant ? restaurant.name : 'Jamai Da Hotel & Restaurant',
    restaurantAddress: restaurant ? restaurant.address : 'Haldia, West Bengal',
    logo: restaurant ? restaurant.logo : null
  });
};



const numberToWords = (num) => {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if ((num = num.toString()).length > 9) return 'overflow';
  const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return;
  let str = '';
  str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
  str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
  str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
  str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
  str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
  return str.trim();
};

const generateOrderInvoicePDF = async (order, user) => {
  const restaurant = await Restaurant.findOne();
  const date = formatDate(new Date());
  const invoiceData = {
    orderId: order.customId || order._id,
    date,
    customerName: user.name,
    customerEmail: user.email,
    customerMobile: user.mobile,
    customerAddress: typeof order.deliveryAddress === 'object' ? order.deliveryAddress : { addressLine1: order.deliveryAddress },
    items: order.items.map((item, index) => ({
      srNo: index + 1,
      name: item.product ? item.product.name : 'Item',
      variant: item.variant,
      quantity: item.quantity,
      price: item.price.toFixed(2),
      amount: (item.price * item.quantity).toFixed(2),
      discount: '0.00', // Item level discount not tracked explicitly yet, simplified
      netValue: (item.price * item.quantity).toFixed(2)
    })),
    totalAmount: order.totalAmount.toFixed(2),
    discountApplied: order.discountApplied.toFixed(2),
    deliveryFee: (order.deliveryFee || 0).toFixed(2),
    packaging: (order.packagingTotal || 0) > 0 ? (order.packagingTotal).toFixed(2) : '',
    finalAmount: order.finalAmount.toFixed(2),
    finalAmountWords: numberToWords(Math.round(order.finalAmount)) + ' Rupees Only',
    paymentStatus: order.paymentStatus,
    // Restaurant Details
    // Restaurant Details
    restaurantName: restaurant ? restaurant.name : 'Jamai Da Hotel & Restaurant',
    restaurantAddress: restaurant ? restaurant.address : 'Gandhi Nagar Colony, Haldia',
    restaurantGST: restaurant ? restaurant.gstIn : '-',
    restaurantFSSAI: restaurant ? restaurant.fssaiLicense : '-',
    logo: restaurant ? restaurant.logo : null, // Pass logo for watermark
    invoiceNo: `INV-${Date.now().toString().slice(-6)}`,

    // Tax Details from Order
    cgst: (order.cgstTotal || 0).toFixed(2),
    sgst: (order.sgstTotal || 0).toFixed(2),
    igst: (order.igstTotal || 0).toFixed(2), // Added IGST support
    totalTax: (order.taxAmount || 0).toFixed(2)
  };

  const invoiceHtml = await compileTemplate('invoice', invoiceData);
  return await generateInvoicePDF(invoiceHtml);
};

const sendOrderDeliveredWithInvoice = async (order, user, existingPdfBuffer = null) => {
  let pdfBuffer = existingPdfBuffer;
  if (!pdfBuffer) {
    pdfBuffer = await generateOrderInvoicePDF(order, user);
  }

  const restaurant = await Restaurant.findOne();

  // Format Date
  const orderDate = formatOrderDate(order.createdAt);
  // The template's "Delivered at" line needs the handover time, not the
  // time the order was placed.
  const deliveredDate = formatOrderDate(order.deliveredAt || new Date());

  // Prepare Items for Email
  const orderItems = order.items.map(item => ({
    name: item.product ? item.product.name : 'Item',
    image: item.product ? item.product.imageURL : null, // Add Image
    quantity: item.quantity,
    price: item.price.toFixed(2),
    total: (item.price * item.quantity).toFixed(2)
  }));

  await sendEmail(user.email, `Your order has been delivered! 🍲`, 'order_delivered', {
    orderId: order.customId || order._id,
    customerName: user.name,
    orderDate,
    deliveredDate,
    items: orderItems,

    // Billing
    subtotal: order.totalAmount.toFixed(2),
    tax: order.taxAmount.toFixed(2),
    deliveryFee: (order.deliveryFee || 0).toFixed(2),
    packaging: (order.packagingTotal || 0) > 0 ? (order.packagingTotal).toFixed(2) : '',
    discount: (order.discountApplied || 0).toFixed(2),
    total: order.finalAmount.toFixed(2),

    // Address
    deliveryAddress: typeof order.deliveryAddress === 'object' ?
      `${order.deliveryAddress.addressLine1}, ${order.deliveryAddress.city || ''}` : order.deliveryAddress,

    // Restaurant Info for Header
    restaurantName: restaurant ? restaurant.name : 'Jamai Da Hotel & Restaurant',
    restaurantAddress: restaurant ? restaurant.address : 'Haldia, West Bengal',
    logo: restaurant ? restaurant.logo : null
  }, [
    {
      filename: `Invoice-${order.customId || order._id}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }
  ]);
};

const sendOrderCancelledEmail = async (order, user, reason = 'Administrative Action') => {
  await sendEmail(user.email, `Order Cancelled: ${order.customId || order._id}`, 'cancelled', {
    orderId: order.customId || order._id,
    reason,
    name: user.name
  });
};

module.exports = {
  sendWelcomeEmail,
  sendOtpEmail,
  sendPasswordResetEmail,
  sendRawEmail,
  sendCouponBroadcast,
  sendOrderStatusEmail,
  sendOrderDeliveredWithInvoice,
  sendOrderCancelledEmail,
  generateOrderInvoicePDF
};
