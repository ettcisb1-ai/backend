const { S3Client, PutBucketCorsCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const corsConfiguration = {
  CORSRules: [
    {
      AllowedHeaders: ['*'],
      AllowedMethods: ['PUT', 'POST', 'GET', 'HEAD'],
      AllowedOrigins: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000',
        'https://lms-virid-seven.vercel.app',
        'https://lms-5at8mtcbf-ettc.vercel.app',
        'https://ettc.info',
        'https://www.ettc.info'
      ],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600
    }
  ]
};

async function configureCORS() {
  try {
    const command = new PutBucketCorsCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      CORSConfiguration: corsConfiguration
    });

    await s3.send(command);
    console.log('✅ S3 CORS configuration updated successfully');
    console.log('Allowed origins:', corsConfiguration.CORSRules[0].AllowedOrigins);
  } catch (error) {
    console.error('❌ Failed to configure S3 CORS:', error);
  }
}

configureCORS();