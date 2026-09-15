const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const RAW_GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

// Remove "models/" if it was accidentally added
const GEMINI_MODEL =
  RAW_GEMINI_MODEL.replace(/^models\//, "");

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve frontend
app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

/* =========================
   STATUS
========================= */

app.get("/api/status", function (req, res) {
  res.json({
    ok: true,
    app: "NA MUSAMMAN AI GLOBAL",
    model: GEMINI_MODEL,
    geminiKeyConfigured: Boolean(GEMINI_API_KEY)
  });
});

/* =========================
   AVAILABLE MODELS
========================= */

app.get("/api/models", async function (req, res) {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is not configured."
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        method: "GET",
        headers: {
          "x-goog-api-key": GEMINI_API_KEY
        }
      }
    );

    const rawText = await response.text();

    console.log(
      "Models HTTP status:",
      response.status
    );

    if (!response.ok) {
      console.error(
        "Models API error:",
        rawText
      );

      return res.status(response.status).json({
        ok: false,
        error: rawText
      });
    }

    let data;

    try {
      data = JSON.parse(rawText);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error:
          "Invalid response from Gemini models API."
      });
    }

    const models =
      (data.models || [])
        .filter(function (model) {
          return (
            Array.isArray(
              model.supportedGenerationMethods
            ) &&
            model.supportedGenerationMethods.includes(
              "generateContent"
            )
          );
        })
        .map(function (model) {
          return {
            name: model.name,
            displayName: model.displayName,
            inputTokenLimit:
              model.inputTokenLimit,
            outputTokenLimit:
              model.outputTokenLimit
          };
        });

    return res.json({
      ok: true,
      currentModel: GEMINI_MODEL,
      models: models
    });

  } catch (error) {
    console.error(
      "MODELS API ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        "Unable to retrieve Gemini models."
    });
  }
});

/* =========================
   GEMINI REQUEST
========================= */

async function callGemini(
  message,
  images,
  history
) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured on Render."
    );
  }

  const contents = [];

  /* =========================
     CONVERSATION HISTORY
  ========================= */

  if (Array.isArray(history)) {
    for (const item of history) {
      if (!item || !item.content) {
        continue;
      }

      const role =
        item.role === "assistant"
          ? "model"
          : "user";

      const parts = [];

      parts.push({
        text: String(item.content)
      });

      // Previous images
      if (Array.isArray(item.images)) {
        for (const image of item.images) {
          if (typeof image !== "string") {
            continue;
          }

          const match = image.match(
            /^data:(image\/[^;]+);base64,(.+)$/
          );

          if (!match) {
            continue;
          }

          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2]
            }
          });
        }
      }

      if (parts.length > 0) {
        contents.push({
          role: role,
          parts: parts
        });
      }
    }
  }

  /* =========================
     CURRENT MESSAGE
  ========================= */

  const currentParts = [];

  if (message) {
    currentParts.push({
      text: String(message)
    });
  }

  /* =========================
     CURRENT IMAGES
  ========================= */

  if (Array.isArray(images)) {
    for (const image of images) {
      if (typeof image !== "string") {
        continue;
      }

      const match = image.match(
        /^data:(image\/[^;]+);base64,(.+)$/
      );

      if (!match) {
        continue;
      }

      currentParts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2]
        }
      });
    }
  }

  if (currentParts.length === 0) {
    throw new Error(
      "Please enter a message or upload an image."
    );
  }

  contents.push({
    role: "user",
    parts: currentParts
  });

  /* =========================
     SYSTEM INSTRUCTION
  ========================= */

  const systemInstruction = {
    parts: [
      {
        text:
          "You are NA MUSAMMAN AI GLOBAL, a helpful AI assistant. " +
          "Answer clearly, accurately and directly. " +
          "The user may communicate in Hausa, English, or other languages. " +
          "If the user writes Hausa, respond in simple, clear Hausa. " +
          "Help with questions, writing, reports, translation, study, " +
          "summaries, image understanding, and general tasks. " +
          "Do not claim to generate or edit an image unless an actual " +
          "image generation or editing tool has performed that action."
      }
    ]
  };

  /* =========================
     REQUEST BODY
  ========================= */

  const requestBody = {
    systemInstruction: systemInstruction,

    contents: contents,

    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    }
  };

  /* =========================
     GEMINI URL
  ========================= */

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(GEMINI_MODEL) +
    ":generateContent";

  console.log(
    "Sending request to Gemini model:",
    GEMINI_MODEL
  );

  /* =========================
     TIMEOUT
  ========================= */

  const controller =
    new AbortController();

  const timeout =
    setTimeout(function () {
      controller.abort();
    }, 30000);

  let response;

  try {
    response = await fetch(
      url,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },

        body: JSON.stringify(requestBody),

        signal: controller.signal
      }
    );

  } catch (error) {

    if (
      error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "Gemini is taking too long to respond. Please try again."
      );
    }

    throw error;

  } finally {
    clearTimeout(timeout);
  }

  /* =========================
     READ RESPONSE
  ========================= */

  const rawText =
    await response.text();

  console.log(
    "Gemini HTTP status:",
    response.status
  );

  /* =========================
     GEMINI ERROR
  ========================= */

  if (!response.ok) {

    console.error(
      "Gemini error:",
      rawText
    );

    let errorMessage =
      "Gemini API request failed.";

    try {

      const errorData =
        JSON.parse(rawText);

      if (
        errorData &&
        errorData.error &&
        errorData.error.message
      ) {
        errorMessage =
          errorData.error.message;
      }

    } catch (error) {

      if (rawText) {
        errorMessage =
          rawText.substring(0, 500);
      }
    }

    const lower =
      errorMessage.toLowerCase();

    /* Model format / model error */

    if (
      lower.includes(
        "unexpected model name format"
      )
    ) {
      throw new Error(
        "Gemini model name is invalid. Current model: " +
        GEMINI_MODEL
      );
    }

    /* High demand */

    if (
      lower.includes(
        "high demand"
      ) ||
      lower.includes(
        "overloaded"
      ) ||
      lower.includes(
        "temporarily unavailable"
      ) ||
      lower.includes(
        "service unavailable"
      )
    ) {
      throw new Error(
        "Gemini is temporarily busy. Please try again."
      );
    }

    /* Quota */

    if (
      lower.includes(
        "quota"
      ) ||
      lower.includes(
        "rate limit"
      ) ||
      lower.includes(
        "resource exhausted"
      )
    ) {
      throw new Error(
        "Gemini usage limit has been reached. Please try again later."
      );
    }

    throw new Error(
      errorMessage
    );
  }

  /* =========================
     EMPTY RESPONSE
  ========================= */

  if (!rawText) {
    throw new Error(
      "Gemini returned an empty response."
    );
  }

  /* =========================
     PARSE JSON
  ========================= */

  let data;

  try {

    data =
      JSON.parse(rawText);

  } catch (error) {

    console.error(
      "Invalid Gemini JSON:",
      rawText
    );

    throw new Error(
      "Gemini returned an invalid response."
    );
  }

  /* =========================
     EXTRACT ANSWER
  ========================= */

  let answer = "";

  if (
    data &&
    Array.isArray(
      data.candidates
    )
  ) {

    for (
      const candidate
      of data.candidates
    ) {

      if (
        !candidate ||
        !candidate.content ||
        !Array.isArray(
          candidate.content.parts
        )
      ) {
        continue;
      }

      for (
        const part
        of candidate.content.parts
      ) {

        if (
          part &&
          typeof part.text ===
            "string"
        ) {
          answer +=
            part.text;
        }
      }
    }
  }

  answer =
    answer.trim();

  /* =========================
     NO ANSWER
  ========================= */

  if (!answer) {

    let reason =
      "Gemini returned no text.";

    if (
      data &&
      Array.isArray(
        data.candidates
      ) &&
      data.candidates[0] &&
      data.candidates[0].finishReason
    ) {

      reason +=
        " Finish reason: " +
        data.candidates[0]
          .finishReason;
    }

    throw new Error(
      reason
    );
  }

  return answer;
}

