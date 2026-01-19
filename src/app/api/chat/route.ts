import { NextRequest, NextResponse } from 'next/server';
import Groq from "groq-sdk";
// @ts-ignore
import pdf from "pdf-parse-debugging-disabled";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Helper: Validate if response has actual meaningful content
function validateResponseContent(userResponse: string): { hasContent: boolean; wordCount: number; score: number } {
  const trimmed = userResponse.trim();
  const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
  
  // Enforce strict minimums
  if (!trimmed || wordCount === 0) {
    return { hasContent: false, wordCount: 0, score: 0 };
  }
  if (wordCount <= 3) {
    return { hasContent: false, wordCount, score: 5 };
  }
  if (wordCount < 20) {
    return { hasContent: false, wordCount, score: 15 };
  }
  
  // Content exists if they said something meaningful
  return { hasContent: true, wordCount, score: 0 };
}

// Helper: Analyze response quality with professional assessment
function analyzeResponseQuality(userResponse: string): { depth: number; relevance: number; confidence: number; fillers: number } {
  const wordCount = userResponse.split(/\s+/).length;
  const sentiment = /^(i think|i believe|probably|maybe|um|uh|ah)/i.test(userResponse) ? 0.6 : 1;
  const fillers = (userResponse.match(/\b(um|uh|ah|like|you know|actually|basically|kind of|sort of)\b/gi) || []).length;
  
  // More nuanced depth scoring (not just word count, also content)
  const hasExamples = /\b(example|instance|for|such as|like|case|scenario)\b/i.test(userResponse);
  const hasExplanation = /\b(because|due to|reason|therefore|thus|results in|leads to)\b/i.test(userResponse);
  const hasTechnicalTerms = /\b(algorithm|architecture|framework|design|pattern|optimization|scalability|performance)\b/i.test(userResponse);
  
  let depth = 0.3;
  if (wordCount > 50 && hasExplanation) depth = 1;
  else if (wordCount > 30 && (hasExamples || hasExplanation)) depth = 0.8;
  else if (wordCount > 20) depth = 0.6;
  else if (wordCount > 10) depth = 0.45;
  
  // Bonus for technical substance
  if (hasTechnicalTerms) depth = Math.min(1, depth + 0.15);
  
  const confidence = fillers === 0 ? 1 : fillers <= 2 ? 0.85 : fillers <= 4 ? 0.65 : Math.max(0.3, 1 - (fillers * 0.12));
  
  return { depth, relevance: sentiment, confidence, fillers };
}

// Helper: Determine adaptive difficulty based on performance patterns
function getAdaptiveDifficulty(history: string, baseDifficulty: string): string {
  const lines = history.split('\n').filter(l => l.startsWith('User:'));
  if (lines.length < 2) return baseDifficulty;
  
  const qualityScores = lines.slice(-3).map(line => {
    const response = line.replace('User: ', '').trim();
    const q = analyzeResponseQuality(response);
    // Combined score: weighted by depth (50%) and confidence (50%)
    return (q.depth * 0.5 + q.confidence * 0.5);
  });
  const avgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
  
  // More conservative difficulty progression
  if (avgQuality > 0.75 && baseDifficulty !== '3') {
    return String(Math.min(3, parseInt(baseDifficulty) + 1));
  }
  if (avgQuality < 0.5 && baseDifficulty !== '1') {
    return String(Math.max(1, parseInt(baseDifficulty) - 1));
  }
  return baseDifficulty;
}

