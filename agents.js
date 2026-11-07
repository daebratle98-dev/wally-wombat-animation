
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
You are an expert SVG animation developer.

Create a complete self-contained HTML document
implementing the supplied animation storyboard.

Requirements:
- Full 45-second animated YouTube Short.
- Vertical SVG viewBox="0 0 1080 1920".
- Recognizable cartoon wombat with articulated body parts.
- Visible, smooth character movements throughout.
- Animated expressions, arms, legs, and props.
- Correct foreground/background layering.
- Avoid clipped limbs and unwanted shadows.
- Implement global window.setProgress(t).
- t is a normalized value between 0 and 1.
- Every frame must be deterministic.
- No external images, libraries, or fonts.
- Include automatic playback for browser preview.

Return ONLY complete HTML, without markdown fences.
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
            temperature: 0.5,
            maxOutputTokens: 16384
          }
        }),
        signal: AbortSignal.timeout(120000)
      });
    } catch (error) {
      if (attempt === 4) throw error;

      const wait = 15000 * (attempt + 1);
      console.log(`Connection error. Waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }

    if (response.ok) {
      const data = await response.json();
      const text = (data.candidates?.[0]?.content?.parts || [])
        .map(part => part.text || "")
        .join("");

      if (!text.trim()) {
        throw new Error("Gemini returned an empty response");
      }

      return text.trim();
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

  console.log("Loaded director.txt");
  console.log("Running only Agent 4 - SVG developer");

  const result = await askGemini(storyboard);

  await fs.writeFile(
    "agent-output/developer.txt",
    result,
    "utf8"
  );

  const html = result
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/, "");

  if (!/<html[\s>]/i.test(html) ||
      !/setProgress\s*\(/.test(html)) {
    throw new Error(
      "Generated output is not a valid HTML animation prototype"
    );
  }

  await fs.writeFile(
    "agent-output/generated.html",
    html,
    "utf8"
  );

  console.log("Agent 4 completed successfully.");
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
