require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('../Models/Course');
const Video = require('../Models/Video');

mongoose.connect(process.env.MONGO_DEV_URI).then(async () => {
  const courses = await Course.find({});
  let totalRemoved = 0;

  for (const course of courses) {
    let changed = false;

    for (const mod of course.modules) {
      const validLectures = [];
      for (const lec of mod.lectures) {
        if (!lec.video) {
          // No video reference — keep it (standalone lecture)
          validLectures.push(lec);
          continue;
        }
        const exists = await Video.exists({ _id: lec.video });
        if (exists) {
          validLectures.push(lec);
        } else {
          totalRemoved++;
          changed = true;
          console.log(`  Removing orphaned lecture: "${lec.title}" from course "${course.title}"`);
        }
      }
      mod.lectures = validLectures;
    }

    if (changed) await course.save();
  }

  console.log(`\nDone. Total orphaned lectures removed: ${totalRemoved}`);
  process.exit(0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
