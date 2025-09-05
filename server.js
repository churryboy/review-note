const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const vision = require('@google-cloud/vision');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const dotenv = require('dotenv');
const { z } = require('zod');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Prisma (optional)
let prisma = null;
try {
  // Lazy require to avoid install issues before prisma is added
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
} catch (_) {
  prisma = null;
}

// Helper: extract authed user id (string) or return null
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

// Enforce HTTPS and HSTS in production/Render
const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
if (IS_PROD) {
  app.enable('trust proxy');
  // Redirect http -> https when behind proxy
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

// Attempt to load API key from common sibling folders if not set
(function tryLoadAltEnv() {
    if (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) return;
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const candidates = [
        path.resolve(__dirname, '.env'),
        path.resolve(__dirname, '..', 'smart-planner', '.env'),
        path.resolve(__dirname, '..', 'smart_planner', '.env'),
        path.resolve(__dirname, '..', 'smart-planner2', '.env'),
        path.resolve(__dirname, '..', 'smart_planner2', '.env'),
        home && path.resolve(home, 'smart-planner', '.env'),
        home && path.resolve(home, 'smart_planner', '.env'),
        home && path.resolve(home, 'smart-planner2', '.env'),
        home && path.resolve(home, 'smart_planner2', '.env'),
    ].filter(Boolean);
    for (const p of candidates) {
        try {
            if (fsSync.existsSync(p)) {
                dotenv.config({ path: p });
                if (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
                    console.log(`Loaded env from ${p}`);
                    break;
                }
            }
        } catch (_) {}
    }
})();

// Increase body parser limits for base64 images
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(cookieParser());

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed.'));
        }
    }
});

// Initialize Google Vision API client
const visionClient = new vision.ImageAnnotatorClient({
    keyFilename: process.env.GOOGLE_CLOUD_KEYFILE // Path to your service account key file
});

// Initialize Claude client (legacy OCR usage retained)
const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const anthropic = new Anthropic({ apiKey: claudeApiKey });

// Initialize OpenAI client (optional)
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Simple file-backed answers store
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const ANSWERS_FILE = path.join(DATA_DIR, 'answers.json');
let answersByHash = {};

async function ensureDataDir() {
    try {
        if (!fsSync.existsSync(DATA_DIR)) {
            await fs.mkdir(DATA_DIR, { recursive: true });
        }
        if (!fsSync.existsSync(UPLOADS_DIR)) {
            await fs.mkdir(UPLOADS_DIR, { recursive: true });
        }
    } catch (e) {
        console.warn('Failed to ensure data directory:', e.message);
    }
}
async function loadAnswers() {
    try {
        await ensureDataDir();
        if (fsSync.existsSync(ANSWERS_FILE)) {
            const raw = await fs.readFile(ANSWERS_FILE, 'utf8');
            answersByHash = JSON.parse(raw || '{}') || {};
        }
    } catch (e) {
        console.warn('Failed to load answers file:', e.message);
        answersByHash = {};
    }
}
async function saveAnswers() {
    try {
        await ensureDataDir();
        await fs.writeFile(ANSWERS_FILE, JSON.stringify(answersByHash, null, 2), 'utf8');
    } catch (e) {
        console.warn('Failed to save answers file:', e.message);
    }
}

// Load answers on startup
loadAnswers();

// Simple in-memory user store (replace with DB later)
const usersByGoogleId = new Map();

function signSession(user) {
  const payload = { sub: user.id, role: user.role || 'user' };
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret-change', { expiresIn: '7d' });
  return token;
}

// Google OAuth endpoints
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

function buildGoogleAuthUrl(state) {
  const redirectUri = `${APP_BASE_URL}/api/auth/google/callback`;
  const p = new URL(GOOGLE_AUTH_URL);
  p.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  p.searchParams.set('redirect_uri', redirectUri);
  p.searchParams.set('response_type', 'code');
  p.searchParams.set('scope', 'openid email profile');
  if (state) p.searchParams.set('state', state);
  p.searchParams.set('access_type', 'online');
  p.searchParams.set('prompt', 'consent');
  return p.toString();
}

