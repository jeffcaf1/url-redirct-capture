const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

async function getFinalDestination(url) {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0' });
    const finalDestination = page.url();
    await browser.close();
    return finalDestination;
  } catch (error) {
    console.error("Error occurred:", error.message);
    return null;
  }
}

async function captureRedirect(initialUrl) {
  let finalUrl = initialUrl;
  let captureMethod = '';

  try {
    const response = await axios.get(initialUrl, { maxRedirects: 0 });
    console.log('Final destination:');
    console.log('200', response.request.res.responseUrl);
    finalUrl = response.request.res.responseUrl;
    captureMethod = 'axios';
  } catch (error) {
    if (error.response && error.response.status === 302) {
      console.log('Request was redirected');
      finalUrl = error.response.headers.location;
      console.log('Final destination:');
      console.log('302', finalUrl);
      captureMethod = 'axios';
    } else {
      console.error('An error occurred:', error.message);
      console.log('Trying Puppeteer to capture final destination...');
      const finalDestination = await getFinalDestination(initialUrl);
      if (finalDestination) {
        console.log('Final destination (Puppeteer):', finalDestination);
        finalUrl = finalDestination;
        captureMethod = 'puppeteer';
      } else {
        console.error('Failed to retrieve final destination.');
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
    .then(({ finalUrl, captureMethod }) => {
      if (finalUrl) {
        res.status(200).json({ finalUrl, message: 'Redirect processing completed', redirect_capture_method: captureMethod });
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
  console.log('Server listening on port 3000');
});

process.on('SIGINT', () => {
  server.close(() => {
    console.log('Server terminated');
    process.exit(0);
  });
});
