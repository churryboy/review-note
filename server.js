// Optimized server.js - Performance, Security, and Caching Improvements

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

// Cache manager
class CacheManager {
  constructor(ttl = 60 * 60 * 1000) { // 1 hour default
    this.cache = new Map();
    this.ttl = ttl;
    
    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }
  
  set(key, value, customTTL) {
    this.cache.set(key, {
      value,
      expires: Date.now() + (customTTL || this.ttl)
    });
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  delete(key) {
    this.cache.delete(key);
  }
  
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        this.cache.delete(key);
      }
    }
  }
  
  clear() {
    this.cache.clear();
  }
}

// Initialize cache managers
const imageCache = new CacheManager(2 * 60 * 60 * 1000); // 2 hours for images
const userCache = new CacheManager(10 * 60 * 1000); // 10 minutes for user data

// Prisma setup (optional)
let prisma = null;
try {
  const DISABLE_DB = String(process.env.DISABLE_DB || '').toLowerCase();
  if (DISABLE_DB === '1' || DISABLE_DB === 'true') {
    prisma = null;
  } else {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    });
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

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const csp = "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; connect-src 'self' https:; font-src 'self' https: data:;";
  res.setHeader('Content-Security-Policy', csp);
  
  // Cache control based on file type
  const url = req.url;
  if (url.endsWith('.html') || url.endsWith('.js') || url.endsWith('.css')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (url.match(/\.(jpg|jpeg|png|gif|ico|webp|svg)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  
  next();
});

// Configure trust proxy for Render
app.set('trust proxy', 1);

// Rate limiting configurations
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: 'Too many uploads from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true
});

const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute (shorter window for faster reset)
  max: 1000, // Much higher limit for development/testing
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
  trustProxy: true
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: 'Too many API requests, please slow down.',
  trustProxy: true
});

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'));
  }
});

// File storage directories
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const ANSWERS_FILE = path.join(DATA_DIR, 'answers.json');
const PIN_USERS_FILE = path.join(DATA_DIR, 'pin-users.json');

// In-memory storage
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

// Load/save answers with error recovery
async function loadAnswers() {
  try {
    await ensureDataDir();
    if (fsSync.existsSync(ANSWERS_FILE)) {
      const raw = await fs.readFile(ANSWERS_FILE, 'utf8');
      answersByHash = JSON.parse(raw || '{}') || {};
    }
  } catch (e) {
    console.error('Failed to load answers:', e.message);
    answersByHash = {};
  }
}

async function saveAnswers() {
  try {
    await ensureDataDir();
    const tmpFile = `${ANSWERS_FILE}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(answersByHash, null, 2), 'utf8');
    await fs.rename(tmpFile, ANSWERS_FILE);
  } catch (e) {
    console.error('Failed to save answers:', e.message);
  }
}

// Load/save PIN users with error recovery
async function loadPinUsers() {
  try {
    await ensureDataDir();
    if (fsSync.existsSync(PIN_USERS_FILE)) {
      const raw = await fs.readFile(PIN_USERS_FILE, 'utf8');
      const arr = JSON.parse(raw || '[]') || [];
      pinUsersById = new Map(arr.map(u => [u.id, u]));
    }
  } catch (e) {
    console.error('Failed to load PIN users:', e.message);
    pinUsersById = new Map();
  }
}

async function savePinUsers() {
  try {
    await ensureDataDir();
    const arr = Array.from(pinUsersById.values());
    const tmpFile = `${PIN_USERS_FILE}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(arr, null, 2), 'utf8');
    await fs.rename(tmpFile, PIN_USERS_FILE);
  } catch (e) {
    console.error('Failed to save PIN users:', e.message);
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

// JWT signing with proper expiry
function signSession(user) {
  const payload = { 
    sub: user.id, 
    role: user.role || 'user',
    iat: Math.floor(Date.now() / 1000)
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret-change', { 
    expiresIn: '7d',
    algorithm: 'HS256'
  });
  return token;
}

// PIN validation
function validatePin(pin) {
  // Must be 4-12 digits
  if (!/^\d{4,12}$/.test(pin)) return false;
  
  // Reject common weak PINs
  const weakPins = ['0000', '1111', '1234', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '123456', '000000', '111111'];
  if (weakPins.includes(pin)) return false;
  
  // Reject sequential patterns
  const sequential = '0123456789';
  const reverseSeq = '9876543210';
  for (let i = 0; i <= sequential.length - pin.length; i++) {
    if (sequential.substr(i, pin.length) === pin || reverseSeq.substr(i, pin.length) === pin) {
      return false;
    }
  }
  
  return true;
}

// Main page with Mixpanel token injection
app.get('/', (req, res) => {
  const fs = require('fs');
  const htmlPath = path.join(__dirname, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  
  const mixpanelToken = process.env.MIXPANEL_TOKEN || '';
  const scriptInjection = `<script>window.MIXPANEL_TOKEN = '${mixpanelToken}';</script>`;
  html = html.replace('</head>', `${scriptInjection}\n</head>`);
  
  res.send(html);
});

// Static files
app.use(express.static('.', {
  maxAge: IS_PROD ? '1d' : 0,
  etag: true,
  lastModified: true
}));
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: IS_PROD ? '30d' : 0
}));

