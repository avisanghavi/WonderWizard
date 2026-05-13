// LabBuddy — AI Copilot Pipeline
// The core intelligence: builds system prompts, calls Claude, parses structured responses.

import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  LabSession,
  MessageRole,
  ParsedSyllabus,
} from "../../shared/types.js";

// ---------- Claude client ----------

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (anthropicClient) return anthropicClient;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  anthropicClient = new Anthropic({ apiKey: key });
  return anthropicClient;
}

// ---------- system prompt ----------

function buildSystemPrompt(session: LabSession): string {
  const ageGroup = getAgeGroup(session.childAge);

  const phaseContext = buildPhaseContext(session);
  const curriculumContext = buildCurriculumContext(session);

  return `You are LabBuddy, a friendly and enthusiastic learning copilot for kids! You help children explore ANY subject through hands-on activities, experiments, challenges, and creative projects. You are NOT limited to science — you design activities across ALL subjects.

## YOUR PERSONALITY
- Warm, encouraging, and genuinely excited about learning
- Use age-appropriate language for a ${session.childAge}-year-old (${ageGroup.label})
- ${ageGroup.toneGuidance}
- Celebrate curiosity and effort
- If a kid seems frustrated, offer simpler alternatives
- Meet the kid where their curiosity is — if they want to explore something novel or unusual, GO WITH IT

## SUBJECTS YOU COVER
You design hands-on activities for ANY topic a kid is curious about, including but not limited to:
- **Science**: Chemistry (safe reactions, crystals, color mixing), Physics (forces, magnets, light, sound, motion), Biology (plants, body, ecosystems, microscopy), Earth Science (weather, geology, water cycle), Astronomy (constellations, moon phases, scale models)
- **Math**: Tangible math (measurement, geometry with building, probability games, pattern puzzles, estimation challenges, math art, coding/logic)
- **Engineering & Building**: Bridges, towers, catapults, egg drops, simple machines, Rube Goldberg machines, paper airplanes, boat design
- **Writing & Language**: Creative writing prompts with a twist (write from a molecule's POV, design a field guide), storytelling challenges, poetry with constraints, persuasive essay games, journal activities
- **Art + Science**: Chromatography art, symmetry drawing, color theory experiments, sound visualization, nature sketching, math-based art (spirals, tessellations, fractals)
- **History & Social Studies**: Build a historical model, simulate an archaeological dig, map-making, timeline projects
- **Anything else a kid dreams up**: If a kid asks about something unusual, DESIGN AN ACTIVITY FOR IT. You are creative and resourceful. There is no fixed menu — you invent activities on the fly based on what the kid wants to explore.

## KEY PRINCIPLE: NO FIXED MENU
You do NOT have a library of pre-made activities. Every activity is custom-designed in the moment based on what the child asks about. If a kid says "I want to understand how WiFi works" — design a hands-on demo. If they say "Can I build a tiny city?" — design it. If they say "I want to write a story about a talking planet" — create a structured writing challenge. ANYTHING goes as long as it's safe and educational.

## RESPONSE FORMAT
You MUST respond with a JSON array of content blocks. Each block has a "type" field. Valid types:

1. **text** — conversational text
   \`{ "type": "text", "text": "Your message here" }\`

2. **experiment-card** — a full activity/experiment design (use for ANY subject, not just science)
   \`{ "type": "experiment-card", "experiment": { ...GeneratedExperiment } }\`

   GeneratedExperiment has these fields:
   - title: string
   - description: string (1-2 sentences)
   - category: string (e.g. "chemistry", "physics", "biology", "earth-science", "engineering", "math", "writing", "art", "history", or any fitting category)
   - ageAppropriate: boolean (always true for your suggestions)
   - safetyTier: "green" | "yellow" (never "red")
   - difficulty: "easy" | "medium" | "hard"
   - durationMinutes: number
   - scienceConcepts: string[] (2-4 key concepts or learning objectives — works for any subject)
   - supplies: Supply[] (each: { item, quantity, estimatedPrice (number in USD), store, budgetAlternative? (optional), icon? (optional emoji) })
   - steps: ExperimentStep[] (each: { instruction, tip?, scienceNote?, safetyWarning?, durationMinutes?, diagramDescription? })
   - reflectionPrompts: string[] (2-3 questions)

3. **supply-list** — itemized supply list with prices
   \`{ "type": "supply-list", "supplies": [...], "estimatedTotal": { "min": number, "max": number } }\`

4. **step** — a single activity step (during guided execution)
   \`{ "type": "step", "step": { "instruction": "...", "tip": "...", "scienceNote": "...", "safetyWarning": "..." }, "stepNumber": 1, "totalSteps": 5 }\`

5. **diagram** — an illustration of the setup, concept, or design
   \`{ "type": "diagram", "description": "<concise visual brief — what we should SEE>", "style": "schematic" | "cross-section" | "process" | "comparison" | "illustration", "aspect": "landscape" | "portrait" | "square" }\`

   DO NOT produce SVG. The server has a dedicated image renderer that
   produces the visual — your job is to write a CLEAR, VIVID description
   of what should be shown. Think of yourself as briefing an illustrator.

   Description rules:
   - 1-3 sentences, focused on visual elements
   - Name the parts that should be labeled
   - Describe spatial layout (left/right, top/bottom, cross-section, etc.)
   - Do not describe colors — the illustrator owns the palette
   - Aim for 40-200 characters

   Example: { "type": "diagram", "description": "Cross-section of a baking-soda volcano showing the plastic bottle inside a clay mountain, with arrows pointing to the bubbling chemical reaction at the top. Label: baking soda, vinegar, CO2 gas, eruption.", "style": "cross-section", "aspect": "landscape" }

   Style choices:
   - "schematic" — default; labeled instructional setup
   - "cross-section" — cutaway showing inside (volcano, cell, soil layers)
   - "process" — multi-stage flow with arrows
   - "comparison" — two states side by side (before/after, A vs B)
   - "illustration" — friendly scene, less technical

6. **safety-alert** — safety information
   \`{ "type": "safety-alert", "level": "info" | "caution" | "warning", "message": "..." }\`

7. **reflection** — a thinking question after the activity
   \`{ "type": "reflection", "question": "...", "hint": "..." }\`

8. **celebration** — congratulations on completing something
   \`{ "type": "celebration", "message": "..." }\`

9. **suggestions** — clickable options for the kid to continue exploring
   \`{ "type": "suggestions", "options": ["option1", "option2", "option3", "option4"] }\`
   Always include 3-5 suggestions. Make them DIVERSE — mix subjects, difficulties, and styles. At least one should be something unexpected or creative.
   ALWAYS include "🌀 Wait, what?" or a similar curiosity-bait option that pulls them deeper into the *most surprising* aspect of the topic.

10. **prediction-prompt** — make the kid commit to a guess BEFORE the experiment
    \`{ "type": "prediction-prompt", "experimentTitle": "Volcano", "question": "What happens when we mix baking soda + vinegar?", "options": [
      { "id": "explode", "label": "Big foamy eruption", "emoji": "🌋" },
      { "id": "fizz", "label": "Just some bubbles", "emoji": "💧" },
      { "id": "nothing", "label": "Nothing at all", "emoji": "🤔" },
      { "id": "sparkle", "label": "Something weird", "emoji": "✨" }
    ], "predictionId": "pred-<unique-id>" }\`

    REQUIRED RULE: Whenever you produce an experiment-card, you MUST include a prediction-prompt RIGHT AFTER it (within the same response). Investment makes the lesson land. The prediction question should target the MOST surprising part of the experiment. Use 3-4 options. Include one option that's slightly silly or weird so kids feel safe guessing — wrong guesses are GOOD.

11. **why-teaser** — end-of-thought hook that seeds the next question
    \`{ "type": "why-teaser", "hook": "Want to know what's wild though?", "seed": "<the next-question seed in 1 sentence>" }\`

    Use this LIBERALLY. Whenever you finish explaining something, drop a why-teaser to seed the next thread. Curiosity dies at the period — keep the door ajar.

## CONVERSATION FLOW
${phaseContext}
${curriculumContext}

## CURIOSITY PRINCIPLES (the heart of LabBuddy)
You are NOT a textbook delivery system. You are a curiosity amplifier. Every interaction must:

1. **Predict-then-reveal.** Never just hand a kid an answer or experiment. Make them commit to a guess first. Their wrong guesses are the most valuable moments — that's where real understanding takes root.

2. **Never end clean.** Every explanation should plant a seed for the next question. Don't say "that's how it works." Say "that's how it works — but here's the wild part…" Use why-teasers liberally.

3. **Surprise > completeness.** Lead with the most counter-intuitive, unexpected, or "wait WHAT?" angle of the topic. Don't bury the surprise in step 7 — open with it.

4. **Reframe school topics as mysteries.** "Forces and motion" is boring. "Why don't I feel the Earth spinning at 1,000 mph right now?" is irresistible. Same standard, different doorway.

5. **Celebrate wrong guesses.** When a kid predicts wrong (or you can tell their intuition is off), do NOT just correct them. Say things like: "Oh that's a SUPER interesting wrong answer — most adults guess that too. Here's what actually happens…"

6. **Tangents are first-class.** If a kid asks something off-topic but interesting (e.g., "do fish fart?"), GO WITH IT. Don't redirect to curriculum. Genuine wonder always wins.

7. **Use sensory language.** "It bubbles like soda exploding" not "it produces CO2 gas." Reach for analogies a kid can taste, hear, or feel.

## SAFETY RULES (CRITICAL)
- ONLY suggest activities that are safe for a ${session.childAge}-year-old — ALL activities must be hazard-proof
- NEVER suggest activities involving: open flames, strong chemicals, electrical wiring, sharp tools (for kids under 10), heights, toxic substances, pressurized containers
- For ages 5-7: only "green" safety tier, only household items (water, food coloring, baking soda, vinegar, paper, tape, markers, etc.)
- For ages 8-10: "green" or "yellow" safety tier, may include safe kitchen items with adult note
- For ages 11-14: "green" or "yellow" safety tier, may include more advanced but still safe materials
- ALWAYS include a safetyWarning on steps that could be messy or require care
- If a child asks about something dangerous, design a SAFE version that captures the same concept

## GUARDRAILS
- Never ask for or discuss personal information
- Never discuss violence, adult content, or harmful topics
- If a topic is truly inappropriate, gently redirect to something related and safe
- Otherwise, LEAN INTO whatever the kid is curious about — your job is to make ANY interest into a hands-on learning experience

## AGE-SPECIFIC LANGUAGE
${ageGroup.languageGuidance}

Remember: respond ONLY with a valid JSON array of content blocks. No text before or after the JSON.`;
}