app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.status(500).send('Google OAuth is not configured');
  const url = buildGoogleAuthUrl('login');
  return res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const redirectUri = `${APP_BASE_URL}/api/auth/google/callback`;
    const code = (req.query.code || '').toString();
    if (!code) return res.status(400).send('Missing code');

    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      return res.status(500).send('Token exchange failed: ' + t);
    }
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) return res.status(500).send('Missing access token');

    // Fetch user info
    const userRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!userRes.ok) {
      const t = await userRes.text();
      return res.status(500).send('Failed to get userinfo: ' + t);
    }
    const profile = await userRes.json();
    const googleId = profile.sub;
    if (!googleId) return res.status(500).send('Invalid profile');

    // Upsert user (DB if available, otherwise in-memory)
    let user = null;
    if (prisma) {
      try {
        user = await prisma.user.upsert({
          where: { googleId: googleId },
          update: { email: profile.email || '', name: profile.name || '', picture: profile.picture || '' },
          create: { googleId: googleId, email: profile.email || `${googleId}@users.noreply`, name: profile.name || '', picture: profile.picture || '', role: 'user' }
        });
      } catch (e) {
        console.warn('DB upsert user failed, falling back to memory:', e.message);
      }
    }
    if (!user) {
      user = usersByGoogleId.get(googleId);
      if (!user) {
        user = { id: googleId, email: profile.email, name: profile.name, picture: profile.picture, role: 'user' };
        usersByGoogleId.set(googleId, user);
      } else {
        user.email = profile.email;
        user.name = profile.name;
        user.picture = profile.picture;
      }
    }

    // Issue session cookie with user.id (DB id if available)
    const sessionUser = { id: user.id || googleId, role: user.role || 'user' };
    const token = signSession(sessionUser);
    res.cookie('session', token, { path: '/', sameSite: (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(), secure: IS_PROD, httpOnly: true, maxAge: 7 * 24 * 3600 * 1000 });
    return res.redirect('/');
  } catch (e) {
    console.error('Google callback error:', e);
    return res.status(500).send('OAuth error');
  }
});

