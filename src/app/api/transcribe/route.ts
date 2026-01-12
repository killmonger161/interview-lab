import { NextRequest, NextResponse } from 'next/server';
import Groq from "groq-sdk";
import pdf from "pdf-parse-debugging-disabled";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const history = formData.get('history') as string;
    const type = formData.get('type') as string;
    const difficulty = formData.get('difficulty') as string; 
    const isFinal = formData.get('isFinal') === 'true';
    let context = "";

    if (type === 'file' && formData.get('context') !== "null") {
      const file = formData.get('context') as File;
      const buffer = Buffer.from(await file.arrayBuffer());
      context = file.type === "application/pdf" ? (await pdf(buffer)).text : buffer.toString('utf8');
    } else {
      context = formData.get('context') as string || "";
    }

    let systemPrompt = isFinal 
      ? `Provide a FINAL AUDIT. Use this format exactly:
         SCORE: [number]
         TECHNICAL: [critique]
         LINGUISTIC: [critique]
         PACING: [critique]
         ADVICE: [summary]`
      : `You are a Senior Interviewer (Level ${difficulty}). 
         ${context ? `Topic: ${context}` : "If you don't know the topic, start by professionally asking the candidate what role/topic they want to be interviewed for today."}
         RULES: Under 2 sentences. No repetition. End with [T:seconds].`;

    const response = await groq.chat.completions.create({
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: history }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.4,
    });

    return NextResponse.json({ reply: response.choices[0].message.content });
  } catch (e) { return NextResponse.json({ error: "API Error" }, { status: 500 }); }
}