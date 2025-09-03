# Deployment Guide - Render

## Quick Render Deployment

### 1. **Connect to Render**
1. Go to [render.com](https://render.com) and sign up/login
2. Click "New +" → "Web Service"
3. Connect your GitHub account if not already connected
4. Select the `churryboy/review-note` repository

### 2. **Configure Render Settings**
- **Name**: `review-note` (or your preferred name)
- **Environment**: `Node`
- **Region**: Choose closest to your users
- **Branch**: `main`
- **Build Command**: `npm install`
- **Start Command**: `npm start`

### 3. **Environment Variables**
Add these environment variables in Render dashboard:

**Required for full functionality:**
- `CLAUDE_API_KEY`: Your Anthropic Claude API key
- `GOOGLE_CLOUD_KEYFILE`: Base64 encoded Google Cloud service account key
- `NODE_ENV`: `production`

**Optional:**
- `PORT`: `10000` (Render will set this automatically)

### 4. **Google Cloud Setup for Production**
Since Render doesn't support file uploads, you need to base64 encode your Google Cloud key:

```bash
# On your local machine
base64 -i /path/to/your/google-cloud-key.json
```

Copy the output and paste it as the `GOOGLE_CLOUD_KEYFILE` environment variable.

### 5. **Deploy**
1. Click "Create Web Service"
2. Render will automatically build and deploy
3. Your app will be available at: `https://your-app-name.onrender.com`

## Development Mode

The app works without API keys in development mode:
- Camera functionality works
- Swipe categorization works  
- Local storage works
- Simulated responses for testing

## Production Features

With API keys configured:
- Real OCR text extraction from images
- Claude AI-powered question parsing
- Structured data extraction
- Enhanced categorization

## Mobile Access

The app is mobile-optimized and works best on:
- Chrome (Android)
- Safari (iOS) 
- Samsung Internet
- Other modern mobile browsers

## Troubleshooting

**Common Issues:**
1. **Build fails**: Check Node.js version (requires v14+)
2. **API errors**: Verify environment variables are set correctly
3. **CORS issues**: Make sure you're accessing the Render URL, not localhost
4. **Camera not working**: Ensure HTTPS is enabled (Render provides this automatically)

**Support:**
- Check Render logs for detailed error messages
- Verify all environment variables are properly set
- Test API keys locally before deploying 