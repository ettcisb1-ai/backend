const mongoose = require('mongoose');

let cachedDbPromise = null;

const connectDB = async () => {
  // If connection is already established, return it
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // If a connection is not already in progress, start it
  if (!cachedDbPromise) {
    const uri = process.env.MONGO_DEV_URI;
    if (!uri) {
      throw new Error('MONGO_DEV_URI is not defined in environment variables');
    }

    console.log('Initiating new MongoDB connection...');
    cachedDbPromise = mongoose.connect(uri).then((m) => {
      console.log(`MongoDB Connected successfully: ${m.connection.host}`);
      return m;
    }).catch((err) => {
      console.error(`MongoDB Connection Error during connection: ${err.message}`);
      cachedDbPromise = null; // Reset cached promise on failure to retry next time
      throw err;
    });
  }

  return cachedDbPromise;
};

module.exports = connectDB;