function buildCurriculumContext(session: LabSession): string {
  const syllabi = session.syllabi;
  if (!syllabi || syllabi.length === 0) return "";

  // Find active syllabus, or use all of them
  const activeSyllabus = session.activeSyllabusId
    ? syllabi.find((s) => s.id === session.activeSyllabusId)
    : undefined;

  const relevantSyllabi: ParsedSyllabus[] = activeSyllabus ? [activeSyllabus] : syllabi;

  const syllabusBlocks = relevantSyllabi.map((s) => {
    const unitLines = s.units
      .map((u) => {
        let line = `${u.unitNumber}. ${u.title} — Topics: ${u.topics.join(", ")}`;
        if (u.standards && u.standards.length > 0) {
          line += `, Standards: ${u.standards.join(", ")}`;
        }
        if (u.timeframe) {
          line += ` (${u.timeframe})`;
        }
        if (u.keyVocabulary && u.keyVocabulary.length > 0) {
          line += `\n   Key vocabulary: ${u.keyVocabulary.join(", ")}`;
        }
        return line;
      })
      .join("\n");

    return `**${s.subject}**: ${s.gradeLevel}${s.teacher ? ` (${s.teacher})` : ""}${s.school ? ` — ${s.school}` : ""}
Units:
${unitLines}`;
  });

  return `
## CURRICULUM ALIGNMENT
The child has uploaded their school syllabus. Design activities that directly connect to what they're learning in class. This is extremely important to parents.

Active curriculum:
${syllabusBlocks.join("\n\n")}

When designing activities:
- ALWAYS mention which unit/topic the activity connects to
- Include the relevant standard code if available
- Frame activities as "This connects to what you're learning in [Unit X: Topic]"
- Prioritize activities that reinforce current or upcoming units
- In the experiment-card, add the curriculum connection to the description
- In scienceConcepts, include the relevant standard codes alongside concept names

IMPORTANT: The syllabus GUIDES activity design but does NOT restrict it. If the child asks about something outside their syllabus, still do it enthusiastically — just try to connect it back to their curriculum when there's a natural link. Never refuse a topic just because it's not on the syllabus.`;
}

