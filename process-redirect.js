const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');
require("dotenv").config();

const app = express();
app.use(express.json());

async function getFinalDestination(url) {
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
    return finalDestination;
  } catch (error) {
    console.error(`Error occurred in getFinalDestination for URL ${url}:`, error.message);
    return null;
  }
}

async function captureRedirect(initialUrl) {
  let finalUrl = initialUrl;
  let captureMethod = '';

  try {
    const response = await axios.get(initialUrl, { maxRedirects: 0 });
    if (response.status === 307) {
      // If it's a temporary redirect, follow it
      finalUrl = response.headers.location;
      captureMethod = 'axios';
    } else {
      console.log('Final destination:');
      console.log(`${response.status}`, response.request.res.responseUrl);
      finalUrl = response.request.res.responseUrl;
      captureMethod = 'axios';
    }
  } catch (error) {
    if (error.response && error.response.status === 302) {
      console.log('Request was redirected');
      finalUrl = error.response.headers.location;
      console.log('Final destination:');
      console.log('302', finalUrl);
      captureMethod = 'axios';
    } else {
      console.error(`An error occurred in captureRedirect for URL ${initialUrl}:`, error.message);
      console.log('Trying Puppeteer to capture final destination...');
      const finalDestination = await getFinalDestination(initialUrl);
      if (finalDestination) {
        console.log('Final destination (Puppeteer):', finalDestination);
        finalUrl = finalDestination;
        captureMethod = 'puppeteer';
      } else {
        console.error(`Failed to retrieve final destination for URL ${initialUrl}.`);
        return null;
      }
    }
  }

  return { finalUrl, captureMethod };
}

app.post('/process-redirect', (req, res) => {
  const preRedirectUrl = req.body.preRedirectUrl;

  if (!preRedirectUrl) {
    res.status(400).send('Missing preRedirectUrl parameter');
    return;
  }

  captureRedirect(preRedirectUrl)
    .then((finalUrl) => {
      if (finalUrl) {
        res.status(200).json({ finalUrl, message: 'Redirect processing completed' });
      } else {
        res.status(500).json({ message: 'Redirect processing failed' });
      }
    })
    .catch((error) => {
      console.error("Error occurred during redirect processing:", error);
      res.status(500).json({ message: 'Redirect processing failed' });
    });
});

const server = app.listen(3000, () => {
  console.log('Server started at', new Date());
  console.log('Server listening on port 3000');
});

process.on('SIGINT', () => {
  server.close(() => {
    console.log('Server terminated');
    process.exit(0);
  });
});
