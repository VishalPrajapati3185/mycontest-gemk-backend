const express = require("express");
const admin = require("firebase-admin");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Firebase Admin connection
if (!admin.apps.length) {
  const serviceAccountJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(serviceAccountJson)
      )
    });
  }
}

const db = admin.apps.length
  ? admin.firestore()
  : null;

// Health check
app.get("/", (req, res) => {
  res.status(200).send("MyContest GemK Backend is running");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "MyContest GemK Backend",
    firebase: Boolean(db)
  });
});

// GemK callback endpoint
app.all("/gemk/callback", async (req, res) => {
  try {
    if (!db) {
      return res.status(503).send("Firebase not configured");
    }

    // GemK callback verification and reward
    // processing will be added after confirming
    // GemK's official callback parameters.

    return res.status(501).json({
      success: false,
      message: "GemK callback verification is pending"
    });

  } catch (error) {
    console.error("GemK callback error:", error.message);

    return res.status(500).send("Server error");
  }
});

app.listen(PORT, () => {
  console.log(`GemK Backend running on port ${PORT}`);
});