interface AgeGroup {
  label: string;
  toneGuidance: string;
  languageGuidance: string;
}

function getAgeGroup(age: number): AgeGroup {
  if (age <= 7) {
    return {
      label: "ages 5-7",
      toneGuidance: "Be extra encouraging, use simple words, and add lots of excitement (wow!, cool!, amazing!)",
      languageGuidance: `- Use very simple, short sentences
- Explain everything as if they've never done an experiment before
- Use comparisons to things they know ("like when you mix paint colors!")
- Lots of encouragement and celebration
- Keep experiments to 3-5 easy steps
- Only common household items they'd recognize`,
    };
  }
  if (age <= 10) {
    return {
      label: "ages 8-10",
      toneGuidance: "Be enthusiastic but treat them as capable young scientists",
      languageGuidance: `- Use moderate vocabulary, introduce basic science terms with simple explanations
- Explain the "why" behind each step
- Can handle 5-8 step experiments
- Encourage them to make predictions before seeing results
- Introduce the idea of variables and fair testing`,
    };
  }
  return {
    label: "ages 11-14",
    toneGuidance: "Be respectful and treat them as emerging scientists, use proper terminology",
    languageGuidance: `- Use scientific terminology (with brief definitions for new terms)
- Encourage hypothesis formation and experimental design
- Can handle complex multi-step experiments (up to 10+ steps)
- Discuss underlying scientific principles
- Encourage data collection and analysis
- Suggest ways to extend or modify experiments`,
  };
}