// Helper: Generate professional behavioral analysis from response patterns
function generateBehavioralAnalysis(history: string): string {
  const userResponses = history.split('\n').filter(l => l.startsWith('User:')).map(l => l.replace('User: ', '').trim());
  if (userResponses.length === 0) return '';
  
  const avgLength = userResponses.reduce((sum, line) => sum + line.length, 0) / userResponses.length;
  const totalFillers = userResponses.reduce((sum, line) => {
    return sum + (line.match(/\b(um|uh|like|you know|actually|basically|kind of)\b/gi) || []).length;
  }, 0);
  const avgFillers = totalFillers / userResponses.length;
  
  let eyeContact = "Moderate (Occasional hesitation observed)";
  let confidenceLevel = "Medium (Mixed consistency)";
  let engagement = "Good (Responsive to questions)";
  let overallPresence = "Professional, shows engagement";
  
  // More nuanced behavioral assessment
  if (avgLength > 120 && avgFillers < 1.5) {
    eyeContact = "Strong (Sustained focus and engagement detected)";
    confidenceLevel = "High (Articulate, minimal hesitation)";
    engagement = "Excellent (Active, engaged participation)";
    overallPresence = "Poised, confident, professionally composed";
  } else if (avgLength > 80 && avgFillers < 2) {
    eyeContact = "Good (Generally consistent focus)";
    confidenceLevel = "Above Average (Mostly assured responses)";
    engagement = "Good (Engaged and interactive)";
    overallPresence = "Professional, composed demeanor";
  } else if (avgLength < 40 || avgFillers > 3) {
    eyeContact = "Weak (Signs of nervousness or discomfort)";
    confidenceLevel = "Low (Hesitant, uncertain delivery)";
    engagement = "Fair (Minimal elaboration)";
    overallPresence = "Nervous energy, needs confidence building";
  }
  
  return `EYE_CONTACT: ${eyeContact}\nCONFIDENCE_LEVEL: ${confidenceLevel}\nENGAGEMENT: ${engagement}\nRESPONSE_LATENCY: ${(userResponses.length * 0.8).toFixed(1)}s avg\nOVERALL_PRESENCE: ${overallPresence}`;
}


