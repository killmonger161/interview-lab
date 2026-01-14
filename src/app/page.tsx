'use client';

import { useRef, useState, useEffect } from 'react';

export default function InterviewLab() {
  const [setup, setSetup] = useState({
    mode: 'text', data: '', file: null as File | null,
    min: 10, difficulty: '2', camMode: 'ai'
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const setupVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  // --- RENDER KEEP-ALIVE ---
  useEffect(() => {
    const keepAlive = setInterval(() => {
      fetch('/').catch(() => {});
    }, 13 * 60 * 1000); 
    return () => clearInterval(keepAlive);
  }, []);

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
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    setSpokenIndex(0);
    utterance.onboundary = (e) => {
      if (e.name === 'word') {
        const words = text.split(/\s+/);
        let chars = 0;
        for (let i = 0; i < words.length; i++) {
          chars += words[i].length + 1;
          if (chars >= e.charIndex) { setSpokenIndex(i + 1); break; }
        }
      }
    };
    utterance.onstart = () => setIsAiSpeaking(true);
    utterance.onend = () => { setIsAiSpeaking(false); setSpokenIndex(text.split(/\s+/).length); };
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
      
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        recognitionRef.current = new SpeechRec();
        recognitionRef.current.lang = 'en-US'; // CHANGE 1: FORCED LANGUAGE LOCK
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.onresult = (e: any) => {
          let str = "";
          for (let i = e.resultIndex; i < e.results.length; ++i) str += e.results[i][0].transcript;
          setTranscript(str);
        };
        recognitionRef.current.start();
      }

      const types = ['audio/webm', 'audio/mp4', 'audio/wav'];
      const supportedType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
      
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: supportedType });
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: supportedType });
        const fd = new FormData(); 
        fd.append('audio', blob);
        fd.append('transcript_fallback', transcript);
        
        setLoading(true);
        const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
        const data = await res.json();
        getAiResponse(data.transcript || transcript || "Silent Response");
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorderRef.current.start();
      setRecording(true);
      if (questionSeconds <= 0) setQuestionSeconds(45);

    } catch (e) { 
      alert("Mic access failed. Please ensure you are on HTTPS."); 
    }
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

    // CHANGE 2: FILE CONTEXT SAFETY CHECK
    const contextValue = setup.mode === 'file' 
      ? (setup.file || "No file uploaded") 
      : (setup.data || "No context provided");

    const fd = new FormData();
    fd.append('history', [...chatHistory, `User: ${userText}`].join('\n'));
    fd.append('difficulty', setup.difficulty);
    fd.append('type', setup.mode);
    fd.append('camMode', setup.camMode);
    fd.append('context', contextValue);
    if (final) fd.append('isFinal', 'true');
    
    const res = await fetch('/api/chat', { method: 'POST', body: fd });
    const { reply } = await res.json();
    if (final) { 
      setAiReply(reply); 
      setIsFinished(true); 
      window.speechSynthesis.cancel(); 
    }
    else {
      const clean = reply.replace(/\[T:\d+\]/g, '');
      const t = reply.match(/\[T:(\d+)\]/);
      setChatHistory(prev => [...prev, `User: ${userText}`, `AI: ${clean}`]);
      setAiReply(clean);
      if (t) setQuestionSeconds(parseInt(t[1]));
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

  if (isFinished) return (
    <main style={{ padding: '60px 20px', maxWidth: '800px', margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ background: '#000', color: '#fff', width: '100%', padding: '60px', borderRadius: '40px', textAlign: 'center', marginBottom: '30px' }}>
        <h2 style={{ opacity: 0.6, fontSize: '0.8rem', letterSpacing: '2px', textTransform: 'uppercase' }}>Verdict: {aiReply.match(/VERDICT:\s*(.*)/)?.[1] || "EVALUATED"}</h2>
        <h1 style={{ fontSize: 'clamp(4rem, 15vw, 10rem)', fontWeight: 900, margin: '10px 0', color: '#ff3b30' }}>{aiReply.match(/SCORE:\s*(\d+)/)?.[1] || "0"}</h1>
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {aiReply.split('\n').filter(s => s.includes(':') && !s.includes('SCORE') && !s.includes('VERDICT')).map((line, i) => {
            const [label, content] = line.split(':');
            return (
              <div key={i} style={{ padding: '25px', borderRadius: '20px', border: '1px solid #eee', background: '#fff' }}>
                <strong style={{ color: '#0070f3', textTransform: 'uppercase', fontSize: '0.75rem', display: 'block', marginBottom: '5px' }}>{label}</strong>
                <span style={{ fontSize: '1.1rem', lineHeight: '1.5' }}>{content}</span>
              </div>
            );
        })}
      </div>
      <button onClick={() => { window.speechSynthesis.cancel(); window.location.reload(); }} style={{ marginTop: '40px', padding: '15px 50px', borderRadius: '50px', background: '#000', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>NEW ATTEMPT</button>
    </main>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: 'Inter, sans-serif' }}>
      {!isStarted ? (
        <div style={{ maxWidth: 950, margin: 'auto', padding: '40px 20px', display: 'flex', flexWrap: 'wrap', gap: 50, justifyContent: 'center' }}>
          <div style={{ flex: '1 1 450px', minWidth: '300px' }}>
             <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', fontWeight: 900, letterSpacing: '-3px' }}>Interview Lab</h1>
             {setup.camMode !== 'off' ? (
                <video ref={setupVideoRef} autoPlay muted style={{ width: '100%', aspectRatio: '1/1', maxHeight: 450, borderRadius: 30, background: '#000', objectFit: 'cover', transform: 'scaleX(-1)', marginTop: 20 }} />
             ) : (
                <div style={{ width: '100%', aspectRatio: '1/1', maxHeight: 450, borderRadius: 30, background: '#f5f5f5', marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>Camera Off</div>
             )}
          </div>
          <div style={{ flex: '1 1 300px', maxWidth: 380, paddingTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 900 }}>SESSION DURATION (MIN)</label>
                <input type="number" value={setup.min} onChange={e => setSetup({...setup, min: parseInt(e.target.value) || 0})} style={{ width: 50, border: '1px solid #ddd', borderRadius: 5, textAlign: 'center', fontWeight: 700 }} />
            </div>
            <input type="range" min="5" max="60" step="5" value={setup.min} onChange={e => setSetup({...setup, min: parseInt(e.target.value)})} style={{ width: '100%', margin: '15px 0', accentColor: '#000' }} />
            
            <label style={{ fontSize: '0.75rem', fontWeight: 900 }}>DIFFICULTY</label>
            <input type="range" min="1" max="3" value={setup.difficulty} onChange={e => setSetup({...setup, difficulty: e.target.value})} style={{ width: '100%', margin: '15px 0', accentColor: '#000' }} />

            <label style={{ fontSize: '0.75rem', fontWeight: 900 }}>CAMERA MODE</label>
            <select value={setup.camMode} onChange={e => setSetup({...setup, camMode: e.target.value})} style={{ width: '100%', padding: 15, borderRadius: 12, margin: '10px 0', background: '#f5f5f5', border: 'none', fontWeight: 600 }}>
              <option value="off">Off</option>
              <option value="mirror">Mirror Only</option>
              <option value="ai">AI Analysis (Behavioral)</option>
            </select>

            <div style={{ display: 'flex', gap: 10, margin: '15px 0' }}>
              <button onClick={() => setSetup({...setup, mode:'text'})} style={{ flex:1, padding:15, borderRadius:12, border: setup.mode==='text'?'2px solid #000':'1px solid #ddd', fontWeight: 700 }}>TEXT</button>
              <button onClick={() => setSetup({...setup, mode:'file'})} style={{ flex:1, padding:15, borderRadius:12, border: setup.mode==='file'?'2px solid #000':'1px solid #ddd', fontWeight: 700 }}>FILE</button>
            </div>

            {setup.mode === 'text' ? (
              <textarea placeholder="Paste Context & Press Enter..." style={{ width:'100%', height:100, padding:15, borderRadius:12, background:'#f5f5f5', border:'none' }} onChange={e => setSetup({...setup, data: e.target.value})} />
            ) : (
              <div style={{ padding:20, border:'2px dashed #ddd', borderRadius:12, textAlign:'center' }}>
                <input type="file" id="f" hidden onChange={e => setSetup({...setup, file: e.target.files?.[0] || null})} />
                <label htmlFor="f" style={{cursor:'pointer', fontWeight: 800}}>{setup.file? setup.file.name : "Upload PDF"}</label>
              </div>
            )}
            <button onClick={startInterview} style={{ width:'100%', padding:20, background:'#000', color:'#fff', borderRadius:12, marginTop:20, fontWeight:900, cursor: 'pointer' }}>START MEETING</button>
            
            <p style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '20px', textAlign: 'center' }}>
              🔒 Privacy: Voice data is processed in real-time and never stored on our servers.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 30, marginBottom: 10 }}>
            <div style={{ textAlign: 'center' }}><small style={{ fontWeight: 900, opacity: 0.3 }}>TOTAL</small><div style={{ fontSize: '1rem', fontWeight: 700 }}>{Math.floor(totalSeconds/60)}:{String(totalSeconds%60).padStart(2,'0')}</div></div>
            <div style={{ textAlign: 'center' }}><small style={{ fontWeight: 900, opacity: 0.3 }}>Q-TIMER</small><div style={{ fontSize: '1.2rem', fontWeight: 900, color: (recording && questionSeconds < 10) ? 'red' : '#000' }}>{recording ? questionSeconds : 0}s</div></div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
            <div style={{ flex: '1 1 300px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className={isAiSpeaking ? 'sphere pulse' : 'sphere'} style={{ margin: '0 auto 20px' }} />
              <p style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: 600, lineHeight: 1.2, margin: '0 0 20px 0' }}>
                {aiReply.split(/\s+/).map((word, i) => (
                  <span key={i} style={{ color: i < spokenIndex ? '#0070f3' : '#e0e0e0', transition: 'color 0.1s' }}>{word} </span>
                ))}
              </p>

              <div style={{ background: '#000', padding: '10px 30px', borderRadius: 100, display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20 }}>
                <button onClick={recording ? stopRecording : startRecording} disabled={loading} style={{ background: recording ? '#ff3b30' : '#fff', color: recording ? '#fff' : '#000', border: 'none', padding: '10px 25px', borderRadius: 50, fontWeight: 900, cursor: 'pointer', fontSize: '0.85rem' }}>{recording ? 'FINISH' : 'RESPONSE'}</button>
                <button onClick={() => setIsPaused(!isPaused)} style={{ background: '#222', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 50, cursor: 'pointer', fontSize: '0.85rem' }}>{isPaused ? 'RESUME' : 'PAUSE'}</button>
                <button onClick={() => { window.speechSynthesis.cancel(); getAiResponse("AUDIT", true); }} style={{ background: 'none', border: 'none', color: '#ff3b30', fontWeight: 900, cursor: 'pointer', fontSize: '0.85rem' }}>LEAVE</button>
              </div>

              {recording && <p style={{ fontSize: '1.2rem', color: '#0070f3', fontWeight: 600, margin: 0 }}>{transcript || "I'm listening..."}</p>}
            </div>

            {setup.camMode !== 'off' && (
              <video ref={videoRef} autoPlay muted style={{ width: '100%', maxWidth: 450, height: 'auto', aspectRatio: '4/5', borderRadius: 40, background: '#000', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            )}
          </div>
        </div>
      )}
      <style jsx>{`
        .sphere { width: 60px; height: 60px; background: #0070f3; border-radius: 50%; filter: blur(30px); opacity: 0.1; transition: 0.4s; }
        .pulse { transform: scale(2.5); opacity: 0.6; filter: blur(40px); }
      `}</style>
    </div>
  );
}