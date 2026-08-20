const mongoose = require('mongoose');
const dotenv = require('dotenv');
const colors = require('colors');
const User = require('./src/models/User');
const Category = require('./src/models/Category');
const Product = require('./src/models/Product');
const connectDB = require('./src/config/db');

dotenv.config();
connectDB();

const seed = async () => {
    try {
        await User.deleteMany();
        await Category.deleteMany();
        await Product.deleteMany();

        // Users
        const admin = await User.create({
            name: 'Admin User',
            email: 'admin@example.com',
            password: 'password123',
            role: 'Admin',
            mobile: '9999999999'
        });

        const customer = await User.create({
            name: 'John Doe',
            email: 'customer@example.com',
            password: 'password123',
            role: 'Customer',
            mobile: '8888888888'
        });

        // Categories
        const categories = await Category.insertMany([
            { name: 'Starters', imageURL: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg' },
            { name: 'Main Course', imageURL: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg' },
            { name: 'Breads', imageURL: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg' },
            { name: 'Desserts', imageURL: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg' }
        ]);

        // Products
        const products = [
            {
                name: 'Paneer Tikka',
                description: 'Cottage cheese grilled with spices',
                category: categories[0]._id,
                imageURL: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
                type: 'Veg',
                variants: [{ name: 'Full', price: 250 }],
                isAvailable: true
            },
            {
                name: 'Chicken Tandoori',
                description: 'Roasted chicken with yogurt and spices',
                category: categories[0]._id,
                imageURL: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
                type: 'Non-Veg',
                variants: [{ name: 'Full', price: 350 }, { name: 'Half', price: 200 }],
                isAvailable: true
            },
            {
                name: 'Butter Chicken',
                description: 'Chicken in tomato butter gravy',
                category: categories[1]._id,
                imageURL: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
                type: 'Non-Veg',
                variants: [{ name: 'Full', price: 400 }],
                isAvailable: true
            },
            {
                name: 'Dal Makhani',
                description: 'Black lentils cooked with butter and cream',
                category: categories[1]._id,
                imageURL: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
                type: 'Veg',
                variants: [{ name: 'Full', price: 280 }],
                isAvailable: true
            },
            {
                name: 'Naan',
                description: 'Leavened flatbread',
                category: categories[2]._id,
                imageURL: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
                type: 'Veg',
                variants: [{ name: 'Butter', price: 40 }, { name: 'Plain', price: 30 }],
                isAvailable: true
            },
            {
                name: 'Roti',
                description: 'Whole wheat flatbread',
                category: categories[2]._id,
                imageURL: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
                type: 'Veg',
                variants: [{ name: 'Butter', price: 25 }, { name: 'Plain', price: 15 }],
                isAvailable: true
            },
            {
                name: 'Gulab Jamun',
                description: 'Deep fried milk solids in sugar syrup',
                category: categories[3]._id,
                imageURL: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
                type: 'Veg',
                variants: [{ name: '2 pcs', price: 100 }],
                isAvailable: true
            },
            {
                name: 'Rasgulla',
                description: 'Ball shaped dumplings of chhena and semolina dough',
                category: categories[3]._id,
                imageURL: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
                type: 'Veg',
                variants: [{ name: '2 pcs', price: 120 }],
                isAvailable: true
            }
        ];

        await Product.insertMany(products);

        console.log('Data Imported!'.green.inverse);
        process.exit();
    } catch (error) {
        console.error(`${error}`.red.inverse);
        process.exit(1);
    }
}

seed();
