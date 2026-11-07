
const puppeteer = require('puppeteer');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

async function runRenderer() {
  const fps = 30;
  const duration = 4;
  const totalFrames = fps * duration;
  const framesDir = path.join(__dirname, 'frames');

  fs.mkdirSync(framesDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: 1080,
      height: 1920,
      deviceScaleFactor: 1
    });

    const fileUrl = pathToFileURL(
      path.join(__dirname, 'index.html')
    );

    fileUrl.searchParams.set('render', '1');

    await page.goto(fileUrl.href, {
      waitUntil: 'load'
    });

    const ready = await page.evaluate(() => {
      return typeof window.setProgress === 'function';
    });

    if (!ready) {
      throw new Error('setProgress(t) was not found');
    }

    console.log(`Rendering ${totalFrames} frames...`);

    for (let frame = 0; frame < totalFrames; frame++) {
      const timeSec = frame / fps;

      await page.evaluate((t) => {
        window.setProgress(t);
      }, timeSec);

      const filename = path.join(
        framesDir,
        `frame_${String(frame).padStart(4, '0')}.png`
      );

      await page.screenshot({ path: filename });

      if (frame % 30 === 0) {
        console.log(`Frame ${frame + 1}/${totalFrames}`);
      }
    }
  } finally {
    await browser.close();
  }

  const inputPattern = path.join(framesDir, 'frame_%04d.png');
  const outputFile = path.join(__dirname, 'output_scene1.mp4');

  execFileSync('ffmpeg', [
    '-y',
    '-framerate', String(fps),
    '-i', inputPattern,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputFile
  ], { stdio: 'inherit' });

  console.log('Video created:', outputFile);
}

runRenderer().catch((error) => {
  console.error(error);
  process.exit(1);
});
