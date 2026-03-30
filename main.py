import os
import uuid
import json
import base64
import httpx
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from fpdf import FPDF
import sqlite3
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv(".env.local")

app = FastAPI()

@app.get("/health")
def read_root():
    return {"status": "ok", "message": "Vani Vikas API is running."}

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize SQLite Database
def get_db():
    db = sqlite3.connect("resume_generator.db")
    db.row_factory = sqlite3.Row
    return db

# Create tables if they don't exist
with get_db() as db:
    db.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'interviewing',
            resume_data TEXT
        );
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            role TEXT,
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        );
    """)
    db.commit()

# Initialize Kimi K2 (Moonshot AI)
kimi_api_key = os.getenv("KIMI_API_KEY")
kimi_client = OpenAI(
    api_key=kimi_api_key,
    base_url="https://integrate.api.nvidia.com/v1"
)

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")

SYSTEM_INSTRUCTION = """You are an empathetic, encouraging, and highly capable Career Counselor and Resume Expert. Your goal is to interview semi-skilled and skilled workers (e.g., electricians, drivers, security guards, housekeeping staff) and extract their professional experience to build a high-impact, ATS-friendly "Skill-First" Hybrid Resume.

STRATEGY:
1. Skill-First Approach: Prioritize "What the user can do" over chronological history.
2. AI Refinement: Elevate simple vernacular/colloquial input into professional English.
   - Example: "I fix house lights" -> "Executed residential wiring projects and lighting installations."
   - Example: "I never come late" -> "Demonstrated track record of high operational reliability and punctuality."
3. ATS Optimization: Use standard professional terminology and single-column structure.

INTERVIEW PHASES:
Phase 1: Intro - "Namaste! I will help you build your resume. What is your full name and which city do you live in?"
Phase 2: Contact - "What is your phone number? Do you use WhatsApp on this number?"
Phase 3: Main Skill - "What kind of work do you do? (e.g., Electrician, Driver, Guard). What are the main tools or machines you use daily?"
Phase 4: Experience - "Tell me about your last job. How many years did you work there and what were your main responsibilities?"
Phase 5: Extras - "Do you have a driving license or any ITI/Government certificate? Also, which languages can you speak fluently?"

