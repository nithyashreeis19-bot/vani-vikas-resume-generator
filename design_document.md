1. System Architecture
The system will follow a classic Client-Server architecture with an AI-orchestration layer.

Frontend: A web-based interface (Streamlit or React) optimized for mobile use. It will handle audio recording and display the real-time "refined" text.


Backend: Python (Mandatory) using FastAPI or Flask to manage the logic, API calls, and DB interactions.


Database: PostgreSQL or MySQL to store user profiles, raw transcripts, and the finalized resume data.

AI Layer (Gemini API): Used for both processing the "logic" of the interview and the "refinement" of the content.

2. Tech Stack

Backend: Python 3.10+.

LLM: Google Gemini API (for conversation management and content enhancement).


Speech-to-Text (STT): OpenAI Whisper or Google Cloud Speech-to-Text (supporting the 22 required languages).

Text-to-Speech (TTS): Google Text-to-Speech (gTTS) or Azure Speech (to "read" the questions to the user).

PDF Generation: ReportLab or FPDF2 in Python.

3. Data Flow
Audio Capture: User speaks their response in a local language (e.g., Bengali).

Transcription & Translation: The STT engine converts audio to text. If the input is not English, it is translated to English for processing.

AI Refinement: Gemini receives the raw text and a prompt: "Professionalize this worker's experience for a resume."


Database Storage: Both the raw and refined text are saved to the database.

Iteration: The AI checks if more information is needed (e.g., "Which city did you work in?") and asks the next question via TTS.

Finalization: Once all fields are satisfied, the backend populates a LaTeX or PDF template.

4. Database Schema (Conceptual)
users: user_id, phone_number, preferred_language.

resume_sections: user_id, section_type (Skills/Experience), raw_content, refined_content.

sessions: session_id, last_question_asked, is_complete.

5. Key Challenges & Solutions
Language Nuance: Using Gemini's multilingual capabilities to ensure that "Hand Skills" are translated into professional terminology rather than literal translations.


ATS Optimization: Ensuring the PDF generator uses standard fonts and layouts that are easily searchable by recruitment software.