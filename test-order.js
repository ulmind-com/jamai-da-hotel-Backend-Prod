require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./src/models/Order');

async function test() {
    await mongoose.connect(process.env.MONGO_URI);
    try {
        const o = new Order({
            totalAmount: 100,
            finalAmount: 100,
            paymentMethod: 'COD'
        });
        await o.save();
        console.log("Success! ID:", o.customId);
        await Order.deleteOne({ _id: o._id });
    } catch (e) {
        console.error("Test Error:", e);
    }
    mongoose.connection.close();
}
test();
