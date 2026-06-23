const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide a course title'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    thumbnail: {
      type: String,
      default: '',
    },
    // FR-27: Category-based classification
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Categorie',
      required: [true, 'Please provide a category'],
    },
    difficulty: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      default: 'Beginner',
    },
    instructor: {
      type: String,
      default: '',
    },
    price: {
      type: String,
      enum: ['Free', 'Premium'],
      default: 'Free',
    },
    status: {
      type: String,
      enum: ['Draft', 'Published', 'Archived'],
      default: 'Draft',
    },
    videosCount: {
      type: Number,
      default: 0,
    },
    studentsCount: {
      type: Number,
      default: 0,
    },
    // FR-25 & FR-26: Multiple video lectures organized in defined order
    modules: [
      {
        title: { type: String, required: true },
        // FR-26: Module-level order index
        order: { type: Number, default: 0 },
        lectures: [
          {
            title: { type: String, required: true },
            duration: { type: String, default: '0:00' },
            // FR-26: Lecture-level order index within module
            order: { type: Number, default: 0 },
            // FR-29 & FR-32: Store internal video reference, NOT a raw external URL
            video: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', default: null },
            // Fallback URL (only used when no Video doc is linked)
            url: { type: String, default: '' },
          }
        ]
      }
    ],
    // Legacy lessons array kept for backward compat
    lessons: [
      {
        title: { type: String, required: true },
        videoUrl: { type: String, required: true },
        duration: { type: String, default: '' },
      }
    ],
  },
  {
    timestamps: true,
  }
);

// Auto-update videosCount before saving
courseSchema.pre('save', function () {
  let count = 0;
  if (this.modules && Array.isArray(this.modules)) {
    this.modules.forEach(mod => {
      if (mod.lectures && Array.isArray(mod.lectures)) {
        count += mod.lectures.length;
      }
    });
  }
  if (this.lessons && Array.isArray(this.lessons)) {
    count += this.lessons.length;
  }
  this.videosCount = count;
});

// NOTE: Sorting of modules/lectures by the `order` field is intentionally
// handled in the controller (sortCourse helper) rather than here.
// A pre-find hook with `this.transform` is not supported in this version of
// Mongoose and caused "TypeError: next is not a function" crashes.

module.exports = mongoose.model('Course', courseSchema);