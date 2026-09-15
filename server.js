const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

app.use(
  express.json({
    limit: "50mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "50mb"
  })
);

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


/* =========================
   BASIC STATUS
========================= */

app.get("/api/status", function (req, res) {

  res.json({
    ok: true,
    app: "NA MUSAMMAN AI GLOBAL",
    model: GEMINI_MODEL,
    geminiKeyConfigured:
      Boolean(GEMINI_API_KEY)
  });

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


  /*
     Add previous conversation
  */

  if (Array.isArray(history)) {

    for (
      const item of history
    ) {

      if (
        !item ||
        !item.content
      ) {
        continue;
      }

      const role =
        item.role === "assistant"
          ? "model"
          : "user";


      const parts = [];


      if (item.content) {

        parts.push({
          text: String(
            item.content
          )
        });

      }


      /*
         Include previous images
         when available.
      */

      if (
        Array.isArray(
          item.images
        )
      ) {

        for (
          const image of item.images
        ) {

          if (
            typeof image !== "string"
          ) {
            continue;
          }


          const match =
            image.match(
              /^data:(image\/[^;]+);base64,(.+)$/
            );


          if (!match) {
            continue;
          }


          parts.push({

            inlineData: {

              mimeType:
                match[1],

              data:
                match[2]

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


  /*
     Current user message
  */

  const currentParts = [];


  if (message) {

    currentParts.push({

      text:
        String(message)

    });

  }


  /*
     Current uploaded images
  */

  if (Array.isArray(images)) {

    for (
      const image of images
    ) {

      if (
        typeof image !== "string"
      ) {
        continue;
      }


      const match =
        image.match(
          /^data:(image\/[^;]+);base64,(.+)$/
        );


      if (!match) {
        continue;
      }


      currentParts.push({

        inlineData: {

          mimeType:
            match[1],

          data:
            match[2]

        }

      });

    }

  }


  /*
     If there is no text and
     no image, stop.
  */

  if (!currentParts.length) {

    throw new Error(
      "Please enter a message or upload an image."
    );

  }


  contents.push({

    role: "user",

    parts:
      currentParts

  });


  const systemInstruction = {

    parts: [

      {

        text:
          "You are NA MUSAMMAN AI GLOBAL, a helpful AI assistant. " +
          "Answer clearly and accurately. " +
          "The user may communicate in Hausa, English, or other languages. " +
          "If the user writes Hausa, respond in simple, clear Hausa. " +
          "Help with questions, writing, reports, translation, study, " +
          "summaries, image understanding, and general tasks. " +
          "Do not claim to have edited an image unless an image generation " +
          "or editing tool actually performed the edit."

      }

    ]

  };


  const requestBody = {

    systemInstruction:
      systemInstruction,

    contents:
      contents,

    generationConfig: {

      temperature:
        0.7,

      maxOutputTokens:
        4096

    }

  };


  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(
      GEMINI_MODEL
    ) +
    ":generateContent";


  console.log(
    "Sending request to Gemini model:",
    GEMINI_MODEL
  );


  const response =
    await fetch(
      url,
      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          "x-goog-api-key":
            GEMINI_API_KEY

        },

        body:
          JSON.stringify(
            requestBody
          )

      }
    );


  const rawText =
    await response.text();


  console.log(
    "Gemini HTTP status:",
    response.status
  );


  if (!response.ok) {

    console.error(
      "Gemini error response:",
      rawText
    );


    let errorMessage =
      "Gemini API request failed.";

    try {

      const errorData =
        JSON.parse(
          rawText
        );

      if (
        errorData &&
        errorData.error &&
        errorData.error.message
      ) {

        errorMessage =
          errorData.error.message;

      }

    } catch (parseError) {

      if (rawText) {

        errorMessage =
          rawText.substring(
            0,
            500
          );

      }

    }


    throw new Error(
      errorMessage
    );

  }


  if (!rawText) {

    throw new Error(
      "Gemini returned an empty response."
    );

  }


  let data;


  try {

    data =
      JSON.parse(
        rawText
      );

  } catch (error) {

    console.error(
      "Gemini returned invalid JSON:",
      rawText
    );

    throw new Error(
      "Gemini returned an invalid response."
    );

  }


  /*
     Extract generated text
  */

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
          typeof part.text === "string"
        ) {

          answer +=
            part.text;

        }

      }

    }

  }


  answer =
    answer.trim();


  if (!answer) {

    /*
       Sometimes Gemini may return
       a blocked/empty candidate.
    */

    let reason =
      "Gemini returned no text.";

    if (
      data &&
      Array.isArray(
        data.candidates
      ) &&
      data.candidates[0]
    ) {

      const candidate =
        data.candidates[0];

      if (
        candidate.finishReason
      ) {

        reason +=
          " Finish reason: " +
          candidate.finishReason;

      }

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


      const message =
        typeof body.message === "string"
          ? body.message.trim()
          : "";


      let images = [];


      if (
        Array.isArray(
          body.images
        )
      ) {

        images =
          body.images.filter(
            function(image) {

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


      /*
         Support old frontend
         that sends "image".
      */

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


      if (
        !message &&
        !images.length
      ) {

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

        answer:
          answer

      });


    } catch (error) {

      console.error(
        "CHAT API ERROR:",
        error
      );


      /*
         Always return JSON.
         This prevents the frontend
         from getting an empty response.
      */

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
