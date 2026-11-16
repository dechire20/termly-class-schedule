const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const SYSTEM_PROMPT =
  "Extract the class schedule from this text. Return ONLY a valid JSON array where each object has: subject, day, start_time (24hr format), end_time, and location. Do not wrap it in markdown blockquotes.";

const MAX_TEXT_LENGTH = 30000;
const RATE_LIMIT_MAX = 12;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const buckets = new Map();

function json(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

function clientIp(request, context) {
  return (
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    context?.ip ||
    "unknown"
  );
}

function isRateLimited(ip) {
  const now = Date.now();

  if (buckets.size > 2000) {
    for (const [key, bucket] of buckets) {
      if (now > bucket.resetAt) buckets.delete(key);
    }
  }

  const bucket = buckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

export default async (request, context) => {
  if (request.method !== "POST") {
    return json(405, { error: { message: "Method not allowed. Use POST." } }, { Allow: "POST" });
  }

  // Browsers always send Origin on cross-origin requests. Same-origin fetch
  // normally includes it too; if present, it must match this deployment.
  const origin = request.headers.get("origin");
  if (origin) {
    let expectedOrigin;
    try {
      expectedOrigin = new URL(request.url).origin;
    } catch {
      return json(400, { error: { message: "Invalid request URL." } });
    }
    if (origin !== expectedOrigin) {
      return json(403, { error: { message: "Origin not allowed." } });
    }
  }

  const ip = clientIp(request, context);
  if (isRateLimited(ip)) {
    return json(429, {
      error: { message: "Too many conversions from this connection. Please wait a few minutes and try again." }
    });
  }

  const apiKey = Netlify.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) {
    return json(500, {
      error: { message: "The server is missing its DeepSeek API key configuration." }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: { message: "Request body must be valid JSON." } });
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return json(400, { error: { message: "No schedule text was provided." } });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return json(413, { error: { message: "The schedule text is too long." } });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text }
        ],
        temperature: 0,
        max_tokens: 3000,
        stream: false
      }),
      signal: controller.signal
    });

    const rawBody = await response.text();
    return new Response(rawBody, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return json(504, {
        error: { message: "DeepSeek took too long to respond. Please try a shorter schedule." }
      });
    }
    console.error("DeepSeek proxy request failed:", error?.message || error);
    return json(502, {
      error: { message: "Could not reach DeepSeek. Please try again in a moment." }
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

export const config = { path: "/api/deepseek" };