app.get('/api/auth/me', async (req, res) => {
  const token = req.cookies?.session || '';
  if (!token) return res.json({ user: null });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change');
    let user = { id: decoded.sub, role: decoded.role };
    if (prisma) {
      try {
        const dbUser = await prisma.user.findUnique({ where: { id: decoded.sub } });
        if (dbUser) user = { id: dbUser.id, role: dbUser.role, name: dbUser.name, email: dbUser.email, picture: dbUser.picture };
      } catch (_) {}
    } else {
      const u = usersByGoogleId.get(decoded.sub);
      if (u) user = { id: u.id || decoded.sub, role: u.role || decoded.role, name: u.name, email: u.email, picture: u.picture };
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

// Anonymous auth: create a user row if DB exists; otherwise issue a random session id
app.post('/api/auth/anon', async (req, res) => {
  try {
    // If already have a session, return current user
    const existing = getAuthedUserId(req);
    if (existing) {
      return res.json({ ok: true, userId: existing });
    }
    let userId = null;
    if (prisma) {
      const rnd = crypto.randomBytes(10).toString('hex');
      const email = `anon-${Date.now()}-${rnd}@anon.local`;
      const user = await prisma.user.create({ data: { email, name: 'Anonymous', role: 'user' } });
      userId = user.id;
    } else {
      // Memory-only fallback
      const rnd = crypto.randomBytes(16).toString('hex');
      const temp = { id: `anon_${rnd}`, email: `anon-${rnd}@anon.local`, name: 'Anonymous', role: 'user' };
      usersByGoogleId.set(temp.id, temp);
      userId = temp.id;
    }
    const token = signSession({ id: userId, role: 'user' });
    res.cookie('session', token, { path: '/', sameSite: (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(), secure: IS_PROD, httpOnly: true, maxAge: 365 * 24 * 3600 * 1000 });
    return res.json({ ok: true, userId });
  } catch (e) {
    console.error('anon auth error:', e);
    return res.status(500).json({ error: 'anon auth failed' });
  }
});

// Middleware
app.use(express.static('.'));
// Serve uploaded images from persistent disk
app.use('/uploads', express.static(UPLOADS_DIR));

// Secure cookie defaults (applies to any future cookie usage)
app.use((req, res, next) => {
  const originalCookie = res.cookie.bind(res);
  res.cookie = (name, value, options = {}) => {
    const sameSitePref = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
    const sameSite = sameSitePref === 'strict' ? 'strict' : 'lax';
    const secure = 'secure' in options ? options.secure : IS_PROD;
    const httpOnly = 'httpOnly' in options ? options.httpOnly : true;
    const patched = {
      sameSite,
      secure,
      httpOnly,
      ...options,
      sameSite, // ensure not overridden later
      secure,
      httpOnly
    };
    return originalCookie(name, value, patched);
  };
  next();
});

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Minimal CSP allowing self, inline styles for this app, and images/uploads
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; connect-src 'self' https:; font-src 'self' https: data:;");
  next();
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Answers API (DB first, fallback to file)
app.get('/api/answers/:hash', async (req, res) => {
    try {
        const ParamsSchema = z.object({ hash: z.string().min(1).max(256) });
        const parse = ParamsSchema.safeParse(req.params);
        if (!parse.success) return res.status(400).json({ error: 'hash required' });
        const { hash } = parse.data;

        if (prisma) {
          try {
            const ans = await prisma.answer.findFirst({ where: { imageHash: hash } });
            return res.json({ answer: ans?.value || null });
          } catch (e) {
            console.warn('DB read answer failed, falling back:', e.message);
          }
        }
        const answer = typeof answersByHash[hash] === 'string' ? answersByHash[hash] : null;
        return res.json({ answer });
    } catch (e) {
        return res.status(500).json({ error: 'failed to load answer' });
    }
});
app.post('/api/answers', async (req, res) => {
    try {
        const BodySchema = z.object({ imageHash: z.string().min(1).max(256), answer: z.string().max(10000) });
        const parse = BodySchema.safeParse(req.body);
        if (!parse.success) return res.status(400).json({ error: 'imageHash and answer are required' });
        const { imageHash, answer } = parse.data;

        let ok = false;
        if (prisma) {
          try {
            // Find question by image hash; if a dedicated mapping exists, use it directly
            const existing = await prisma.answer.findFirst({ where: { imageHash } });
            if (existing) {
              await prisma.answer.update({ where: { id: existing.id }, data: { value: answer } });
            } else {
              await prisma.answer.create({ data: { imageHash, value: answer } });
            }
            ok = true;
          } catch (e) {
            console.warn('DB save answer failed, falling back:', e.message);
          }
        }
        if (!ok) {
          answersByHash[imageHash] = answer;
          await saveAnswers();
        }
        return res.json({ ok: true });
    } catch (e) {
        return res.status(500).json({ error: 'failed to save answer' });
    }
});

// Upload image from data URL and return a public URL
app.post('/api/upload-image', async (req, res) => {
    try {
        const BodySchema = z.object({ imageDataUrl: z.string().min(50) });
        const parsed = BodySchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'imageDataUrl is required' });
        const { imageDataUrl } = parsed.data;
        const match = imageDataUrl.match(/^data:(.*?);base64,(.*)$/);
        if (!match) {
            return res.status(400).json({ error: 'Invalid data URL' });
        }
        const mediaType = match[1];
        const base64 = match[2];
        const ext = mediaType.includes('png') ? 'png' : mediaType.includes('webp') ? 'webp' : 'jpg';
        const name = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
        await ensureDataDir();
        const filePath = path.join(UPLOADS_DIR, name);
        await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
        const url = `/uploads/${name}`;
        return res.json({ url });
    } catch (e) {
        console.error('Failed to upload image:', e);
        return res.status(500).json({ error: 'failed to upload image' });
    }
});

// Questions API (DB only; require auth)
app.get('/api/questions', async (req, res) => {
  if (!prisma) return res.status(501).json({ error: 'DB unavailable' });
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const items = await prisma.question.findMany({ where: { userId }, include: { image: true } });
  return res.json({ items });
});
app.post('/api/questions', async (req, res) => {
  if (!prisma) return res.status(501).json({ error: 'DB unavailable' });
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const Body = z.object({ imageHash: z.string(), imageUrl: z.string(), questionNumber: z.string().optional(), publisher: z.string().optional(), category: z.string().optional(), round: z.number().int().optional() });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body' });
  const { imageHash, imageUrl, questionNumber, publisher, category, round } = parsed.data;
  // Upsert image
  const img = await prisma.image.upsert({ where: { hash: imageHash }, update: { url: imageUrl }, create: { hash: imageHash, url: imageUrl } });
  const q = await prisma.question.create({ data: { userId, imageId: img.id, questionNumber: questionNumber || null, publisher: publisher || null, category: category || null, round: typeof round === 'number' ? round : 0 } });
  return res.json({ item: q });
});
app.patch('/api/questions/:id', async (req, res) => {
  if (!prisma) return res.status(501).json({ error: 'DB unavailable' });
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const Params = z.object({ id: z.string() });
  const Body = z.object({ round: z.number().int().optional(), lastAccessed: z.string().datetime().optional(), quizCount: z.number().int().optional(), category: z.string().optional() });
  const p = Params.safeParse(req.params);
  const b = Body.safeParse(req.body);
  if (!p.success || !b.success) return res.status(400).json({ error: 'invalid' });
  const q = await prisma.question.update({ where: { id: p.data.id }, data: { ...b.data } });
  return res.json({ item: q });
});
app.delete('/api/questions/:id', async (req, res) => {
  if (!prisma) return res.status(501).json({ error: 'DB unavailable' });
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const p = z.object({ id: z.string() }).safeParse(req.params);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  await prisma.question.delete({ where: { id: p.data.id } });
  return res.json({ ok: true });
});

// Pop Quiz Queue API (DB only; require auth)
app.get('/api/pop-quiz-queue', async (req, res) => {
  if (!prisma) return res.status(501).json({ error: 'DB unavailable' });
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const items = await prisma.popQuizQueue.findMany({ where: { question: { userId } }, include: { question: true } });
  return res.json({ items });
});
app.post('/api/pop-quiz-queue', async (req, res) => {
  if (!prisma) return res.status(501).json({ error: 'DB unavailable' });
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const Body = z.object({ questionId: z.string(), nextAt: z.coerce.date() });
  const b = Body.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'invalid' });
  const existing = await prisma.popQuizQueue.findUnique({ where: { questionId: b.data.questionId } });
  const item = existing
    ? await prisma.popQuizQueue.update({ where: { id: existing.id }, data: { nextAt: b.data.nextAt } })
    : await prisma.popQuizQueue.create({ data: { questionId: b.data.questionId, nextAt: b.data.nextAt } });
  return res.json({ item });
});
app.patch('/api/pop-quiz-queue/:id', async (req, res) => {
  if (!prisma) return res.status(501).json({ error: 'DB unavailable' });
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const Params = z.object({ id: z.string() });
  const Body = z.object({ nextAt: z.coerce.date() });
  const p = Params.safeParse(req.params);
  const b = Body.safeParse(req.body);
  if (!p.success || !b.success) return res.status(400).json({ error: 'invalid' });
  const item = await prisma.popQuizQueue.update({ where: { id: p.data.id }, data: { nextAt: b.data.nextAt } });
  return res.json({ item });
});
app.delete('/api/pop-quiz-queue/:id', async (req, res) => {
  if (!prisma) return res.status(501).json({ error: 'DB unavailable' });
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const p = z.object({ id: z.string() }).safeParse(req.params);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  await prisma.popQuizQueue.delete({ where: { id: p.data.id } });
  return res.json({ ok: true });
});

