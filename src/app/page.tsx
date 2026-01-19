'use client';

import { useRef, useState, useEffect } from 'react';

export default function InterviewLab() {
  const [setup, setSetup] = useState({
    mode: 'text', data: '', file: null as File | null,
    min: 10, difficulty: '2', camMode: 'ai', customInstruction: ''
  });
  const [isStarted, setIsStarted] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  
  const [transcript, setTranscript] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [spokenIndex, setSpokenIndex] = useState(0);
  const [chatHistory, setChatHistory] = useState<string[]>([]);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [questionSeconds, setQuestionSeconds] = useState(0);
  const [performanceScore, setPerformanceScore] = useState(0);
  const [adaptiveDifficulty, setAdaptiveDifficulty] = useState(setup.difficulty);

  const videoRef = useRef<HTMLVideoElement>(null);
  const setupVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    const keepAlive = setInterval(() => {
      fetch('/').catch(() => {});
    }, 13 * 60 * 1000); 
    return () => clearInterval(keepAlive);
  }, []);

  const downloadLog = () => {
    let logText = `INTERVIEW SESSION REPORT\nGenerated: ${new Date().toLocaleString()}\n-------------------------------------------\n\n[1] FULL CHAT HISTORY\n-------------------------------------------\n`;
    chatHistory.forEach(line => { logText += `${line}\n`; });
    logText += `\n-------------------------------------------\n\n[2] FINAL EVALUATION & TRUTH VERDICT\n-------------------------------------------\n${aiReply || "No evaluation data available."}`;
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Interview_Truth_Log_${new Date().getTime()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const startInterview = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (e) { console.error("Mic warm-up failed"); }
    setTotalSeconds(setup.min * 60);
    setIsStarted(true);
    getAiResponse("START");
  };

  useEffect(() => {
    let s: MediaStream;
    if (!isStarted && setup.camMode !== 'off' && setupVideoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
        s = stream;
        if (setupVideoRef.current) setupVideoRef.current.srcObject = stream;
      }).catch(e => console.error("Cam blocked"));
    }
    return () => s?.getTracks().forEach(t => t.stop());
  }, [isStarted, setup.camMode]);

  useEffect(() => {
    if (isStarted && setup.camMode !== 'off' && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: true }).then(s => {
        if (videoRef.current) videoRef.current.srcObject = s;
      });
    }
  }, [isStarted]);

  const speak = (text: string) => {
    if (!text) return;
    if (isPaused) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    setSpokenIndex(0);
    utterance.onboundary = (e) => {
      if (e.name === 'word' && !isPaused) {
        const words = text.split(/\s+/);
        let chars = 0;
        for (let i = 0; i < words.length; i++) {
          chars += words[i].length + 1;
          if (chars >= e.charIndex) { setSpokenIndex(i + 1); break; }
        }
      }
    };
    utterance.onstart = () => setIsAiSpeaking(true);
    utterance.onend = () => { setIsAiSpeaking(false); setSpokenIndex(text?.split(/\s+/).length || 0); };
    window.speechSynthesis.speak(utterance);
  };

  const startRecording = async () => {
    if (recording || isPaused) return;
    
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
    }

    setTranscript('');
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || (window as any).webkitRecognition;
      
      if (SpeechRec) {
        recognitionRef.current = new SpeechRec();
        recognitionRef.current.lang = 'en-US';
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        
        recognitionRef.current.onresult = (e: any) => {
          let str = "";
          for (let i = e.resultIndex; i < e.results.length; ++i) {
            str += e.results[i][0].transcript;
          }
          setTranscript(str);
        };
        recognitionRef.current.start();
      }

      const types = ['audio/mp4', 'audio/webm', 'audio/wav', 'audio/aac'];
      const supportedType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: supportedType });
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        setLoading(true);
        const blob = new Blob(audioChunksRef.current, { type: supportedType });
        const fd = new FormData(); 
        fd.append('audio', blob);
        
        const currentTranscript = transcript;
        fd.append('transcript_fallback', currentTranscript);
        
        const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
        const data = await res.json();
        
        const finalText = data.transcript || currentTranscript || "Silent Response";
        
        // Track performance score based on response quality
        if (data.quality) {
          const { isIntelligent, confidence, hasFillers } = data.quality;
          const scoreIncrement = isIntelligent ? 1.5 : (hasFillers ? -0.5 : 0.5);
          setPerformanceScore(prev => Math.max(0, Math.min(100, prev + scoreIncrement)));
        }
        
        setTranscript(finalText);
        getAiResponse(finalText);
        
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorderRef.current.start();
      setRecording(true);
      if (questionSeconds <= 0) setQuestionSeconds(45);
    } catch (e) { alert("Mic access failed."); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      recognitionRef.current?.stop();
      setRecording(false);
    }
  };

  const getAiResponse = async (userText: string, final = false) => {
    window.speechSynthesis.cancel();
    if (final) stopRecording();
    setLoading(true);
    const fd = new FormData();
    const updatedHistory = final ? chatHistory : [...chatHistory, `User: ${userText}`];
    
    fd.append('history', updatedHistory.join('\n'));
    fd.append('difficulty', adaptiveDifficulty);
    fd.append('type', setup.mode);
    fd.append('camMode', setup.camMode);
    fd.append('customInstruction', setup.customInstruction);

    const rawContext = setup.mode === 'text' ? setup.data : (setup.file ? setup.file : "null");
    const forceGeneral = (!setup.data && !setup.file) ? "Conduct a general personality and logic interview." : rawContext;
    fd.append('context', forceGeneral);
    
    if (final) {
        fd.append('isFinal', 'true');
        fd.append('truthGuard', 'Perform a brutal relevance audit. If the user provided no substantial answers, stayed silent, or dodged questions, you MUST assign SCORE: 0 and VERDICT: FAILED. Strictly NO pity marks. Every parameter card must state "IRRELEVANT" or "NO DATA" if applicable. Strictly NO ADVICE section.');
    }
    
    const res = await fetch('/api/chat', { method: 'POST', body: fd });
    const { reply } = await res.json();
    if (final) { 
      setAiReply(reply || "SCORE: 0\nVERDICT: FAILED"); 
      setIsFinished(true); 
    } else {
      const clean = reply?.replace(/\[T:\d+\]/g, '') || "Error.";
      const t = reply?.match(/\[T:(\d+)\]/);
      setChatHistory(prev => [...prev, `User: ${userText}`, `AI: ${clean}`]);
      setAiReply(clean);
      if (t) setQuestionSeconds(parseInt(t[1]));
      
      // Simulate adaptive difficulty based on performance
      const updatedDifficulty = performanceScore > 70 && parseInt(adaptiveDifficulty) < 3 
        ? String(parseInt(adaptiveDifficulty) + 1) 
        : performanceScore < 40 && parseInt(adaptiveDifficulty) > 1
        ? String(parseInt(adaptiveDifficulty) - 1)
        : adaptiveDifficulty;
      setAdaptiveDifficulty(updatedDifficulty);
      
      speak(clean);
    }
    setLoading(false);
  };

  useEffect(() => {
    let int: any;
    if (isStarted && !isPaused && !isFinished) {
      int = setInterval(() => {
        setTotalSeconds(s => Math.max(0, s - 1));
        if (recording) setQuestionSeconds(q => { if (q <= 1) { stopRecording(); return 0; } return q - 1; });
      }, 1000);
    }
    return () => clearInterval(int);
  }, [isStarted, isPaused, isFinished, recording]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isStarted && !isFinished) {
        e.preventDefault();
        if (!loading) {
          if (recording) {
            stopRecording();
          } else {
            startRecording();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isStarted, isFinished, recording, loading]);

  if (isFinished) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)', fontFamily: 'Inter, sans-serif', padding: '40px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
      <main style={{ maxWidth: '900px', width: '100%' }}>
        {/* Score Card */}
        <div style={{ background: '#000', color: '#fff', width: '100%', padding: '60px 40px', borderRadius: '28px', textAlign: 'center', marginBottom: '40px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <h2 style={{ opacity: 0.8, fontSize: '0.95rem', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 15px 0', fontWeight: 600 }}>Interview Verdict</h2>
          <h1 style={{ fontSize: 'clamp(4rem, 15vw, 10rem)', fontWeight: 900, margin: '0 0 10px 0' }}>
            {aiReply?.match(/SCORE:\s*(\d+)/)?.[1] || "0"}
          </h1>
          <p style={{ fontSize: '1.3rem', opacity: 0.9, margin: '0 0 30px 0', fontWeight: 600 }}>
            {aiReply?.match(/VERDICT:\s*(.*)/)?.[1]?.trim() || "ASSESSMENT PENDING"}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={downloadLog} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '2px solid rgba(255,255,255,0.4)', padding: '12px 28px', borderRadius: '20px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s', fontSize: '0.95rem', backdropFilter: 'blur(10px)' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.transform = 'translateY(0)'; }}>DOWNLOAD LOG</button>
            <button onClick={() => { window.speechSynthesis.cancel(); window.location.reload(); }} style={{ background: '#fff', color: '#000', border: '2px solid #d63031', padding: '12px 28px', borderRadius: '20px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s', fontSize: '0.95rem', boxShadow: '0 8px 20px rgba(0,0,0,0.15)' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.2)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)'; }}>NEW ATTEMPT</button>
          </div>
        </div>

        {/* Evaluation Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          {aiReply?.split('\n')
            .filter(s => s.trim() && s.includes(':') && !s.includes('SCORE') && !s.includes('VERDICT') && !s.toUpperCase().includes('ADVICE') && !s.includes('['))
            .map((line, i) => {
              const parts = line.split(':');
              const label = parts[0].trim();
              const content = parts.slice(1).join(':').trim();
              const colors = ['#000', '#d63031', '#000', '#d63031'];
              const borderColor = colors[i % colors.length];
              return (label && content) ? (
                <div key={i} style={{ padding: '28px', borderRadius: '20px', border: `2px solid ${borderColor}20`, background: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', transition: 'all 0.3s' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.12)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: borderColor, marginBottom: '12px' }}></div>
                  <strong style={{ color: borderColor, textTransform: 'uppercase', fontSize: '0.8rem', display: 'block', marginBottom: '8px', fontWeight: 700, letterSpacing: '0.5px' }}>{label}</strong>
                  <span style={{ fontSize: '1rem', lineHeight: '1.6', color: '#333' }}>{content || "NO DATA"}</span>
                </div>
              ) : null;
            })}
        </div>

        {/* Advice Section */}
        {aiReply?.includes('ADVICE') && (
          <div style={{ background: '#fff', padding: '32px', borderRadius: '20px', border: '2px solid #d63031', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', marginBottom: '30px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d63031', marginRight: '12px' }}></div>
              <h3 style={{ margin: 0, color: '#333', fontSize: '1.1rem', fontWeight: 700 }}>Recommendations</h3>
            </div>
            <div style={{ color: '#555', lineHeight: '1.8', fontSize: '0.95rem' }}>
              {aiReply?.split('ADVICE')[1]?.split('\n')[0] || "No specific recommendations at this time."}
            </div>
          </div>
        )}
      </main>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)', fontFamily: 'Inter, sans-serif' }}>
      {!isStarted ? (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px 20px' }}>
          <div style={{ maxWidth: 1200, width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 60, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ marginBottom: 40 }}>
                <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', fontWeight: 900, letterSpacing: '-2px', color: '#000', margin: '0 0 15px 0' }}>Interview Lab</h1>
                <p style={{ fontSize: '1.1rem', color: '#666', fontWeight: 500, margin: 0 }}>Prepare smarter, interview better</p>
              </div>
              <div style={{ borderRadius: 24, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                {setup.camMode !== 'off' ? (
                   <video ref={setupVideoRef} autoPlay muted playsInline style={{ width: '100%', aspectRatio: '1/1', background: '#000', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                ) : (
                   <div style={{ width: '100%', aspectRatio: '1/1', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.2rem', fontWeight: 600 }}>Camera Off</div>
                )}
              </div>
            </div>
            
            <div style={{ background: '#fff', padding: '40px', borderRadius: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}>
              <div style={{ marginBottom: 32 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#000', letterSpacing: '0.5px', display: 'block', marginBottom: 12 }}>SESSION DURATION</label>
                <div style={{ display: 'flex', gap: 15, alignItems: 'center', marginBottom: 12 }}>
                  <input type="range" min="5" max="60" step="5" value={setup.min} onChange={e => setSetup({...setup, min: parseInt(e.target.value)})} style={{ flex: 1, height: 6, borderRadius: 3, background: '#e0e0e0', accentColor: '#d63031', cursor: 'pointer' }} />
                  <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#000', minWidth: 50, textAlign: 'center' }}>{setup.min}m</span>
                </div>
              </div>

              <div style={{ marginBottom: 32 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#000', letterSpacing: '0.5px', display: 'block', marginBottom: 12 }}>DIFFICULTY LEVEL</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="range" min="1" max="3" value={setup.difficulty} onChange={e => setSetup({...setup, difficulty: e.target.value})} style={{ flex: 1, height: 6, borderRadius: 3, background: '#e0e0e0', accentColor: '#d63031', cursor: 'pointer' }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[1, 2, 3].map(level => (
                      <div key={level} style={{ width: 28, height: 28, borderRadius: 8, background: parseInt(setup.difficulty) >= level ? '#000' : '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>
                        {level}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 32 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#000', letterSpacing: '0.5px', display: 'block', marginBottom: 12 }}>CAMERA MODE</label>
                <select value={setup.camMode} onChange={e => setSetup({...setup, camMode: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid #d63031', background: '#fff', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', transition: 'all 0.3s', color: '#000' }}>
                  <option value="off">Off</option>
                  <option value="mirror">Mirror Only</option>
                  <option value="ai">AI Analysis</option>
                </select>
              </div>

              <div style={{ marginBottom: 32 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#000', letterSpacing: '0.5px', display: 'block', marginBottom: 12 }}>CONTENT TYPE</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <button onClick={() => setSetup({...setup, mode:'text'})} style={{ padding: '14px 20px', borderRadius: 12, border: setup.mode==='text'?'2px solid #d63031':'2px solid #e0e0e0', background: setup.mode==='text'?'#fff':'#fff', fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s', color: '#000' }}>TEXT</button>
                  <button onClick={() => setSetup({...setup, mode:'file'})} style={{ padding: '14px 20px', borderRadius: 12, border: setup.mode==='file'?'2px solid #d63031':'2px solid #e0e0e0', background: setup.mode==='file'?'#fff':'#fff', fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s', color: '#000' }}>FILE</button>
                </div>
              </div>

              {setup.mode === 'text' ? (
                <div style={{ marginBottom: 28 }}>
                  <textarea placeholder="Paste your context, MCQs, or resume here..." value={setup.data} onChange={e => setSetup({...setup, data: e.target.value})} style={{ width:'100%', minHeight:120, padding:'14px 16px', borderRadius:12, border:'2px solid #d63031', background:'#fff', fontFamily:'inherit', fontSize:'0.95rem', resize: 'vertical', transition: 'all 0.3s', color: '#000' }} onFocus={e => e.target.style.borderColor = '#d63031'} onBlur={e => e.target.style.borderColor = '#d63031'} />
                </div>
              ) : (
                <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ padding:24, border:'2px solid #d63031', borderRadius:16, textAlign:'center', background:'#fff', transition: 'all 0.3s' }}>
                    <input type="file" id="f" hidden accept=".pdf,.doc,.docx,.ppt,.txt" onChange={e => setSetup({...setup, file: e.target.files?.[0] || null})} />
                    <label htmlFor="f" style={{ cursor: 'pointer', fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1.8rem' }}>+</span>
                      <span style={{ color: setup.file ? '#d63031' : '#999', fontSize: '0.95rem' }}>{setup.file ? setup.file.name : "Click to upload file"}</span>
                      <span style={{ fontSize: '0.8rem', color: '#aaa' }}>(PDF, DOC, DOCX, PPT, TXT)</span>
                    </label>
                  </div>
                  <textarea placeholder="Add specific interview instructions..." value={setup.customInstruction} onChange={e => setSetup({...setup, customInstruction: e.target.value})} style={{ width:'100%', minHeight:70, padding:'12px 14px', borderRadius:12, border:'2px solid #d63031', background:'#fff', fontFamily:'inherit', fontSize:'0.9rem', resize: 'vertical', transition: 'all 0.3s', color: '#000' }} onFocus={e => e.target.style.borderColor = '#d63031'} onBlur={e => e.target.style.borderColor = '#d63031'} />
                </div>
              )}

              <button onClick={startInterview} style={{ width:'100%', padding:'16px 24px', background: '#000', color:'#fff', border:'2px solid #d63031', borderRadius:14, fontWeight:900, fontSize:'1.05rem', cursor: 'pointer', transition: 'all 0.3s', boxShadow: '0 8px 20px rgba(0,0,0,0.15)', letterSpacing: '0.5px' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.2)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)'; }}>START INTERVIEW</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 30, marginBottom: 10 }}>
            <div style={{ textAlign: 'center' }}><small style={{ fontWeight: 900, opacity: 0.3 }}>TOTAL</small><div style={{ fontSize: '1rem', fontWeight: 700 }}>{Math.floor(totalSeconds/60)}:{String(totalSeconds%60).padStart(2,'0')}</div></div>
            <div style={{ textAlign: 'center' }}><small style={{ fontWeight: 900, opacity: 0.3 }}>Q-TIMER</small><div style={{ fontSize: '1.2rem', fontWeight: 900, color: (recording && questionSeconds < 10) ? 'red' : '#000' }}>{recording ? questionSeconds : 0}s</div></div>
            <div style={{ textAlign: 'center' }}><small style={{ fontWeight: 900, opacity: 0.3 }}>PERFORMANCE</small><div style={{ fontSize: '1rem', fontWeight: 700, color: performanceScore > 70 ? '#00cc44' : performanceScore > 40 ? '#ff9500' : '#ff3b30' }}>{Math.round(performanceScore)}%</div></div>
            <div style={{ textAlign: 'center' }}><small style={{ fontWeight: 900, opacity: 0.3 }}>DIFFICULTY</small><div style={{ fontSize: '1rem', fontWeight: 700 }}>Lv.{adaptiveDifficulty}</div></div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
            <div style={{ flex: '1 1 300px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className={isAiSpeaking ? 'sphere pulse' : 'sphere'} style={{ margin: '0 auto 20px' }} />
              <p style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: 600, lineHeight: 1.2, margin: '0 0 20px 0', opacity: isPaused ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                {aiReply?.split(/\s+/).map((word, i) => (
                  <span key={i} style={{ color: (i < spokenIndex && !isPaused) ? '#0070f3' : '#e0e0e0', transition: 'color 0.1s' }}>{word} </span>
                ))}
              </p>
              <div style={{ background: '#000', padding: '10px 30px', borderRadius: 100, display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20 }}>
                <button onClick={recording ? stopRecording : startRecording} disabled={loading} style={{ background: recording ? '#ff3b30' : '#fff', color: recording ? '#fff' : '#000', border: 'none', padding: '10px 25px', borderRadius: 50, fontWeight: 900, cursor: 'pointer', fontSize: '0.85rem' }}>{recording ? 'FINISH' : 'RESPONSE'}</button>
                <button onClick={() => { window.speechSynthesis.cancel(); setIsPaused(!isPaused); if (!isPaused) speak(aiReply); }} style={{ background: isPaused ? '#667eea' : '#222', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 50, cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.3s' }}>{isPaused ? 'RESUME' : 'PAUSE'}</button>
                <button onClick={() => { window.speechSynthesis.cancel(); getAiResponse("", true); }} style={{ background: 'none', border: 'none', color: '#ff3b30', fontWeight: 900, cursor: 'pointer', fontSize: '0.85rem' }}>LEAVE</button>
              </div>
              {recording && <p style={{ fontSize: '1.2rem', color: '#0070f3', fontWeight: 600, margin: 0 }}>{transcript || "I'm listening..."}</p>}
            </div>
            {setup.camMode !== 'off' && <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', maxWidth: 450, height: 'auto', aspectRatio: '4/5', borderRadius: 40, background: '#000', objectFit: 'cover', transform: 'scaleX(-1)' }} />}
          </div>
        </div>
      )}
      <style>{`
        .sphere { width: 60px; height: 60px; background: #0070f3; border-radius: 50%; filter: blur(30px); opacity: 0.1; transition: 0.4s; }
        .pulse { transform: scale(2.5); opacity: 0.6; filter: blur(40px); }
      `}</style>
    </div>
  );
}