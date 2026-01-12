import { NextRequest, NextResponse } from 'next/server';
import Groq from "groq-sdk";
// @ts-ignore
import pdf from "pdf-parse-debugging-disabled";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const history = formData.get('history') as string;
    const type = formData.get('type') as string;
    const difficulty = formData.get('difficulty') as string; 
    const camMode = formData.get('camMode') as string;
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
      ? `You are a BRUTAL and ELITE Interview Auditor. 
         SCORING RULES:
         - IF USER SAID NOTHING OR 'SILENT RESPONSE': SCORE IS 0/100.
         - BE HARSH. Average candidates get 40. 80+ is for perfect experts.
         - Deduct points for fillers (um, ah, like) and lack of technical depth.
         
         BEHAVIORAL ANALYSIS:
         ${camMode === 'ai' ? "AI CAMERA IS ENABLED. You MUST provide a highly detailed segment called 'BEHAVIORAL' analyzing simulated facial expressions, eye contact, and micro-expressions based on the user's response patterns." : "AI CAMERA IS DISABLED. Do not provide detailed behavioral stats."}

         FORMAT (Strictly follow this):
         SCORE: [0-100]
         VERDICT: [FAILED / WEAK / HIRED]
         TECHNICAL: [Critique knowledge based on the MCQs/Context provided]
         ${camMode === 'ai' ? "BEHAVIORAL: [Detailed AI analysis of facial cues and confidence]" : ""}
         LINGUISTIC: [Critique speech clarity and confidence]
         ADVICE: [3 specific things they must study]`
      : `You are a Senior Interviewer (Level ${difficulty}).
         CONTEXT: ${context}
         TASK: Use the provided context (MCQs/Resume) to ask ONE challenging open-ended question at a time.
         RULES: NEVER teach. NEVER explain. If the user is wrong, move to the next topic. 
         Keep responses under 2 sentences. End with [T:seconds].`;

    const response = await groq.chat.completions.create({
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: history }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
    });

    return NextResponse.json({ reply: response.choices[0].message.content });
  } catch (e) { return NextResponse.json({ error: "API Error" }, { status: 500 }); }
}