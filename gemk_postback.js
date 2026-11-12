
const express = require("express");
const crypto = require("crypto");
const admin = require("firebase-admin");

const router = express.Router();
const db = admin.firestore();

const gemkRoot = db.collection("offerwall").doc("gemk");

function verifySecret(receivedSecret) {
  const expectedSecret = process.env.GEMK_POSTBACK_SECRET;

  if (!expectedSecret || !receivedSecret) {
    return false;
  }

  const received = Buffer.from(String(receivedSecret));
  const expected = Buffer.from(String(expectedSecret));

  if (received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(received, expected);
}

function getParams(req) {
  return {
    ...req.query,
    ...(req.body || {})
  };
}

router.all("/callback", async (req, res) => {
  try {
    const data = getParams(req);

    const userId = String(data.userid || "").trim();
    const txId = String(
      data.transactionID || data.txid || ""
    ).trim();

    const secret = data.password || data.sig;

    const userAmount = Number(data.user_amount);
    const payout = Number(data.payout);

    const offerName = String(data.offer_name || "GemK Offer");
    const offerId = String(data.offer_id || "");

    // Required fields
    if (
      !userId ||
      !txId ||
      !Number.isFinite(userAmount) ||
      !Number.isFinite(payout) ||
      userAmount === 0 ||
      txId.includes("/")
    ) {
      return res.status(400).send("Missing or invalid fields");
    }

    // Verify GemK secret
    if (!verifySecret(secret)) {
      return res.status(403).send("Invalid secret");
    }

    // User reward: 50% of GemK user_amount
    const userPoints = userAmount * 0.50;

    // Platform revenue: 50% of GemK payout (USD)
    const platformRevenue = payout * 0.50;

    const userRef = gemkRoot
      .collection("users")
      .doc(userId);

    const transactionRef = gemkRoot
      .collection("transactions")
      .doc(txId);

    const reversalRef = gemkRoot
      .collection("reversals")
      .doc(txId);

    const revenueRef = gemkRoot
      .collection("revenue")
      .doc("summary");

    const result = await db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const txSnap = await transaction.get(transactionRef);
      const reversalSnap = await transaction.get(reversalRef);
      const revenueSnap = await transaction.get(revenueRef);

      // Positive reward
      if (userAmount > 0 && payout >= 0) {
        if (txSnap.exists) {
          return "duplicate";
        }

        const currentPoints = Number(
          userSnap.exists ? userSnap.get("gemkBalance") || 0 : 0
        );

        const currentRevenue = Number(
          revenueSnap.exists
            ? revenueSnap.get("totalUsd") || 0
            : 0
        );

        transaction.set(userRef, {
          gemkBalance: currentPoints + userPoints,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        transaction.create(transactionRef, {
          userId,
          transactionId: txId,
          offerName,
          offerId,
          userAmount,
          userPoints,
          gemkPayoutUsd: payout,
          platformRevenueUsd: platformRevenue,
          type: "credit",
          status: "completed",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.set(revenueRef, {
          totalUsd: currentRevenue + platformRevenue,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return "credited";
      }

      // Reversal
      if (userAmount < 0 && payout <= 0) {
        if (!txSnap.exists) {
          throw new Error("Original transaction not found");
        }

        if (reversalSnap.exists) {
          return "duplicate";
        }

        const originalUserId = txSnap.get("userId");

        if (originalUserId !== userId) {
          throw new Error("User does not match original transaction");
        }

        const currentPoints = Number(
          userSnap.exists ? userSnap.get("gemkBalance") || 0 : 0
        );

        const currentRevenue = Number(
          revenueSnap.exists
            ? revenueSnap.get("totalUsd") || 0
            : 0
        );

        // Negative userPoints and platformRevenue deduct balances.
        transaction.set(userRef, {
          gemkBalance: currentPoints + userPoints,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        transaction.create(reversalRef, {
          userId,
          transactionId: txId,
          offerName,
          offerId,
          userAmount,
          userPoints,
          gemkPayoutUsd: payout,
          platformRevenueUsd: platformRevenue,
          type: "reversal",
          status: "completed",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.set(revenueRef, {
          totalUsd: currentRevenue + platformRevenue,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return "reversed";
      }

      throw new Error("Invalid reward or reversal values");
    });

    // GemK expects HTTP 200 and body 1
    return res.status(200).send("1");

  } catch (error) {
    console.error("GemK Postback Error:", error.message);

    if (error.message === "Original transaction not found") {
      return res.status(500).send("Original transaction not found");
    }

    if (error.message === "User does not match original transaction") {
      return res.status(400).send("User mismatch");
    }

    return res.status(500).send("Server error");
  }
});

module.exports = router;
