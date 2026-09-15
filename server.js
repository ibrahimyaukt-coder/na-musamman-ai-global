const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.6-flash";

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(
  express.static(path.join(__dirname, "public"))
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
   GEMINI
========================= */

async function callGemini(message, images, history) {

  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured on Render."
    );
  }

  const contents = [];

  /* Previous conversation */

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

      /* Previous images */

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

      if (parts.length) {

        contents.push({
          role: role,
          parts: parts
        });

      }
    }
  }


  /* Current message */

  const currentParts = [];

  if (message) {

    currentParts.push({
      text: String(message)
    });

  }


  /* Current images */

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


  if (!currentParts.length) {

    throw new Error(
      "Please enter a message or upload an image."
    );

  }


  contents.push({
    role: "user",
    parts: currentParts
  });


  /* System instruction */

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


  const requestBody = {

    systemInstruction: systemInstruction,

    contents: contents,

    generationConfig: {

      temperature: 0.7,

      maxOutputTokens: 2048

    }

  };


  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(GEMINI_MODEL) +
    ":generateContent";


  console.log(
    "Sending request to Gemini:",
    GEMINI_MODEL
  );


  /*
     FAST REQUEST
     No long retry / no artificial delay
  */

  const controller = new AbortController();

  const timeout = setTimeout(function () {
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

    if (error.name === "AbortError") {

      throw new Error(
        "Gemini is taking too long to respond. Please try again."
      );

    }

    throw error;

  } finally {

    clearTimeout(timeout);

  }


  const rawText = await response.text();

  console.log(
    "Gemini HTTP status:",
    response.status
  );


  /* Gemini error */

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


    /*
       Make high-demand message shorter
    */

    const lower =
      errorMessage.toLowerCase();


    if (
      lower.includes("high demand") ||
      lower.includes("overloaded") ||
      lower.includes("temporarily unavailable")
    ) {

      throw new Error(
        "Gemini is temporarily busy. Please try again."
      );

    }


    throw new Error(errorMessage);

  }


  if (!rawText) {

    throw new Error(
      "Gemini returned an empty response."
    );

  }


  let data;

  try {

    data = JSON.parse(rawText);

  } catch (error) {

    console.error(
      "Invalid Gemini JSON:",
      rawText
    );

    throw new Error(
      "Gemini returned an invalid response."
    );

  }


  /* Extract answer */

  let answer = "";


  if (
    data &&
    Array.isArray(data.candidates)
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
          typeof part.text === "string"
        ) {

          answer += part.text;

        }

      }

    }

  }


  answer = answer.trim();


  if (!answer) {

    let reason =
      "Gemini returned no text.";


    if (
      data &&
      Array.isArray(data.candidates) &&
      data.candidates[0] &&
      data.candidates[0].finishReason
    ) {

      reason +=
        " Finish reason: " +
        data.candidates[0].finishReason;

    }


    throw new Error(reason);

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


      const message =
        typeof body.message === "string"
          ? body.message.trim()
          : "";


      let images = [];


      if (Array.isArray(body.images)) {

        images =
          body.images.filter(
            function (image) {

              return (
                typeof image === "string" &&
                image.startsWith("data:image/")
              );

            }
          );

      }


      /* Old frontend support */

      if (
        !images.length &&
        typeof body.image === "string" &&
        body.image.startsWith("data:image/")
      ) {

        images = [body.image];

      }


      const history =
        Array.isArray(body.history)
          ? body.history
          : [];


      console.log(
        "Chat request:",
        {
          hasMessage: Boolean(message),
          imageCount: images.length,
          historyCount: history.length
        }
      );


      if (!message && !images.length) {

        return res.status(400).json({

          ok: false,

          error:
            "Please enter a message or upload an image."

        });

      }


      const answer =
        await callGemini(
          message,
          images,
          history
        );


      return res.status(200).json({

        ok: true,

        answer: answer

      });


    } catch (error) {

      console.error(
        "CHAT API ERROR:",
        error
      );


      return res.status(500).json({

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
   FRONTEND
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
   START
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
      Boolean(GEMINI_API_KEY)
    );

  }
);
