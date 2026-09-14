```javascript
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

app.use(express.json({ limit: "50mb" }));

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

const SYSTEM_PROMPT = `
You are NA MUSAMMAN AI GLOBAL.

You are a helpful, accurate and respectful AI assistant.

Always answer the user in the same language the user uses.

For Hausa users, use simple and clear Hausa.

You can help with:
- General questions
- Education
- Chemistry
- Translation
- Summaries
- News writing
- Reports
- Social media posts
- Captions
- Letters
- Speeches
- Image understanding
- Study assistance
- Writing and editing.

When images are provided, analyze them carefully.

If multiple images are provided, consider all of them together.

Be concise when the user asks for a short answer.

Do not claim to have performed an action that you cannot actually perform.
`;

app.get("/api/status", (_req, res) => {
  res.json({
    ok: true,
    app: "NA MUSAMMAN AI GLOBAL",
    configured: Boolean(GEMINI_API_KEY),
    model: GEMINI_MODEL
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Gemini API key is not configured on the server."
      });
    }

    const {
      message = "",
      image = null,
      images = [],
      history = []
    } = req.body || {};

    const contents = [];

    if (Array.isArray(history)) {
      for (const item of history.slice(-12)) {
        if (!item || !item.role) {
          continue;
        }

        const parts = [];

        if (item.content) {
          parts.push({
            text: String(item.content)
          });
        }

        const historyImages =
          Array.isArray(item.images)
            ? item.images
            : item.image
              ? [item.image]
              : [];

        for (const img of historyImages) {
          if (typeof img !== "string") {
            continue;
          }

          const match = img.match(
            /^data:(image\/[^;]+);base64,(.+)$/
          );

          if (match) {
            parts.push({
              inline_data: {
                mime_type: match[1],
                data: match[2]
              }
            });
          }
        }

        if (parts.length > 0) {
          contents.push({
            role:
              item.role === "assistant"
                ? "model"
                : "user",
            parts
          });
        }
      }
    }

    const currentParts = [];

    if (message) {
      currentParts.push({
        text: String(message)
      });
    }

    const currentImages = [];

    if (Array.isArray(images)) {
      currentImages.push(...images);
    }

    if (
      image &&
      typeof image === "string" &&
      !currentImages.includes(image)
    ) {
      currentImages.push(image);
    }

    for (const img of currentImages) {
      if (typeof img !== "string") {
        continue;
      }

      const match = img.match(
        /^data:(image\/[^;]+);base64,(.+)$/
      );

      if (match) {
        currentParts.push({
          inline_data: {
            mime_type: match[1],
            data: match[2]
          }
        });
      }
    }

    if (currentParts.length === 0) {
      currentParts.push({
        text: "Please respond to the user's request."
      });
    }

    contents.push({
      role: "user",
      parts: currentParts
    });

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        GEMINI_MODEL
      )}:generateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: SYSTEM_PROMPT
            }
          ]
        },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Gemini error:",
        JSON.stringify(data)
      );

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Gemini API request failed."
      });
    }

    let answer = "";

    for (const candidate of data?.candidates || []) {
      for (const part of candidate?.content?.parts || []) {
        if (typeof part?.text === "string") {
          answer += part.text;
        }
      }
    }

    res.json({
      ok: true,
      answer:
        answer.trim() ||
        "I could not generate a response."
    });

  } catch (error) {
    console.error(
      "Server error:",
      error
    );

    res.status(500).json({
      error:
        error?.message ||
        "Internal server error."
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

app.listen(PORT, () => {
  console.log(
    `NA MUSAMMAN AI GLOBAL running on port ${PORT}`
  );
});
```
