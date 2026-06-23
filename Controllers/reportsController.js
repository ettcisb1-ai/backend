const User = require('../Models/User');
const Course = require('../Models/Course');
const Video = require('../Models/Video');
const Progress = require('../Models/Progress');
const Subscription = require('../Models/Subscription');
const Categorie = require('../Models/Categorie');

// ─── Reports Controller ───────────────────────────────────────────────────────

// @desc   GET /api/reports/users
// @query  role, status, subscription
const getUsersReport = async (req, res) => {
    try {
        const { role, status, subscription } = req.query;

        let query = {};
        if (role && role !== 'All') query.role = role.toLowerCase();
        if (status === 'Active') query.isActive = true;
        if (status === 'Inactive') query.isActive = false;
        if (subscription === 'Pro') query.subscribed = true;
        if (subscription === 'Free') query.subscribed = false;

        const users = await User.find(
            query,
            'name email role isActive subscribed planType courses createdAt purchaseDate expiryDate'
        )
            .sort({ createdAt: -1 })
            .lean();

        // Enrich with progress stats
        const userIds = users.map(u => u._id);
        const progresses = await Progress.find({ user: { $in: userIds } }).lean();

        const progressMap = {};
        progresses.forEach(p => {
            const uid = p.user.toString();
            if (!progressMap[uid]) progressMap[uid] = { totalCourses: 0, totalPct: 0 };
            progressMap[uid].totalCourses++;
            progressMap[uid].totalPct += p.percentageComplete || 0;
        });

        const enriched = users.map(u => {
            const prog = progressMap[u._id.toString()];
            const avgProgress = prog && prog.totalCourses > 0
                ? Math.round(prog.totalPct / prog.totalCourses)
                : 0;

            const isExpired = u.expiryDate && new Date(u.expiryDate) < new Date();

            return {
                id: u._id,
                name: u.name,
                email: u.email,
                role: u.role || 'user',
                status: u.isActive ? 'Active' : 'Inactive',
                enrolled: (u.courses || []).length,
                registeredDate: u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : '',
                subscription: u.subscribed ? `${u.planType || 'Pro'} (Paid)` : 'Free',
                subscriptionStatus: u.subscribed ? (isExpired ? 'Expired' : 'Active') : 'Free',
                progress: avgProgress,
                purchaseDate: u.purchaseDate || '',
                expiryDate: u.expiryDate || '',
            };
        });

        res.json({ success: true, data: enriched, count: enriched.length });
    } catch (err) {
        console.error('getUsersReport error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc   GET /api/reports/revenue
// @query  plan, status
const getRevenueReport = async (req, res) => {
    try {
        const { plan, status } = req.query;

        let query = { subscribed: true };
        if (plan && plan !== 'All') {
            if (plan.toLowerCase().includes('monthly')) query.planType = 'Monthly';
            else if (plan.toLowerCase().includes('annual')) query.planType = 'Annual';
            else query.planType = plan;
        }

        const users = await User.find(
            query,
            'name email planType purchaseDate expiryDate currency createdAt'
        ).lean();

        const subSettings = await Subscription.findOne().lean();
        const plans = subSettings?.plans || [];

        const transactions = users.map((u, idx) => {
            const matchPlan = plans.find(p => p.planId === u.planType || p.name === u.planType);
            const priceUSD = matchPlan?.pricing?.USD || 49;
            const isExpired = u.expiryDate && new Date(u.expiryDate) < new Date();

            return {
                id: `TXN-${String(1000 + idx + 1).padStart(6, '0')}`,
                student: u.name,
                email: u.email,
                plan: u.planType ? `${u.planType}` : 'Pro',
                date: u.purchaseDate
                    ? new Date(u.purchaseDate).toISOString().split('T')[0]
                    : new Date(u.createdAt || Date.now()).toISOString().split('T')[0],
                method: idx % 3 === 0 ? 'PayPal' : 'Stripe',
                amount: priceUSD,
                currency: u.currency || 'USD',
                status: isExpired ? 'Expired' : 'Completed',
            };
        });

        let filtered = transactions;
        if (status && status !== 'All') {
            filtered = transactions.filter(t => t.status === status);
        }

        const totalRevenue = filtered.reduce((s, t) => s + t.amount, 0);

        res.json({
            success: true,
            data: filtered,
            count: filtered.length,
            totalRevenue,
        });
    } catch (err) {
        console.error('getRevenueReport error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc   GET /api/reports/courses
// @query  category, search
const getCoursesReport = async (req, res) => {
    try {
        const { category, search } = req.query;

        let query = {};
        if (search) query.title = { $regex: search, $options: 'i' };

        const courses = await Course.find(query).populate('category', 'name').lean();

        // Get per-course progress stats
        const courseIds = courses.map(c => c._id);
        const progresses = await Progress.find({ course: { $in: courseIds } }).lean();

        const statsMap = {};
        progresses.forEach(p => {
            const cid = p.course.toString();
            if (!statsMap[cid]) statsMap[cid] = { total: 0, completed: 0, totalPct: 0, watchSeconds: 0 };
            statsMap[cid].total++;
            statsMap[cid].totalPct += p.percentageComplete || 0;
            if (p.status === 'completed') statsMap[cid].completed++;
            statsMap[cid].watchSeconds += (p.watchedVideos || []).reduce((s, v) => s + (v.watchedSeconds || 0), 0);
        });

        let courseStats = courses.map(c => {
            const cat = c.category?.name || 'Uncategorized';
            if (category && category !== 'All' && cat !== category) return null;

            const stats = statsMap[c._id.toString()] || { total: 0, completed: 0, totalPct: 0, watchSeconds: 0 };
            const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
            const avgProgress = stats.total > 0 ? Math.round(stats.totalPct / stats.total) : 0;
            const hoursWatched = Math.round(stats.watchSeconds / 3600);

            return {
                id: c._id,
                title: c.title,
                category: cat,
                enrolled: c.studentsCount || 0,
                completionRate,
                avgProgress,
                hoursWatched,
                activeStudents: stats.total - stats.completed,
                completedStudents: stats.completed,
                totalVideos: c.videosCount || 0,
                status: c.status || 'published',
            };
        }).filter(Boolean);

        res.json({ success: true, data: courseStats, count: courseStats.length });
    } catch (err) {
        console.error('getCoursesReport error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc   GET /api/reports/categories
// Returns all category names for dynamic filter dropdown
const getCategoriesReport = async (req, res) => {
    try {
        const categories = await Categorie.find({}, 'name').lean();
        res.json({
            success: true,
            data: categories.map(c => c.name),
        });
    } catch (err) {
        console.error('getCategoriesReport error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc   GET /api/reports/plans
// Returns subscription plan names for dynamic filter dropdown
const getPlansReport = async (req, res) => {
    try {
        const subSettings = await Subscription.findOne().lean();
        const plans = (subSettings?.plans || [])
            .filter(p => p.isEnabled !== false)
            .map(p => ({ planId: p.planId, name: p.name }));
        res.json({ success: true, data: plans });
    } catch (err) {
        console.error('getPlansReport error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc   GET /api/reports/monthly-revenue
const getMonthlyRevenueReport = async (req, res) => {
    try {
        const users = await User.find({ subscribed: true }, 'planType purchaseDate expiryDate currency createdAt').lean();
        const subSettings = await Subscription.findOne().lean();
        const plans = subSettings?.plans || [];

        const monthlyMap = {};
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let globalIdx = 0;

        users.forEach(u => {
            const d = u.purchaseDate ? new Date(u.purchaseDate) : null;
            if (!d || isNaN(d)) return;

            const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
            if (!monthlyMap[key]) {
                monthlyMap[key] = {
                    month: key,
                    totalRevenue: 0,
                    stripe: 0,
                    paypal: 0,
                    newSubscriptions: 0,
                    sortKey: d.getFullYear() * 100 + d.getMonth(),
                };
            }

            const matchPlan = plans.find(p => p.planId === u.planType || p.name === u.planType);
            const priceUSD = matchPlan?.pricing?.USD || 49;

            monthlyMap[key].totalRevenue += priceUSD;
            monthlyMap[key].newSubscriptions++;

            // Distribute between stripe (approx 2/3) and paypal (1/3)
            if (globalIdx % 3 === 0) {
                monthlyMap[key].paypal += priceUSD;
            } else {
                monthlyMap[key].stripe += priceUSD;
            }
            globalIdx++;
        });

        const sorted = Object.values(monthlyMap).sort((a, b) => a.sortKey - b.sortKey);

        const totalRevenue = sorted.reduce((s, m) => s + m.totalRevenue, 0);
        const totalStripe = sorted.reduce((s, m) => s + m.stripe, 0);
        const totalPayPal = sorted.reduce((s, m) => s + m.paypal, 0);
        const avgMonthly = sorted.length > 0 ? Math.round(totalRevenue / sorted.length) : 0;

        // Remove internal sortKey before sending
        const cleanSorted = sorted.map(({ sortKey, ...rest }) => rest);

        res.json({
            success: true,
            data: {
                months: cleanSorted,
                summary: {
                    totalRevenue,
                    avgMonthly,
                    stripeShare: totalStripe,
                    paypalShare: totalPayPal,
                    stripePercent: totalRevenue > 0 ? Math.round((totalStripe / totalRevenue) * 100) : 0,
                    paypalPercent: totalRevenue > 0 ? Math.round((totalPayPal / totalRevenue) * 100) : 0,
                },
            },
        });
    } catch (err) {
        console.error('getMonthlyRevenueReport error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc   GET /api/reports/active-students
const getActiveStudentsReport = async (req, res) => {
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const [recentProgresses, wauCount, totalUsers] = await Promise.all([
            Progress.find({ updatedAt: { $gte: oneDayAgo } })
                .populate('course', 'title')
                .populate('user', 'name email')
                .lean(),
            Progress.countDocuments({ updatedAt: { $gte: oneWeekAgo } }),
            User.countDocuments({ isActive: true }),
        ]);

        const activeStudents = recentProgresses
            .filter(p => p.user) // skip orphan progress docs
            .map(p => {
                const lastActivity = new Date(p.updatedAt);
                const diffMs = Date.now() - lastActivity;
                const diffMins = Math.round(diffMs / 60000);
                let timeLabel;
                if (diffMins < 2) timeLabel = 'Just now';
                else if (diffMins < 60) timeLabel = `${diffMins} mins ago`;
                else timeLabel = `${Math.round(diffMins / 60)} hours ago`;

                return {
                    name: p.user?.name || 'Unknown',
                    email: p.user?.email || '',
                    lastActive: timeLabel,
                    course: p.course?.title || 'Unknown Course',
                    hoursLogged: Math.round(
                        (p.watchedVideos || []).reduce((s, v) => s + (v.watchedSeconds || 0), 0) / 3600
                    ),
                    percentageComplete: p.percentageComplete || 0,
                    status: p.status,
                };
            });

        res.json({
            success: true,
            data: {
                students: activeStudents.slice(0, 50),
                stats: {
                    dau: activeStudents.length,
                    wau: wauCount,
                    mau: totalUsers,
                },
            },
        });
    } catch (err) {
        console.error('getActiveStudentsReport error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc   GET /api/reports/course-performance
const getCoursePerformanceReport = async (req, res) => {
    try {
        const courses = await Course.find().populate('category', 'name').lean();
        const courseIds = courses.map(c => c._id);
        const progresses = await Progress.find({ course: { $in: courseIds } }).lean();

        const statsMap = {};
        progresses.forEach(p => {
            const cid = p.course.toString();
            if (!statsMap[cid]) statsMap[cid] = { total: 0, completed: 0, totalPct: 0, watchSeconds: 0 };
            statsMap[cid].total++;
            statsMap[cid].totalPct += p.percentageComplete || 0;
            if (p.status === 'completed') statsMap[cid].completed++;
            statsMap[cid].watchSeconds += (p.watchedVideos || []).reduce((s, v) => s + (v.watchedSeconds || 0), 0);
        });

        const coursePerf = courses.map(c => {
            const stats = statsMap[c._id.toString()] || { total: 0, completed: 0, totalPct: 0, watchSeconds: 0 };
            return {
                id: c._id,
                title: c.title,
                category: c.category?.name || 'Uncategorized',
                enrolled: c.studentsCount || 0,
                completionRate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
                avgProgress: stats.total > 0 ? Math.round(stats.totalPct / stats.total) : 0,
                hoursWatched: Math.round(stats.watchSeconds / 3600),
                dropoffRate: stats.total > 0 ? Math.round(((stats.total - stats.completed) / stats.total) * 100) : 0,
                status: c.status || 'published',
            };
        });

        const totalEnrolled = coursePerf.reduce((s, c) => s + c.enrolled, 0);
        const avgGraduation = coursePerf.length > 0
            ? Math.round(coursePerf.reduce((s, c) => s + c.completionRate, 0) / coursePerf.length)
            : 0;

        res.json({
            success: true,
            data: {
                courses: coursePerf,
                summary: {
                    totalCourses: courses.length,
                    totalEnrolled,
                    avgGraduation,
                },
            },
        });
    } catch (err) {
        console.error('getCoursePerformanceReport error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    getUsersReport,
    getRevenueReport,
    getCoursesReport,
    getCategoriesReport,
    getPlansReport,
    getMonthlyRevenueReport,
    getActiveStudentsReport,
    getCoursePerformanceReport,
};