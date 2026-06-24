const Video = require('../Models/Video');
const Course = require('../Models/Course');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── In-memory token store (kept as required — no Redis) ──────────────────────
// Maps  token → { videoId, userId, expiresAt }
const streamTokenStore = new Map();

const generateStreamToken = (videoId, userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 2 * 60 * 60 * 1000; // 2-hour TTL (legacy local files)
  streamTokenStore.set(token, { videoId, userId, expiresAt });
  return token;
};

const validateStreamToken = (token) => {
  const entry = streamTokenStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    streamTokenStore.delete(token);
    return null;
  }
  return entry;
};

// Periodic cleanup of expired tokens
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of streamTokenStore.entries()) {
    if (now > entry.expiresAt) streamTokenStore.delete(token);
  }
}, 30 * 60 * 1000);

// ── Shared security response headers ─────────────────────────────────────────
const applySecurityHeaders = (res) => {
  res.set({
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer',
  });
};

// ─── Get all videos ───────────────────────────────────────────────────────────
// @route   GET /api/videos
// @access  Private/Admin
const getVideos = async (req, res) => {
  try {
    const videos = await Video.find({})
      .populate('course', 'title')
      .populate('category', 'name')
      .select('-publicId -videoUrl'); // never expose storage identifiers to clients
    return res.status(200).json({ success: true, count: videos.length, data: videos });
  } catch (error) {
    console.error('Error in getVideos:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get single video by ID ───────────────────────────────────────────────────
// @route   GET /api/videos/:id
// @access  Private
const getVideoById = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id)
      .populate('course', 'title')
      .populate('category', 'name')
      .select('-publicId -videoUrl'); // hide storage fields
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });
    return res.status(200).json({ success: true, data: video });
  } catch (error) {
    console.error('Error in getVideoById:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get videos by course ─────────────────────────────────────────────────────
// @route   GET /api/videos/course/:courseId
// @access  Private
const getVideosByCourse = async (req, res) => {
  try {
    const videos = await Video.find({ course: req.params.courseId })
      .populate('course', 'title')
      .populate('category', 'name')
      .select('-publicId -videoUrl');
    return res.status(200).json({ success: true, count: videos.length, data: videos });
  } catch (error) {
    console.error('Error in getVideosByCourse:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get videos by category ───────────────────────────────────────────────────
// @route   GET /api/videos/category/:categoryId
// @access  Private
const getVideosByCategory = async (req, res) => {
  try {
    const videos = await Video.find({ category: req.params.categoryId })
      .populate('course', 'title')
      .populate('category', 'name')
      .select('-publicId -videoUrl');
    return res.status(200).json({ success: true, count: videos.length, data: videos });
  } catch (error) {
    console.error('Error in getVideosByCategory:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── FR-29, FR-32: Issue a short-lived signed stream token / URL ──────────────
// @desc    Validates access then returns either:
//          (a) A presigned S3 GET URL (for S3-hosted videos), OR
//          (b) An internal proxy token URL (for legacy local-file videos).
//          The raw videoUrl is NEVER sent to the client.
// @route   POST /api/videos/:id/token
// @access  Private (user or admin)
const getStreamToken = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    // ── Validation: account active ────────────────────────────────────────────
    if (req.user.role !== 'admin' && req.user.isActive === false) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated.' });
    }

    // ── Validation: video must be published ───────────────────────────────────
    if (video.status === 'Draft') {
      return res.status(403).json({
        success: false,
        message: 'This video is not yet available for streaming.',
      });
    }

    // ── Security headers on every token response ───────────────────────────
    applySecurityHeaders(res);

    const securityFlags = {
      disableDownloads: video.disableDownloads,
      hideUrls: video.hideUrls,
      antiScreenRecording: video.antiScreenRecording,
      securePlayback: video.securePlayback,
      adaptiveStreaming: video.adaptiveStreaming,
    };

    // ── Path 0: DRM protected video — return Widevine DASH stream & license server ──
    // FOR TESTING: Force DRM (Widevine) on all videos so screenshot blackout is active
    if (video.drm || true) {
      return res.status(200).json({
        success: true,
        streamUrl: 'https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd',
        licenseServerUrl: 'https://cwip-shaka-proxy.appspot.com/no_auth',
        isDrm: true,
        isHLS: false,
        isDASH: true,
        expiresIn: 7200,
        security: securityFlags,
      });
    }

    // ── Path A: S3-hosted video — generate a presigned GET URL ──────────────
    if (video.videoUrl && video.videoUrl.includes('amazonaws.com')) {
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const s3 = require('../config/s3');

      let s3Key;
      try {
        const urlObj = new URL(video.videoUrl);
        s3Key = urlObj.pathname.replace(/^\//, '');
      } catch {
        return res.status(500).json({ success: false, message: 'Invalid S3 video URL stored' });
      }

      const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key:    s3Key,
        ResponseContentDisposition: 'inline',
        ResponseContentType: 'video/mp4',
      });

      // 2-hour signed URL
      const streamUrl = await getSignedUrl(s3, command, { expiresIn: 7200 });

      return res.status(200).json({
        success: true,
        streamUrl,
        isHLS: false,
        expiresIn: 7200,
        security: securityFlags,
      });
    }

    // ── Path B: Legacy local / externally-hosted video (proxy token) ──────────
    const token = generateStreamToken(video._id.toString(), req.user._id.toString());

    return res.status(200).json({
      success: true,
      streamUrl: `/api/videos/stream/${token}`,
      isHLS: false,
      token,
      expiresIn: 7200,
      security: securityFlags,
    });

  } catch (error) {
    console.error('Error in getStreamToken:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── FR-29, FR-32, FR-34: Proxy stream for legacy (non-S3) videos ────────────
// @desc    Validates the internal Map token then serves/proxies the video bytes.
//          This endpoint is only reached for videos WITHOUT an S3 URL.
//          S3 videos are served directly via presigned URLs (no proxy needed).
// @route   GET /api/videos/stream/:token
// @access  Public (token is the auth mechanism)
const streamVideo = async (req, res) => {
  try {
    const entry = validateStreamToken(req.params.token);
    if (!entry) {
      return res.status(401).json({ success: false, message: 'Invalid or expired stream token' });
    }

    const video = await Video.findById(entry.videoId);
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });

    applySecurityHeaders(res);

    const videoUrl = video.videoUrl;

    // ── Detect self-hosted URL to avoid proxy loop ────────────────────────────
    const selfHosts = ['localhost:3000', '127.0.0.1:3000', req.get('host') || ''];
    const isSelfUrl = (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) &&
      selfHosts.some(h => h && videoUrl.includes(h));

    let filePath;

    if (isSelfUrl) {
      try {
        const urlObj = new URL(videoUrl);
        const relativePath = urlObj.pathname.replace(/^\//, '');
        filePath = path.join(__dirname, '..', relativePath);
      } catch {
        filePath = path.join(__dirname, '..', 'uploads', path.basename(videoUrl));
      }
    } else if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      // External URL — proxy through server (URL never shown to client)
      const https = videoUrl.startsWith('https') ? require('https') : require('http');
      const requestHeaders = {};
      if (req.headers.range) requestHeaders['Range'] = req.headers.range;

      const proxyReq = https.request(videoUrl, { headers: requestHeaders }, (proxyRes) => {
        const responseHeaders = { ...proxyRes.headers };
        delete responseHeaders['content-disposition'];
        responseHeaders['Content-Disposition'] = 'inline';
        responseHeaders['Cache-Control'] = 'no-store';
        responseHeaders['X-Frame-Options'] = 'SAMEORIGIN';
        responseHeaders['Referrer-Policy'] = 'no-referrer';

        res.writeHead(proxyRes.statusCode, responseHeaders);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', (err) => {
        console.error('Stream proxy error:', err);
        if (!res.headersSent) res.status(502).json({ success: false, message: 'Stream proxy error' });
      });
      proxyReq.end();
      return;
    } else {
      filePath = path.isAbsolute(videoUrl) ? videoUrl : path.join(__dirname, '..', videoUrl);
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Video file not found on server' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1024 * 1024 - 1, fileSize - 1);
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'inline',
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'no-referrer',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'inline',
        'Cache-Control': 'no-store',
        'Accept-Ranges': 'bytes',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'no-referrer',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error('Error in streamVideo:', error);
    if (!res.headersSent) return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get video security settings (FR-30 to FR-34) ────────────────────────────
// @route   GET /api/videos/:id/security
// @access  Private/Admin
const getVideoSecurity = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).select(
      'title disableDownloads hideUrls tokenizedStreaming drm antiScreenRecording securePlayback adaptiveStreaming hlsPath status'
    );
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });
    return res.status(200).json({ success: true, data: video });
  } catch (error) {
    console.error('Error in getVideoSecurity:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Update video security settings (FR-30 to FR-34) ─────────────────────────
// @route   PATCH /api/videos/:id/security
// @access  Private/Admin
const updateVideoSecurity = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });

    const securityFields = [
      'disableDownloads',
      'hideUrls',
      'tokenizedStreaming',
      'drm',
      'antiScreenRecording',
      'securePlayback',
      'adaptiveStreaming',
      'hlsPath',
    ];

    securityFields.forEach(field => {
      if (req.body[field] !== undefined) video[field] = req.body[field];
    });

    await video.save();
    return res.status(200).json({
      success: true,
      message: 'Video security settings updated',
      data: video,
    });
  } catch (error) {
    console.error('Error in updateVideoSecurity:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Helper to trigger new-content notifications for enrolled users
const triggerNewContentNotification = async (courseId, videoTitle) => {
  try {
    const User = require('../Models/User');
    const Notification = require('../Models/Notification');

    const course = await Course.findById(courseId);
    if (!course) return;

    // Find all users enrolled in this course
    const enrolledUsers = await User.find({ courses: courseId.toString() }).select('_id');
    if (!enrolledUsers.length) return;

    const userIds = enrolledUsers.map((u) => u._id);

    // Dispatch to all enrolled users
    const docs = userIds.map((uid) => ({
      user: uid,
      title: 'New Course Content Added',
      message: `A new video "${videoTitle}" has been added to "${course.title}".`,
      type: 'new_content',
      course: courseId,
      audience: 'all',
    }));
    await Notification.insertMany(docs);
    console.log(`[Notification Service] Dispatched new_content notification to ${userIds.length} user(s) for course: ${course.title}`);
  } catch (error) {
    console.error('Error in triggerNewContentNotification:', error);
  }
};

// ─── Create a new video ───────────────────────────────────────────────────────
// @route   POST /api/videos
// @access  Private/Admin
const createVideo = async (req, res) => {
  try {
    const {
      title, videoUrl, publicId, thumbnail, duration, size, status, category, course,
      disableDownloads, hideUrls, tokenizedStreaming, drm,
      antiScreenRecording, securePlayback, adaptiveStreaming, hlsPath,
    } = req.body;

    if (!title || (!videoUrl && !publicId) || !category || !course) {
      return res.status(400).json({
        success: false,
        message: 'Please provide video title, a video source (publicId or videoUrl), category, and course',
      });
    }

        const video = await Video.create({
      title,
      publicId: publicId || '',
      videoUrl: videoUrl || '',
      thumbnail: thumbnail || '',
      duration: duration || '0:00',
      size: size || 'Unknown size',
      status: status || 'Published',
      category,
      course,
      disableDownloads: disableDownloads !== undefined ? disableDownloads : true,
      hideUrls:         hideUrls         !== undefined ? hideUrls         : true,
      tokenizedStreaming: tokenizedStreaming !== undefined ? tokenizedStreaming : true,
      drm:              drm              !== undefined ? drm              : false,
      antiScreenRecording: antiScreenRecording !== undefined ? antiScreenRecording : true,
      securePlayback:   securePlayback   !== undefined ? securePlayback   : true,
      adaptiveStreaming: adaptiveStreaming !== undefined ? adaptiveStreaming : false,
      hlsPath: hlsPath || '',
    });

    // Automatically add the video as a lecture to the course's modules
    try {
      const courseDoc = await Course.findById(course);
      if (courseDoc) {
        if (!courseDoc.modules || courseDoc.modules.length === 0) {
          courseDoc.modules = [{
            title: 'Main Module',
            order: 0,
            lectures: []
          }];
        }

        const targetModule = courseDoc.modules[courseDoc.modules.length - 1];
        targetModule.lectures.push({
          title: video.title,
          duration: video.duration || '0:00',
          order: targetModule.lectures.length,
          video: video._id,
          url: video.videoUrl || '',
        });

        await courseDoc.save();
        console.log(`[Video Service] Automatically added video "${video.title}" to module "${targetModule.title}" of course "${courseDoc.title}"`);
      }
    } catch (courseErr) {
      console.error('Error automatically adding video to course modules:', courseErr);
      // We don't fail the whole video creation if course association fails
    }

    if (video.status === 'Published') {
      await triggerNewContentNotification(course, title);
    }

    const populatedVideo = await Video.findById(video._id)
      .populate('course', 'title')
      .populate('category', 'name')
      .select('-publicId -videoUrl'); // never expose storage identifiers

    return res.status(201).json({ success: true, message: 'Video created successfully', data: populatedVideo });
  } catch (error) {
    console.error('Error in createVideo:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Update video ─────────────────────────────────────────────────────────────
// @route   PUT /api/videos/:id
// @access  Private/Admin
const updateVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });

    const fieldsToUpdate = [
      'title', 'videoUrl', 'publicId', 'thumbnail', 'duration', 'size', 'status', 'category', 'course',
      'disableDownloads', 'hideUrls', 'tokenizedStreaming', 'drm',
      'antiScreenRecording', 'securePlayback', 'adaptiveStreaming', 'hlsPath',
    ];

    const oldStatus = video.status;

    fieldsToUpdate.forEach(field => {
      if (req.body[field] !== undefined) video[field] = req.body[field];
    });

    const updatedVideo = await video.save();

    if (oldStatus !== 'Published' && updatedVideo.status === 'Published') {
      await triggerNewContentNotification(updatedVideo.course, updatedVideo.title);
    }

    const populatedVideo = await Video.findById(updatedVideo._id)
      .populate('course', 'title')
      .populate('category', 'name')
      .select('-publicId -videoUrl');

    return res.status(200).json({ success: true, message: 'Video updated successfully', data: populatedVideo });
  } catch (error) {
    console.error('Error in updateVideo:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Delete video ─────────────────────────────────────────────────────────────
// @route   DELETE /api/videos/:id
// @access  Private/Admin
const deleteVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });

    // ── Also remove this video's lecture entry from its parent course ─────────
    if (video.course) {
      try {
        await Course.updateOne(
          { _id: video.course },
          {
            $pull: {
              'modules.$[].lectures': { video: video._id },
            },
          }
        );
      } catch (courseErr) {
        console.error('Error removing lecture from course modules:', courseErr);
        // Don't fail the delete — just log it
      }
    }

    await video.deleteOne();
    return res.status(200).json({ success: true, message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Error in deleteVideo:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getVideos,
  getVideoById,
  createVideo,
  updateVideo,
  getVideosByCourse,
  getVideosByCategory,
  deleteVideo,
  // FR-29, FR-32
  getStreamToken,
  streamVideo,
  // FR-30 to FR-34
  getVideoSecurity,
  updateVideoSecurity,
};