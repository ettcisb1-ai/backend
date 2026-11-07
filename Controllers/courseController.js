const Course = require('../Models/Course');
const Categorie = require('../Models/Categorie');
const User = require('../Models/User');
const Video = require('../Models/Video');
const SubscriptionSettings = require('../Models/Subscription');
const mongoose = require('mongoose');
const Progress = require('../Models/Progress');
const Notification = require('../Models/Notification');

// ─── Helper: resolve or create a category ────────────────────────────────────
const resolveCategory = async (category) => {
  if (mongoose.Types.ObjectId.isValid(category)) return category;

  const foundCat = await Categorie.findOne({
    $or: [
      { name: new RegExp('^' + category + '$', 'i') },
      { slug: new RegExp('^' + category.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '$', 'i') }
    ]
  });
  if (foundCat) return foundCat._id;

  const newCat = await Categorie.create({
    name: category,
    slug: category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
    description: `Auto-generated category for ${category}`
  });
  return newCat._id;
};

// ─── Helper: sort modules & lectures by order field ───────────────────────────
const sortCourse = (course) => {
  if (!course) return course;
  const obj = course.toObject ? course.toObject() : course;
  if (obj.modules) {
    obj.modules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    obj.modules.forEach(mod => {
      if (mod.lectures) mod.lectures.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });
  }
  return obj;
};

