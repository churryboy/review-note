const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const dotenv = require('dotenv');
const { z } = require('zod');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { fileTypeFromBuffer } = require('file-type');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

// Global crash guards
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err && err.stack || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason);
});

const app = express();
const PORT = process.env.PORT || 3000;

// Prisma setup (optional)
let prisma = null;
try {
  const DISABLE_DB = String(process.env.DISABLE_DB || '').toLowerCase();
  if (DISABLE_DB === '1' || DISABLE_DB === 'true') {
    prisma = null;
  } else {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    prisma.$connect()
      .then(() => console.log("Database connected successfully"))
      .catch((err) => {
        console.error("Database connection failed:", err.message);
        prisma = null;
      });
  }
} catch (_) {
  prisma = null;
}

// Helper functions
function isDbAvailable() {
  return prisma !== null;
}

function getAuthedUserId(req) {
  try {
    const token = req.cookies?.session || '';
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change');
    return decoded?.sub || null;
  } catch (_) {
    return null;
  }
}

// Production settings
const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
if (IS_PROD) {
  app.enable('trust proxy');
  // Redirect HTTP to HTTPS
  app.use((req, res, next) => {
    const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    if (proto !== 'https') {
      const host = req.headers.host;
      return res.redirect(301, `https://${host}${req.originalUrl}`);
    }
    return next();
  });
  // HSTS header
  app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    next();
  });
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const csp = "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; connect-src 'self' https:; font-src 'self' https: data:;";
  res.setHeader('Content-Security-Policy', csp);
  next();
});

// Rate limiting
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  message: 'Too many uploads from this IP, please try again later.'
});

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Invalid file type'));
  }
});

// File storage directories
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const ANSWERS_FILE = path.join(DATA_DIR, 'answers.json');
const PIN_USERS_FILE = path.join(DATA_DIR, 'pin-users.json');

let answersByHash = {};
let pinUsersById = new Map();

// Initialize directories
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (e) {
    console.warn('Failed to ensure data directory:', e.message);
  }
}

// Load/save answers
async function loadAnswers() {
  try {
    await ensureDataDir();
    if (fsSync.existsSync(ANSWERS_FILE)) {
      const raw = await fs.readFile(ANSWERS_FILE, 'utf8');
      answersByHash = JSON.parse(raw || '{}') || {};
    }
  } catch (e) {
    answersByHash = {};
  }
}