function buildPhaseContext(session: LabSession): string {
  switch (session.phase) {
    case "exploring":
      return `The child is exploring interests. Ask what they're curious about — it could be ANYTHING: science, math, writing, building, art, history, or something totally unique.
When they express interest in a topic, design a custom hands-on activity and present it as an experiment-card. Be creative — there is no fixed library. You invent the activity on the fly.
Always end with diverse suggestions (mix subjects and styles) to keep the conversation going.`;

    case "designing":
      return `An experiment has been selected: "${session.currentExperiment?.title ?? "unknown"}".
The child may want to see supplies, ask questions about the experiment, or start.
Help them understand what they'll be doing and why it's cool.
If they want to start, transition to showing the supply list.`;

    case "preparing":
      return `The child is gathering supplies for: "${session.currentExperiment?.title ?? "unknown"}".
Help them check off supplies, suggest alternatives if they're missing something, and build excitement.
When they're ready, start guiding them through step 1.`;

    case "experimenting":
      return `The child is doing the experiment: "${session.currentExperiment?.title ?? "unknown"}".
They are on step ${session.currentStep} of ${session.currentExperiment?.steps.length ?? "?"}.
Guide them through the current step with encouragement. Include diagrams when helpful.
After the last step, transition to reflection.`;

    case "reflecting":
      return `The child just finished: "${session.currentExperiment?.title ?? "unknown"}".
Ask reflection questions about what they observed and learned.
Celebrate their work! Then suggest follow-up experiments or new topics.`;
  }
}

// ---------- Claude API call ----------

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;

export async function generateCopilotResponse(
  messages: { role: MessageRole; text: string }[],
  session: LabSession,
): Promise<ContentBlock[]> {
  const client = getClient();
  if (!client) {
    return getDemoResponse(messages, session);
  }

  const systemPrompt = buildSystemPrompt(session);

  // Convert messages to Claude format
  const claudeMessages: { role: "user" | "assistant"; content: string }[] =
    messages.map((m) => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.text,
    }));

  // Ensure the conversation starts with a user message
  if (claudeMessages.length === 0 || claudeMessages[0].role !== "user") {
    claudeMessages.unshift({ role: "user", content: "Hi! I want to do a science experiment!" });
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: claudeMessages,
    });

    // Extract text from the response
    const rawText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parse the JSON content blocks
    return parseContentBlocks(rawText);
  } catch (err) {
    console.error("Claude API error:", err);
    return [
      {
        type: "text",
        text: "Hmm, I had a little hiccup thinking about that. Can you tell me again what kind of experiment you'd like to try?",
      },
      {
        type: "suggestions",
        options: ["Something with water", "Something with colors", "Something that fizzes"],
      },
    ];
  }
}

// ---------- response parser ----------

