# Architecture: Smart AI Interview System

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    SMART INTERVIEW FLOW                     │
└─────────────────────────────────────────────────────────────┘

USER SPEAKS
    ↓
BROWSER RECORDS AUDIO
    ↓
SEND TO /api/transcribe
    ↓
    ├─→ Groq Whisper (Speech-to-Text)
    ├─→ analyzeTranscriptQuality()
    │   ├─ Count filler words (um, uh, like)
    │   ├─ Check response length
    │   ├─ Detect technical keywords
    │   └─→ Return: {isIntelligent, confidence, hasFillers}
    │
RESPONSE QUALITY METRICS → FRONTEND
    ↓
FRONTEND TRACKS PERFORMANCE
    ├─ Update performanceScore state
    ├─ Display real-time score (0-100%)
    ├─ Adjust color (Red/Orange/Green)
    │
CALL /api/chat WITH:
    ├─ Chat history (conversation memory)
    ├─ adaptiveDifficulty (Lv 1-3)
    ├─ User response quality metrics
    │
BACKEND PROCESSES:
    ├─→ getAdaptiveDifficulty()
    │   ├─ Analyze last 3 user responses
    │   ├─ Calculate average quality
    │   ├─ Decide: upgrade, downgrade, or keep level
    │   └─→ Returns: new difficulty (1-3)
    │
    ├─→ generateBehavioralAnalysis() [if camera ON]
    │   ├─ Measure response length patterns
    │   ├─ Estimate eye contact
    │   ├─ Calculate confidence signals
    │   └─→ Returns: simulated behavioral metrics
    │
    ├─→ Build Enhanced System Prompt
    │   ├─ 4-Dimensional Scoring Framework
    │   ├─ Adaptive Questioning Strategy
    │   ├─ Context Awareness Instructions
    │   ├─ Behavioral Analysis Guidelines
    │
    ├─→ Call Groq LLM (llama-3.3-70b)
    │   ├─ Input: System prompt + Chat history
    │   ├─ Temperature: 0.7 (adaptive, natural)
    │   ├─ Max tokens: 500
    │   └─→ Returns: Smart next question
    │
RESPONSE QUALITY DETECTED IN QUESTION:
    ├─ Strong answer detected? → Probe deeper
    ├─ Weak answer detected? → Test fundamentals
    ├─ Vague answer detected? → Ask for examples
    │
AI RESPONSE → FRONTEND
    ├─ Display new question
    ├─ Text-to-speech synthesis
    ├─ Visual word-by-word highlighting
    │
CYCLE REPEATS with better intelligence each time
```

## Component Architecture

```
Frontend (page.tsx)
├─ State Management
│  ├─ performanceScore (0-100%) - REAL-TIME TRACKING
│  ├─ adaptiveDifficulty (1-3) - DYNAMIC LEVELING
│  ├─ chatHistory - CONVERSATION MEMORY
│  └─ Other session states
│
├─ Main Functions
│  ├─ startRecording() → Records user audio
│  ├─ stopRecording() → Stops and sends to /api/transcribe
│  ├─ getAiResponse(userText) → Sends to /api/chat
│  └─ speak(text) → Text-to-speech
│
└─ UI Components
   ├─ Performance Score Display (Red/Orange/Green)
   ├─ Difficulty Level Display (Lv. 1/2/3)
   ├─ Real-time Question Timer
   ├─ Transcript Display
   └─ AI Response Visualization


Backend: /api/transcribe/route.ts
├─ Receives: Audio blob + fallback text
├─ Processes:
│  ├─ Groq Whisper API (speech-to-text)
│  └─ analyzeTranscriptQuality()
│      ├─ Detects filler words
│      ├─ Measures response depth
│      ├─ Identifies technical content
│      └─ Calculates confidence score
├─ Returns:
│  ├─ transcript (text)
│  └─ quality metrics (isIntelligent, confidence, hasFillers)
└─ Error Handling: Falls back to live transcript if API fails


Backend: /api/chat/route.ts
├─ Receives:
│  ├─ Chat history
│  ├─ User response
│  ├─ Difficulty level
│  ├─ Camera mode
│  ├─ Context (resume/MCQs)
│  └─ isFinal flag
│
├─ Smart Processing:
│  ├─ getAdaptiveDifficulty(history, baseDifficulty)
│  │  └─ Analyzes quality → adjusts difficulty
│  │
│  ├─ generateBehavioralAnalysis(history)
│  │  └─ Simulates confidence, eye contact, engagement
│  │
│  ├─ Build Enhanced System Prompt
│  │  ├─ 4-D Scoring Framework (Technical, Communication, Confidence, Relevance)
│  │  ├─ Adaptive Question Strategy
│  │  ├─ Context Awareness Instructions
│  │  ├─ Behavioral Analysis (if camera enabled)
│  │  └─ Custom instructions from user
│  │
│  └─ Call Groq LLM
│     ├─ System: Enhanced prompt
│     ├─ User: Chat history (last 6 exchanges)
│     ├─ Temperature: 0.7 (balances consistency with adaptability)
│     └─ Max tokens: 500
│
├─ Returns:
│  └─ reply (next question or final evaluation)
│
└─ Intelligence Features:
   ├─ Adaptive difficulty selection
   ├─ Performance-based question tuning
   ├─ Context-aware follow-ups
   ├─ Multi-dimensional evaluation
   └─ Behavioral pattern recognition
