
const fs = require("node:fs/promises");

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}

const agents = [
  {
    name: "director",
    instructions: `You are an expert 2D animation director.

Turn the supplied English YouTube Shorts script into a
detailed 45-second animation storyboard.

Requirements:
- Vertical 9:16 video, 1080x1920.
- Expressive cartoon wombat character.
- Smooth, clearly visible character movements.
- Five scenes with exact start and end times.
- Describe backgrounds, poses, facial expressions,
  camera movements, and transitions.
- Specify foreground/background layering.
- Prevent clipped limbs, hidden hands, and objects
  covering the character's face.
- Keep the animation visually engaging throughout.

Return a detailed storyboard that an SVG animation
developer can implement.`
  },
  {
    name: "developer",
    instructions: `You are an expert SVG animation developer.

Build a complete, self-contained HTML animation
from the supplied storyboard.

Requirements:
- 1080x1920 vertical SVG canvas.
- Full 45-second animation.
- A recognizable, expressive cartoon wombat.
- Smooth character movement, not static slides.
- Animated arms, legs, eyes, mouth, and body.
- Clear foreground/background layering.
- No clipped limbs or unwanted shadows.
- No external libraries, images, or fonts.
- Provide a global function setProgress(t).
- t is a normalized value between 0 and 1.
- The scene must render correctly at any t.
- Use SVG groups and transforms for animation.
- Include automatic browser playback for preview.

Return ONLY a complete HTML document.
Do not include markdown fences or explanations.`
  }
];

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function askGemini(instructions, input) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(
      `Gemini request: attempt ${attempt + 1}/${maxAttempts}`
    );

    let response;

    try {
      response = await fetch(url, {
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
            maxOutputTokens: 16384
          }
        }),
        signal: AbortSignal.timeout(120000)
      });
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw error;
      }

      const wait = 15000 * (attempt + 1);
      console.log(`Connection issue. Waiting ${wait / 1000}s.`);
      await sleep(wait);
      continue;
    }

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
    const retryable = [429, 500, 502, 503, 504]
      .includes(response.status);

    if (!retryable || attempt === maxAttempts - 1) {
      throw new Error(
        `Gemini HTTP ${response.status}: ${errorText}`
      );
    }

    const wait = 15000 * (attempt + 1);

    console.log(
      `Gemini HTTP ${response.status}. ` +
      `Retrying in ${wait / 1000} seconds.`
    );

    await sleep(wait);
  }
}

async function main() {
  const script = await fs.readFile("script.txt", "utf8");

  if (!script.trim()) {
    throw new Error("script.txt is empty");
  }

  await fs.mkdir("agent-output", { recursive: true });

  console.log("Loaded existing script.txt");
  console.log("Skipping research and script agents.");

  let result = script;

  for (const agent of agents) {
    console.log(`Running agent: ${agent.name}`);

    result = await askGemini(agent.instructions, result);

    const filename = `agent-output/${agent.name}.txt`;
    await fs.writeFile(filename, result, "utf8");

    console.log(`Saved ${filename}`);
  }

  const html = result
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/, "");

  if (!/<html[\s>]/i.test(html) ||
      !/setProgress\s*\(/.test(html)) {
    throw new Error(
      "Developer output is not a valid animation HTML prototype"
    );
  }

  await fs.writeFile(
    "agent-output/generated.html",
    html,
    "utf8"
  );

  console.log("Director and developer completed.");
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
