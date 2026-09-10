# EcaNotes.in - Free Render.com Fullstack Deployment Guide

Deploying to **Render.com** (100% Free) hosts your entire website—including the frontend (HTML, CSS, JS), the Python FastAPI backend, SQLite database, and real PDF storage—all under a single live HTTPS URL (e.g., `https://ecanotes.onrender.com`).

---

## Prerequisites (Takes 2 minutes)
1. A free GitHub account: [github.com](https://github.com)
2. A free Render account: [render.com](https://render.com)

---

## Step 1: Push Project to GitHub

Open terminal / PowerShell in your project folder:
```powershell
cd C:\Users\shlok\.gemini\antigravity\scratch\ecanotes
```

Run these Git commands to upload your code to a new repository:
```powershell
git init
git add .
git commit -m "Deploy EcaNotes.in fullstack"
git branch -M main
```

Create a new repository on [github.com/new](https://github.com/new) named `ecanotes`, then link and push:
```powershell
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/ecanotes.git
git push -u origin main
```

---

## Step 2: Deploy on Render.com

1. Go to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** in the top right &rarr; select **Web Service**.
3. Choose **Build and deploy from a Git repository** &rarr; select your `ecanotes` repo.
4. Fill in the settings:
   - **Name**: `ecanotes` (or any name you choose)
   - **Region**: Closest to you (e.g. Singapore or Frankfurt)
   - **Branch**: `main`
   - **Runtime**: `Python 3`
   - **Build Command**:
     ```bash
     pip install -r requirements.txt && python backend/database.py && python backend/storage.py
     ```
   - **Start Command**:
     ```bash
     uvicorn backend.server:app --host 0.0.0.0 --port $PORT
     ```
   - **Plan**: Select **Free**.
5. Click **Create Web Service**.

---

## Step 3: Verification on Live Website

Once Render finishes building (approx. 1-2 minutes):
1. Render will give you a live URL, like:
   👉 `https://ecanotes.onrender.com`
2. Open `https://ecanotes.onrender.com` &rarr; All notes, filters (including "Practical Files"), and genuine PDF downloads work immediately.
3. Open `https://ecanotes.onrender.com/admin.html` &rarr; Sign in with your owner credentials:
   - **Email:** `owner@ecanotes.in`
   - **Password:** `admin123`
4. Both owner moderation and student uploads will now work live from any phone or computer in the world!