/* =========================
   CHAT API
========================= */

app.post(
  "/api/chat",
  async function (req, res) {

    try {

      const body =
        req.body || {};

      /* =========================
         MESSAGE
      ========================= */

      const message =
        typeof body.message ===
        "string"
          ? body.message.trim()
          : "";

      /* =========================
         IMAGES
      ========================= */

      let images = [];

      if (
        Array.isArray(
          body.images
        )
      ) {

        images =
          body.images.filter(
            function (image) {

              return (
                typeof image ===
                  "string" &&
                image.startsWith(
                  "data:image/"
                )
              );

            }
          );
      }

      /* Support old single image */

      if (
        !images.length &&
        typeof body.image ===
          "string" &&
        body.image.startsWith(
          "data:image/"
        )
      ) {

        images = [
          body.image
        ];
      }

      /* =========================
         HISTORY
      ========================= */

      const history =
        Array.isArray(
          body.history
        )
          ? body.history
          : [];

      console.log(
        "Chat request:",
        {
          hasMessage:
            Boolean(message),

          imageCount:
            images.length,

          historyCount:
            history.length
        }
      );

      /* =========================
         VALIDATION
      ========================= */

      if (
        !message &&
        !images.length
      ) {

        return res.status(
          400
        ).json({

          ok: false,

          error:
            "Please enter a message or upload an image."

        });
      }

      /* =========================
         CALL GEMINI
      ========================= */

      const answer =
        await callGemini(
          message,
          images,
          history
        );

      /* =========================
         SUCCESS
      ========================= */

      return res.status(
        200
      ).json({

        ok: true,

        answer: answer

      });

    } catch (error) {

      console.error(
        "CHAT API ERROR:",
        error
      );

      return res.status(
        500
      ).json({

        ok: false,

        error:
          error &&
          error.message
            ? error.message
            : "AI server error."

      });
    }
  }
);

/* =========================
   FRONTEND FALLBACK
========================= */

app.get(
  "*",
  function (req, res) {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

/* =========================
   START SERVER
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  function () {

    console.log(
      "NA MUSAMMAN AI GLOBAL running on port " +
      PORT
    );

    console.log(
      "Gemini model:",
      GEMINI_MODEL
    );

    console.log(
      "Gemini API key configured:",
      Boolean(
        GEMINI_API_KEY
      )
    );
  }
);
