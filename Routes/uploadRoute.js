const express = require('express');
const router = express.Router();
const path = require('path');
const { protect, authorize } = require('../Middlewares/auth');
const s3 = require('../config/s3');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// @desc    Generate a presigned S3 PUT URL for direct browser → S3 video upload.
//          The frontend PUTs the file directly to S3 — bypasses Vercel size limits.
//          After upload completes, the frontend saves the public S3 URL to MongoDB.
// @route   GET /api/upload/s3-signature
// @access  Private/Admin only
router.get('/s3-signature', protect, authorize('admin'), async (req, res) => {
  try {
    const { fileName, contentType } = req.query;

    if (!fileName || !contentType) {
      return res.status(400).json({
        success: false,
        message: 'fileName and contentType query params are required',
      });
    }

    const BUCKET = process.env.AWS_S3_BUCKET;
    if (!BUCKET) {
      return res.status(500).json({ success: false, message: 'AWS_S3_BUCKET is not configured' });
    }

    // Build a unique S3 key
    const ext      = path.extname(fileName) || '.mp4';
    const safeName = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const s3Key    = `lms-videos/${Date.now()}_${safeName}${ext}`;

    // Presigned PUT URL — valid for 2 hours
    const command = new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         s3Key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 7200 });

    // Public URL (accessible once uploaded, assuming bucket allows public reads)
    const region    = process.env.AWS_REGION;
    const publicUrl = `https://${BUCKET}.s3.${region}.amazonaws.com/${s3Key}`;

    return res.status(200).json({
      success: true,
      presignedUrl,
      publicUrl,
      s3Key,
      bucket: BUCKET,
    });
  } catch (error) {
    console.error('S3 presign error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate S3 presigned URL',
    });
  }
});

module.exports = router;
