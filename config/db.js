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
      // Migration: transition suspended users to inactive status
      try {
        const User = require('../Models/User');
        User.updateMany({ status: 'suspended' }, { status: 'inactive' })
          .then(result => {
            if (result.modifiedCount > 0) {
              console.log(`[MIGRATION] Migrated ${result.modifiedCount} suspended users to inactive.`);
            }
          })
          .catch(err => {
            console.error('[MIGRATION ERROR] Failed to update suspended users:', err);
          });
      } catch (err) {
        console.error('[MIGRATION ERROR] Failed to load User model for migration:', err);
      }
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
