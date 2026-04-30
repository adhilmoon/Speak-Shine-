# Railway Environment Variables Setup

**IMPORTANT:** The `.env` file is NOT committed to git for security reasons. You must configure these environment variables in Railway's dashboard.

## How to Set Environment Variables in Railway

1. Go to your Railway project dashboard
2. Select your service (webapp)
3. Click on "Variables" tab
4. Add each variable below

## Required Environment Variables

### Core Configuration
```
NODE_ENV=production
API_PORT=3001
JWT_SECRET=<your-jwt-secret>
MAX_USERS=20
```

### Database & Cache
```
MONGO_URI=<your-mongodb-connection-string>
REDIS_URL=<your-redis-connection-string>
```

### CORS Configuration
```
ALLOWED_ORIGINS=https://speak-shine.up.railway.app,https://speak-shine-up.railway.app,https://web-production-db61.up.railway.app
FRONTEND_URL=https://speak-shine.up.railway.app
```

### AI API Keys
```
GROQ_API_KEY=<your-groq-api-key>
GROQ_API_KEYS=<comma-separated-list-of-groq-keys>
GEMINI_API_KEY=<your-gemini-api-key>
```

### Cloudflare R2 Storage
```
R2_ACCOUNT_ID=<your-r2-account-id>
R2_ACCESS_KEY_ID=<your-r2-access-key>
R2_SECRET_ACCESS_KEY=<your-r2-secret-key>
R2_BUCKET_NAME=speak-shine-videos
R2_PUBLIC_URL=<your-r2-public-url>
R2_ENDPOINT=<your-r2-endpoint>
```

### LiveKit (Video Sessions)
```
LIVEKIT_URL=<your-livekit-url>
LIVEKIT_API_KEY=<your-livekit-api-key>
LIVEKIT_API_SECRET=<your-livekit-api-secret>
```

### WhatsApp Bot (Optional)
```
TARGET_GROUP=<whatsapp-group-id>
OWNER_NUMBER=<whatsapp-owner-number>
TEST_MODE=false
FINE_AMOUNT=2
```

### Timeouts
```
TRANSCRIBE_TIMEOUT_MS=240000
SPEECH_TIMEOUT_MS=120000
VISUAL_TIMEOUT_MS=240000
```

### 2FA API
```
TWO_FACTOR_API_KEY=<your-2fa-api-key>
```

## Security Notes

- **NEVER** commit `.env` files to git
- **NEVER** share API keys or secrets publicly
- Rotate secrets regularly
- Use Railway's built-in secret management
- Each environment (dev/staging/prod) should have different secrets

## Current Status

✅ `.env` is in `.gitignore`
✅ `.env` is NOT tracked in git
⚠️ Make sure all variables are set in Railway dashboard
