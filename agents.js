
const fs = require("node:fs/promises");

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function askGemini(input) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const instructions = `
You are an expert 2D SVG character animator.

Create ONE complete, self-contained HTML document
for the FIRST FIVE SECONDS of the supplied storyboard.

Animation requirements:
- 1080x1920 vertical SVG viewBox.
- Exactly 5 seconds of animation.
- One expressive cartoon wombat character.
- Character must visibly MOVE, not remain static.
- Animate head, arms, eyes, and body.
- Use SVG groups with transforms.
- Correct foreground/background layering.
- Keep all limbs visible inside the frame.
- Use simple clean vector shapes.
- No external libraries, images, or fonts.
- Implement window.setProgress(t).
- t is between 0 and 1 for this 5-second scene.
- Every frame must be deterministic.
- Include automatic browser preview playback.

Keep the HTML concise, ideally under 12000 characters.

Return ONLY complete HTML code.
Do not use markdown fences.
`;

  for (let attempt = 0; attempt < 5; attempt++) {
    console.log(`Attempt ${attempt + 1}/5`);

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
            temperature: 0.4,
            maxOutputTokens: 8192
          }
        }),
        signal: AbortSignal.timeout(120000)
      });
    } catch (error) {
      if (attempt === 4) throw error;

      const wait = 15000 * (attempt + 1);
      console.log(`Connection issue. Waiting ${wait / 1000}s`);
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

    if (
      ![429, 500, 502, 503, 504].includes(response.status) ||
      attempt === 4
    ) {
      throw new Error(
        `Gemini HTTP ${response.status}: ${errorText}`
      );
    }

    const wait = 15000 * (attempt + 1);
    console.log(
      `Gemini HTTP ${response.status}. Waiting ${wait / 1000}s`
    );

    await sleep(wait);
  }
}

async function main() {
  const storyboard = await fs.readFile(
    "director.txt",
    "utf8"
  );

  if (!storyboard.trim()) {
    throw new Error("director.txt is empty");
  }

  await fs.mkdir("agent-output", { recursive: true });

  console.log("Generating first 5-second SVG scene");

  const result = await askGemini(storyboard);

  await fs.writeFile(
    "agent-output/developer.txt",
    result,
    "utf8"
  );

  const html = result
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/, "");

  if (
    !/<html[\s>]/i.test(html) ||
    !/<\/html>/i.test(html) ||
    !/setProgress\s*\(/.test(html)
  ) {
    throw new Error(
      "Generated scene is incomplete or missing setProgress"
    );
  }

  await fs.writeFile(
    "agent-output/generated.html",
    html,
    "utf8"
  );

  console.log("First 5-second scene generated.");
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