async function saveAnswers() {
  try {
    await ensureDataDir();
    await fs.writeFile(ANSWERS_FILE, JSON.stringify(answersByHash, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to save answers:', e.message);
  }
}

// Load/save PIN users
async function loadPinUsers() {
  try {
    await ensureDataDir();
    if (fsSync.existsSync(PIN_USERS_FILE)) {
      const raw = await fs.readFile(PIN_USERS_FILE, 'utf8');
      const arr = JSON.parse(raw || '[]') || [];
      pinUsersById = new Map(arr.map(u => [u.id, u]));
    }
  } catch (e) {
    pinUsersById = new Map();
  }
}

async function savePinUsers() {
  try {
    await ensureDataDir();
    const arr = Array.from(pinUsersById.values());
    await fs.writeFile(PIN_USERS_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to save PIN users:', e.message);
  }
}

// Load data on startup
loadAnswers();
loadPinUsers();

// Generate unique public ID
async function generate6DigitPublicId() {
  function rnd() { 
    return String(Math.floor(100000 + Math.random() * 900000)); 
  }
  
  for (let i = 0; i < 50; i++) {
    const id = rnd();
    let exists = false;
    
    if (prisma) {
      try {
        const u = await prisma.user.findFirst({ where: { publicId: id } });
        if (u) exists = true;
      } catch (_) {}
    }
    
    if (!exists) {
      for (const u of pinUsersById.values()) {
        if ((u.publicId || '') === id) {
          exists = true;
          break;
        }
      }
    }
    
    if (!exists) return id;
  }
  return rnd();
}

// JWT signing
function signSession(user) {
  const payload = { sub: user.id, role: user.role || 'user' };
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret-change', { 
    expiresIn: '7d' 
  });
  return token;
}

// Static files
app.use(express.static('.'));
app.use('/uploads', express.static(UPLOADS_DIR));

// Main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Auth endpoints
app.get('/api/auth/me', async (req, res) => {
  const token = req.cookies?.session || '';
  if (!token) return res.json({ user: null });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change');
    let user = { id: decoded.sub, role: decoded.role };
    
    if (prisma) {
      try {
        const dbUser = await prisma.user.findUnique({ where: { id: decoded.sub } });
        if (dbUser) {
          user = {
            id: dbUser.id,
            role: dbUser.role,
            name: dbUser.name,
            email: dbUser.email,
            picture: dbUser.picture,
            provider: dbUser.authProvider,
            publicId: dbUser.publicId,
            nickname: dbUser.nickname || dbUser.name
          };
        }
      } catch (_) {}
    }
    
    if (!user.name) {
      const u2 = pinUsersById.get(decoded.sub);
      if (u2) {
        user = {
          id: u2.id,
          role: 'user',
          name: u2.nickname,
          provider: 'pin',
          publicId: u2.publicId,
          nickname: u2.nickname
        };
      }
    }
    
    return res.json({ user });
  } catch (_) {
    return res.json({ user: null });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.cookie('session', '', { path: '/', maxAge: 0 });
  return res.json({ ok: true });
});

app.post('/api/auth/anon', async (req, res) => {
  try {
    const existing = getAuthedUserId(req);
    if (existing) {
      return res.json({ ok: true, userId: existing });
    }
    
    let userId = null;
    if (prisma) {
      try {
        const rnd = crypto.randomBytes(10).toString('hex');
        const email = `anon-${Date.now()}-${rnd}@anon.local`;
        const user = await prisma.user.create({ 
          data: { email, name: 'Anonymous', role: 'user' } 
        });
        userId = user.id;
      } catch (e) {
        console.warn('DB anon create failed:', e.message);
      }
    }
    
    if (!userId) {
      const rnd = crypto.randomBytes(16).toString('hex');
      userId = `anon_${rnd}`;
    }
    
    const token = signSession({ id: userId, role: 'user' });
    res.cookie('session', token, {
      path: '/',
      sameSite: 'lax',
      secure: IS_PROD,
      httpOnly: true,
      maxAge: 365 * 24 * 3600 * 1000
    });
    
    return res.json({ ok: true, userId });
  } catch (e) {
    console.error('anon auth error:', e);
    return res.status(500).json({ error: 'anon auth failed' });
  }
});

app.post('/api/auth/register-pin', async (req, res) => {
  try {
    const Body = z.object({
      nickname: z.string().min(1).max(40),
      pin: z.string().min(4).max(12)
    });
    const b = Body.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'invalid' });
    
    const { nickname, pin } = b.data;
    const pinHash = await bcrypt.hash(pin, 10);
    
    if (!prisma) {
      // Fallback to file store
      const id = 'pin_' + crypto.randomBytes(8).toString('hex');
      const publicId = await generate6DigitPublicId();
      const rec = {
        id,
        nickname,
        pinHash,
        publicId,
        createdAt: new Date().toISOString()
      };
      pinUsersById.set(id, rec);
      await savePinUsers();
      
      const token = signSession({ id, role: 'user' });
      res.cookie('session', token, {
        path: '/',
        sameSite: 'lax',
        secure: IS_PROD,
        httpOnly: true,
        maxAge: 365 * 24 * 3600 * 1000
      });
      
      return res.json({ ok: true, user: { id, publicId, nickname } });
    }
    
    // Check for existing nickname
    const exists = await prisma.user.findFirst({
      where: { nickname, authProvider: 'pin' }
    });
    if (exists) return res.status(409).json({ error: 'nickname exists' });
    
    // Create user
    let user = null;
    for (let i = 0; i < 5 && !user; i++) {
      const publicId = await generate6DigitPublicId();
      const email = `pin-${publicId}@pin.local`;
      
      try {
        user = await prisma.user.create({
          data: {
            email,
            name: nickname,
            nickname,
            pinHash,
            publicId,
            authProvider: 'pin',
            role: 'user'
          }
        });
      } catch (e) {
        if (e.code === 'P2002') continue; // Unique constraint, retry
        break;
      }
    }
    
    if (!user) return res.status(500).json({ error: 'register failed' });
    
    const token = signSession({ id: user.id, role: 'user' });
    res.cookie('session', token, {
      path: '/',
      sameSite: 'lax',
      secure: IS_PROD,
      httpOnly: true,
      maxAge: 365 * 24 * 3600 * 1000
    });
    
    return res.json({ ok: true, user: { id: user.id, publicId: user.publicId, nickname: user.nickname } });
  } catch (e) {
    console.error('register-pin error:', e);
    return res.status(500).json({ error: 'register failed' });
  }
});