// Auth endpoints with rate limiting
app.get('/api/auth/me', apiLimiter, async (req, res) => {
  const token = req.cookies?.session || '';
  if (!token) return res.json({ user: null });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change');
    
    // Check cache first
    const cachedUser = userCache.get(`user:${decoded.sub}`);
    if (cachedUser) {
      return res.json({ user: cachedUser });
    }
    
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
          userCache.set(`user:${decoded.sub}`, user);
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
        userCache.set(`user:${decoded.sub}`, user);
      }
    }
    
    return res.json({ user });
  } catch (_) {
    return res.json({ user: null });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const userId = getAuthedUserId(req);
  if (userId) {
    userCache.delete(`user:${userId}`);
  }
  res.cookie('session', '', { path: '/', maxAge: 0 });
  return res.json({ ok: true });
});

app.post('/api/auth/anon', apiLimiter, async (req, res) => {
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

app.post('/api/auth/register-pin', authLimiter, async (req, res) => {
  try {
    const Body = z.object({
      nickname: z.string().min(1).max(40),
      pin: z.string().min(4).max(12)
    });
    const b = Body.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Invalid input' });
    
    const { nickname, pin } = b.data;
    
    // Validate PIN strength
    if (!validatePin(pin)) {
      return res.status(400).json({ error: 'PIN is too weak. Please use a stronger PIN.' });
    }
    
    const pinHash = await bcrypt.hash(pin, 12); // Increased rounds for better security
    
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
    if (exists) return res.status(409).json({ error: 'Nickname already exists' });
    
    // Create user with retry logic
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
        throw e;
      }
    }
    
    if (!user) return res.status(500).json({ error: 'Registration failed' });
    
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
    return res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login-pin', authLimiter, async (req, res) => {
  try {
    const Body = z.object({
      nickname: z.string().min(1).max(40),
      pin: z.string().min(4).max(12)
    });
    const b = Body.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Invalid input' });
    
    const { nickname, pin } = b.data;
    
    // Try database first
    if (prisma) {
      const user = await prisma.user.findFirst({
        where: { nickname, authProvider: 'pin' }
      });
      
      if (user) {
        const ok = await bcrypt.compare(pin, user.pinHash || '');
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
        
        // Clear user cache on successful login
        userCache.delete(`user:${user.id}`);
        
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
      if (!rec) return res.status(401).json({ error: 'Invalid credentials' });
      
      const ok = await bcrypt.compare(pin, rec.pinHash || '');
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
      
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
    
    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (e) {
    console.error('login-pin error:', e);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// Optimized image upload with better compression
app.post('/api/upload-image-form', uploadLimiter, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const rawBuffer = req.file.buffer;
    const mime = req.file.mimetype;
    
    // Validate actual file type
    const fileType = await fileTypeFromBuffer(rawBuffer);
    if (!fileType || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(fileType.mime)) {
      return res.status(400).json({ error: 'Invalid image format' });
    }
    
    // Process image with sharp
    let pipeline = sharp(rawBuffer, { failOn: 'none' })
      .rotate() // Auto-rotate based on EXIF
      .resize(1200, 1200, { 
        fit: 'inside',
        withoutEnlargement: true
      });
    
    // Optimize based on format
    switch (mime) {
      case 'image/jpeg':
        pipeline = pipeline.jpeg({ 
          quality: 85, 
          mozjpeg: true,
          progressive: true
        });
        break;
      case 'image/png':
        pipeline = pipeline.png({ 
          compressionLevel: 9,
          adaptiveFiltering: true
        });
        break;
      case 'image/webp':
        pipeline = pipeline.webp({ 
          quality: 85,
          effort: 6
        });
        break;
      default:
        pipeline = pipeline.jpeg({ 
          quality: 85,
          mozjpeg: true
        });
    }
    
    const sanitized = await pipeline.toBuffer();
    const hash = crypto.createHash('sha256').update(sanitized).digest('hex');
    
    // Save to database if available
    if (prisma) {
      try {
        // Check if image already exists
        const existingImage = await prisma.image.findUnique({ where: { hash } });
        if (existingImage) {
          const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
          const host = req.headers.host;
          const url = `${proto}://${host}/api/image/${hash}`;
          return res.json({ url, hash });
        }
        
        // Store new image
        await prisma.image.create({
          data: {
            hash,
            url: `/api/image/${hash}`,
            data: sanitized,
            mimeType: mime,
            size: sanitized.length
          }
        });
        
        // Cache the image
        imageCache.set(hash, {
          data: sanitized,
          mimeType: mime,
          size: sanitized.length
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

// Serve images with caching
app.get('/api/image/:hash', async (req, res) => {
  if (!prisma) return res.status(404).json({ error: 'Database not available' });
  
  try {
    const { hash } = req.params;
    
    // Check cache first
    const cached = imageCache.get(hash);
    if (cached) {
      res.set({
        'Content-Type': cached.mimeType || 'image/jpeg',
        'Content-Length': cached.size,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'ETag': `"${hash}"`,
      });
      return res.send(cached.data);
    }
    
    // Fetch from database
    const image = await prisma.image.findUnique({
      where: { hash },
      select: { data: true, mimeType: true, size: true }
    });
    
    if (!image || !image.data) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Cache for future requests
    imageCache.set(hash, {
      data: image.data,
      mimeType: image.mimeType,
      size: image.size
    });
    
    res.set({
      'Content-Type': image.mimeType || 'image/jpeg',
      'Content-Length': image.size || image.data.length,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': `"${hash}"`,
    });
    
    res.send(image.data);
  } catch (error) {
    console.error('Failed to serve image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Answers API
app.get('/api/answers/:hash', apiLimiter, async (req, res) => {
  try {
    const { hash } = req.params;
    const answer = answersByHash[hash] || null;
    return res.json({ answer });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load answer' });
  }
});

app.get('/api/answers', apiLimiter, async (req, res) => {
  try {
    return res.json({ answers: answersByHash });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load answers' });
  }
});

app.post('/api/answers', apiLimiter, async (req, res) => {
  try {
    const { imageHash, answer } = req.body;
    if (!imageHash || typeof answer !== 'string') {
      return res.status(400).json({ error: 'Invalid data' });
    }
    
    answersByHash[imageHash] = answer;
    await saveAnswers();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save answer' });
  }
});

// Questions API with batch support
app.get('/api/questions', apiLimiter, async (req, res) => {
  if (!prisma) return res.json({ items: [] });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const items = await prisma.question.findMany({
      where: { userId },
      include: { image: true },
      orderBy: { timestamp: 'desc' }
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

app.post('/api/questions', apiLimiter, async (req, res) => {
  if (!prisma) return res.json({ item: null, persisted: false });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
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
        round: typeof round === 'number' ? round : 0,
        timestamp: new Date()
      }
    });
    
    return res.json({ item: q, persisted: true });
  } catch (e) {
    console.warn('DB create question failed:', e.message);
    return res.json({ item: null, persisted: false });
  }
});

app.delete('/api/questions/:id', apiLimiter, async (req, res) => {
  if (!prisma) return res.json({ ok: true });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    await prisma.question.deleteMany({
      where: { 
        id: req.params.id,
        userId // Ensure user can only delete their own questions
      }
    });
    return res.json({ ok: true });
  } catch (e) {
    return res.json({ ok: true });
  }
});

// Pop Quiz Queue API
app.get('/api/pop-quiz-queue', apiLimiter, async (req, res) => {
  if (!prisma) return res.json({ items: [] });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const items = await prisma.popQuizQueue.findMany({
      where: { question: { userId } },
      include: { question: { include: { image: true } } },
      orderBy: { nextAt: 'asc' }
    });
    
    return res.json({ items });
  } catch (e) {
    return res.json({ items: [] });
  }
});

app.post('/api/pop-quiz-queue', apiLimiter, async (req, res) => {
  if (!prisma) return res.json({ item: null, persisted: false });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const { questionId, nextAt } = req.body;
    
    // Verify question belongs to user
    const question = await prisma.question.findFirst({
      where: { id: questionId, userId }
    });
    
    if (!question) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
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
app.get('/api/achievements', apiLimiter, async (req, res) => {
  if (!prisma) return res.json({ items: [] });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const items = await prisma.achievement.findMany({
      where: { userId },
      include: { question: { include: { image: true } } },
      orderBy: { achievedAt: 'desc' }
    });
    
    return res.json({ items });
  } catch (e) {
    return res.json({ items: [] });
  }
});

app.post('/api/achievements', apiLimiter, async (req, res) => {
  if (!prisma) return res.json({ item: null });
  
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const { questionId } = req.body;
    
    // Check if achievement already exists
    const existing = await prisma.achievement.findFirst({
      where: { userId, questionId }
    });
    
    if (existing) {
      return res.json({ item: existing });
    }
    
    const item = await prisma.achievement.create({
      data: { 
        userId, 
        questionId,
        achievedAt: new Date()
      }
    });
    
    return res.json({ item });
  } catch (e) {
    return res.json({ item: null });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    ok: true, 
    db: isDbAvailable(),
    env: IS_PROD ? 'production' : 'development',
    cache: {
      images: imageCache.cache.size,
      users: userCache.cache.size
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Request error:', err && err.stack || err);
  if (res.headersSent) return next(err);
  
  const status = err.status || 500;
  const message = IS_PROD ? 'Server error' : err.message;
  
  return res.status(status).json({ error: message });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Save any pending data
  await saveAnswers();
  await savePinUsers();
  
  // Close database connection
  if (prisma) {
    await prisma.$disconnect();
  }
  
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${IS_PROD ? 'production' : 'development'}`);
  console.log(`Database: ${isDbAvailable() ? 'connected' : 'not available'}`);
  console.log(`Data directory: ${DATA_DIR}`);
});