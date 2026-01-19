import { NextRequest, NextResponse } from 'next/server';
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Analyze transcript quality for response intelligence
function analyzeTranscriptQuality(text: string): { isIntelligent: boolean; confidence: number; hasFillers: boolean } {
  const fillerWords = /\b(um|uh|ah|like|you know|actually|basically|i think|i guess|sort of|kind of)\b/gi;
  const fillerCount = (text.match(fillerWords) || []).length;
  const wordCount = text.split(/\s+/).length;
  
  // Intelligent responses have:
  // - Substantive length (>20 words)
  // - Few fillers relative to length
  // - Specific technical or detailed language
  const hasSpecificContent = /\b(because|therefore|thus|consequently|for example|specifically|technically|implement|architecture|design|optimize|strategy)\b/i.test(text);
  const isIntelligent = wordCount > 25 && fillerCount < wordCount / 10 && hasSpecificContent;
  
  const confidence = Math.max(0, 1 - (fillerCount * 0.15)); // Penalize for fillers
  const hasFillers = fillerCount > 2;
  
  return { isIntelligent, confidence: Math.min(1, confidence), hasFillers };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    const fallbackText = formData.get('transcript_fallback') as string;

    // If no audio was sent, use the fallback text from the phone
    if (!audioFile || audioFile.size === 0) {
      const quality = analyzeTranscriptQuality(fallbackText);
      return NextResponse.json({ 
        transcript: fallbackText || "",
        quality: quality
      });
    }

    // Convert File to Buffer for Groq
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    
    // We create a temporary file-like object for the Groq SDK
    const file = await Groq.toFile(buffer, 'audio.m4a', { type: audioFile.type });

    // Send to Groq Whisper for Speech-to-Text
    const transcription = await groq.audio.transcriptions.create({
      file: file,
      model: "whisper-large-v3-turbo", // Fastest and best for mobile
      response_format: "json",
      language: "en",
    });

    const finalTranscript = transcription.text || fallbackText;
    const quality = analyzeTranscriptQuality(finalTranscript);

    return NextResponse.json({ 
      transcript: finalTranscript,
      quality: quality // Send back quality metrics for intelligent follow-ups
    });

  } catch (e) {
    console.error("Transcription Error:", e);
    // If transcription fails, we still return the fallback text so the app doesn't break
    const formData = await req.formData().catch(() => null);
    const fallback = formData?.get('transcript_fallback') as string;
    return NextResponse.json({ 
      transcript: fallback || "",
      quality: { isIntelligent: false, confidence: 0, hasFillers: true }
    });
  }
}