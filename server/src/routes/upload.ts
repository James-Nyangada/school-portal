import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
});

const router = Router();

// Configure Multer with Memory Storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// POST /api/upload
router.post('/', requireAuth, upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Convert buffer to base64 data URL
    const fileBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    // Upload to Cloudinary
    const uploadResponse = await cloudinary.uploader.upload(fileBase64, {
      folder: 'school_portal_documents',
      resource_type: 'auto', // Support PDF, images, etc.
    });

    res.status(200).json({
      url: uploadResponse.secure_url,
      publicId: uploadResponse.public_id,
    });
  } catch (error: any) {
    console.error('[Upload Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to upload file to Cloudinary' });
  }
});

export default router;
