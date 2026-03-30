import { config } from 'dotenv';
config({ path: '.env.local' });
import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import Database from 'better-sqlite3';

const app = express();
const PORT = 3000;

// Initialize Database
const db = new Database('resume_generator.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'interviewing',
    resume_data TEXT
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    role TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  );
`);

app.use(express.json());

// Initialize OpenAI (NVIDIA API)
const getAi = () => {
  const apiKey = process.env.NVIDIA_API_KEY || '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';
  return new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: apiKey
  });
};

const upload = multer({ storage: multer.memoryStorage() });

const SYSTEM_INSTRUCTION = `You are an empathetic, encouraging, and highly capable Career Counselor and Resume Expert. Your goal is to interview semi-skilled and skilled workers (e.g., electricians, drivers, security guards, housekeeping staff) and extract their professional experience to build a high-impact, ATS-friendly "Skill-First" Hybrid Resume.

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
- When all info is gathered, call 'finalizeResume' with structured, professionalized data.`;

const finalizeResumeDeclaration = {
  type: "function",
  function: {
    name: 'finalizeResume',
    description: 'Call this when you have gathered all necessary information to generate the final ATS-friendly resume.',
    parameters: {
      type: "object",
      properties: {
        fullName: { type: "string" },
        phoneNumber: { type: "string" },
        whatsappNumber: { type: "string" },
        location: { type: "string", description: 'City, State' },
        languages: { type: "array", items: { type: "string" }, description: 'Languages spoken by the candidate.' },
        jobTitle: { type: "string" },
        summary: { type: "string", description: 'A professional summary of the candidate (the Hook).' },
        skillCategories: {
          type: "object",
          properties: {
            primary: { type: "array", items: { type: "string" }, description: 'Core technical skills.' },
            tools: { type: "array", items: { type: "string" }, description: 'Tools and equipment used.' },
            soft: { type: "array", items: { type: "string" }, description: 'Soft skills like punctuality, communication.' }
          },
          required: ['primary', 'tools', 'soft']
        },
        experience: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: { type: "string" },
              company: { type: "string" },
              duration: { type: "string" },
              responsibilities: { type: "array", items: { type: "string" }, description: 'Professional ATS-friendly bullet points.' }
            },
            required: ['role', 'company', 'duration', 'responsibilities']
          }
        },
        licenses: { type: "array", items: { type: "string" }, description: 'Licenses and certifications (ITI, Aadhaar, Driving License, etc.)' },
        education: { type: "string" }
      },
      required: ['fullName', 'phoneNumber', 'location', 'languages', 'jobTitle', 'summary', 'skillCategories', 'experience']
    }
  }
};

// API Routes
app.post('/api/sessions', async (req, res) => {
  console.log(`\n[Backend] POST /api/sessions triggered`);
  console.log(`[Backend] Request body:`, req.body);
  const { language = 'English' } = req.body || {};
  const sessionId = uuidv4();
  console.log(`[Backend] Created sessionId: ${sessionId}`);
  
  db.prepare('INSERT INTO sessions (id) VALUES (?)').run(sessionId);
  console.log(`[Backend] Inserted new session into DB`);
  
  try {
    console.log(`[Backend] Initializing AI client...`);
    const aiClient = getAi();
    
    const sarvamLangMap: Record<string, string> = {
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
      'Odia': 'or-IN'
    };
    const sarvamLang = sarvamLangMap[language] || 'hi-IN';
    const dynamicSystemInstruction = `${SYSTEM_INSTRUCTION}\n\nIMPORTANT: The user prefers to communicate in ${language}. Please ask your questions and respond in ${language}. However, the final resume data MUST be generated in English.`;
    
    console.log(`[Backend] Sending prompt to AI model (moonshotai/kimi-k2-instruct)...`);
    const response = await aiClient.chat.completions.create({
      model: 'moonshotai/kimi-k2-instruct',
      messages: [
        { role: 'system', content: dynamicSystemInstruction },
        { role: 'user', content: 'Start the interview by introducing yourself and asking for my full name and phone number.' }
      ],
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 4096,
    });
    console.log(`[Backend] Received response from AI model`);
    
    const initialMessage = response.choices[0]?.message?.content || "Hello! I'm here to help you build a professional resume. What is your full name and phone number?";
    console.log(`[Backend] AI initial message: ${initialMessage}`);
    db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(uuidv4(), sessionId, 'model', initialMessage);
    console.log(`[Backend] Saved AI message to DB`);
    
    let ttsAudioBase64 = null;
    if (process.env.SARVAM_API_KEY) {
      console.log(`[Backend] SARVAM_API_KEY found. Fetching TTS for ${language}...`);
      try {
        const ttsResponse = await fetch('https://api.sarvam.ai/text-to-speech', {
          method: 'POST',
          headers: {
            'api-subscription-key': process.env.SARVAM_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: [initialMessage],
            target_language_code: sarvamLang,
            speaker: "shubh",
            pace: 1.0,
            speech_sample_rate: 16000,
            enable_preprocessing: true,
            model: "bulbul:v3"
          })
        });
        console.log(`[Backend] Sarvam API response status: ${ttsResponse.status}`);
        if (ttsResponse.ok) {
          const ttsData = await ttsResponse.json() as any;
          ttsAudioBase64 = ttsData?.audios?.[0];
          console.log(`[Backend] TTS Success for ${language} (${sarvamLang})`);
        } else {
          const errorText = await ttsResponse.text();
          console.error(`[Backend] TTS API Error (${ttsResponse.status}):`, errorText);
        }
      } catch (e) {
        console.error('[Backend] TTS Request Fetch Error:', e);
      }
    } else {
      console.log(`[Backend] No SARVAM_API_KEY found. Skipping TTS.`);
    }
    
    console.log(`[Backend] Sending successful response to client`);
    res.json({ sessionId, message: initialMessage, replyAudioBuffer: ttsAudioBase64 });
  } catch (err: any) {
    console.error('[Backend] Caught Error generating initial message:', err);
    if (err.message && err.message.includes('API key not valid')) {
      return res.status(400).json({ error: 'API key not valid' });
    }
    const initialMessage = "Hello! I'm here to help you build a professional resume. What is your full name and phone number?";
    db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(uuidv4(), sessionId, 'model', initialMessage);
    
    console.log(`[Backend] Sending fallback response to client`);
    res.json({ sessionId, message: initialMessage, replyAudioBuffer: null });
  }
});

app.get('/api/sessions/:id/messages', (req, res) => {
  const messages = db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(messages);
});

app.post('/api/sessions/:id/chat', upload.single('audio'), async (req, res) => {
  const sessionId = req.params.id;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  if (session.status === 'completed') {
    return res.json({ status: 'completed', resumeData: JSON.parse(session.resume_data) });
  }

  try {
    const aiClient = getAi();
    let userText = req.body.text; // Fallback for text input
    const language = req.body.language || 'English';
    const dynamicSystemInstruction = `${SYSTEM_INSTRUCTION}\n\nIMPORTANT: The user prefers to communicate in ${language}. Please ask your questions and respond in ${language}. However, the final resume data MUST be generated in English.`;
    
    // Mapping frontend languages to Sarvam AI language codes
    const sarvamLangMap: Record<string, string> = {
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
      'Odia': 'or-IN'
    };
    const sarvamLang = sarvamLangMap[language] || 'hi-IN';
    const sarvamApiKey = process.env.SARVAM_API_KEY;

    if (req.file) {
      if (!sarvamApiKey) {
        throw new Error("SARVAM_API_KEY environment variable is not set");
      }
      
      const formData = new FormData();
      formData.append('file', new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype }), 'audio.webm');
      
      const sttResponse = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: {
          'api-subscription-key': sarvamApiKey
        },
        body: formData
      });
      
      if (!sttResponse.ok) {
        throw new Error(`Sarvam STT failed: ${sttResponse.statusText}`);
      }
      
      const sttData = await sttResponse.json() as any;
      userText = sttData.transcript;
      if (!userText) {
        throw new Error('Could not extract text from audio');
      }
    }

    if (userText) {
      db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(uuidv4(), sessionId, 'user', userText);
      
      const history = db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as any[];
      const messages: any[] = [
        { role: 'system', content: dynamicSystemInstruction },
        ...history.map(msg => ({
          role: msg.role === 'model' ? 'assistant' : 'user',
          content: msg.content
        }))
      ];

      const response = await aiClient.chat.completions.create({
        model: 'moonshotai/kimi-k2-instruct',
        messages: messages,
        temperature: 0.6,
        top_p: 0.9,
        max_tokens: 4096,
        tools: [finalizeResumeDeclaration as any]
      });

      const message = response.choices[0]?.message;
      const toolCalls = message?.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        const call = toolCalls[0] as any;
        if (call.function.name === 'finalizeResume') {
          const resumeData = JSON.parse(call.function.arguments);
          db.prepare('UPDATE sessions SET status = ?, resume_data = ? WHERE id = ?').run('completed', JSON.stringify(resumeData), sessionId);
          const finalMsg = 'Great! I have all the information I need. I am generating your resume now.';
          db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(uuidv4(), sessionId, 'model', finalMsg);
          
          let ttsAudioBase64 = null;
          if (sarvamApiKey) {
            try {
              const ttsResponse = await fetch('https://api.sarvam.ai/text-to-speech', {
                method: 'POST',
                headers: {
                  'api-subscription-key': sarvamApiKey,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  inputs: [finalMsg],
                  target_language_code: sarvamLang,
                  speaker: "shubh",
                  pace: 1.0,
                  speech_sample_rate: 16000,
                  enable_preprocessing: true,
                  model: "bulbul:v3"
                })
              });
              if (ttsResponse.ok) {
                const ttsData = await ttsResponse.json() as any;
                ttsAudioBase64 = ttsData?.audios?.[0];
                console.log(`TTS Success (Final) for ${language} (${sarvamLang})`);
              } else {
                const errorText = await ttsResponse.text();
                console.error(`TTS API Error (Final) (${ttsResponse.status}):`, errorText);
              }
            } catch(e) { console.error('TTS Fetch Error (Final):', e); }
          }
          
          return res.json({ status: 'completed', message: finalMsg, resumeData, replyAudioBuffer: ttsAudioBase64, userText });
        }
      }

      const replyText = message?.content || "I didn't quite catch that. Could you please repeat?";
      db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(uuidv4(), sessionId, 'model', replyText);
      
      let ttsAudioBase64 = null;
      if (sarvamApiKey) {
        try {
          const ttsResponse = await fetch('https://api.sarvam.ai/text-to-speech', {
            method: 'POST',
            headers: {
              'api-subscription-key': sarvamApiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              inputs: [replyText],
              target_language_code: sarvamLang,
              speaker: "shubh",
              pace: 1.0,
              speech_sample_rate: 16000,
              enable_preprocessing: true,
              model: "bulbul:v3"
            })
          });
          if (ttsResponse.ok) {
            const ttsData = await ttsResponse.json() as any;
            ttsAudioBase64 = ttsData?.audios?.[0];
            console.log(`TTS Success for ${language} (${sarvamLang})`);
          } else {
            const errorText = await ttsResponse.text();
            console.error(`TTS API Error (${ttsResponse.status}):`, errorText);
          }
        } catch (e) { console.error('TTS Fetch Error:', e); }
      }
      
      res.json({ status: 'interviewing', message: replyText, replyAudioBuffer: ttsAudioBase64, userText });
    } else {
      res.status(400).json({ error: 'No audio or text provided' });
    }

  } catch (error: any) {
    console.error('Error processing chat:', error);
    if (error.message && error.message.includes('API key not valid')) {
      return res.status(400).json({ error: 'API key not valid' });
    }
    res.status(500).json({ error: 'Failed to process chat' });
  }
});

app.post('/api/sessions/:id/complete', (req, res) => {
  const sessionId = req.params.id;
  const resumeData = req.body.resumeData;
  db.prepare('UPDATE sessions SET status = ?, resume_data = ? WHERE id = ?').run('completed', JSON.stringify(resumeData), sessionId);
  res.json({ success: true });
});

app.get('/api/sessions/:id/resume.pdf', (req, res) => {
  const sessionId = req.params.id;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  
  if (!session || session.status !== 'completed' || !session.resume_data) {
    return res.status(404).json({ error: 'Resume not found or not completed' });
  }

  const data = JSON.parse(session.resume_data);
  
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${data.fullName.replace(/\s+/g, '_')}_Resume.pdf"`);
  doc.pipe(res);

  // ATS-Friendly Blueprint: Single Column, Standard Fonts
  const primaryFont = 'Helvetica';
  const boldFont = 'Helvetica-Bold';

  // Header
  doc.fontSize(20).font(boldFont).text(data.fullName.toUpperCase(), { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(12).font(boldFont).fillColor('#4f46e5').text(data.jobTitle.toUpperCase(), { align: 'center' });
  doc.moveDown(0.5);
  
  doc.fontSize(10).font(primaryFont).fillColor('#000000');
  const contactLine = [
    data.location,
    data.phoneNumber,
    data.whatsappNumber ? `WhatsApp: ${data.whatsappNumber}` : null
  ].filter(Boolean).join('  |  ');
  doc.text(contactLine, { align: 'center' });
  
  if (data.languages && data.languages.length > 0) {
    doc.moveDown(0.2);
    doc.fontSize(9).font(primaryFont).text(`Languages: ${data.languages.join(', ')}`, { align: 'center' });
  }
  doc.moveDown(1.5);

  // Professional Summary
  doc.fontSize(12).font(boldFont).text('PROFESSIONAL SUMMARY');
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
  doc.moveDown(0.5);
  doc.fontSize(11).font(primaryFont).text(data.summary, { lineGap: 2 });
  doc.moveDown(1.5);

  // Core Competencies (Skill-First)
  doc.fontSize(12).font(boldFont).text('CORE COMPETENCIES');
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);
  
  if (data.skillCategories) {
    const { primary, tools, soft } = data.skillCategories;
    if (primary && primary.length > 0) {
      doc.fontSize(10).font(boldFont).text('PRIMARY SKILLS: ', { continued: true });
      doc.font(primaryFont).text(primary.join(', '));
      doc.moveDown(0.3);
    }
    if (tools && tools.length > 0) {
      doc.fontSize(10).font(boldFont).text('TOOLS & EQUIPMENT: ', { continued: true });
      doc.font(primaryFont).text(tools.join(', '));
      doc.moveDown(0.3);
    }
    if (soft && soft.length > 0) {
      doc.fontSize(10).font(boldFont).text('PROFESSIONAL ATTRIBUTES: ', { continued: true });
      doc.font(primaryFont).text(soft.join(', '));
    }
  }
  doc.moveDown(1.5);

  // Experience
  doc.fontSize(12).font(boldFont).text('PROFESSIONAL EXPERIENCE');
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);
  
  if (data.experience && data.experience.length > 0) {
    data.experience.forEach((exp: any) => {
      doc.fontSize(11).font(boldFont).text(exp.role, { continued: true });
      doc.font(primaryFont).text(`  |  ${exp.company}`, { continued: true });
      doc.text(`  |  ${exp.duration}`, { align: 'right' });
      doc.moveDown(0.3);
      
      if (exp.responsibilities && exp.responsibilities.length > 0) {
        exp.responsibilities.forEach((resp: string) => {
          doc.fontSize(10).text(`• ${resp}`, { indent: 15, lineGap: 1 });
        });
      }
      doc.moveDown(0.8);
    });
  }
  doc.moveDown(0.7);

  // Licenses & Certifications
  if (data.licenses && data.licenses.length > 0) {
    doc.fontSize(12).font(boldFont).text('LICENSES & CERTIFICATIONS');
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    data.licenses.forEach((lic: string) => {
      doc.fontSize(10).font(primaryFont).text(`• ${lic}`, { indent: 15 });
    });
    doc.moveDown(1.5);
  }

  // Education
  if (data.education) {
    doc.fontSize(12).font(boldFont).text('EDUCATION');
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(10).font(primaryFont).text(data.education);
  }

  // Digital Badge Placeholder
  doc.moveDown(2);
  const bottomY = doc.y;
  if (bottomY < 750) {
    doc.fontSize(8).font(primaryFont).fillColor('#94a3b8').text('DIGITAL TRUST BADGE', { align: 'center' });
    doc.text('Scan to hear professional introduction', { align: 'center' });
  }

  doc.end();
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
