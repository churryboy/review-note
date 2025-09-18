# 복습노트 (Review Note)

A mobile-optimized web application for scanning and storing exam questions using OCR and AI technology.

## Features

- 📸 **Camera Integration**: Take photos of exam questions directly from your mobile device
- 🔍 **OCR Processing**: Automatically extract text from images using Google Cloud Vision API
- 🤖 **AI-Powered Analysis**: Use Anthropic Claude to parse and structure question information
- 📱 **Mobile-First Design**: Optimized for mobile devices with a beautiful, modern UI
- 💾 **Local Storage**: Questions are saved locally for offline access
- 🎨 **Smart Planner 2 Inspired UI**: Orange-themed design with smooth animations

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js, Express.js
- **OCR**: Google Cloud Vision API
- **AI**: Anthropic Claude API (Claude 3.5 Sonnet)
- **Storage**: LocalStorage (client-side)

## Setup Instructions

### Prerequisites

1. Node.js (v14 or higher)
2. Google Cloud account with Vision API enabled
3. Anthropic Claude API key

### Installation

1. Clone the repository:
```bash
cd review_note
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
   - Copy `env.example` to `.env`
   - Add your Anthropic Claude API key
   - Add path to your Google Cloud service account key file

4. Set up Google Cloud Vision:
   - Create a service account in Google Cloud Console
   - Download the JSON key file
   - Place it in a secure location and update the path in `.env`

5. Start the server:
```bash
npm start
```

6. Open your browser and navigate to `http://localhost:3000`

## Usage

1. **Taking a Photo**:
   - Click the camera button in the center of the screen
   - Take a photo of the exam question
   - The app will automatically process the image

2. **Viewing Questions**:
   - Click the list icon in the top right or use the bottom navigation
   - All saved questions will be displayed with their number and source

3. **Question Information Extracted**:
   - Question number
   - Publisher/Source (defaults to "출처모름" if not found)
   - Question text
   - Answer choices (if multiple choice)
   - Handwritten notes

## Development

For development with auto-reload:
```bash
npm run dev
```

## Testing on Mobile

### Local Network Testing [[memory:7783983]]
1. Find your computer's IP address
2. Make sure your phone is on the same network
3. Access `http://YOUR_IP:3000` from your mobile browser

### Using ngrok (for external testing)
1. Install ngrok: `npm install -g ngrok`
2. Run: `ngrok http 3000`
3. Use the provided HTTPS URL on your mobile device

## API Endpoints

- `GET /` - Serve the main application
- `POST /api/process-image` - Process uploaded image with OCR and AI
- `GET /api/health` - Health check endpoint

## Browser Support

- Chrome (Android) - Recommended
- Safari (iOS) - Supported
- Samsung Internet - Supported
- Other modern mobile browsers

## Notes

- The application includes a development mode that simulates Claude API responses when running on localhost
- All data is stored locally in the browser's localStorage
- Maximum image size is 10MB
- Supported image formats: JPEG, PNG, WebP, HEIC

## Future Enhancements

- Cloud storage for questions
- Export functionality (PDF, Excel)
- Question categorization and tagging
- Study mode with spaced repetition
- Sharing capabilities # Force Render Redeploy - Thu Sep 18 15:05:20 KST 2025
