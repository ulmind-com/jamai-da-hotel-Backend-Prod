# Food Delivery Backend API

## Description
A production-ready RESTful API for a food delivery application built with Node.js, Express, and MongoDB.

## Features
-   **Authentication**: JWT-based auth (Admin/Customer).
-   **Menu Management**: CRUD for Categories and Products.
-   **Order Processing**: Place orders, strict status workflows, and history.
-   **Real-Time Updates**: Socket.io for live order tracking.
-   **Payments**: Razorpay integration.
-   **Admin Dashboard**: Analytics using MongoDB Aggregation.
-   **Security**: Helmet headers, Rate Limiting, Input Validation.
-   **Documentation**: Swagger UI.

## Tech Stack
-   Node.js
-   Express.js
-   MongoDB (Atlas)
-   Socket.io
-   Cloudinary (Image Upload)
-   Nodemailer (Email Service)

## Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in the root directory (see `.env.example` or use the provided keys).
4.  Run the seed script for demo data:
    ```bash
    node seed.js
    ```
5.  Start the server:
    ```bash
    npm start
    # or
    node server.js
    ```

## API Documentation
Visit `http://localhost:5000/api-docs` for the interactive Swagger documentation.

## Environment Variables
-   `PORT`: Server port
-   `MONGO_URI`: MongoDB connection string
-   `JWT_SECRET`: Secret for JWT
-   `CLOUDINARY_CLOUD_NAME`: Cloudinary Name
-   `CLOUDINARY_API_KEY`: Cloudinary Key
-   `CLOUDINARY_API_SECRET`: Cloudinary Secret
-   `RAZORPAY_KEY_ID`: Razorpay Key ID
-   `RAZORPAY_KEY_SECRET`: Razorpay Key Secret

## Project Structure
-   `src/models`: Database Schemas
-   `src/controllers`: Request Logic
-   `src/routes`: API Routes
-   `src/middleware`: Auth, Validation, Error Handling
-   `src/config`: DB, Swagger
-   `src/utils`: Helpers (Email)
