const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const app = express();

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure directories exist
const tempDownloadsDir = path.join(__dirname, 'temp_downloads');
if (!fs.existsSync(tempDownloadsDir)) {
  fs.mkdirSync(tempDownloadsDir, { recursive: true });
}

const debugDir = path.join(__dirname, 'public', 'debug');
if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir, { recursive: true });
}

// Memory database to store download job status
const jobs = {};

// Helper: wait for download on server with progress reporting
const monitorDownload = async (dir, jobId, timeoutMs = 300000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      // Find a file that is not a temporary Chrome/Chromium download file
      const completedFile = files.find(file => !file.endsWith('.crdownload') && !file.endsWith('.tmp') && file !== '.com.google.Chrome.d3m0n');
      
      // Update progress details
      const activeFile = files.find(file => file !== '.com.google.Chrome.d3m0n');
      if (activeFile) {
        try {
          const stats = fs.statSync(path.join(dir, activeFile));
          const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
          jobs[jobId].message = `Downloading on server: ${sizeMb} MB...`;
        } catch (e) {}
      }

      if (completedFile) {
        return path.join(dir, completedFile);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error('Download timed out or no file was saved on server.');
};

// Test page route to simulate "click Download Server 1 three times to download"
app.get('/test-site', (req, res) => {
  const step = parseInt(req.query.step, 10) || 0;
  if (step >= 3) {
    res.setHeader('Content-Disposition', 'attachment; filename="my_friend_file.txt"');
    res.setHeader('Content-Type', 'text/plain');
    return res.send('Hello! This file was downloaded using automated clicks automation.');
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>My Friend's File Hosting - Step ${step}</title>
      <style>
        body { font-family: sans-serif; padding: 40px; text-align: center; }
        .btn { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 20px; }
      </style>
    </head>
    <body>
      <h2>Step ${step} / 3 to Download File</h2>
      <p>Click "Download Server 1" to proceed.</p>
      <a class="btn" href="/test-site?step=${step + 1}">Download Server 1</a>
    </body>
    </html>
  `);
});

// Endpoint to kick off the download job asynchronously
app.get('/start-download', async (req, res) => {
  const targetUrl = req.query.url;
  const buttonSelectorText = req.query.selector || 'Download Server 1';
  const clicksCount = parseInt(req.query.clicks, 10) || 3;
  const delayMs = parseInt(req.query.delay, 10) || 2000;

  if (!targetUrl) {
    return res.status(400).send('URL parameter is required.');
  }

  try {
    new URL(targetUrl);
  } catch (err) {
    return res.status(400).send('Invalid URL format. Include http:// or https://');
  }

  // Clear previous debug screenshots
  try {
    const debugFiles = ['loaded.png', 'click_1.png', 'click_2.png', 'click_3.png', 'click_4.png', 'click_5.png', 'error.png'];
    debugFiles.forEach(file => {
      const filePath = path.join(debugDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (e) {}

  // Generate unique Job ID
  const jobId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  jobs[jobId] = {
    status: 'loading',
    message: 'Starting headless browser...',
    filePath: '',
    filename: '',
    error: null
  };

  // Respond immediately with the Job ID to avoid HTTP Gateway / Browser timeout
  res.json({ jobId });

  // Run the Puppeteer automation worker in the background
  (async () => {
    let browser;
    const uniqueSubdir = path.join(tempDownloadsDir, jobId);

    try {
      fs.mkdirSync(uniqueSubdir, { recursive: true });

      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      // Track new tabs/popups
      browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
          const newPage = await target.page();
          if (newPage) {
            try {
              const newClient = await newPage.target().createCDPSession();
              await newClient.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: uniqueSubdir
              });
              console.log(`[Job ${jobId}] Applied download behavior to new tab/popup`);
            } catch (err) {
              console.error(`[Job ${jobId}] Failed to apply download behavior to popup:`, err.message);
            }
          }
        }
      });

      const page = await browser.newPage();

      // Configure downloads
      const client = await page.target().createCDPSession();
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: uniqueSubdir
      });

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 800 });

      // Navigate
      console.log(`[Job ${jobId}] Navigating to target URL`);
      jobs[jobId].status = 'loading';
      jobs[jobId].message = 'Navigating to target page...';
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 });
      await page.screenshot({ path: path.join(debugDir, 'loaded.png') }).catch(() => {});

      // Click sequence
      jobs[jobId].status = 'clicking';
      for (let i = 0; i < clicksCount; i++) {
        console.log(`[Job ${jobId}] Attempting click ${i + 1}/${clicksCount}`);
        jobs[jobId].message = `Clicking "${buttonSelectorText}" (${i + 1}/${clicksCount})...`;

        let clicked = false;
        try {
          const [clickedResult] = await Promise.all([
            page.evaluate((btnText) => {
              const elements = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="button"], input[type="submit"]'));
              const target = elements.find(el => {
                const textContent = el.textContent || el.value || '';
                return textContent.toLowerCase().includes(btnText.toLowerCase().trim());
              });
              
              if (target) {
                target.click();
                return true;
              }
              return false;
            }, buttonSelectorText),
            page.waitForNavigation({ waitUntil: 'load', timeout: 5000 }).catch(() => {})
          ]);
          
          clicked = clickedResult;
        } catch (err) {
          console.warn(`[Job ${jobId}] Click context warning (likely navigated):`, err.message);
          clicked = true;
        }

        if (clicked) {
          console.log(`[Job ${jobId}] Click ${i + 1} registered.`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          await page.screenshot({ path: path.join(debugDir, `click_${i + 1}.png`) }).catch(() => {});
        } else {
          console.warn(`[Job ${jobId}] Button "${buttonSelectorText}" not found on click ${i + 1}`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Monitor download
      console.log(`[Job ${jobId}] Waiting for download start...`);
      jobs[jobId].status = 'downloading';
      jobs[jobId].message = 'Waiting for download to start on server...';

      const filePath = await monitorDownload(uniqueSubdir, jobId, 300000);
      const filename = path.basename(filePath);
      console.log(`[Job ${jobId}] Download complete: ${filename}`);

      // Mark Job as Ready
      jobs[jobId].status = 'ready';
      jobs[jobId].filePath = filePath;
      jobs[jobId].filename = filename;
      jobs[jobId].message = 'Download fully completed on server!';

    } catch (error) {
      console.error(`[Job ${jobId}] Background task failed:`, error.message);
      
      try {
        if (browser) {
          const pages = await browser.pages();
          if (pages.length > 0) {
            await pages[0].screenshot({ path: path.join(debugDir, 'error.png') }).catch(() => {});
          }
        }
      } catch (e) {}

      jobs[jobId].status = 'failed';
      jobs[jobId].error = error.message;

      // Clean up directory on failure immediately
      try {
        if (fs.existsSync(uniqueSubdir)) {
          fs.rmSync(uniqueSubdir, { recursive: true, force: true });
        }
      } catch (e) {}
    } finally {
      if (browser) {
        await browser.close();
        console.log(`[Job ${jobId}] Browser closed`);
      }
    }
  })();
});

// Endpoint to poll job status
app.get('/status', (req, res) => {
  const jobId = req.query.jobId;
  const job = jobs[jobId];
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// Endpoint to serve the fully downloaded file
app.get('/get-file', (req, res) => {
  const jobId = req.query.jobId;
  const job = jobs[jobId];
  if (!job || job.status !== 'ready') {
    return res.status(404).send('File not ready or download job expired.');
  }

  const filePath = job.filePath;
  const filename = job.filename;

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found on server.');
  }

  const stats = fs.statSync(filePath);
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/octet-stream');

  console.log(`[Job ${jobId}] Sending file stream to user's browser: ${filename}`);
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  // Clean up directory and job state after file is fully streamed
  res.on('finish', () => {
    try {
      const dir = path.dirname(filePath);
      fs.rmSync(dir, { recursive: true, force: true });
      delete jobs[jobId];
      console.log(`[Job ${jobId}] Temporary files and state cleaned up after download completion.`);
    } catch (e) {}
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
