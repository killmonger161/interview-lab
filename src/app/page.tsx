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



  useEffect(() => {

    const handleKey = (e: KeyboardEvent) => {

      if (e.key === 'Enter' && !isStarted && (setup.data || setup.file)) startInterview();

    };

    window.addEventListener('keydown', handleKey);

    return () => window.removeEventListener('keydown', handleKey);

  }, [isStarted, setup]);



  const startInterview = () => {

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

    setTranscript('');

    audioChunksRef.current = [];

    try {

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;

      if (SpeechRecognition) {

        recognitionRef.current = new SpeechRecognition();

        recognitionRef.current.continuous = true;

        recognitionRef.current.interimResults = true;

        recognitionRef.current.onresult = (e: any) => {

          let str = "";

          for (let i = e.resultIndex; i < e.results.length; ++i) str += e.results[i][0].transcript;

          setTranscript(str);

        };

        recognitionRef.current.start();

      }

      mediaRecorderRef.current = new MediaRecorder(stream);

      mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);

      mediaRecorderRef.current.onstop = async () => {

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        const fd = new FormData(); fd.append('audio', blob);

        setLoading(true);

        const res = await fetch('/api/transcribe', { method: 'POST', body: fd });

        const data = await res.json();

        getAiResponse(data.transcript || transcript || "Silent Response");

        stream.getTracks().forEach(t => t.stop());

      };

      mediaRecorderRef.current.start();

      setRecording(true);

      if (questionSeconds <= 0) setQuestionSeconds(45);

    } catch (e) { alert("Mic Error"); }

  };



  const stopRecording = () => {

    if (mediaRecorderRef.current && recording) {

      mediaRecorderRef.current.stop();

      recognitionRef.current?.stop();

      setRecording(false);

    }

  };



  const getAiResponse = async (userText: string, final = false) => {

    if (final) {

      window.speechSynthesis.cancel(); // STOP VOICE INSTANTLY

      stopRecording();

    }

    setLoading(true);

    const fd = new FormData();

    fd.append('history', [...chatHistory, `User: ${userText}`].join('\n'));

    fd.append('difficulty', setup.difficulty);

    fd.append('type', setup.mode);

    fd.append('camMode', setup.camMode);

    fd.append('context', setup.mode === 'text' ? setup.data : (setup.file ? setup.file : "null"));

    if (final) fd.append('isFinal', 'true');

   

    const res = await fetch('/api/chat', { method: 'POST', body: fd });

    const { reply } = await res.json();

    if (final) { setAiReply(reply); setIsFinished(true); }

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

        <h1 style={{ fontSize: '10rem', fontWeight: 900, margin: '10px 0', color: '#ff3b30' }}>{aiReply.match(/SCORE:\s*(\d+)/)?.[1] || "0"}</h1>

      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '15px' }}>

        {aiReply.split('\n').filter(s => s.includes(':') && !s.includes('SCORE') && !s.includes('VERDICT')).map((line, i) => {

            const [label, content] = line.split(':');

            const isBehavioral = label.trim() === 'BEHAVIORAL';

            return (

              <div key={i} style={{ padding: '25px', borderRadius: '20px', border: isBehavioral ? '2px solid #0070f3' : '1px solid #eee', background: isBehavioral ? '#f0f7ff' : '#fff' }}>

                <strong style={{ color: '#0070f3', textTransform: 'uppercase', fontSize: '0.75rem', display: 'block', marginBottom: '5px' }}>{label} {isBehavioral && "(AI VISION ACTIVE)"}</strong>

                <span style={{ fontSize: '1.1rem', lineHeight: '1.5' }}>{content}</span>

              </div>

            );

        })}

      </div>

      <button onClick={() => window.location.reload()} style={{ marginTop: '40px', padding: '15px 50px', borderRadius: '50px', background: '#000', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>NEW ATTEMPT</button>

    </main>

  );



  return (

    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: 'Inter, sans-serif' }}>

      {!isStarted ? (

        <div style={{ maxWidth: 950, margin: 'auto', paddingTop: 60, display: 'flex', gap: 50 }}>

          <div style={{ flex: 1 }}>

             <h1 style={{ fontSize: '4rem', fontWeight: 900, letterSpacing: '-3px' }}>Interview Lab</h1>

             {setup.camMode !== 'off' ? (

                <video ref={setupVideoRef} autoPlay muted style={{ width: '100%', height: 450, borderRadius: 30, background: '#000', objectFit: 'cover', transform: 'scaleX(-1)', marginTop: 20 }} />

             ) : (

                <div style={{ width: '100%', height: 450, borderRadius: 30, background: '#f5f5f5', marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>Camera Off</div>

             )}

          </div>

          <div style={{ width: 380, paddingTop: 40 }}>

            <label style={{ fontSize: '0.75rem', fontWeight: 900 }}>SESSION DURATION: {setup.min} MIN</label>

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

          </div>

        </div>

      ) : (

        <div style={{ padding: 40, display: 'flex', flexDirection: 'column', height: '90vh' }}>

          <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 40 }}>

            <div><small style={{ fontWeight: 900, opacity: 0.3 }}>TOTAL</small><div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{Math.floor(totalSeconds/60)}:{String(totalSeconds%60).padStart(2,'0')}</div></div>

            <div><small style={{ fontWeight: 900, opacity: 0.3 }}>Q-TIMER</small><div style={{ fontSize: '1.8rem', fontWeight: 900, color: (recording && questionSeconds < 10) ? 'red' : '#000' }}>{recording ? questionSeconds : 0}s</div></div>

          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 60 }}>

            <div style={{ flex: 1, textAlign: 'center' }}>

              <div className={isAiSpeaking ? 'sphere pulse' : 'sphere'} style={{ margin: '0 auto 40px' }} />

              <p style={{ fontSize: '2.5rem', fontWeight: 600, lineHeight: 1.2 }}>

                {aiReply.split(/\s+/).map((word, i) => (

                  <span key={i} style={{ color: i < spokenIndex ? '#0070f3' : '#e0e0e0', transition: 'color 0.1s' }}>{word} </span>

                ))}

              </p>

            </div>

            {setup.camMode !== 'off' && <video ref={videoRef} autoPlay muted style={{ width: 450, height: 550, borderRadius: 40, background: '#000', objectFit: 'cover', transform: 'scaleX(-1)' }} />}

          </div>

          <div style={{ height: 60, textAlign: 'center', marginBottom: 20 }}>

             {recording && <p style={{ fontSize: '1.6rem', color: '#0070f3', fontWeight: 600 }}>{transcript || "I'm listening..."}</p>}

          </div>

          <div style={{ alignSelf: 'center', background: '#000', padding: '15px 40px', borderRadius: 100, display: 'flex', gap: 30, alignItems: 'center' }}>

            <button onClick={recording ? stopRecording : startRecording} disabled={isAiSpeaking || loading} style={{ background: recording ? '#ff3b30' : '#fff', color: recording ? '#fff' : '#000', border: 'none', padding: '12px 35px', borderRadius: 50, fontWeight: 900, cursor: 'pointer' }}>{recording ? 'FINISH' : 'RESPONSE'}</button>

            <button onClick={() => setIsPaused(!isPaused)} style={{ background: '#222', color: '#fff', border: 'none', padding: '12px 25px', borderRadius: 50, cursor: 'pointer' }}>{isPaused ? 'RESUME' : 'PAUSE'}</button>

            <button onClick={() => getAiResponse("AUDIT", true)} style={{ background: 'none', border: 'none', color: '#ff3b30', fontWeight: 900, cursor: 'pointer' }}>LEAVE</button>

          </div>

        </div>

      )}

      <style jsx>{`

        .sphere { width: 80px; height: 80px; background: #0070f3; border-radius: 50%; filter: blur(40px); opacity: 0.1; transition: 0.4s; }

        .pulse { transform: scale(3.5); opacity: 0.6; filter: blur(60px); }

      `}</style>

    </div>

  );

}