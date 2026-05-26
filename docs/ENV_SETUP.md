ENV setup for developers

Overview

This project uses separate env handling for frontend (Vite) and backend (Node/Express). The repo includes `.env.example`, `frontend/.env.example`, and `.infisical.json` as templates. Each developer can run locally with either local `.env` values or secure Infisical secrets.

Quick start for a new developer

1. Clone the repo

```bash
git clone <repo-url>
cd whatsapp-bot
```

2. Install dependencies

```bash
npm install
cd frontend
npm install
cd ..
```

3. Initialize Infisical (recommended for secure team collaboration)

```bash
infisical login
infisical init
```

4. Create local frontend public vars

```bash
cp frontend/.env.example frontend/.env.local
# edit frontend/.env.local to set VITE_API_URL and other safe public values
```

5. Start backend with Infisical

```bash
npm run dev:infisical
```

6. Start frontend

```bash
cd frontend
npm run dev
```

If you do not want to use Infisical, copy the backend template locally:

```bash
cp .env.example .env
npm run setup
npm run dev:backend
```

Infisical commands

```bash
infisical login
infisical init
infisical secrets set MONGO_URI "mongodb://localhost:27017/whatsapp-bot-dev"
infisical secrets set JWT_SECRET "your-dev-jwt-secret"
infisical run -- npm run dev:backend
```

Best practices

- never commit `.env` or `frontend/.env.local`
- never expose backend secrets to frontend/browser users
- keep production secrets in a separate secret store or environment
- use role-based access for teammates in Infisical
- only public frontend vars should use the `VITE_` prefix

Production environment example

```bash
NODE_ENV=production
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/prod-db
JWT_SECRET=<strong-production-secret>
VITE_API_URL=https://app.example.com
```

In production, do not use local `.env` files for secrets; use a secure platform or Infisical workspace with strict access control.

Using `backend/config/env.js`

Example:

```js
// backend/server.js
import express from 'express';
import env from './config/env.js';

const app = express();
app.listen(env.PORT, () => console.log(`Listening on ${env.PORT}`));
```

Database connection example:

```js
// backend/config/database.js
import mongoose from 'mongoose';
import env from './env.js';

export default async function connect() {
  const opts = { useNewUrlParser: true, useUnifiedTopology: true };
  try {
    await mongoose.connect(env.MONGO_URI, opts);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    if (env.NODE_ENV === 'production') throw err;
  }
}

// Example server usage
// import connectDB from './config/database.js';
// import env from './config/env.js';
// connectDB().then(() => app.listen(env.PORT));
```

- Never commit `.env` or `frontend/.env.local`.
- `.env.example` documents required variables only (no secrets).
- Frontend env vars prefixed with `VITE_` are visible in browser DevTools; never store secrets there.
- Rotate keys and store production credentials in a secrets manager (AWS Secrets Manager, GCP Secret Manager, Vault, or Cloud Provider environment settings) for production.

Using `backend/config/env.js`

Example:

```js
// backend/server.js
const env = require('./config/env');
const express = require('express');
const app = express();

app.listen(env.PORT, () => console.log('listening on', env.PORT));
```

Database connection example:

```js
// backend/config/database.js
const mongoose = require('mongoose');
const env = require('./env');

module.exports = async function connect() {
  const opts = { useNewUrlParser: true, useUnifiedTopology: true };
  try {
    await mongoose.connect(env.MONGO_URI, opts);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    // In dev we don't want to crash the process automatically; rethrow for prod
    if (env.NODE_ENV === 'production') throw err;
  }
};

// Example server usage
// const connectDB = require('./config/database');
// const env = require('./config/env');
// connectDB().then(() => app.listen(env.PORT));
```

