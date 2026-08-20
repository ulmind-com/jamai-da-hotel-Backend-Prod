const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const http = require('http');

dotenv.config();

const runcheck = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const User = require('../src/models/User');
        const adminUser = await User.findOne({ email: 'banerjeesoumyajit10@gmail.com' });

        if (!adminUser) {
            console.error('Admin user not found.');
            process.exit(1);
        }

        console.log(`Found Admin: ${adminUser.name}`);
        const token = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

        const makeRequest = (path) => {
            return new Promise((resolve, reject) => {
                const options = {
                    hostname: 'localhost',
                    port: 5000,
                    path: path,
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                };

                const req = http.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        resolve({ status: res.statusCode, body: data });
                    });
                });

                req.on('error', (e) => {
                    reject(e);
                });
                req.end();
            });
        };

        console.log('\n--- Testing GET /api/admin/dashboard ---');
        const dash = await makeRequest('/api/admin/dashboard');
        console.log('Status:', dash.status);
        console.log('Data:', dash.body.substring(0, 500) + '...'); // Truncate

        console.log('\n--- Testing GET /api/admin/analytics ---');
        const ana = await makeRequest('/api/admin/analytics');
        console.log('Status:', ana.status);
        console.log('Data:', ana.body.substring(0, 500) + '...');

        console.log('\n--- Testing GET /api/admin/analytics?custom... ---');
        const end = new Date().toISOString();
        const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const anaCustom = await makeRequest(`/api/admin/analytics?startDate=${start}&endDate=${end}`);
        console.log('Status:', anaCustom.status);
        console.log('Data:', anaCustom.body.substring(0, 500) + '...');

        await mongoose.disconnect();
        console.log('Done');
        process.exit(0);

    } catch (error) {
        console.error('Script Error:', error);
        process.exit(1);
    }
};

runcheck();
