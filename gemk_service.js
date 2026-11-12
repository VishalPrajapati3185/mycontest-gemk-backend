
const admin = require("firebase-admin");

const db = admin.firestore();

const gemkRoot = db.collection("offerwall")
  .doc("gemk");

module.exports = {
  gemkRoot,

  async getUser(uid) {
    return gemkRoot.collection("users")
      .doc(uid).get();
  },

  async getTransaction(txid) {
    return gemkRoot.collection("transactions")
      .doc(txid).get();
  }
};
