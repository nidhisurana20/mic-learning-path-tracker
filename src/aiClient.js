'use strict';

/**
 * Server-side-only AI client.
 *
 * IMPORTANT: the AI is only ever asked to *explain* a decision that
 * progressLogic.js has already made (which cert is now "available").
 * It is never given the prerequisite graph and asked to choose the
 * next cert — that would violate the brief.
 *
 * Supports OpenAI or Gemini via env vars, chosen at runtime so this
 * runs against whichever key you actually have:
 *   AI_PROVIDER = "openai" | "gemini"   (default: openai)
 *   OPENAI_API_KEY / GEMINI_API_KEY
 *   AI_MODEL      (optional override)
 *   AI_TIMEOUT_MS (optional, default 8000)
 */

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 8000);

function buildPrompt({ cert, fromCert, goal }) {
  const goalLine = goal ? `The learner's stated goal is: "${goal}".` : '';
  const fromLine = fromCert
    ? `They just completed "${fromCert.name}" (${fromCert.id}).`
    : `This is their first step on this path.`;

  return [
    `You are an encouraging study-path assistant for Microsoft certifications.`,
    fromLine,
    `Their next available step, already chosen by the system, is "${cert.name}" (${cert.id}): ${cert.description}`,
    goalLine,
    `In 1-2 short, encouraging sentences, explain WHY this step makes sense next given what they've `
      + `just finished (and their goal, if given). Do not suggest a different certification. `
      + `Do not invent prerequisites. Keep it under 45 words.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function fallbackExplanation({ cert, fromCert }) {
  const base = fromCert
    ? `Nice work finishing ${fromCert.id}! `
    : `Great place to start! `;
  return (
    base +
    `${cert.name} (${cert.id}) is next because its prerequisites are now complete — ` +
    `it builds directly on what you already know.`
  );
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`OpenAI API returned ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI API returned no content');
  return text;
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const model = process.env.AI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Gemini API returned ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Gemini API returned no content');
  return text;
}

/**
 * Returns { explanation, source: "ai" | "fallback" }.
 * Never throws — a down/slow/misconfigured AI API degrades to a
 * plain fallback explanation instead of failing the request.
 */
async function explainStep({ cert, fromCert, goal }) {
  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  const prompt = buildPrompt({ cert, fromCert, goal });

  try {
    const text =
      provider === 'gemini' ? await callGemini(prompt) : await callOpenAI(prompt);
    return { explanation: text, source: 'ai' };
  } catch (err) {
    console.error(`AI explanation failed (${provider}):`, err.message);
    return { explanation: fallbackExplanation({ cert, fromCert }), source: 'fallback' };
  }
}

module.exports = { explainStep };
