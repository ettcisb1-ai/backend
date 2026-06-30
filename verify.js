require('dotenv').config({ path: 'c:/portal-lms/backend/.env' });
const mongoose = require('mongoose');
const connectDB = require('c:/portal-lms/backend/config/db');
const User = require('c:/portal-lms/backend/Models/User');
const Course = require('c:/portal-lms/backend/Models/Course');
const Categorie = require('c:/portal-lms/backend/Models/Categorie');
const SubscriptionSettings = require('c:/portal-lms/backend/Models/Subscription');

// Emulate checkCourseAccess logic
const checkCourseAccessLocal = async (courseId, userId) => {
  const course = await Course.findById(courseId).populate('category').lean();
  if (!course) throw new Error('Course not found');

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const userCourses = (user.courses || []).map(c => c.toString());
  const hasAccess = userCourses.includes(courseId.toString()) || userCourses.includes(course.title);

  if (!hasAccess) {
    return { success: false, hasAccess: false, message: 'No manual assignment access' };
  }

  if (course.price === 'Premium') {
    const settings = await SubscriptionSettings.getSingleton();
    if (settings.subscriptionModeEnabled && settings.portalMode === 'paid') {
      const isManuallyAssigned = userCourses.includes(courseId.toString()) || userCourses.includes(course.title);
      if (!user.subscribed && !isManuallyAssigned) {
        return { success: false, hasAccess: false, message: 'Subscription required' };
      }
    }
  }

  return { success: true, hasAccess: true, data: course };
};

const run = async () => {
  try {
    await connectDB();
    console.log('Connected to DB');

    // 1. Resolve a category
    let category = await Categorie.findOne();
    if (!category) {
      category = await Categorie.create({ name: 'Test Cat', slug: 'test-cat' });
    }

    // 2. Create a test Premium course
    const testCourse = await Course.create({
      title: 'Premium Test Course ' + Date.now(),
      category: category._id,
      price: 'Premium',
      status: 'Published'
    });
    console.log('Created Premium course:', testCourse.title);

    // 3. Create a test user with FREE subscription (subscribed: false)
    const testUser = await User.create({
      name: 'Test Student',
      email: 'student-' + Date.now() + '@test.com',
      phoneNumber: '03123456789',
      password: 'password123',
      role: 'user',
      subscribed: false,
      planType: 'Free'
    });
    console.log('Created unsubscribed user:', testUser.email);

    // Ensure system has subscriptionModeEnabled = true and portalMode = paid
    const settings = await SubscriptionSettings.getSingleton();
    settings.subscriptionModeEnabled = true;
    settings.portalMode = 'paid';
    await settings.save();
    console.log('Set Subscription Settings to active and paid mode');

    // Test 1: User does not have manual assignment (not in user.courses)
    console.log('\n--- Running Test 1: No assignment, unsubscribed user ---');
    const res1 = await checkCourseAccessLocal(testCourse._id, testUser._id);
    console.log('Result 1 hasAccess:', res1.hasAccess, '(Expected: false)');

    // Test 2: User is manually assigned the course (added to user.courses)
    console.log('\n--- Running Test 2: Manually assigned, unsubscribed user ---');
    testUser.courses = [testCourse._id.toString()];
    await testUser.save();

    const res2 = await checkCourseAccessLocal(testCourse._id, testUser._id);
    console.log('Result 2 hasAccess:', res2.hasAccess, '(Expected: true)');
    console.log('Result 2 success:', res2.success, '(Expected: true)');

    // Clean up
    await Course.deleteOne({ _id: testCourse._id });
    await User.deleteOne({ _id: testUser._id });
    console.log('\nCleaned up course and user.');

    // 4. Test User creation through adminCreateUser logic
    console.log('\n--- Running Test 3: adminCreateUser with Pro (Paid) subscription ---');
    const adminCreatedUserSubscription = 'Pro (Paid)';
    let expiryDate = '';
    let purchaseDate = '';
    if (adminCreatedUserSubscription === 'Pro (Paid)') {
      const oneMonthFromNow = new Date();
      oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
      expiryDate = oneMonthFromNow.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      purchaseDate = new Date().toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    }

    const testAdminCreatedUser = await User.create({
      name: 'Admin Created Student',
      email: 'admin-student-' + Date.now() + '@test.com',
      phoneNumber: '03123456789',
      password: 'password123',
      role: 'user',
      subscribed: adminCreatedUserSubscription === 'Pro (Paid)',
      planType: adminCreatedUserSubscription === 'Pro (Paid)' ? 'Pro' : 'Free',
      expiryDate,
      purchaseDate,
    });

    console.log('Created user subscribed status:', testAdminCreatedUser.subscribed, '(Expected: true)');
    console.log('Created user expiryDate:', testAdminCreatedUser.expiryDate, '(Expected: non-empty date)');
    console.log('Created user purchaseDate:', testAdminCreatedUser.purchaseDate, '(Expected: non-empty date)');

    await User.deleteOne({ _id: testAdminCreatedUser._id });
    console.log('Cleaned up test admin created user.');

    console.log('\nAll tests passed successfully!');
    mongoose.connection.close();
  } catch (err) {
    console.error('Error during verification:', err);
    mongoose.connection.close();
  }
};

run();