app.post('/api/auth/login-pin', async (req, res) => {
  try {
    const Body = z.object({
      nickname: z.string().min(1).max(40),
      pin: z.string().min(4).max(12)
    });
    const b = Body.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'invalid' });
    
    const { nickname, pin } = b.data;
    
    // Try database first
    if (prisma) {
      const user = await prisma.user.findFirst({
        where: { nickname, authProvider: 'pin' }
      });
      
      if (user) {
        const ok = await bcrypt.compare(pin, user.pinHash || '');
        if (!ok) return res.status(401).json({ error: 'invalid credentials' });
        
        const token = signSession({ id: user.id, role: user.role || 'user' });
        res.cookie('session', token, {
          path: '/',
          sameSite: 'lax',
          secure: IS_PROD,
          httpOnly: true,
          maxAge: 365 * 24 * 3600 * 1000
        });
        
        return res.json({ ok: true, user: { id: user.id, publicId: user.publicId, nickname: user.nickname } });
      }
    }
    
    // Fallback to file store
    if (!IS_PROD) {
      const rec = Array.from(pinUsersById.values()).find(u => (u.nickname || '') === nickname);
      if (!rec) return res.status(401).json({ error: 'invalid credentials' });
      
      const ok = await bcrypt.compare(pin, rec.pinHash || '');
      if (!ok) return res.status(401).json({ error: 'invalid credentials' });
      
      const token = signSession({ id: rec.id, role: 'user' });
      res.cookie('session', token, {
        path: '/',
        sameSite: 'lax',
        secure: IS_PROD,
        httpOnly: true,
        maxAge: 365 * 24 * 3600 * 1000
      });
      
      return res.json({ ok: true, user: { id: rec.id, publicId: rec.publicId, nickname: rec.nickname } });
    }
    
    return res.status(401).json({ error: 'invalid credentials' });
  } catch (e) {
    console.error('login-pin error:', e);
    return res.status(500).json({ error: 'login failed' });
  }
});

