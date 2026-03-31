/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Download, Loader2, FileText, CheckCircle, Globe, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';

const LANGUAGES = [
  { label: 'English', value: 'English' },
  { label: 'हिन्दी (Hindi)', value: 'Hindi' },
  { label: 'ಕನ್ನಡ (Kannada)', value: 'Kannada' },
  { label: 'தமிழ் (Tamil)', value: 'Tamil' },
  { label: 'తెలుగు (Telugu)', value: 'Telugu' },
  { label: 'മലയാളം (Malayalam)', value: 'Malayalam' },
  { label: 'मराठी (Marathi)', value: 'Marathi' },
  { label: 'ગુજરાતી (Gujarati)', value: 'Gujarati' },
  { label: 'বাংলা (Bengali)', value: 'Bengali' },
  { label: 'ਪੰਜਾਬੀ (Punjabi)', value: 'Punjabi' },
  { label: 'ଓଡ଼ିଆ (Odia)', value: 'Odia' },
  { label: 'অসমীয়া (Assamese)', value: 'Assamese' },
  { label: 'اردو (Urdu)', value: 'Urdu' },
  { label: 'संस्कृतम् (Sanskrit)', value: 'Sanskrit' },
  { label: 'नेपाली (Nepali)', value: 'Nepali' },
  { label: 'कोंकणी (Konkani)', value: 'Konkani' },
  { label: 'मैथिली (Maithili)', value: 'Maithili' },
  { label: 'डोगरी (Dogri)', value: 'Dogri' },
  { label: 'کٲشُر (Kashmiri)', value: 'Kashmiri' },
  { label: 'सिन्धी (Sindhi)', value: 'Sindhi' },
  { label: 'बर\' (Bodo)', value: 'Bodo' },
  { label: 'ᱥᱟᱱᱛᱟᱲᱤ (Santali)', value: 'Santali' },
  { label: 'মৈতৈলোন (Manipuri)', value: 'Manipuri' }
];

const SYSTEM_INSTRUCTION = `These instructions are handled by the backend.`;