// @desc    Get all courses (FR-25, FR-27)
// @route   GET /api/courses
// @access  Public
const getCourses = async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) {
      if (mongoose.Types.ObjectId.isValid(req.query.category)) {
        filter.category = req.query.category;
      } else {
        const cat = await Categorie.findOne({ name: new RegExp('^' + req.query.category + '$', 'i') });
        if (cat) filter.category = cat._id;
      }
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty;
    if (req.query.price) filter.price = req.query.price;

    const courses = await Course.find(filter).populate('category').lean();
    const sorted = courses.map(c => {
      if (c.modules) {
        c.modules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        c.modules.forEach(mod => {
          if (mod.lectures) mod.lectures.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        });
      }
      return c;
    });

    return res.status(200).json({
      success: true,
      count: sorted.length,
      data: sorted,
    });
  } catch (error) {
    console.error('Error in getCourses:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single course by ID — with video details populated (FR-25, FR-26)
// @route   GET /api/courses/:id
// @access  Public
const getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('category')
      .populate({
        path: 'modules.lectures.video',
        model: 'Video',
        select: 'title videoUrl duration size status disableDownloads hideUrls tokenizedStreaming securePlayback',
      })
      .lean();

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // FR-26: Sort modules and lectures by order
    if (course.modules) {
      course.modules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      course.modules.forEach(mod => {
        if (mod.lectures) mod.lectures.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      });
    }

    return res.status(200).json({ success: true, data: course });
  } catch (error) {
    console.error('Error in getCourseById:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Check if the current user has access to a course (FR-28)
// @route   GET /api/courses/:id/access
// @access  Private (user)
const checkCourseAccess = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('category')
      .populate({
        path: 'modules.lectures.video',
        model: 'Video',
        select: 'title videoUrl duration size status disableDownloads hideUrls tokenizedStreaming securePlayback',
      })
      .lean();

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Admins always have access
    if (req.user.role === 'admin') {
      if (course.modules) {
        course.modules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        course.modules.forEach(mod => {
          if (mod.lectures) mod.lectures.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        });
      }
      return res.status(200).json({ success: true, hasAccess: true, data: course });
    }

    // FR-28: Users only access courses they're assigned to
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userCourses = (user.courses || []).map(c => c.toString());
    const courseId = course._id.toString();
    const hasAccess = userCourses.includes(courseId) || userCourses.includes(course.title);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        hasAccess: false,
        message: 'You do not have access to this course. Please contact your administrator.',
      });
    }

    // ── Subscription gate: if course is Premium and subscription mode is ON,
    //    the user must be subscribed to watch (unless explicitly assigned by admin) ─────────────────────────────────
    if (course.price === 'Premium') {
      const settings = await SubscriptionSettings.getSingleton();
      if (settings.subscriptionModeEnabled && settings.portalMode === 'paid') {
        // If the course is explicitly assigned to the user, bypass subscription check
        const isManuallyAssigned = userCourses.includes(courseId) || userCourses.includes(course.title);
        if (!user.subscribed && !isManuallyAssigned) {
          return res.status(403).json({
            success: false,
            hasAccess: false,
            message: 'This course requires an active subscription. Please purchase a plan to continue.',
          });
        }
      }
    }

    // FR-26: Sort before returning
    if (course.modules) {
      course.modules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      course.modules.forEach(mod => {
        if (mod.lectures) mod.lectures.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      });
    }

    return res.status(200).json({ success: true, hasAccess: true, data: course });
  } catch (error) {
    console.error('Error in checkCourseAccess:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all courses assigned to the currently logged-in user, with videos
// @route   GET /api/courses/my-courses
// @access  Private (user)
const getMyCourses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const assignedCourseIds = (user.courses || []);
    if (assignedCourseIds.length === 0) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    // Build query: match by ObjectId OR by title (for legacy title-based assignments)
    const validIds = assignedCourseIds.filter(c => mongoose.Types.ObjectId.isValid(c));
    const titleStrings = assignedCourseIds.filter(c => !mongoose.Types.ObjectId.isValid(c));

    const query = {
      $or: [
        ...(validIds.length > 0 ? [{ _id: { $in: validIds } }] : []),
        ...(titleStrings.length > 0 ? [{ title: { $in: titleStrings } }] : []),
      ]
    };

    const courses = await Course.find(query)
      .populate('category')
      .populate({
        path: 'modules.lectures.video',
        model: 'Video',
        select: 'title videoUrl duration size status disableDownloads hideUrls tokenizedStreaming securePlayback',
      })
      .lean();

    // Sort modules/lectures
    const sorted = courses.map(c => {
      if (c.modules) {
        c.modules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        c.modules.forEach(mod => {
          if (mod.lectures) mod.lectures.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        });
      }
      return c;
    });

    return res.status(200).json({ success: true, count: sorted.length, data: sorted });
  } catch (error) {
    console.error('Error in getMyCourses:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new course (FR-25, FR-26, FR-27)
// @route   POST /api/courses
// @access  Private/Admin
const createCourse = async (req, res) => {
  try {
    const { title, description, thumbnail, category, difficulty, instructor, price, status, modules } = req.body;

    if (!title || !category) {
      return res.status(400).json({ success: false, message: 'Please provide course title and category' });
    }

    const categoryId = await resolveCategory(category);

    let normalizedModules = [];
    if (modules && Array.isArray(modules)) {
      normalizedModules = modules.map((mod, mIdx) => ({
        ...mod,
        order: mod.order !== undefined ? mod.order : mIdx,
        lectures: (mod.lectures || []).map((lec, lIdx) => ({
          ...lec,
          order: lec.order !== undefined ? lec.order : lIdx,
        }))
      }));
    }

    const course = await Course.create({
      title,
      description: description || '',
      thumbnail: thumbnail || '',
      category: categoryId,
      difficulty: difficulty || 'Beginner',
      instructor: instructor || '',
      price: price || 'Free',
      status: status || 'Draft',
      modules: normalizedModules,
    });

    const populatedCourse = await Course.findById(course._id).populate('category').lean();

    if (populatedCourse.modules) {
      populatedCourse.modules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      populatedCourse.modules.forEach(mod => {
        if (mod.lectures) mod.lectures.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: populatedCourse,
    });
  } catch (error) {
    console.error('Error in createCourse:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a course (FR-25, FR-26, FR-27)
// @route   PUT /api/courses/:id
// @access  Private/Admin
const updateCourse = async (req, res) => {
  try {
    const { title, description, thumbnail, category, difficulty, instructor, price, status, modules } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (title) course.title = title;
    if (description !== undefined) course.description = description;
    if (thumbnail !== undefined) course.thumbnail = thumbnail;
    if (difficulty) course.difficulty = difficulty;
    if (instructor !== undefined) course.instructor = instructor;
    if (price) course.price = price;
    if (status) course.status = status;

    if (category) {
      course.category = await resolveCategory(category);
    }

    if (modules && Array.isArray(modules)) {
      course.modules = modules.map((mod, mIdx) => ({
        ...mod,
        order: mod.order !== undefined ? mod.order : mIdx,
        lectures: (mod.lectures || []).map((lec, lIdx) => ({
          ...lec,
          order: lec.order !== undefined ? lec.order : lIdx,
        }))
      }));
    }

    const updatedCourse = await course.save();
    const populatedCourse = await Course.findById(updatedCourse._id).populate('category').lean();

    if (populatedCourse.modules) {
      populatedCourse.modules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      populatedCourse.modules.forEach(mod => {
        if (mod.lectures) mod.lectures.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      data: populatedCourse,
    });
  } catch (error) {
    console.error('Error in updateCourse:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reorder modules within a course (FR-26)
// @route   PATCH /api/courses/:id/reorder
// @access  Private/Admin
const reorderCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (req.body.modules && Array.isArray(req.body.modules)) {
      req.body.modules.forEach(({ _id, order }) => {
        const mod = course.modules.id(_id);
        if (mod) mod.order = order;
      });
    }

    if (req.body.moduleId && req.body.lectures && Array.isArray(req.body.lectures)) {
      const mod = course.modules.id(req.body.moduleId);
      if (mod) {
        req.body.lectures.forEach(({ _id, order }) => {
          const lec = mod.lectures.id(_id);
          if (lec) lec.order = order;
        });
      }
    }

    await course.save();
    const updated = await Course.findById(course._id).populate('category').lean();
    if (updated.modules) {
      updated.modules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      updated.modules.forEach(mod => {
        if (mod.lectures) mod.lectures.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Course order updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Error in reorderCourse:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a course
// @route   DELETE /api/courses/:id
// @access  Private/Admin
const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    await course.deleteOne();
    return res.status(200).json({ success: true, message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Error in deleteCourse:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


// @desc    Get all students enrolled in a specific course
// @route   GET /api/courses/:id/students
// @access  Private/Admin
const getCourseStudents = async (req, res) => {
  try {
    const courseId = req.params.id;
    const course = await Course.findById(courseId).select('_id title thumbnail category difficulty price studentsCount');
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // A user has courses stored in `user.courses` as array of course ID strings
    const students = await User.find({
      role: 'user',
      courses: { $in: [courseId, courseId.toString()] }
    })
      .select('_id name email phoneNumber status isActive planType subscribed purchaseDate expiryDate activityLog createdAt')
      .lean();

    // Fetch progress for all these students in this course
    const studentIds = students.map(s => s._id);
    const progressList = await Progress.find({
      course: courseId,
      user: { $in: studentIds }
    }).lean();

    const progressMap = {};
    progressList.forEach(p => {
      progressMap[p.user.toString()] = {
        percentageComplete: p.percentageComplete || 0,
        completedVideos: p.completedVideos || 0,
        totalVideos: p.totalVideos || 0,
        status: p.status || 'not_started',
        lastWatchedAt: p.lastWatchedAt || null,
      };
    });

    const enrichedStudents = students.map(s => {
      const prog = progressMap[s._id.toString()] || {
        percentageComplete: 0,
        completedVideos: 0,
        totalVideos: 0,
        status: 'not_started',
        lastWatchedAt: null,
      };

      return {
        _id: s._id,
        name: s.name,
        email: s.email,
        phoneNumber: s.phoneNumber || '',
        status: s.status || (s.isActive ? 'active' : 'inactive'),
        isActive: s.isActive !== false,
        planType: s.planType || 'Free',
        subscribed: !!s.subscribed,
        registeredDate: s.purchaseDate || (s.createdAt ? s.createdAt.toISOString().split('T')[0] : '—'),
        expiryDate: s.expiryDate || '',
        progress: prog,
      };
    });

    // Keep studentsCount on Course in sync
    if (course.studentsCount !== enrichedStudents.length) {
      await Course.findByIdAndUpdate(courseId, { studentsCount: enrichedStudents.length });
      course.studentsCount = enrichedStudents.length;
    }

    return res.status(200).json({
      success: true,
      data: {
        course: {
          _id: course._id,
          title: course.title,
          thumbnail: course.thumbnail,
          studentsCount: enrichedStudents.length,
        },
        total: enrichedStudents.length,
        students: enrichedStudents,
      },
    });
  } catch (error) {
    console.error('Error in getCourseStudents:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Enroll a student into a course
// @route   POST /api/courses/:id/students/enroll
// @access  Private/Admin
const enrollStudentInCourse = async (req, res) => {
  try {
    const courseId = req.params.id;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Please provide userId to enroll' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userCourses = (user.courses || []).map(c => c.toString());
    if (!userCourses.includes(courseId.toString())) {
      userCourses.push(courseId.toString());
      user.courses = userCourses;
      await user.save();
      await Course.findByIdAndUpdate(courseId, { $inc: { studentsCount: 1 } });

      // Send notification to the student
      try {
        await Notification.create({
          user: user._id,
          title: 'New Course Assigned!',
          message: `You have been enrolled in "${course.title}". Start watching the lectures from your dashboard.`,
          type: 'new_content',
          course: course._id,
        });
      } catch (notifErr) {
        console.error('Failed to create enroll notification:', notifErr);
      }
    }

    return res.status(200).json({
      success: true,
      message: `${user.name} has been enrolled in ${course.title}`,
    });
  } catch (error) {
    console.error('Error in enrollStudentInCourse:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Unenroll a student from a course
// @route   DELETE /api/courses/:id/students/:userId
// @access  Private/Admin
const unenrollStudentFromCourse = async (req, res) => {
  try {
    const { id: courseId, userId } = req.params;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userCourses = (user.courses || []).map(c => c.toString());
    if (userCourses.includes(courseId.toString())) {
      user.courses = userCourses.filter(c => c !== courseId.toString());
      await user.save();
      await Course.findByIdAndUpdate(courseId, {
        $inc: { studentsCount: -1 }
      });

      // Send removal notification to the student
      try {
        await Notification.create({
          user: user._id,
          title: 'Course Access Removed',
          message: `Your access to the course "${course.title}" has been removed by the administrator. Contact support if you need assistance.`,
          type: 'course_removed',
          course: course._id,
        });
      } catch (notifErr) {
        console.error('Failed to create unenroll notification:', notifErr);
      }
    }

    return res.status(200).json({
      success: true,
      message: `${user.name} has been removed from ${course.title}`,
    });
  } catch (error) {
    console.error('Error in unenrollStudentFromCourse:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getCourseStudents,
  enrollStudentInCourse,
  unenrollStudentFromCourse,
  getCourses,
  getCourseById,
  checkCourseAccess,
  getMyCourses,
  createCourse,
  updateCourse,
  reorderCourse,
  deleteCourse,
};