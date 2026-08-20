const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Product = require('./src/models/Product');
const Category = require('./src/models/Category');
const connectDB = require('./src/config/db');

dotenv.config();
connectDB();

const run = async () => {
    try {
        await Product.deleteMany();
        await Category.deleteMany();

        const cat = await Category.create({ name: 'TestCat', description: 'Desc' });

        const product = {
            name: 'Test Product',
            description: 'Test Desc',
            category: cat._id,
            imageURL: 'http://example.com/image.jpg',
            type: 'Veg',
            variants: [{ name: 'Full', price: 100 }],
            isAvailable: true
        };

        console.log('Inserting:', product);
        await Product.create(product);
        console.log('Success!');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
