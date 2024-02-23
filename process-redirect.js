const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();
app.use(express.json());

function logRequest(req) {
  const timestamp = new Date().toISOString();
  const requestId = uuidv4();
  const { method, url, body, headers } = req;
  console.log(`${timestamp} [${requestId}] Incoming Request: ${method} ${url}`);
  console.log(`${timestamp} [${requestId}] Request Headers:`, headers);
  console.log(`${timestamp} [${requestId}] Request Body:`, body);
  return requestId;
}

async function getFinalDestination(url, requestId) {
  try {
    const browser = await puppeteer.launch({
      args: [
        "--disable-setuid-sandbox",
        "--no-sandbox",
        "--single-process",
        "--no-zygote",
      ],
      executablePath: process.env.NODE_ENV === 'production' ? process.env.PUPPETEER_EXECUTABLE_PATH : puppeteer.executablePath(),
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0' });
    const finalDestination = page.url();
    await browser.close();
    console.log(`${new Date().toISOString()} [${requestId}] Puppeteer - Final destination: ${finalDestination}`);
    return finalDestination;
  } catch (error) {
    console.error(`${new Date().toISOString()} [${requestId}] Puppeteer - Error occurred:`, error.message);
    return null;
  }
}

async function captureRedirect(initialUrl, requestId) {
  let finalUrl = initialUrl;
  let captureMethod = '';

  try {
    const response = await axios.get(initialUrl, { maxRedirects: 0 });
    if (response.status === 307) {
      finalUrl = response.headers.location;
      captureMethod = 'axios';
    } else {
      console.log(`${new Date().toISOString()} [${requestId}] Axios - Final destination: ${response.request.res.responseUrl}`);
      finalUrl = response.request.res.responseUrl;
      captureMethod = 'axios';
    }
  } catch (error) {
    if (error.response && error.response.status === 302) {
      finalUrl = error.response.headers.location;
      console.log(`${new Date().toISOString()} [${requestId}] Axios - Final destination: ${finalUrl}`);
      captureMethod = 'axios';
    } else {
      console.error(`${new Date().toISOString()} [${requestId}] Axios - An error occurred:`, error.message);
      console.log(`${new Date().toISOString()} [${requestId}] Trying Puppeteer to capture final destination...`);
      const finalDestination = await getFinalDestination(initialUrl, requestId);
      if (finalDestination) {
        console.log(`${new Date().toISOString()} [${requestId}] Puppeteer - Final destination: ${finalDestination}`);
        finalUrl = finalDestination;
        captureMethod = 'puppeteer';
      } else {
        console.error(`${new Date().toISOString()} [${requestId}] Puppeteer - Failed to retrieve final destination.`);
        return null;
      }
    }
  }

  return { finalUrl, captureMethod };
}

app.post('/process-redirect', (req, res) => {
  const preRedirectUrl = req.body.preRedirectUrl;
  const requestId = logRequest(req);

  if (!preRedirectUrl) {
    res.status(400).send('Missing preRedirectUrl parameter');
    return;
  }

  captureRedirect(preRedirectUrl, requestId)
    .then((finalUrl) => {
      if (finalUrl) {
        res.status(200).json({ finalUrl: finalUrl.finalUrl, message: 'Redirect processing completed' });
      } else {
        res.status(500).json({ message: 'Redirect processing failed' });
      }
    })
    .catch((error) => {
      console.error(`${new Date().toISOString()} [${requestId}] Error occurred during redirect processing:`, error);
      res.status(500).json({ message: 'Redirect processing failed' });
    });
});

const server = app.listen(3000, () => {
  console.log('Server listening on port 3000');
});

process.on('SIGINT', () => {
  server.close(() => {
    console.log('Server terminated');
    process.exit(0);
  });
});
