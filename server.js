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

app.use(
  express.json({
    limit: "50mb"
  })
);

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


/* =========================
   SYSTEM PROMPT
========================= */

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
- Image comparison
- Study assistance
- Writing and editing

When images are provided, carefully examine all images and follow the user's instructions.

Be concise when the user asks for a short answer.

Do not claim to have performed an action that you cannot actually perform.
`;


/* =========================
   STATUS
========================= */

app.get("/api/status", (req, res) => {

  res.json({
    ok: true,
    app: "NA MUSAMMAN AI GLOBAL",
    configured: Boolean(GEMINI_API_KEY),
    model: GEMINI_MODEL
  });

});


/* =========================
   CHAT
========================= */

app.post("/api/chat", async (req, res) => {

  try {

    if (!GEMINI_API_KEY) {

      return res.status(500).json({
        error:
          "Gemini API key is not configured on the server."
      });

    }


    const {
      message = "",
      image = null,
      images = [],
      history = []
    } = req.body || {};


    const contents = [];


    /* =====================
       HISTORY
    ===================== */

    if (Array.isArray(history)) {

      for (const item of history.slice(-12)) {

        if (
          !item ||
          !item.role ||
          !item.content
        ) {
          continue;
        }


        const role =
          item.role === "assistant"
            ? "model"
            : "user";


        const parts = [
          {
            text: String(item.content)
          }
        ];


        const oldImages =
          Array.isArray(item.images)
            ? item.images
            : item.image
              ? [item.image]
              : [];


        for (const img of oldImages) {

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


        contents.push({
          role,
          parts
        });

      }

    }


    /* =====================
       CURRENT MESSAGE
    ===================== */

    const currentParts = [];


    if (message) {

      currentParts.push({
        text: String(message)
      });

    }


    let imageList =
      Array.isArray(images)
        ? [...images]
        : [];


    if (
      image &&
      typeof image === "string" &&
      !imageList.includes(image)
    ) {

      imageList.push(image);

    }


    for (const img of imageList) {

      if (typeof img !== "string") {
        continue;
      }


      const match = img.match(
        /^data:(image\/[^;]+);base64,(.+)$/
      );


      if (!match) {
        continue;
      }


      currentParts.push({
        inline_data: {
          mime_type: match[1],
          data: match[2]
        }
      });

    }


    if (!currentParts.length) {

      currentParts.push({
        text:
          "Please respond to the user's request."
      });

    }


    contents.push({
      role: "user",
      parts: currentParts
    });


    /* =====================
       GEMINI REQUEST
    ===================== */

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(GEMINI_MODEL) +
      ":generateContent";


    const response = await fetch(
      url,
      {
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
      }
    );


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


    for (
      const candidate
      of data?.candidates || []
    ) {

      for (
        const part
        of candidate?.content?.parts || []
      ) {

        if (
          typeof part?.text === "string"
        ) {

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


/* =========================
   FRONTEND
========================= */

app.get("*", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );

});


/* =========================
   START
========================= */

app.listen(
  PORT,
  () => {

    console.log(
      `NA MUSAMMAN AI GLOBAL running on port ${PORT}`
    );

  }
);
```
