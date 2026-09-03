# services/ai_service.py
#
# Calls an LLM API to turn "here's the next cert and why (goal + completed
# certs)" into a short encouraging explanation. The API key lives only in
# this server process (via .env) — it is never sent to the client.
#
# Provider-agnostic: works with any OpenAI-compatible chat completions
# endpoint (OpenAI itself, or a Gemini/other proxy that speaks the same
# shape). Swap AI_API_URL / AI_MODEL in .env if you use a different vendor.

import os
import requests

AI_API_URL = os.environ.get("AI_API_URL", "https://api.openai.com/v1/chat/completions")
AI_API_KEY = os.environ.get("AI_API_KEY", "")
AI_MODEL = os.environ.get("AI_MODEL", "gpt-4o-mini")
AI_TIMEOUT_SECONDS = 8


def fallback_explanation(cert, goal):
    """
    Plain, deterministic fallback — used whenever the AI call fails, times
    out, or no API key is configured. Never a blank screen / bare error.
    """
    goal_part = f" toward your goal of {goal}" if goal else ""
    return (
        f"Next up: {cert['name']}. This builds directly on what you've already "
        f"completed and is the logical next step{goal_part}. Keep going!"
    )


def explain_next_cert(cert, completed_cert_names, goal=None):
    """
    cert: the next cert dict (already decided by progress_service)
    completed_cert_names: list of names of certs the user has finished
    goal: optional free-text goal, e.g. "get into cloud"
    """
    if not AI_API_KEY:
        return {
            "explanation": fallback_explanation(cert, goal),
            "source": "fallback (no API key configured)",
        }

    prompt_parts = [
        "A student is working through a Microsoft certification learning path.",
        (
            f"They have already completed: {', '.join(completed_cert_names)}."
            if completed_cert_names
            else "They haven't completed any certs yet."
        ),
        f'Their stated goal is: "{goal}".' if goal else "",
        (
            "The next cert they should attempt, already decided by the app's own "
            f"prerequisite logic, is: \"{cert['name']}\"."
        ),
        (
            "Write a short, encouraging 1-2 sentence explanation of why this is a "
            "good next step. Do not suggest a different cert — only explain the one given."
        ),
    ]
    prompt = " ".join(p for p in prompt_parts if p)

    try:
        response = requests.post(
            AI_API_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {AI_API_KEY}",
            },
            json={
                "model": AI_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 120,
                "temperature": 0.7,
            },
            timeout=AI_TIMEOUT_SECONDS,
        )
        response.raise_for_status()

        data = response.json()
        text = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )

        if not text:
            raise ValueError("AI API returned no text")

        return {"explanation": text, "source": "ai"}

    except Exception as err:
        # Down, timed out, bad key, malformed response — all land here.
        return {
            "explanation": fallback_explanation(cert, goal),
            "source": f"fallback ({err})",
        }
