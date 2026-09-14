```javascript
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.5-flash-lite";

const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ||
  "gemini-3.1-flash-image";


/* =========================
   APP
========================= */

app.use(
  express.json({
    limit: "50mb"
  })
);

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
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

When images are provided:

- Examine all provided images carefully.
- Answer questions about them.
- Compare them when requested.
- Follow the user's written instructions.
- Be concise when the user asks for a short answer.

Do not claim to have performed an action that you cannot perform.
`;


/* =========================
   STATUS
========================= */

app.get(
  "/api/status",
  (_req, res) => {

    res.json({

      ok: true,

      app:
        "NA MUSAMMAN AI GLOBAL",

      configured:
        Boolean(
          GEMINI_API_KEY
        ),

      chatModel:
        GEMINI_MODEL,

      imageModel:
        IMAGE_MODEL

    });

  }
);


/* =========================
   CHAT
========================= */

app.post(
  "/api/chat",
  async (req, res) => {

    try {

      if (!GEMINI_API_KEY) {

        return res
          .status(500)
          .json({
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

      if (
        Array.isArray(history)
      ) {

        for (
          const item
          of history.slice(-12)
        ) {

          if (
            !item ||
            !item.role ||
            !item.content
          ) {
            continue;
          }


          const role =
            item.role ===
            "assistant"
              ? "model"
              : "user";


          const parts = [

            {
              text:
                String(
                  item.content
                )
            }

          ];


          const oldImages =
            Array.isArray(
              item.images
            )
              ? item.images
              : (
                  item.image
                    ? [item.image]
                    : []
                );


          for (
            const img
            of oldImages
          ) {

            if (
              typeof img !==
              "string"
            ) {
              continue;
            }


            const match =
              img.match(
                /^data:(image\/[^;]+);base64,(.+)$/
              );


            if (match) {

              parts.push({

                inline_data: {

                  mime_type:
                    match[1],

                  data:
                    match[2]

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

          text:
            String(message)

        });

      }


      let imageList =
        Array.isArray(images)
          ? [...images]
          : [];


      if (
        image &&
        typeof image ===
          "string"
      ) {

        if (
          !imageList.includes(
            image
          )
        ) {

          imageList.push(
            image
          );

        }

      }


      for (
        const img
        of imageList
      ) {

        if (
          typeof img !==
          "string"
        ) {
          continue;
        }


        const match =
          img.match(
            /^data:(image\/[^;]+);base64,(.+)$/
          );


        if (!match) {
          continue;
        }


        currentParts.push({

          inline_data: {

            mime_type:
              match[1],

            data:
              match[2]

          }

        });

      }


      if (
        !currentParts.length
      ) {

        currentParts.push({

          text:
            "Please respond to the user's request."

        });

      }


      contents.push({

        role:
          "user",

        parts:
          currentParts

      });


      /* =====================
         GEMINI CHAT
      ===================== */

      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          GEMINI_MODEL
        )}:generateContent`;


      const response =
        await fetch(
          url,
          {

            method:
              "POST",

            headers: {

              "Content-Type":
                "application/json",

              "x-goog-api-key":
                GEMINI_API_KEY

            },

            body:
              JSON.stringify({

                system_instruction: {

                  parts: [

                    {
                      text:
                        SYSTEM_PROMPT
                    }

                  ]

                },

                contents,

                generationConfig: {

                  temperature:
                    0.7,

                  maxOutputTokens:
                    4096

                }

              })

          }
        );


      const data =
        await response.json();


      if (
        !response.ok
      ) {

        console.error(
          "Gemini chat error:",
          JSON.stringify(
            data
          )
        );


        return res
          .status(
            response.status
          )
          .json({

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
          of candidate?.content
            ?.parts || []
        ) {

          if (
            typeof part?.text ===
            "string"
          ) {

            answer +=
              part.text;

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
        "Chat server error:",
        error
      );


      res
        .status(500)
        .json({

          error:
            error?.message ||
            "Internal server error."

        });

    }

  }
);


/* =========================
   ACTUAL IMAGE EDITING
========================= */

app.post(
  "/api/edit-image",
  async (req, res) => {

    try {

      if (!GEMINI_API_KEY) {

        return res
          .status(500)
          .json({

            error:
              "Gemini API key is not configured on the server."

          });

      }


      const {

        prompt = "",

        images = [],

        image = null

      } = req.body || {};


      /* =====================
         VALIDATE PROMPT
      ===================== */

      if (
        !prompt ||
        !String(prompt).trim()
      ) {

        return res
          .status(400)
          .json({

            error:
              "Please enter what you want to change in the image."

          });

      }


      /* =====================
         IMAGE LIST
      ===================== */

      let imageList =
        Array.isArray(images)
          ? [...images]
          : [];


      if (
        image &&
        typeof image ===
          "string"
      ) {

        if (
          !imageList.includes(
            image
          )
        ) {

          imageList.push(
            image
          );

        }

      }


      if (
        imageList.length === 0
      ) {

        return res
          .status(400)
          .json({

            error:
              "Please upload at least one image."

          });

      }


      /* =====================
         CONTENTS
      ===================== */

      const parts = [

        {
          text:
            String(prompt).trim()
        }

      ];


      for (
        const img
        of imageList
      ) {

        if (
          typeof img !==
          "string"
        ) {
          continue;
        }


        const match =
          img.match(
            /^data:(image\/[^;]+);base64,(.+)$/
          );


        if (!match) {
          continue;
        }


        parts.push({

          inline_data: {

            mime_type:
              match[1],

            data:
              match[2]

          }

        });

      }


      /* =====================
         IMAGE GENERATION API
      ===================== */

      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          IMAGE_MODEL
        )}:generateContent`;


      const response =
        await fetch(
          url,
          {

            method:
              "POST",

            headers: {

              "Content-Type":
                "application/json",

              "x-goog-api-key":
                GEMINI_API_KEY

            },

            body:
              JSON.stringify({

                contents: [

                  {
                    role:
                      "user",

                    parts
                  }

                ],

                generationConfig: {

                  responseModalities: [
                    "TEXT",
                    "IMAGE"
                  ],

                  responseFormat: {

                    image: {

                      aspectRatio:
                        "1:1",

                      imageSize:
                        "1K"

                    }

                  }

                }

              })

          }
        );


      const data =
        await response.json();


      /* =====================
         API ERROR
      ===================== */

      if (
        !response.ok
      ) {

        console.error(
          "Gemini image error:",
          JSON.stringify(
            data
          )
        );


        return res
          .status(
            response.status
          )
          .json({

            error:
              data?.error?.message ||
              "Image editing failed."

          });

      }


      /* =====================
         EXTRACT RESULT
      ===================== */

      let generatedImage =
        null;

      let generatedText =
        "";


      const candidates =
        data?.candidates || [];


      for (
        const candidate
        of candidates
      ) {

        const responseParts =
          candidate?.content
            ?.parts || [];


        for (
          const part
          of responseParts
        ) {

          if (
            typeof part?.text ===
            "string"
          ) {

            generatedText +=
              part.text;

          }


          if (
            part?.inlineData?.data
          ) {

            const mimeType =
              part.inlineData.mimeType ||
              "image/png";


            generatedImage =
              `data:${mimeType};base64,${part.inlineData.data}`;

          }

        }

      }


      /* =====================
         NO IMAGE
      ===================== */

      if (!generatedImage) {

        return res
          .status(500)
          .json({

            error:
              generatedText ||
              "The image model did not return an edited image."

          });

      }


      /* =====================
         RETURN IMAGE
      ===================== */

      res.json({

        ok: true,

        image:
          generatedImage,

        text:
          generatedText.trim()

      });


    } catch (error) {

      console.error(
        "Image editing server error:",
        error
      );


      res
        .status(500)
        .json({

          error:
            error?.message ||
            "Internal image editing error."

        });

    }

  }
);


/* =========================
   FRONTEND FALLBACK
========================= */

app.get(
  "*",
  (_req, res) => {

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
  () => {

    console.log(
      `NA MUSAMMAN AI GLOBAL running on port ${PORT}`
    );

  }
);
```