```

## Data Flow Example

```
SCENARIO: User gives GOOD answer

1. USER SPEAKS:
   "Well, I would use a microservices architecture because it 
    provides better scalability and allows independent deployment 
    of services. For example, you can scale the payment service 
    separately from the notification service."

2. TRANSCRIBE ENDPOINT:
   analyzeTranscriptQuality() returns:
   {
     isIntelligent: true,      // >25 words + technical keywords
     confidence: 0.95,          // No fillers detected
     hasFillers: false
   }

3. FRONTEND UPDATES:
   performanceScore += 1.5  // Jump from 45% to 48%
   Display: "Performance: 48% ▲"
   Color: Green (showing improvement)

4. CHAT ENDPOINT:
   getAdaptiveDifficulty() calculates:
   - Last 3 responses quality average: HIGH (>1.5)
   - Decision: Upgrade difficulty
   - New difficulty: 2 → 3

5. SYSTEM PROMPT:
   "You are an INTELLIGENT Senior Interviewer (Level 3/3)
    User has shown STRONG KNOWLEDGE. Probe deeper.
    Ask about: edge cases, real-world scenarios, performance trade-offs"

6. LLM GENERATES:
   "Great use of microservices! In a high-traffic scenario, 
    how would you handle distributed transactions across services? 
    [T:45]"

7. FRONTEND RECEIVES:
   - New question displayed
   - Difficulty updated to "Lv.3"
   - Performance score: 48%
   - Cycle repeats with harder question
```

## Key Intelligence Algorithms

### 1. Response Quality Scoring
```typescript
analyzeTranscriptQuality(text: string) {
  fillerCount = count(/um|uh|like|you know/)
  wordCount = text.split(' ').length
  technicalKeywords = /architect|design|implement|optimize/i
  
  isIntelligent = (wordCount > 25) && 
                  (fillers < wordCount/10) && 
                  (hasKeywords)
                  
  confidence = Math.max(0, 1 - (fillers * 0.15))
  
  return { isIntelligent, confidence, hasFillers }
}
```

### 2. Adaptive Difficulty
```typescript
getAdaptiveDifficulty(history, currentLevel) {
  lastResponses = history.split('\n').filter('User:').slice(-3)
  
  qualityScores = lastResponses.map(response => {
    quality = analyzeResponseQuality(response)
    return quality.depth + quality.confidence
  })
  
  avgQuality = average(qualityScores)
  
  if (avgQuality > 1.5 && currentLevel < 3) {
    return currentLevel + 1  // Upgrade
  } else if (avgQuality < 0.6 && currentLevel > 1) {
    return currentLevel - 1  // Downgrade
  }
  return currentLevel  // Keep same
}
```

### 3. Performance Score
```typescript
performanceScore += (isIntelligent ? 1.5 : 
                     hasFillers ? -0.5 : 0.5)

performanceScore = Math.max(0, Math.min(100, score))
```

## Integration Points

### Frontend → Backend
- `POST /api/transcribe`: Send audio, receive quality metrics
- `POST /api/chat`: Send history + metrics, receive adaptive question

### Backend Intelligence
- **Transcribe**: Detects answer quality before AI even sees it
- **Chat**: Uses quality to adapt AI behavior
- **Frontend**: Uses both to track real-time performance

## Performance Considerations

1. **Context Window**: Only last 6 exchanges kept (efficiency)
2. **Temperature**: 0.7 (balances creativity with consistency)
3. **Max Tokens**: 500 (prevents lengthy responses)
4. **Analysis Functions**: Synchronous, fast regex-based
5. **Adaptive Difficulty**: Calculated fresh each turn

## Error Handling

```
Audio Transcription Fails?
→ Falls back to browser's live transcript

Chat API Fails?
→ Returns generic error message

Quality Analysis?
→ Conservative defaults (assumes weak response)

Performance Score?
→ Initialized at 0, only increases with good answers
```

## Extension Points

These systems are built to extend:

1. **Custom Scorers**: Add industry-specific evaluation functions
2. **Question Banks**: Integrate domain-specific knowledge bases
3. **Analytics**: Export performance data for reporting
4. **ML Models**: Train models on interview patterns
5. **Real APIs**: Replace simulated behavioral analysis with real biometrics