GUIDELINES:
- Ask ONE question at a time.
- Use simple, clear, and encouraging language.
- Detect incomplete answers and ask follow-up questions to extract details.
- When all info is gathered, call 'finalizeResume' with structured, professionalized data."""

finalize_resume_tool = {
    "type": "function",
    "function": {
        "name": "finalizeResume",
        "description": "Call this when you have gathered all necessary information to generate the final ATS-friendly resume.",
        "parameters": {
            "type": "object",
            "properties": {
                "fullName": {"type": "string"},
                "phoneNumber": {"type": "string"},
                "whatsappNumber": {"type": "string"},
                "location": {"type": "string", "description": "City, State"},
                "languages": {"type": "array", "items": {"type": "string"}, "description": "Languages spoken by the candidate."},
                "jobTitle": {"type": "string"},
                "summary": {"type": "string", "description": "A professional summary of the candidate (the Hook)."},
                "skillCategories": {
                    "type": "object",
                    "properties": {
                        "primary": {"type": "array", "items": {"type": "string"}, "description": "Core technical skills."},
                        "tools": {"type": "array", "items": {"type": "string"}, "description": "Tools and equipment used."},
                        "soft": {"type": "array", "items": {"type": "string"}, "description": "Soft skills like punctuality, communication."}
                    },
                    "required": ["primary", "tools", "soft"]
                },
                "experience": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "role": {"type": "string"},
                            "company": {"type": "string"},
                            "duration": {"type": "string"},
                            "responsibilities": {"type": "array", "items": {"type": "string"}, "description": "Professional ATS-friendly bullet points."}
                        },
                        "required": ["role", "company", "duration", "responsibilities"]
                    }
                },
                "licenses": {"type": "array", "items": {"type": "string"}, "description": "Licenses and certifications (ITI, Aadhaar, Driving License, etc.)"},
                "education": {"type": "string"}
            },
            "required": ["fullName", "phoneNumber", "location", "languages", "jobTitle", "summary", "skillCategories", "experience"]
        }
    }
}

SARVAM_LANG_MAP = {
    'English': 'en-IN',
    'Hindi': 'hi-IN',
    'Kannada': 'kn-IN',
    'Tamil': 'ta-IN',
    'Telugu': 'te-IN',
    'Malayalam': 'ml-IN',
    'Marathi': 'mr-IN',
    'Gujarati': 'gu-IN',
    'Bengali': 'bn-IN',
    'Punjabi': 'pa-IN',
    'Odia': 'or-IN',
    'Assamese': 'as-IN',
    'Urdu': 'ur-IN',
    'Nepali': 'ne-IN',
    'Konkani': 'kok-IN',
    'Maithili': 'mai-IN',
    'Dogri': 'doi-IN',
    'Kashmiri': 'ks-IN',
    'Sindhi': 'sd-IN',
    'Bodo': 'brx-IN',
    'Santali': 'sat-IN',
    'Manipuri': 'mni-IN',
    'Sanskrit': 'sa-IN'
}

class SessionRequest(BaseModel):
    language: str
    phone_number: Optional[str] = None

@app.post("/api/sessions")
async def create_session(req: SessionRequest):
    session_id = str(uuid.uuid4())
    
    # Get initial message from Kimi
    instruction = f"{SYSTEM_INSTRUCTION}\n\nIMPORTANT: The user prefers to communicate in {req.language}. Please ask your questions and respond in {req.language}. However, the final resume data MUST be generated in English."
    
    response = kimi_client.chat.completions.create(
        model="moonshotai/kimi-k2-instruct",
        messages=[
            {"role": "system", "content": instruction},
            {"role": "user", "content": "Start the interview by introducing yourself and asking for my full name and phone number."}
        ]
    )
    
    initial_message = response.choices[0].message.content
    
    # Save session and initial message to SQLite
    with get_db() as db:
        db.execute("INSERT INTO sessions (id, status) VALUES (?, ?)", (session_id, "interviewing"))
        db.execute("INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)", 
                   (str(uuid.uuid4()), session_id, "assistant", initial_message))
        db.commit()

    # TTS for initial message
    tts_audio = None
    target_lang = SARVAM_LANG_MAP.get(req.language, "hi-IN")
    if SARVAM_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                tts_res = await client.post(
                    "https://api.sarvam.ai/text-to-speech",
                    headers={"api-subscription-key": SARVAM_API_KEY},
                    json={
                        "inputs": [initial_message],
                        "target_language_code": target_lang,
                        "speaker": "anushka",
                        "model": "bulbul:v2"
                    }
                )
                if tts_res.status_code == 200:
                    tts_audio = tts_res.json().get("audios", [None])[0]
        except Exception as e:
            print(f"TTS Error: {e}")

    return {
        "sessionId": session_id,
        "message": initial_message,
        "replyAudioBuffer": tts_audio
    }

@app.post("/api/sessions/{session_id}/chat")
async def chat_session(
    session_id: str,
    audio: UploadFile = File(None),
    text: Optional[str] = Form(None),
    language: str = Form("English")
):
    user_text = text
    target_lang = SARVAM_LANG_MAP.get(language, "hi-IN")

    # 1. STT if audio provided
    if audio and SARVAM_API_KEY:
        audio_content = await audio.read()
        try:
            async with httpx.AsyncClient() as client:
                files = {"file": ("audio.webm", audio_content, audio.content_type)}
                stt_res = await client.post(
                    "https://api.sarvam.ai/speech-to-text",
                    headers={"api-subscription-key": SARVAM_API_KEY},
                    files=files
                )
                if stt_res.status_code == 200:
                    user_text = stt_res.json().get("transcript")
        except Exception as e:
            print(f"STT Error: {e}")
            raise HTTPException(status_code=500, detail="Speech-to-text failed")

    if not user_text:
        raise HTTPException(status_code=400, detail="No input provided")

    # 2. Save message and get history
    db = get_db()
    db.execute("INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)", 
               (str(uuid.uuid4()), session_id, "user", user_text))
    db.commit()
    
    rows = db.execute("SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC", (session_id,)).fetchall()
    history = [dict(row) for row in rows]
    db.close()

    # 3. Kimi K2 Completion
    instruction = f"{SYSTEM_INSTRUCTION}\n\nIMPORTANT: The user prefers to communicate in {language}. Please ask your questions and respond in {language}. However, the final resume data MUST be generated in English."
    
    messages = [{"role": "system", "content": instruction}]
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})

    completion = kimi_client.chat.completions.create(
        model="moonshotai/kimi-k2-instruct",
        messages=messages,
        tools=[finalize_resume_tool],
        tool_choice="auto"
    )

    assistant_message = completion.choices[0].message
    reply_text = assistant_message.content or ""
    status = "interviewing"
    resume_data = None

    # Handle tool calls
    if assistant_message.tool_calls:
        tool_call = assistant_message.tool_calls[0]
        if tool_call.function.name == "finalizeResume":
            resume_data = json.loads(tool_call.function.arguments)
            reply_text = "Great! I have all the information I need. I am generating your resume now."
            status = "completed"
            
            db = get_db()
            db.execute("UPDATE sessions SET status = ?, resume_data = ? WHERE id = ?", 
                       ("completed", json.dumps(resume_data), session_id))
            db.commit()
            db.close()

    # Save AI response
    db = get_db()
    db.execute("INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)", 
               (str(uuid.uuid4()), session_id, "assistant", reply_text))
    db.commit()
    db.close()

    # 4. TTS for AI response
    tts_audio = None
    if SARVAM_API_KEY and reply_text:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                tts_res = await client.post(
                    "https://api.sarvam.ai/text-to-speech",
                    headers={"api-subscription-key": SARVAM_API_KEY},
                    json={
                        "inputs": [reply_text],
                        "target_language_code": target_lang,
                        "speaker": "anushka",
                        "model": "bulbul:v2"
                    }
                )
                if tts_res.status_code == 200:
                    tts_audio = tts_res.json().get("audios", [None])[0]
        except Exception as e:
            print(f"TTS Error: {e}")

    return {
        "status": status,
        "message": reply_text,
        "replyAudioBuffer": tts_audio,
        "userText": user_text,
        "resumeData": resume_data
    }

@app.get("/api/sessions/{session_id}/resume.pdf")
async def get_resume_pdf(session_id: str):
    db = get_db()
    session = db.execute("SELECT resume_data, status FROM sessions WHERE id = ?", (session_id,)).fetchone()
    db.close()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session["status"] != "completed" or not session["resume_data"]:
        raise HTTPException(status_code=400, detail="Resume not completed yet")
    
    data = json.loads(session["resume_data"])
    
    # Safe text helper - converts any value to a clean Latin-1 string
    def safe(val):
        if val is None:
            return ""
        if isinstance(val, list):
            val = ", ".join([str(v) for v in val])
        return str(val).encode('latin-1', 'replace').decode('latin-1')

    try:
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.add_page()
        page_w = pdf.w - pdf.l_margin - pdf.r_margin  # usable width
        
        # ── Header ──
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, safe(data.get("fullName", "RESUME")).upper(), new_x="LMARGIN", new_y="NEXT", align="C")
        
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(79, 70, 229)
        pdf.cell(0, 8, safe(data.get("jobTitle", "")).upper(), new_x="LMARGIN", new_y="NEXT", align="C")
        pdf.set_text_color(0, 0, 0)
        
        pdf.set_font("Helvetica", "", 10)
        parts = [safe(data.get("location", "")), safe(data.get("phoneNumber", ""))]
        if data.get("whatsappNumber"):
            parts.append(f"WhatsApp: {safe(data['whatsappNumber'])}")
        pdf.cell(0, 6, "  |  ".join([p for p in parts if p]), new_x="LMARGIN", new_y="NEXT", align="C")
        
        if data.get("languages"):
            pdf.set_font("Helvetica", "I", 9)
            pdf.cell(0, 6, f"Languages: {safe(data['languages'])}", new_x="LMARGIN", new_y="NEXT", align="C")
        
        pdf.ln(8)
        
        # ── Helper: section header ──
        def section_header(title):
            pdf.set_font("Helvetica", "B", 12)
            pdf.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
            y = pdf.get_y()
            pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
            pdf.ln(3)
        
        # ── Professional Summary ──
        section_header("PROFESSIONAL SUMMARY")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 5, safe(data.get("summary", "")), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(6)
        
        # ── Core Competencies ──
        section_header("CORE COMPETENCIES")
        skills = data.get("skillCategories", {})
        if isinstance(skills, str):
            pdf.set_font("Helvetica", "", 10)
            pdf.multi_cell(0, 5, safe(skills), new_x="LMARGIN", new_y="NEXT")
        else:
            pdf.set_font("Helvetica", "", 10)
            for label, key in [("Primary Skills", "primary"), ("Tools & Equipment", "tools"), ("Professional Attributes", "soft")]:
                val = skills.get(key)
                if val:
                    pdf.multi_cell(0, 6, f"{label}: {safe(val)}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(6)
        
        # ── Professional Experience ──
        section_header("PROFESSIONAL EXPERIENCE")
        for exp in data.get("experience", []):
            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 6, safe(exp.get("role", "")), new_x="LMARGIN", new_y="NEXT")
            
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(79, 70, 229)
            company_dur = safe(exp.get("company", ""))
            if exp.get("duration"):
                company_dur += f"  ({safe(exp['duration'])})"
            pdf.cell(0, 6, company_dur, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)
            
            pdf.set_font("Helvetica", "", 10)
            for resp in exp.get("responsibilities", []):
                pdf.multi_cell(0, 5, f"  - {safe(resp)}", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(4)
        
        # ── Certifications ──
        if data.get("licenses"):
            section_header("LICENSES & CERTIFICATIONS")
            pdf.set_font("Helvetica", "", 10)
            for lic in data["licenses"]:
                pdf.cell(0, 6, f"  - {safe(lic)}", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(6)
        
        # ── Education ──
        if data.get("education"):
            section_header("EDUCATION")
            pdf.set_font("Helvetica", "", 10)
            pdf.multi_cell(0, 5, safe(data["education"]), new_x="LMARGIN", new_y="NEXT")
        
        pdf_content = bytes(pdf.output())
        
        filename = f"{safe(data.get('fullName', 'Resume')).replace(' ', '_')}_Resume.pdf"
        return Response(
            content=pdf_content,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

# Static files for the frontend
app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # If the path exists in dist, serve it
    file_path = os.path.join("dist", full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    # Default to index.html for SPA routing
    return FileResponse("dist/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