// Convenience: delete queue by questionId
app.delete('/api/pop-quiz-queue/by-question/:questionId', async (req, res) => {
  if (!prisma) return res.status(501).json({ error: 'DB unavailable' });
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const p = z.object({ questionId: z.string() }).safeParse(req.params);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  try {
    await prisma.popQuizQueue.delete({ where: { questionId: p.data.questionId } });
  } catch (_) {}
  return res.json({ ok: true });
});

// Achievements API (DB only; require auth)
app.get('/api/achievements', async (req, res) => {
  if (!prisma) return res.status(501).json({ error: 'DB unavailable' });
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const items = await prisma.achievement.findMany({ where: { userId }, include: { question: { include: { image: true } } } });
  return res.json({ items });
});
app.post('/api/achievements', async (req, res) => {
  if (!prisma) return res.status(501).json({ error: 'DB unavailable' });
  const userId = getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const Body = z.object({ questionId: z.string() });
  const b = Body.safeParse(req.body);
  if (!b.success) return res.status(400).json({ error: 'invalid' });
  const item = await prisma.achievement.create({ data: { userId, questionId: b.data.questionId } });
  return res.json({ item });
});

// OpenAI LLM chat with image context
app.post('/api/llm-chat', async (req, res) => {
    try {
        if (!openai) {
            return res.status(501).json({ error: 'LLM이 구성되어 있지 않습니다. OPENAI_API_KEY 누락.' });
        }
        const BodySchema = z.object({ message: z.string().min(1).max(8000), imageDataUrl: z.string().min(10) });
        const parsed = BodySchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid request body' });
        const { message, imageDataUrl } = parsed.data;

        const match = imageDataUrl.match(/^data:(.*?);base64,(.*)$/);
        if (!match) {
            return res.status(400).json({ error: 'Invalid image data URL' });
        }
        const mediaType = match[1];
        const base64Data = match[2];

        const result = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are a helpful assistant that explains solutions clearly.' },
                { role: 'user', content: message },
            ]
        });
        const text = result.choices?.[0]?.message?.content || '';
        return res.json({ answer: text });
    } catch (e) {
        console.error('LLM chat error:', e);
        return res.status(500).json({ error: 'LLM error' });
    }
});