export default function App() {
  const [language, setLanguage] = useState('English');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string; audioData?: string }[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<'interviewing' | 'completed'>('interviewing');
  const [resumeData, setResumeData] = useState<any>(null);
  
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startInterview = async () => {
    console.log('[Frontend] startInterview called');
    console.log(`[Frontend] Payload: language=${language}, phoneNumber=${phoneNumber}`);
    try {
      setIsProcessing(true);
      setMessages([]);
      setResumeData(null);
      setStatus('interviewing');
      
      console.log('[Frontend] Sending POST /api/sessions request...');
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, phone_number: phoneNumber })
      });
      
      console.log(`[Frontend] Received response from /api/sessions with status: ${res.status}`);
      const data = await res.json();
      console.log('[Frontend] Parsed response JSON data:', data);

      setSessionId(data.sessionId);
      setMessages([{ role: 'model', content: data.message, audioData: data.replyAudioBuffer }]);
      
      setIsProcessing(false);
      console.log('[Frontend] startInterview completed successfully');
    } catch (err) {
      console.error('[Frontend] Caught error in startInterview:', err);
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = async () => {
        setIsProcessing(true);
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');
        formData.append('language', language);
        
        try {
          console.log(`[Frontend Debug] Sending audio array to /api/sessions/${sessionId}/chat...`);
          const res = await fetch(`/api/sessions/${sessionId}/chat`, {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          console.log(`[Frontend Debug] /chat backend response data:`, data);
          
          if (data.userText) {
            setMessages(prev => [...prev, { role: 'user', content: data.userText }]);
          } else {
            setMessages(prev => [...prev, { role: 'user', content: '[Audio Message]' }]);
          }
          
          if (data.message) {
            setMessages(prev => [...prev, { role: 'model', content: data.message, audioData: data.replyAudioBuffer }]);
          }
          
          if (data.status === 'completed') {
            console.log('[Frontend Debug] Chat response status is COMPLETED. Received resumeData:', data.resumeData);
            setStatus('completed');
            setResumeData(data.resumeData);
          }
        } catch (err) {
            console.error(err);
        } finally {
            setIsProcessing(false);
        }
        
        stream.getTracks().forEach(t => t.stop());
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
       console.error("Microphone access denied", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const cancelInterview = () => {
    if (mediaRecorder && mediaRecorder.stream) { 
      mediaRecorder.stream.getTracks().forEach(t=>t.stop()); 
    }
    setSessionId(null);
    setStatus('interviewing');
    setMessages([]);
    setIsRecording(false);
  };

  const downloadResume = () => {
    if (!sessionId) return;
    window.open(`/api/sessions/${sessionId}/resume.pdf`, '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Vani Vikas</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button 
              onClick={() => setShowLangMenu(!showLangMenu)} 
              className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-200 transition-colors"
            >
              <Globe size={16} className="text-slate-500" />
              <span className="hidden sm:inline text-sm font-medium text-slate-700">
                {LANGUAGES.find(l => l.value === language)?.label || language}
              </span>
            </button>
            {showLangMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)}></div>
                <div className="absolute right-0 mt-2 w-48 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl z-50">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.value}
                      onClick={() => {
                        setLanguage(lang.value);
                        setShowLangMenu(false);
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${
                        language === lang.value ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {status === 'completed' && (
            <button
              onClick={downloadResume}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-full font-medium transition-colors shadow-sm"
            >
              <Download size={18} />
              <span className="hidden sm:inline">Download PDF</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col md:flex-row gap-6">
        
        {/* Chat Interface */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-[calc(100vh-120px)]">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {messages.length === 0 && !sessionId && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="bg-indigo-100 w-20 h-20 rounded-full flex items-center justify-center mb-6">
                  <Mic size={40} className="text-indigo-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome to Vani Vikas</h2>
                <p className="text-slate-600 max-w-sm mb-6">
                  Your voice is your path to progress. Enter your phone number and click "Start Interview" to build your professional resume.
                </p>
                <div className="w-full max-w-xs space-y-3">
                  <input 
                    type="tel" 
                    placeholder="Enter Phone Number" 
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                  <button
                    onClick={startInterview}
                    disabled={isProcessing || !phoneNumber}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-8 py-4 rounded-xl font-medium transition-colors shadow-lg flex items-center justify-center gap-2"
                  >
                    {isProcessing ? <Loader2 className="animate-spin" /> : <Play />}
                    Start Interview
                  </button>
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-5 py-3 ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                    }`}
                  >
                    {msg.content === '[Audio Message]' ? (
                      <div className="flex items-center gap-2">
                        <Mic size={16} />
                        <span className="italic opacity-90">Voice message sent</span>
                      </div>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        {msg.audioData && (
                          <audio 
                            autoPlay 
                            className="hidden"
                            src={`data:audio/wav;base64,${msg.audioData}`}
                          />
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {isProcessing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="bg-slate-100 text-slate-500 rounded-2xl rounded-bl-sm px-5 py-3 flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span>AI is thinking...</span>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Controls */}
          {status === 'interviewing' && (
            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-col items-center justify-center gap-3">
              {!sessionId ? (
                <button
                  onClick={startInterview}
                  disabled={isProcessing}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-full font-medium transition-colors shadow-lg flex items-center gap-2"
                >
                  {isProcessing ? <Loader2 className="animate-spin" /> : <Play />}
                  Start Interview
                </button>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      disabled={isProcessing}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white w-16 h-16 rounded-full flex items-center justify-center transition-colors shadow-lg disabled:opacity-50"
                    >
                      {isProcessing ? <Loader2 className="animate-spin" /> : <Mic size={24} />}
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="relative group flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 shadow-lg bg-red-500 hover:bg-red-600 animate-pulse"
                    >
                      <Square size={24} className="text-white" fill="currentColor" />
                      <span className="absolute inset-0 rounded-full border-4 border-red-500 opacity-50 animate-ping"></span>
                    </button>
                  )}
                  
                  <div className="text-center w-full">
                    <p className={`text-sm font-medium ${isRecording ? 'text-red-500' : 'text-slate-500'}`}>
                      {isRecording ? 'Recording... Tap to send.' : isProcessing ? 'Processing... please wait.' : 'Tap Mic to speak.'}
                    </p>
                  </div>
                  
                  <div 
                    className="text-center w-full cursor-pointer mt-2"
                    onClick={cancelInterview}
                  >
                    <p className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors">
                      Cancel Interview
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live Preview Panel (Desktop only, or full width if completed) */}
        {(resumeData || status === 'completed') && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full md:w-[450px] lg:w-[500px] bg-white rounded-2xl shadow-sm border border-slate-200 p-8 overflow-y-auto h-[calc(100vh-120px)]"
          >
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CheckCircle className="text-emerald-500" size={24} />
                <h2 className="text-lg font-semibold text-slate-800">Resume Ready</h2>
              </div>
              <button
                onClick={downloadResume}
                className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center gap-1"
              >
                <Download size={16} />
                PDF
              </button>
            </div>

            {resumeData && (
              <div className="space-y-8 font-sans text-slate-900">
                {/* Header - Single Column */}
                <div className="text-center border-b pb-6">
                  <h3 className="text-3xl font-bold text-slate-900 uppercase tracking-tight">{resumeData.fullName}</h3>
                  <p className="text-xl text-indigo-600 font-semibold mt-1 uppercase tracking-wide">{resumeData.jobTitle}</p>
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-slate-600 mt-3">
                    <span>{resumeData.location}</span>
                    <span>•</span>
                    <span>{resumeData.phoneNumber}</span>
                    {resumeData.whatsappNumber && (
                      <>
                        <span>•</span>
                        <a 
                          href={`https://wa.me/${resumeData.whatsappNumber.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-emerald-600 font-medium"
                        >
                          WhatsApp
                        </a>
                      </>
                    )}
                  </div>
                  {resumeData.languages && (
                    <div className="mt-2 text-xs text-slate-500 italic">
                      Languages: {resumeData.languages.join(', ')}
                    </div>
                  )}
                </div>

                {/* Professional Summary */}
                <section>
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-3">Professional Summary</h4>
                  <p className="text-sm text-slate-700 leading-relaxed italic">"{resumeData.summary}"</p>
                </section>

                {/* Core Competencies - Skill First */}
                <section>
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-4">Core Competencies</h4>
                  <div className="space-y-4">
                    {resumeData.skillCategories?.primary && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Primary Skills</p>
                        <div className="flex flex-wrap gap-2">
                          {resumeData.skillCategories.primary.map((s: string, i: number) => (
                            <span key={i} className="px-3 py-1 bg-slate-100 text-slate-800 rounded-md text-xs font-semibold border border-slate-200">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {resumeData.skillCategories?.tools && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Tools & Equipment</p>
                        <div className="flex flex-wrap gap-2">
                          {resumeData.skillCategories.tools.map((s: string, i: number) => (
                            <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-md text-xs font-semibold border border-indigo-100">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {resumeData.skillCategories?.soft && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Professional Attributes</p>
                        <div className="flex flex-wrap gap-2">
                          {resumeData.skillCategories.soft.map((s: string, i: number) => (
                            <span key={i} className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-md text-xs font-semibold border border-emerald-100">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Experience */}
                <section>
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-4">Professional Experience</h4>
                  <div className="space-y-6">
                    {resumeData.experience?.map((exp: any, i: number) => (
                      <div key={i}>
                        <div className="flex justify-between items-baseline mb-1">
                          <p className="font-bold text-slate-800">{exp.role}</p>
                          <p className="text-xs font-medium text-slate-500">{exp.duration}</p>
                        </div>
                        <p className="text-sm text-indigo-600 font-medium mb-2">{exp.company}</p>
                        <ul className="list-disc list-outside ml-4 space-y-1">
                          {exp.responsibilities?.map((resp: string, j: number) => (
                            <li key={j} className="text-sm text-slate-600 pl-1">{resp}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Licenses & Certifications */}
                {resumeData.licenses && resumeData.licenses.length > 0 && (
                  <section>
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-3">Licenses & Certifications</h4>
                    <ul className="grid grid-cols-1 gap-2">
                      {resumeData.licenses.map((lic: string, i: number) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                          <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></div>
                          {lic}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Education */}
                {resumeData.education && (
                  <section>
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1 mb-2">Education</h4>
                    <p className="text-sm text-slate-700">{resumeData.education}</p>
                  </section>
                )}

                {/* Digital Badge QR Code Placeholder */}
                <div className="pt-8 border-t border-slate-100 flex flex-col items-center gap-3">
                  <div className="w-24 h-24 bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-300">
                    <Globe size={32} />
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Digital Trust Badge</p>
                    <p className="text-[8px] text-slate-400 italic">Scan to hear professional introduction</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}
