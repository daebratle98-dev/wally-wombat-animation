
const fs = require("node:fs/promises");

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}

const agents = [
  {
    name: "research",
    instructions: `You are a science fact-checker for funny
English YouTube Shorts. Choose one surprising, verifiable
animal fact. Distinguish established facts from hypotheses.
Return a concise fact brief with sources to verify.`
  },
  {
    name: "script",
    instructions: `You are a comedy scriptwriter.
Use the fact brief to write a funny, accurate English
45-second YouTube Short script with a strong hook,
voiceover, and five timed scenes. Avoid unsupported claims.`
  },
  {
    name: "director",
    instructions: `You are a 2D animation director.
Convert the script into a detailed 9:16 SVG animation plan.
Specify character positions, layering, expressions, timing,
and smooth motion. Avoid clipped limbs and obscured faces.`
  },
  {
    name: "developer",
    instructions: `You are an SVG animation developer.
Generate a complete self-contained HTML animation for
the full 45-second vertical Short. Use deterministic
setProgress(t), where t ranges from 0 to 1.
Do not use external images, fonts, or JavaScript libraries.
Return ONLY the complete HTML code, no markdown fences.`
  }
];

async function askGemini(instructions, input) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: instructions }]
        },
        contents: [
          { role: "user", parts: [{ text: input }] }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      const result = (data.candidates?.[0]?.content?.parts || [])
        .map(part => part.text || "")
        .join("");

      if (!result.trim()) {
        throw new Error("Gemini returned an empty response");
      }
      return result.trim();
    }

    const errorText = await response.text();

    if (![429, 500, 502, 503, 504].includes(response.status) ||
        attempt === 2) {
      throw new Error(`Gemini HTTP ${response.status}: ${errorText}`);
    }

    await new Promise(resolve =>
      setTimeout(resolve, 2000 * (attempt + 1))
    );
  }
}

async function main() {
  const topic = process.env.SHORT_TOPIC ||
    "Why wombats produce cube-shaped poop";

  await fs.mkdir("agent-output", { recursive: true });

  let result = `Create a science Short about: ${topic}`;

  for (const agent of agents) {
    console.log(`Running agent: ${agent.name}`);

    result = await askGemini(agent.instructions, result);

    const filename = `agent-output/${agent.name}.txt`;
    await fs.writeFile(filename, result, "utf8");

    console.log(`Saved ${filename}`);
  }

  let html = result
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/, "");

  if (!/<html[\s>]/i.test(html) ||
      !/setProgress\s*\(/.test(html)) {
    throw new Error(
      "Developer output is not a valid animation HTML prototype"
    );
  }

  await fs.writeFile("agent-output/generated.html", html, "utf8");
  console.log("Agent pipeline completed.");
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
