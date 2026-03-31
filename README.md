<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# Vani Vikas 🎙️📄
**The AI-Powered Voice-to-Resume Platform**

[![React](https://img.shields.io/badge/React-19-blue.svg?style=flat&logo=react)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6-purple.svg?style=flat&logo=vite)](https://vitejs.dev/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-black.svg?style=flat&logo=express)](https://expressjs.com/)
[![Supabase](https://img.shields.io/badge/Supabase-DB-green.svg?style=flat&logo=supabase)](https://supabase.com/)

</div>

---

## 📖 Overview

**Vani Vikas** is an empathetic, voice-first application designed to help semi-skilled and skilled workers (Electricians, Drivers, Security Guards, etc.) generate highly professional, ATS-friendly resumes purely by speaking in their native language. 

The application acts as an intelligent career counselor that interviews the candidate, translating their vernacular responses into standard professional English, and compiles a beautifully formatted, downloadable PDF resume.

## ✨ Key Features

- **🗣️ Voice-First Interface:** Users can speak naturally into their microphones instead of typing.
- **🌍 Vernacular & Multilingual Support:** Powered by [Sarvam AI](https://www.sarvam.ai/), the app communicates via Speech-to-Text and Text-to-Speech in over a dozen regional Indian languages (Hindi, Kannada, Tamil, Marathi, Punjabi, etc.).
- **🤖 Intelligent Resume Mapping:** Driven by Moonshot Kimi (via NVIDIA AI), it breaks down vague descriptions (e.g., "I fix house lights") into professional bullet points (e.g., "Executed residential wiring projects and lighting installations").
- **📑 Skill-First PDF Generation:** Automatically outputs highly structured, clean PDF resumes focused on core competencies and tools, built with `pdfkit`.
- **🗄️ Hybrid Database Architecture:** Uses a side-by-side database strategy:
  - **Local Session Storage:** Fast read/write during interviews using `better-sqlite3`.
  - **Cloud Analytics:** Seamlessly exports finalized candidate profiles into **Supabase** where rich analytical routing takes place (merging identities, certifications, languages, and more).

---

## 🛠️ Tech Stack

### Frontend
- **React 19** + **TypeScript**
- **Tailwind CSS v4** for styling
- **Motion (Framer Motion)** for fluid animations
- **Lucide React** for iconography

### Backend
- **Express.js** + **Node.js**
- **Vite** (Middleware mode for SSR/SPA handling)
- **Better-SQLite3** (Local storage)
- **Supabase-JS** (Cloud synchronization)
- **PDFKit** (Resume Rendering)
- **Multer** (Audio buffer handling)

### AI & APIS
- **NVIDIA API (Moonshotai Kimi-k2-instruct)**: Dialogue & Intelligence
- **Sarvam AI**: Indian regional Text-To-Speech (TTS) and Speech-To-Text (STT)

---

## 🚀 Setup & Installation

### 1. Prerequisites
Ensure you have **Node.js 22.x** or higher installed.

### 2. Clone and Install
```bash
# Clone the repository
git clone https://github.com/nithyashreeis19-bot/vani-vikas-resume-generator.git
cd vani-vikas

# Install dependencies
npm install
```

### 3. Environment Variables
Create a `.env.local` file in the root directory and configure the necessary APIs and Supabase keys:

```env
# AI Models
NVIDIA_API_KEY=your_nvidia_api_key_here
SARVAM_API_KEY=your_sarvam_api_key_here

# Cloud Database (Supabase)
SUPABASE_RL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Supabase Setup
If you are running the Supabase sync, execute the following SQL in your Supabase SQL Editor to map candidate data:
```sql
CREATE TABLE IF NOT EXISTS public.candidate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  full_name TEXT,
  phone_number TEXT,
  occupation TEXT,
  languages_spoken TEXT[],
  certifications TEXT[],
  identity_documents TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Remember to setup Row Level Security (RLS)!
ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous inserts" ON public.candidate_profiles FOR INSERT TO anon WITH CHECK (true);
```

### 5. Run Locally
```bash
# Start the development server
npm run dev
```

Your app will be live at `http://localhost:3000`!

---

## 💡 Roadmap & Architecture Considerations
- **Authentication**: Implementing Supabase Phone OTP for true persistence instead of UUID sessions (Execution plan is mapped and ready).
- **Scale**: Expanding the PDF templates for standard corporate structures vs vocational trade structures.

<div align="center">
<i>Built to give every voice a professional footprint.</i>
</div>
