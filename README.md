# Termly — Class Schedule to Calendar

A single-page app that turns pasted or photographed class schedules into
downloadable `.ics` calendar files.

**Live site:** https://termly-class-schedule.netlify.app

## How it works

- **OCR:** Tesseract.js reads timetable photos in the browser.
- **Extraction:** DeepSeek extracts structured class data.
- **Calendar:** ics.js builds the `.ics` file; the browser downloads it.

The browser calls `/api/deepseek`, a Netlify Edge Function. The DeepSeek API
key lives in the Netlify environment variable `DEEPSEEK_API_KEY` and is never
included in the static site or sent to the browser.

## Project layout

```text
public/index.html                      Front-end app
netlify/edge-functions/deepseek.js     DeepSeek proxy
netlify.toml                           Netlify build/headers config
```

## Deploy

This project is deployed manually to Netlify. To deploy a new version:

```bash
netlify deploy --prod
```

Set `DEEPSEEK_API_KEY` in the Netlify project environment variables before
deploying. Environment variables declared in `netlify.toml` are not available
to Edge Functions.

## Local development

Serve `public/` with any static server. The `/api/deepseek` proxy is only
available through Netlify Dev or the deployed Netlify site. For local proxy
testing:

```bash
netlify dev
```

## Security notes

- Never put the DeepSeek key in `public/index.html`.
- The proxy checks the request origin and enforces a per-instance rate limit.
- For a high-traffic public deployment, add stronger abuse protection such as
  authentication or a CAPTCHA.
