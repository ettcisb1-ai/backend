require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Course = require('./Models/Course');

const run = async () => {
  try {
    await connectDB();
    console.log('Connected to DB successfully.');

    const courses = await Course.find({});
    console.log(`Found ${courses.length} course(s) to recalculate.`);

    for (const course of courses) {
      const oldCount = course.videosCount;
      await course.save();
      console.log(`Course "${course.title}": recalculated videosCount from ${oldCount} to ${course.videosCount}`);
    }

    console.log('\nRecalculation complete!');
    mongoose.connection.close();
  } catch (err) {
    console.error('Error during recalculation:', err);
    mongoose.connection.close();
  }
};

run();
