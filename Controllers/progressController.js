const Progress = require('../Models/Progress');
const Course = require('../Models/Course');
const User = require('../Models/User');
const Video = require('../Models/Video');

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: recalculate and save percentageComplete
// ─────────────────────────────────────────────────────────────────────────────
const recalcProgress = async (progressDoc, course) => {
    // Count total published videos in this course across all modules
    const totalVideos = course.modules.reduce(
        (acc, mod) => acc + mod.lectures.length,
        0
    );

    const completedVideos = progressDoc.watchedVideos.filter((v) => v.completed).length;
    const percentage = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;

    progressDoc.totalVideos = totalVideos;
    progressDoc.completedVideos = completedVideos;
    progressDoc.percentageComplete = percentage;

    if (completedVideos === 0) {
        progressDoc.status = 'not_started';
    } else if (percentage >= 100) {
        progressDoc.status = 'completed';
        progressDoc.completedAt = progressDoc.completedAt || new Date();
    } else {
        progressDoc.status = 'in_progress';
    }

    await progressDoc.save();
    return progressDoc;
};

// ─────────────────────────────────────────────────────────────────────────────
//  FR-46: Mark a video as watched / update watch position
//  @route   POST /api/progress/watch
//  @access  Private / User
// ─────────────────────────────────────────────────────────────────────────────
const markVideoWatched = async (req, res) => {
    try {
        const { courseId, videoId, watchedSeconds, totalSeconds, lectureTitle } = req.body;

        if (!courseId || !videoId) {
            return res.status(400).json({ success: false, message: 'courseId and videoId are required' });
        }

        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        // Upsert progress doc
        let progress = await Progress.findOne({ user: req.user._id, course: courseId });
        if (!progress) {
            progress = new Progress({
                user: req.user._id,
                course: courseId,
                startedAt: new Date(),
            });
        }

        // Update or add the video entry
        const existing = progress.watchedVideos.find(
            (v) => v.video.toString() === videoId
        );

        const ws = watchedSeconds || 0;
        const ts = totalSeconds || 0;
        const isCompleted = ts > 0 && ws / ts >= 0.8; // 80% watched = completed

        if (existing) {
            if (isCompleted) {
                existing.watchedSeconds = Math.max(existing.watchedSeconds, ws);
            } else if (ws === 0) {
                existing.watchedSeconds = 0;
            } else {
                existing.watchedSeconds = Math.max(existing.watchedSeconds, ws);
            }
            if (ts > 0) existing.totalSeconds = ts;
            
            existing.completed = isCompleted;
            if (isCompleted) {
                existing.completedAt = existing.completedAt || new Date();
            } else {
                existing.completedAt = null;
            }
            existing.lastWatchedAt = new Date();
        } else {
            progress.watchedVideos.push({
                video: videoId,
                lectureTitle: lectureTitle || '',
                watchedSeconds: ws,
                totalSeconds: ts,
                completed: isCompleted,
                completedAt: isCompleted ? new Date() : null,
                lastWatchedAt: new Date(),
            });
        }

        await recalcProgress(progress, course);

        return res.status(200).json({
            success: true,
            message: 'Progress updated',
            data: {
                percentageComplete: progress.percentageComplete,
                completedVideos: progress.completedVideos,
                totalVideos: progress.totalVideos,
                status: progress.status,
            },
        });
    } catch (error) {
        console.error('markVideoWatched error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  FR-47: Get progress for the logged-in user (dashboard view)
//  @route   GET /api/progress/me
//  @access  Private / User
// ─────────────────────────────────────────────────────────────────────────────
const getMyProgress = async (req, res) => {
    try {
        const progressList = await Progress.find({ user: req.user._id })
            .populate('course', 'title thumbnail instructor difficulty')
            .sort({ updatedAt: -1 });

        return res.status(200).json({
            success: true,
            data: progressList,
        });
    } catch (error) {
        console.error('getMyProgress error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  FR-47: Get progress for a specific course (user)
//  @route   GET /api/progress/course/:courseId
//  @access  Private / User
// ─────────────────────────────────────────────────────────────────────────────
const getMyCourseProgress = async (req, res) => {
    try {
        const progress = await Progress.findOne({
            user: req.user._id,
            course: req.params.courseId,
        }).populate('watchedVideos.video', 'title duration');

        if (!progress) {
            return res.status(200).json({
                success: true,
                data: null,
                message: 'No progress found for this course',
            });
        }

        return res.status(200).json({ success: true, data: progress });
    } catch (error) {
        console.error('getMyCourseProgress error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  FR-48: Admin — get progress report per user
//  @route   GET /api/progress/admin/users/:userId
//  @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
const getUserProgressReport = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('name email planType subscribed');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const progressList = await Progress.find({ user: req.params.userId })
            .populate('course', 'title thumbnail instructor difficulty videosCount')
            .sort({ updatedAt: -1 });

        return res.status(200).json({
            success: true,
            data: {
                user,
                progress: progressList,
                summary: {
                    totalCourses: progressList.length,
                    completedCourses: progressList.filter((p) => p.status === 'completed').length,
                    inProgressCourses: progressList.filter((p) => p.status === 'in_progress').length,
                    avgCompletion:
                        progressList.length > 0
                            ? Math.round(
                                progressList.reduce((s, p) => s + p.percentageComplete, 0) /
                                progressList.length
                            )
                            : 0,
                },
            },
        });
    } catch (error) {
        console.error('getUserProgressReport error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  FR-48: Admin — get progress report per course
//  @route   GET /api/progress/admin/courses/:courseId
//  @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
const getCourseProgressReport = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId).select('title thumbnail instructor');
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        const progressList = await Progress.find({ course: req.params.courseId })
            .populate('user', 'name email planType')
            .sort({ updatedAt: -1 });

        const totalEnrolled = progressList.length;
        const completed = progressList.filter((p) => p.status === 'completed').length;
        const inProgress = progressList.filter((p) => p.status === 'in_progress').length;
        const notStarted = progressList.filter((p) => p.status === 'not_started').length;
        const avgCompletion =
            totalEnrolled > 0
                ? Math.round(
                    progressList.reduce((s, p) => s + p.percentageComplete, 0) / totalEnrolled
                )
                : 0;

        return res.status(200).json({
            success: true,
            data: {
                course,
                summary: { totalEnrolled, completed, inProgress, notStarted, avgCompletion },
                progress: progressList,
            },
        });
    } catch (error) {
        console.error('getCourseProgressReport error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  FR-48: Admin — get all progress (paginated overview)
//  @route   GET /api/progress/admin
//  @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
const getAllProgressAdmin = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.course) filter.course = req.query.course;

        const [progressList, total] = await Promise.all([
            Progress.find(filter)
                .populate('user', 'name email planType')
                .populate('course', 'title instructor')
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit),
            Progress.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                progress: progressList,
                total,
                page,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('getAllProgressAdmin error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    markVideoWatched,
    getMyProgress,
    getMyCourseProgress,
    getUserProgressReport,
    getCourseProgressReport,
    getAllProgressAdmin,
};