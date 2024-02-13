// api/process-redirect.js

const axios = require('axios');
const puppeteer = require('puppeteer');

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const preRedirectUrl = req.body.preRedirectUrl;

  if (!preRedirectUrl) {
    return res.status(400).json({ message: 'Missing preRedirectUrl parameter' });
  }

  let finalUrl, captureMethod;

  try {
    const response = await axios.get(preRedirectUrl, { maxRedirects: 0 });
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
      const finalDestination = await getFinalDestination(preRedirectUrl);
      if (finalDestination) {
        console.log('Final destination (Puppeteer):', finalDestination);
        finalUrl = finalDestination;
        captureMethod = 'puppeteer';
      } else {
        console.error('Failed to retrieve final destination.');
        return res.status(500).json({ message: 'Redirect processing failed' });
      }
    }
  }

  res.status(200).json({ finalUrl, message: 'Redirect processing completed', redirect_capture_method: captureMethod });
}
