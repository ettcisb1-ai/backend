const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide a video title'],
      trim: true,
    },

    // ── Legacy field — kept for backward compatibility ────────────────────────
    // Old videos may have had a Cloudinary publicId; no longer used for new uploads.
    // Kept so existing records don't break.
    publicId: {
      type: String,
      default: '',
      trim: true,
    },

    // ── S3 video URL ──────────────────────────────────────────────────────────
    // Stores the S3 public URL. The backend generates presigned GET URLs on
    // demand for playback — raw URL is never sent to clients.
    videoUrl: {
      type: String,
      default: '',
      trim: true,
    },

    duration: { type: String, default: '0:00' },
    size:     { type: String, default: 'Unknown size' },
    thumbnail: { type: String, default: '' },

    // FR-27: Videos belong to a category
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Categorie',
      required: [true, 'Please provide a category'],
    },
    // FR-25/FR-26: Videos belong to a course
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Please provide a course'],
    },

    status: {
      type: String,
      enum: ['Draft', 'Processing', 'Published'],
      default: 'Published',
    },

    // ── Security settings (FR-30 to FR-34) ───────────────────────────────────
    // FR-30: Disable download via controlsList + Content-Disposition headers
    disableDownloads: { type: Boolean, default: true },

    // FR-32: Never expose Cloudinary or raw URLs in API responses
    hideUrls: { type: Boolean, default: true },

    // FR-29: Issue signed tokens/URLs; never serve raw video directly
    tokenizedStreaming: { type: Boolean, default: true },

    // FR-30: DRM layer flag (signals client to enforce DRM restrictions)
    drm: { type: Boolean, default: false },

    // FR-31: Screen capture detection (experimental)
    // NOTE: Cannot prevent OBS, Bandicam, Xbox Game Bar, or mobile cameras.
    // Only detects focus/visibility changes in the browser tab.
    antiScreenRecording: { type: Boolean, default: true },

    // FR-29: Enforce secure in-app playback only
    securePlayback: { type: Boolean, default: true },

    // FR-34: HLS adaptive bitrate streaming via Cloudinary streaming profiles.
    // When enabled, the token endpoint returns a signed .m3u8 playlist URL
    // and the frontend uses HLS.js for multi-quality adaptive playback.
    adaptiveStreaming: { type: Boolean, default: false },

    // FR-34: HLS playlist path (legacy — for self-hosted transcoded videos)
    hlsPath: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Video', videoSchema);