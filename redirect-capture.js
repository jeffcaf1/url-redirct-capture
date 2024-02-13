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

  try {
    const response = await axios.get(initialUrl, { maxRedirects: 0 });
    console.log('Final destination:');
    console.log('200', response.request.res.responseUrl);
    return sendWebhook(initialUrl, response.request.res.responseUrl);
  } catch (error) {
    if (error.response && error.response.status === 302) {
      console.log('Request was redirected');
      finalUrl = error.response.headers.location;
      console.log('Final destination:');
      console.log('302', finalUrl);
      return sendWebhook(initialUrl, finalUrl);
    } else {
      console.error('An error occurred:', error.message);
      console.log('Trying Puppeteer to capture final destination...');
      const finalDestination = await getFinalDestination(initialUrl);
      if (finalDestination) {
        console.log('Final destination (Puppeteer):', finalDestination);
        return sendWebhook(initialUrl, finalDestination);
      } else {
        console.error('Failed to retrieve final destination.');
        return null;
      }
    }
  }
}

function sendWebhook(originalUrl, finalUrl) {
  const webhookUrl = 'https://webhook.site/2580031e-4f9f-4940-b56b-6089ff265c33';
  const data = {
    originalUrl: originalUrl,
    finalUrl: finalUrl
  };
  const headers = { 'Content-Type': 'application/json' };

  return axios
    .post(webhookUrl, data, { headers })
    .then(response => {
      console.log('Webhook response:', response.status);
      return finalUrl;
    })
    .catch(error => {
      console.error('Webhook request failed:', error.message);
      return null;
    });
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
        res.status(500).send('Redirect processing failed');
      }
    })
    .catch(() => {
      res.status(500).send('Redirect processing failed');
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