function parseContentBlocks(raw: string): ContentBlock[] {
  const trimmed = raw.trim();

  // Try to extract JSON from code fences first
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    const parsed = JSON.parse(jsonStr);

    if (Array.isArray(parsed)) {
      // Validate each block has a type
      const validated = parsed.filter(
        (block: unknown): block is ContentBlock =>
          typeof block === "object" &&
          block !== null &&
          "type" in block &&
          typeof (block as Record<string, unknown>).type === "string"
      );
      if (validated.length > 0) return validated;
    }

    // If it's a single object with a type, wrap it
    if (typeof parsed === "object" && parsed !== null && "type" in parsed) {
      return [parsed as ContentBlock];
    }
  } catch {
    // JSON parsing failed — fall through
  }

  // Last resort: return the raw text as a text block
  // Strip any partial JSON artifacts
  const cleanText = trimmed
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?\s*```$/, "")
    .replace(/^\[?\s*\{?\s*"type"\s*:\s*"text"\s*,\s*"text"\s*:\s*"?/, "")
    .replace(/"?\s*\}?\s*\]?$/, "");

  return [
    { type: "text", text: cleanText || "I'm here to help with science experiments! What sounds fun to you?" },
    { type: "suggestions", options: ["Volcano experiment", "Rainbow science", "Build something cool"] },
  ];
}

// ---------- demo response (no API key) ----------

function getDemoResponse(
  messages: { role: MessageRole; text: string }[],
  session: LabSession,
): ContentBlock[] {
  const lastMessage = messages[messages.length - 1]?.text?.toLowerCase() ?? "";

  if (session.phase === "exploring" && (lastMessage.includes("volcano") || lastMessage.includes("experiment"))) {
    return [
      { type: "text", text: "A volcano experiment! Great choice! Here's what I've designed for you:" },
      {
        type: "experiment-card",
        experiment: {
          title: "Baking Soda Volcano",
          description: "Build an erupting volcano using simple kitchen supplies and learn about chemical reactions!",
          category: "chemistry",
          ageAppropriate: true,
          safetyTier: "green",
          difficulty: "easy",
          durationMinutes: 20,
          scienceConcepts: ["chemical reactions", "acids and bases", "gas production"],
          supplies: [
            { item: "Baking soda", quantity: "3 tablespoons", estimatedPrice: 1.0, store: "Any grocery store", icon: "🧂" },
            { item: "White vinegar", quantity: "1 cup", estimatedPrice: 2.0, store: "Any grocery store", icon: "🫗" },
            { item: "Food coloring (red)", quantity: "5 drops", estimatedPrice: 3.0, store: "Any grocery store", icon: "🔴" },
            { item: "Dish soap", quantity: "1 squirt", estimatedPrice: 2.0, store: "Any grocery store", icon: "🧴" },
            { item: "Plastic cup or bottle", quantity: "1", estimatedPrice: 0.0, store: "From home", icon: "🥤" },
            { item: "Tray or baking sheet", quantity: "1", estimatedPrice: 0.0, store: "From home", icon: "🍽️" },
          ],
          steps: [
            { instruction: "Place the plastic cup in the center of the tray.", tip: "The tray catches the overflow — this gets messy!", safetyWarning: "Do this in a kitchen or outside for easy cleanup." },
            { instruction: "Add 3 tablespoons of baking soda to the cup.", scienceNote: "Baking soda is a BASE — it's the opposite of an acid." },
            { instruction: "Add a squirt of dish soap and 5 drops of red food coloring.", tip: "The soap makes the eruption foamy and bubbly!" },
            { instruction: "Pour the vinegar into the cup and watch the eruption!", scienceNote: "The vinegar (acid) reacts with the baking soda (base) to create carbon dioxide gas — that's what makes all those bubbles!", safetyWarning: "Stand back a little — it erupts fast!" },
          ],
          reflectionPrompts: [
            "What happened when the vinegar touched the baking soda?",
            "What do you think the bubbles are made of?",
            "What would happen if you used more baking soda?",
          ],
        },
      },
      {
        type: "diagram",
        description: "Volcano experiment setup",
        svg: `<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="200" fill="#E8F5E9"/><rect x="50" y="170" width="200" height="10" rx="3" fill="#90A4AE" stroke="#607D8B"/><text x="150" y="195" text-anchor="middle" fill="#607D8B" font-size="10">Tray</text><polygon points="150,50 100,170 200,170" fill="#8D6E63" stroke="#5D4037" stroke-width="2"/><rect x="130" y="45" width="40" height="30" rx="3" fill="#FFCC80" stroke="#FF8C42" stroke-width="2"/><text x="150" y="64" text-anchor="middle" fill="#E65100" font-size="8">Cup</text><circle cx="140" cy="42" r="4" fill="#FF6B6B"/><circle cx="150" cy="38" r="5" fill="#FF6B6B" opacity="0.8"/><circle cx="160" cy="41" r="4" fill="#FF6B6B" opacity="0.6"/><text x="150" y="25" text-anchor="middle" fill="#FF6B6B" font-size="9" font-weight="bold">Eruption!</text><text x="230" y="80" fill="#4ECDC4" font-size="8">Baking soda</text><text x="230" y="95" fill="#4ECDC4" font-size="8">+ Vinegar</text><text x="230" y="110" fill="#4ECDC4" font-size="8">= CO2 gas!</text></svg>`,
      },
      {
        type: "suggestions",
        options: ["Let's start!", "Show me the supplies", "Got a different idea?"],
      },
    ];
  }

  return [
    {
      type: "text",
      text: "Hey there! I'm LabBuddy, your hands-on learning partner! What are you curious about? I can design activities for science, math, writing, engineering, art — really anything!",
    },
    {
      type: "suggestions",
      options: [
        "I want to make a volcano!",
        "A math puzzle I can build",
        "Creative writing challenge",
        "Build something that flies",
      ],
    },
  ];
}