// API endpoint to process images (legacy OCR route)
app.post('/api/process-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }

        console.log('Processing image...');

        // Perform OCR using Google Vision API
        const [result] = await visionClient.textDetection({
            image: { content: req.file.buffer }
        });

        const detections = result.textAnnotations;
        
        if (!detections || detections.length === 0) {
            return res.status(400).json({ error: 'No text found in image' });
        }

        // Get the full text from the first annotation
        const fullText = detections[0].description;
        console.log('OCR Result:', fullText);

        // Get category from form data
        const BodySchema = z.object({ category: z.string().max(32).optional() });
        const parsed = BodySchema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ error: 'Invalid category' });
        const category = parsed.data.category || 'unknown';

        // Process with LLM to extract structured information
        const llmResponse = await processWithLLM(fullText, category);
        
        // Send the processed result
        res.json(llmResponse);

    } catch (error) {
        console.error('Error processing image:', error);
        res.status(500).json({ error: 'Failed to process image' });
    }
});

// Process text with Claude to extract structured information
async function processWithLLM(ocrText, category = 'unknown') {
    try {
        const prompt = `다음은 OCR로 인식한 문제 텍스트입니다. 이 텍스트에서 다음 정보를 추출해주세요:

1. 문제 번호 (없으면 null)
2. 출처/출판사 (없으면 "출처모름")
3. 문제 텍스트
4. 선택지 (있는 경우 배열로, 없으면 빈 배열)
5. 손글씨 메모나 추가 내용 (있는 경우)

OCR 텍스트:
${ocrText}

반드시 다음 JSON 형식으로만 응답해주세요:
{"questionNumber":"문제 번호 또는 null","publisher":"출처 또는 출처모름","questionText":"문제 내용","answerChoices":["선택지1"],"handwrittenNotes":"메모"}`;

        const message = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 2000,
            temperature: 0.3,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ]
        });

        const responseText = message.content[0].text;
        let jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in Claude response');
        }

        try {
            return JSON.parse(jsonMatch[0]);
        } catch (e) {
            throw new Error('Failed to parse JSON from Claude response');
        }
    } catch (error) {
        console.error('LLM processing error:', error);
        return { error: 'Failed to process with LLM' };
    }
}

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
        }
    }
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}); 