// Image upload endpoint
app.post('/api/upload-image-form', uploadLimiter, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const rawBuffer = req.file.buffer;
    const mime = req.file.mimetype;
    
    // Validate size
    if (rawBuffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (max 5MB)' });
    }
    
    // Process image with sharp
    let pipeline = sharp(rawBuffer, { failOn: 'warning' }).rotate();
    
    switch (mime) {
      case 'image/jpeg':
        pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
        break;
      case 'image/png':
        pipeline = pipeline.png({ compressionLevel: 9 });
        break;
      case 'image/webp':
        pipeline = pipeline.webp({ quality: 85 });
        break;
      default:
        pipeline = pipeline.jpeg({ quality: 85 });
    }
    
    const sanitized = await pipeline.toBuffer();
    const hash = crypto.createHash('sha256').update(sanitized).digest('hex');
    
    // Save to database if available
    if (prisma) {
      try {
        const existingImage = await prisma.image.findUnique({ where: { hash } });
        if (existingImage) {
          const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
          const host = req.headers.host;
          const url = `${proto}://${host}/api/image/${hash}`;
          return res.json({ url, hash });
        }
        
        await prisma.image.create({
          data: {
            hash,
            url: `/api/image/${hash}`,
            data: sanitized,
            mimeType: mime,
            size: sanitized.length
          }
        });
        
        const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
        const host = req.headers.host;
        const url = `${proto}://${host}/api/image/${hash}`;
        return res.json({ url, hash });
      } catch (e) {
        console.warn('DB save failed, falling back to file:', e.message);
      }
    }
    
    // Fallback to file system
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const name = `${uuidv4()}.${ext}`;
    await ensureDataDir();
    const filePath = path.join(UPLOADS_DIR, name);
    await fs.writeFile(filePath, sanitized);
    
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
    const host = req.headers.host;
    const url = `${proto}://${host}/uploads/${name}`;
    
    return res.json({ url, hash });
  } catch (e) {
    console.error('Upload error:', e);
    return res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Serve images from database
app.get('/api/image/:hash', async (req, res) => {
  if (!prisma) return res.status(404).json({ error: 'Database not available' });
  
  try {
    const { hash } = req.params;
    const image = await prisma.image.findUnique({
      where: { hash },
      select: { data: true, mimeType: true, size: true }
    });
    
    if (!image || !image.data) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    res.set({
      'Content-Type': image.mimeType || 'image/jpeg',
      'Content-Length': image.size || image.data.length,
      'Cache-Control': 'public, max-age=31536000'
    });
    
    res.send(image.data);
  } catch (error) {
    console.error('Failed to serve image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Answers API
app.get('/api/answers/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const userId = getAuthedUserId(req);
    
    if (prisma) {
      try {
        const ans = await prisma.answer.findFirst({
          where: { imageHash: hash, userId: userId || undefined }
        });
        if (ans) return res.json({ answer: ans.value || null });
      } catch (e) {
        console.warn('DB read answer failed:', e.message);
      }
    }
    
    const answer = answersByHash[hash] || null;
    return res.json({ answer });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load answer' });
  }
});

// Bulk answers API - get all answers for current user
app.get('/api/answers', async (req, res) => {
  try {
    const userId = getAuthedUserId(req);
    let allAnswers = {};
    
    if (prisma && userId) {
      try {
        const answers = await prisma.answer.findMany({
          where: { userId }
        });
        answers.forEach(ans => {
          if (ans.imageHash && ans.value) {
            allAnswers[ans.imageHash] = ans.value;
          }
        });
      } catch (e) {
        console.warn('DB read all answers failed:', e.message);
      }
    }
    
    // Merge with file-based answers (fallback)
    Object.assign(allAnswers, answersByHash);
    
    return res.json({ answers: allAnswers });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load answers' });
  }
});

app.post('/api/answers', async (req, res) => {
  try {
    const { imageHash, answer } = req.body;
    if (!imageHash) return res.status(400).json({ error: 'imageHash required' });
    
    const userId = getAuthedUserId(req);
    
    if (prisma && userId) {
      try {
        const existing = await prisma.answer.findFirst({
          where: { imageHash, userId }
        });
        
        if (existing) {
          await prisma.answer.update({
            where: { id: existing.id },
            data: { value: answer }
          });
        } else {
          await prisma.answer.create({
            data: { value: answer, imageHash, userId }
          });
        }
        
        return res.json({ ok: true });
      } catch (e) {
        console.warn('DB save answer failed:', e.message);
      }
    }
    
    answersByHash[imageHash] = answer;
    await saveAnswers();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save answer' });
  }
});

app.post('/api/answers/migrate-canonical', async (req, res) => {
  // Simplified migration endpoint
  return res.json({ ok: true, migrated: 0 });
});

// Questions API
app.get('/api/questions', async (req, res) => {
  if (!prisma) return res.json({ items: [] });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  
  try {
    const items = await prisma.question.findMany({
      where: { userId },
      include: { image: true }
    });
    
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
    const host = req.headers.host;
    
    const norm = items.map(it => {
      if (it?.image?.url && !/^https?:\/\//i.test(it.image.url)) {
        it.image.url = it.image.url.startsWith('/') 
          ? `${proto}://${host}${it.image.url}`
          : `${proto}://${host}/${it.image.url}`;
      }
      return it;
    });
    
    return res.json({ items: norm });
  } catch (e) {
    console.warn('DB get questions failed:', e.message);
    return res.json({ items: [] });
  }
});

app.post('/api/questions', async (req, res) => {
  if (!prisma) return res.json({ item: null, persisted: false });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  
  try {
    const { imageHash, imageUrl, questionNumber, category, round } = req.body;
    
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) return res.json({ item: null, persisted: false });
    
    const img = await prisma.image.upsert({
      where: { hash: imageHash },
      update: { url: imageUrl },
      create: { hash: imageHash, url: imageUrl }
    });
    
    const q = await prisma.question.create({
      data: {
        userId,
        imageId: img.id,
        questionNumber: questionNumber || null,
        category: category || null,
        round: typeof round === 'number' ? round : 0
      }
    });
    
    return res.json({ item: q, persisted: true });
  } catch (e) {
    console.warn('DB create question failed:', e.message);
    return res.json({ item: null, persisted: false });
  }
});

app.delete('/api/questions/:id', async (req, res) => {
  if (!prisma) return res.json({ ok: true });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  
  try {
    await prisma.question.delete({ where: { id: req.params.id } });
    return res.json({ ok: true });
  } catch (e) {
    return res.json({ ok: true });
  }
});

// Pop Quiz Queue API
app.get('/api/pop-quiz-queue', async (req, res) => {
  if (!prisma) return res.json({ items: [] });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  
  try {
    const items = await prisma.popQuizQueue.findMany({
      where: { question: { userId } },
      include: { question: { include: { image: true } } }
    });
    
    return res.json({ items });
  } catch (e) {
    return res.json({ items: [] });
  }
});

app.post('/api/pop-quiz-queue', async (req, res) => {
  if (!prisma) return res.json({ item: null, persisted: false });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  
  try {
    const { questionId, nextAt } = req.body;
    
    const item = await prisma.popQuizQueue.upsert({
      where: { questionId },
      update: { nextAt: new Date(nextAt) },
      create: { questionId, nextAt: new Date(nextAt) }
    });
    
    return res.json({ item, persisted: true });
  } catch (e) {
    return res.json({ item: null, persisted: false });
  }
});

// Achievements API
app.get('/api/achievements', async (req, res) => {
  if (!prisma) return res.json({ items: [] });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  
  try {
    const items = await prisma.achievement.findMany({
      where: { userId },
      include: { question: { include: { image: true } } }
    });
    
    return res.json({ items });
  } catch (e) {
    return res.json({ items: [] });
  }
});

app.post('/api/achievements', async (req, res) => {
  if (!prisma) return res.json({ item: null });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  
  try {
    const { questionId } = req.body;
    const item = await prisma.achievement.create({
      data: { userId, questionId }
    });
    return res.json({ item });
  } catch (e) {
    return res.json({ item: null });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    ok: true, 
    db: isDbAvailable(),
    env: IS_PROD ? 'production' : 'development'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Request error:', err && err.stack || err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ error: 'Server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${IS_PROD ? 'production' : 'development'}`);
  console.log(`Database: ${isDbAvailable() ? 'connected' : 'not available'}`);
});