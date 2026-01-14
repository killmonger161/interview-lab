import { NextRequest, NextResponse } from 'next/server';
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    const fallbackText = formData.get('transcript_fallback') as string;

    // If no audio was sent, use the fallback text from the phone
    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json({ transcript: fallbackText || "" });
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

    return NextResponse.json({ 
      transcript: transcription.text || fallbackText 
    });

  } catch (e) {
    console.error("Transcription Error:", e);
    // If transcription fails, we still return the fallback text so the app doesn't break
    const formData = await req.formData().catch(() => null);
    const fallback = formData?.get('transcript_fallback') as string;
    return NextResponse.json({ transcript: fallback || "" });
  }
}