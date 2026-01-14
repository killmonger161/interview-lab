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
    return () => {
      window.speechSynthesis.cancel();
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startInterview = async () => {
    window.speechSynthesis.cancel();
    const silent = new SpeechSynthesisUtterance("");
    window.speechSynthesis.speak(silent);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (e) { alert("Mic access denied."); }

    setTotalSeconds(setup.min * 60);
    setIsStarted(true);
    getAiResponse("START");
  };

  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.onstart = () => setIsAiSpeaking(true);
    utterance.onend = () => setIsAiSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const startRecording = async () => {
    if (recording || isPaused || loading) return;

    // RESUME AUDIO CONTEXT FOR MOBILE
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
        recognitionRef.current.lang = 'en-US';
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.onresult = (e: any) => {
          let str = "";
          for (let i = e.resultIndex; i < e.results.length; ++i) str += e.results[i][0].transcript;
          setTranscript(str);
        };
        recognitionRef.current.start();
      }

      const types = ['audio/webm', 'audio/mp4', 'audio/wav', 'audio/aac'];
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
        fd.append('transcript_fallback', transcript);
        
        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
          const data = await res.json();
          getAiResponse(data.transcript || transcript || "Silent Response");
        } catch {
          getAiResponse(transcript || "Connection Error");
        }
        stream.getTracks().forEach(t => t.stop());
      };

      // THE FIX: Request data chunks every 100ms to keep the pipe 'hot'
      mediaRecorderRef.current.start(100); 
      setRecording(true);
      if (questionSeconds <= 0) setQuestionSeconds(45);
    } catch (e) { alert("Mic failed. Use HTTPS."); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      if (recognitionRef.current) recognitionRef.current.stop();
      setRecording(false);
    }
  };

  const getAiResponse = async (userText: string, final = false) => {
    window.speechSynthesis.cancel();
    setLoading(true);
    const fd = new FormData();
    fd.append('history', [...chatHistory, `User: ${userText}`].join('\n'));
    fd.append('difficulty', setup.difficulty);
    fd.append('type', setup.mode);
    fd.append('context', setup.mode === 'file' ? (setup.file || "No file") : (setup.data || "No context"));
    if (final) fd.append('isFinal', 'true');
    
    try {
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
    } catch { setAiReply("Error."); } finally { setLoading(false); }
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
    <main style={{ padding: '60px 20px', maxWidth: '800px', margin: 'auto', textAlign: 'center' }}>
      <div style={{ background: '#000', color: '#fff', padding: '60px', borderRadius: '40px' }}>
        <h1>Score: {aiReply.match(/SCORE:\s*(\d+)/)?.[1] || "0"}</h1>
      </div>
      <button onClick={() => window.location.reload()} style={{ marginTop: '20px', padding: '15px 40px', borderRadius: '50px', background: '#000', color: '#fff' }}>Restart</button>
    </main>
  );

  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      {!isStarted ? (
        <div style={{ maxWidth: 400, margin: 'auto' }}>
          <h1>Interview Lab</h1>
          <button onClick={startInterview} style={{ width: '100%', padding: 20, background: '#000', color: '#fff', borderRadius: 12, fontWeight: 900 }}>START MEETING</button>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 20 }}>Timer: {totalSeconds}s | Q: {questionSeconds}s</div>
          <div className={isAiSpeaking ? 'sphere pulse' : 'sphere'} style={{ margin: '40px auto' }} />
          <p style={{ fontSize: '1.5rem', minHeight: '100px' }}>{aiReply}</p>
          <div style={{ background: '#000', padding: 10, borderRadius: 100, display: 'inline-flex', gap: 10 }}>
            <button onClick={recording ? stopRecording : startRecording} style={{ background: recording ? 'red' : '#fff', padding: '10px 20px', borderRadius: 50 }}>{recording ? 'FINISH' : 'RESPONSE'}</button>
            <button onClick={() => getAiResponse("AUDIT", true)} style={{ background: 'none', color: 'red', border: 'none' }}>LEAVE</button>
          </div>
          {recording && <p style={{ color: '#0070f3' }}>{transcript || "Listening..."}</p>}
        </div>
      )}
      <style jsx>{`
        .sphere { width: 60px; height: 60px; background: #0070f3; border-radius: 50%; filter: blur(20px); transition: 0.3s; }
        .pulse { transform: scale(2); opacity: 0.8; }
      `}</style>
    </div>
  );
}