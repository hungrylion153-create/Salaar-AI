"use strict";

const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");

dotenv.config({
  path: path.join(__dirname, ".env")
});

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TEXT_MODEL =
  process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

app.disable("x-powered-by");

app.use(express.json({ limit: "15mb" }));

// Serve only the frontend and its assets.
// Do not expose server.js, .env, package files, or node_modules.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use(
  "/assets",
  express.static(path.join(__dirname, "assets"), {
    dotfiles: "deny",
    index: false
  })
);

// Backend status endpoint.
app.get("/api/status", (req, res) => {
  res.json({
    message: "Salaar AI backend is running",
    geminiConfigured: Boolean(ai),
    textModel: TEXT_MODEL,
    imageModel: IMAGE_MODEL
  });
});

// Gemini text chat endpoint.
// Gemini text and image chat endpoint.
app.post("/api/chat", async (req, res) => {
  try {
    if (!ai) {
      return res.status(503).json({
        error: "Gemini API key is missing. Check your .env file."
      });
    }

    const body = req.body || {};
    const message = body.message;
    const image = body.image;

    // Require a text message or an image.
    if (
      (typeof message !== "string" || !message.trim()) &&
      !image
    ) {
      return res.status(400).json({
        error: "Please enter a message or attach an image."
      });
    }

    if (typeof message === "string" && message.length > 20000) {
      return res.status(413).json({
        error: "Your message is too long. Please shorten it."
      });
    }

    // Validate the attached image.
    const imageParts = [];

    if (image !== null && image !== undefined) {
      if (
        typeof image !== "object" ||
        typeof image.base64 !== "string" ||
        typeof image.mimeType !== "string"
      ) {
        return res.status(400).json({
          error: "The attached image data is invalid."
        });
      }

      const allowedImageTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
      ];

      if (!allowedImageTypes.includes(image.mimeType)) {
        return res.status(400).json({
          error: "Please attach a JPEG, PNG, WEBP, or GIF image."
        });
      }

      // Five MB maximum for the decoded image.
      const estimatedBytes = Math.floor(
        image.base64.length * 3 / 4
      );

      if (
        !image.base64 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64) ||
        estimatedBytes > 5 * 1024 * 1024
      ) {
        return res.status(400).json({
          error: "The image is invalid or exceeds the 5 MB limit."
        });
      }

      imageParts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.base64
        }
      });
    }

    // Convert conversation history to Gemini format.
    const history = Array.isArray(body.history)
      ? body.history
          .filter((item) => {
            const content =
              typeof item?.text === "string"
                ? item.text
                : item?.content;

            return (
              item &&
              ["user", "assistant", "model"].includes(item.role) &&
              typeof content === "string" &&
              content.trim()
            );
          })
          .slice(-12)
          .map((item) => {
            const content =
              typeof item.text === "string"
                ? item.text
                : item.content;

            return {
              role:
                item.role === "assistant" || item.role === "model"
                  ? "model"
                  : "user",
              parts: [
                {
                  text: content.slice(0, 12000)
                }
              ]
            };
          })
      : [];

    // Build the current message, including the image if attached.
    const currentParts = [];

    if (typeof message === "string" && message.trim()) {
      currentParts.push({
        text: message.trim()
      });
    }

    currentParts.push(...imageParts);

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,

      contents: [
        ...history,
        {
          role: "user",
          parts: currentParts
        }
      ],

      config: {
        systemInstruction: `You are Salaar AI, an AI assistant built by Yahya Salaar Hassan.

When asked who you are, say:
"Hello, I am Salaar AI, an AI model built by Yahya Salaar Hassan. I am here to help you answer questions, generate content, and solve problems."

Write clean, professional, easy-to-read answers.
Avoid Markdown formatting symbols such as **, ##, and ###.
Use plain headings, numbered lists, and simple bullet points.
Separate paragraphs with blank lines.
Answer questions directly and accurately.

When a user attaches an image, examine the image and answer their question about its visible contents.`
      }
    });

    const reply = response.text;

    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({
        error: "Gemini returned an empty response. Please try again."
      });
    }

    return res.json({ reply });

  } catch (error) {
    console.error("Gemini chat error:", error.message);

    return res.status(500).json({
      error:
        "Chat failed. Check your Gemini API key, model access, internet connection, and API quota."
    });
  }
});

// Gemini image-generation endpoint.
app.post("/api/image", async (req, res) => {
  try {
    if (!ai) {
      return res.status(503).json({
        error: "Gemini API key is missing. Check your .env file."
      });
    }

    const body = req.body || {};
    const prompt = body.prompt;

    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({
        error: "Please describe the image you want to generate."
      });
    }

    if (prompt.length > 5000) {
      return res.status(413).json({
        error: "Your image prompt is too long. Please shorten it."
      });
    }

    const allowedAspectRatios = [
      "1:1",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "9:16",
      "16:9",
      "21:9"
    ];

    const allowedImageSizes = ["1K", "2K", "4K"];

    const aspectRatio = allowedAspectRatios.includes(
      body.aspectRatio
    )
      ? body.aspectRatio
      : "1:1";

    const imageSize = allowedImageSizes.includes(body.imageSize)
      ? body.imageSize
      : "1K";

    // The Google GenAI SDK's image-generation model uses generateContent.
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt.trim()
            }
          ]
        }
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio,
          imageSize
        }
      }
    });

    let imageBase64 = null;
    let mimeType = "image/png";
    let textResponse = "";

    const parts =
      response.candidates &&
      response.candidates[0] &&
      response.candidates[0].content &&
      response.candidates[0].content.parts;

    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (part.text) {
          textResponse += part.text;
        }

        if (part.inlineData && part.inlineData.data) {
          imageBase64 = part.inlineData.data;
          mimeType = part.inlineData.mimeType || "image/png";
        }
      }
    }

    if (!imageBase64) {
      console.error("Gemini did not return image data.");

      return res.status(502).json({
        error:
          "Gemini did not return an image. Check image-model availability and API access."
      });
    }

    return res.json({
      imageBase64,
      mimeType,
      text: textResponse
    });
  } catch (error) {
    console.error("Gemini image-generation error:", error.message);

    return res.status(500).json({
      error:
        "Image generation failed. Check the image model, API access, and usage limits."
    });
  }
});

// Return JSON for unknown API routes.
app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API endpoint not found."
  });
});

// Handle malformed JSON requests.
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({
      error: "Invalid JSON request."
    });
  }

  console.error("Server error:", error.message);

  return res.status(500).json({
    error: "An unexpected server error occurred."
  });
});

// Start the server.
app.listen(PORT, () => {
  console.log("");
  console.log("====================================");
  console.log("         SALAAR AI SERVER");
  console.log("====================================");
  console.log(`Website: http://localhost:${PORT}`);
  console.log(`Gemini configured: ${Boolean(ai)}`);
  console.log(`Text model: ${TEXT_MODEL}`);
  console.log(`Image model: ${IMAGE_MODEL}`);
  console.log("====================================");
  console.log("");
});