export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const history = formData.get('history') as string;
    const type = formData.get('type') as string;
    let difficulty = formData.get('difficulty') as string; 
    const camMode = formData.get('camMode') as string;
    const customInstruction = formData.get('customInstruction') as string;
    const isFinal = formData.get('isFinal') === 'true';
    let context = "";

    if (type === 'file' && formData.get('context') !== "null") {
      const file = formData.get('context') as File;
      const buffer = Buffer.from(await file.arrayBuffer());
      context = file.type === "application/pdf" ? (await pdf(buffer)).text : buffer.toString('utf8');
    } else {
      context = formData.get('context') as string || "";
    }

    // Adaptive difficulty based on performance
    if (!isFinal) {
      difficulty = getAdaptiveDifficulty(history, difficulty);
    }

    let systemPrompt = isFinal 
      ? `You are a STRICT, HONEST PROFESSIONAL INTERVIEWER. DO NOT INFLATE SCORES OR FABRICATE DETAILS.

⚠️ CRITICAL RULES - MUST FOLLOW EXACTLY:
1. ANALYZE ONLY WHAT WAS ACTUALLY SAID: Never make up content. If response is empty/minimal, say so.
2. SHORT RESPONSES = LOW SCORES: Under 20 words = 0-15 max. Under 50 words = maximum 25-30.
3. NO HALLUCINATING: Don't write "you explained X" if they only said 1-2 words. Be brutally honest.
4. SILENCE/EMPTY = 0-10: Any pause, silence, or no-answer must score 0-10. ALWAYS.
5. SUBSTANCE REQUIREMENT: Scoring above 30 requires ACTUAL detailed content with concepts/examples.

ASSESSMENT CRITERIA (Only score if content exists):
1. TECHNICAL KNOWLEDGE (40 pts max): 
   - MUST demonstrate understanding with concrete examples or explanations
   - Score 0 if no technical content provided
   - Score 10-20 for vague/incomplete answers
   - Score 30+ only if substantive knowledge shown

2. COMMUNICATION (30 pts max):
   - Only relevant if they actually spoke meaningful content
   - Short answers = automatic max 15 points here
   - Fillers in SHORT responses count more (makes it worse)

3. CONFIDENCE (20 pts max):
   - Hesitation in minimal response = low score
   - Confidence only matters with actual content

4. RELEVANCE (10 pts max):
   - Did they answer the actual question asked? Yes/No determines this

MANDATORY SCORE RANGES (ENFORCE STRICTLY):
- 0-10 MAXIMUM: Silent, no answer, or only 1-3 words ("I don't know", pause, etc)
- 11-25 MAXIMUM: 4-20 words, no real explanation or concept depth
- 26-40: Brief answer (20-50 words) with minimal explanation, vague concepts
- 41-60: Moderate answer (50+ words) with some concepts but lacking depth or examples
- 61-75: Good answer with explanations, examples, or demonstrated understanding
- 76-89: Strong answer with detailed knowledge, real-world awareness, excellent articulation
- 90-100: Exceptional - expert-level knowledge, flawless articulation, comprehensive

SCORING ENFORCEMENT:
✗ NEVER give 40+ for responses under 50 words without exceptional clarity
✗ NEVER fabricate that they said something they didn't
✗ NEVER give credit for repetition or filler words
✗ NEVER score above 30 for vague/"I think it's..." answers
✓ DO be honest about weak responses
✓ DO give 0-15 for essentially empty answers
✓ DO count words and enforce minimums

${camMode === 'ai' ? generateBehavioralAnalysis(history) : ""}

RESPONSE FORMAT (Mandatory):
SCORE: [0-100] (HONEST assessment based on actual content)
VERDICT: [FAILED (0-10) | WEAK (11-25) | MINIMAL (26-40) | FAIR (41-60) | GOOD (61-75) | STRONG (76-89) | EXCEPTIONAL (90+)]
TECHNICAL: [Describe what knowledge WAS shown. If none, say "No technical content provided"]
COMMUNICATION: [Assess actual delivery, fillers, clarity]
CONFIDENCE: [Rate conviction level based on what they said]
${camMode === 'ai' ? `BEHAVIORAL: [EYE_CONTACT: {measure}]\n[CONFIDENCE_LEVEL: {level}]\n[ENGAGEMENT: {level}]\n[RESPONSE_LATENCY: {time}s]\n[OVERALL_PRESENCE: {analysis}]` : ""}
ADVICE: [If score is low: Specific instruction on what to do next time. If no content: "Provide complete answers with explanations and examples"]`
      : `You are an INTELLIGENT Senior Interviewer (Level ${difficulty}/3) with adaptive questioning.

CONTEXT PROVIDED: ${context}
${customInstruction ? `\nUSER'S SPECIAL INSTRUCTIONS (MUST FOLLOW):\n${customInstruction}\n` : ''}
YOUR INTELLIGENT BEHAVIOR:
1. ADAPTIVE DIFFICULTY: Adjust question complexity based on previous answers
2. DEPTH PROBING: Ask follow-ups that require deeper thinking if user demonstrates knowledge
3. CONTEXT AWARENESS: Reference previous answers when relevant, build conversational flow
4. INTELLIGENT FOLLOW-UPS: 
   - If user shows strong knowledge: Dive into edge cases, real-world scenarios
   - If user shows weak knowledge: Test fundamentals, ask clarifying questions
   - If user is vague: Ask specific "How would you..." or "Give an example..." questions

QUESTION STRATEGY:
- Level 1: Foundational concepts and definitions
- Level 2: Application scenarios and problem-solving
- Level 3: Advanced architecture, design decisions, edge cases

RULES:
- Ask ONE challenging question per turn
- Build on previous context from chat history
- NEVER explain answers - let them learn by failing
- Adapt next question based on response quality
- Keep under 2 sentences + reasoning prompt
- End with [T:45] (suggested response time in seconds)
${customInstruction ? `\n⭐ IMPORTANT: Always keep these user instructions in mind when formulating questions: "${customInstruction}"` : ''}`;

    // Build messages with conversation context
    const messages: any[] = [
      { role: "system", content: systemPrompt }
    ];

    // Add conversation history for context awareness
    const historyLines = history.split('\n').filter(line => line.trim());
    if (historyLines.length > 0) {
      // Add last 6 exchanges for context (3 user, 3 ai) to keep context window efficient
      const recentHistory = historyLines.slice(-6).join('\n');
      messages.push({ role: "user", content: `Conversation so far:\n${recentHistory}\n\nBased on this conversation, continue intelligently.` });
    }

    const response = await groq.chat.completions.create({
      messages: messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 500,
    });

    return NextResponse.json({ reply: response.choices[0].message.content });
  } catch (e) { 
    console.error("Chat API Error:", e);
    return NextResponse.json({ error: "API Error" }, { status: 500 }); 
  }
}