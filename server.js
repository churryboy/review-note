const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const vision = require('@google-cloud/vision');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Middleware
app.use(express.static('.'));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// OpenAI LLM chat with image context
app.post('/api/llm-chat', async (req, res) => {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: 'OPENAI_API_KEY가 설정되어 있지 않습니다.' });
        }
        const { message, imageDataUrl } = req.body;
        if (!message || !imageDataUrl) {
            return res.status(400).json({ error: 'message and imageDataUrl are required' });
        }

        const match = imageDataUrl.match(/^data:(.*?);base64,(.*)$/);
        if (!match) {
            return res.status(400).json({ error: 'Invalid image data URL' });
        }
        const mediaType = match[1];
        const base64Data = match[2];
        const dataUri = `data:${mediaType};base64,${base64Data}`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful math and science tutor. Use the attached image of the problem as the sole context. Answer in Korean with clear bullet points. Typeset math using LaTeX delimiters $...$.'
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: message },
                        { type: 'image_url', image_url: { url: dataUri } }
                    ]
                }
            ]
        });

        const text = response.choices?.[0]?.message?.content || '답변을 생성하지 못했습니다.';
        return res.json({ reply: text });
    } catch (err) {
        console.error('LLM chat error:', err);
        return res.status(500).json({ error: 'LLM 요청에 실패했습니다.' });
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
        const category = req.body.category || 'unknown';

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
        const result = JSON.parse(jsonMatch[0]);
        result.category = category;
        return result;

    } catch (error) {
        console.error('Claude processing error:', error);
        return {
            questionNumber: null,
            publisher: "출처모름",
            questionText: ocrText,
            answerChoices: [],
            handwrittenNotes: "",
            category: category
        };
    }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

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

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Environment variables needed:');
    console.log('- OPENAI_API_KEY: OpenAI API key for chat (required)');
    console.log('- GOOGLE_CLOUD_KEYFILE: Path to GCP service account key file (optional, only for legacy OCR)');
}); 