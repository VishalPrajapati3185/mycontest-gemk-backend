const express = require("express");
const admin = require("firebase-admin");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccount) {
    throw new Error("Firebase credentials missing");
  }

  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(serviceAccount)
    )
  });
}

app.locals.db = admin.firestore();

app.get("/", (req, res) => {
  res.send("MyContest GemK Backend is running");
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "MyContest GemK Backend",
    firebase: true
  });
});

app.use("/gemk", require("./gemk_postback"));

app.listen(PORT, () => {
  console.log("GemK Backend running on port " + PORT);
});
