const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const COMMAND_SECRET = defineSecret("COMMAND_SECRET");

// UID Firebase Auth whitelistés (Jean-Didier + pote Botsty78)
const ADMIN_UIDS = [
  "EJFPIvxkW3ZFifiwYPINg3uixRr1",
  "FMubOvLPieNplbiSv07s1Tvf63X2",
];

const STARS_MAX = 6;

// Appelée par Botsty78 (ou tout autre bot chat plus tard) sur chaque commande !argent / !etoile / !<arme>.
// Protégée par une clé secrète fixe (COMMAND_SECRET) connue uniquement du bot.
exports.commandWebhook = onRequest(
  { region: "europe-west1", secrets: [COMMAND_SECRET], cors: true },
  async (req, res) => {
    const providedSecret = req.get("x-overlay-secret") || req.query.key;
    if (providedSecret !== COMMAND_SECRET.value()) {
      res.status(403).json({ ok: false, error: "invalid secret" });
      return;
    }

    const payload = req.method === "POST" ? req.body : req.query;
    const command = String(payload?.command || "").toLowerCase().replace(/^!/, "");
    const args = payload?.args;

    if (!command) {
      res.status(400).json({ ok: false, error: "missing command" });
      return;
    }

    const stateRef = db.collection("state").doc("gta");

    try {
      if (command === "argent") {
        const delta = parseInt(args, 10);
        if (Number.isNaN(delta)) {
          res.status(400).json({ ok: false, error: "invalid amount" });
          return;
        }
        await stateRef.set(
          { money: admin.firestore.FieldValue.increment(delta) },
          { merge: true }
        );
        res.json({ ok: true, command, delta });
        return;
      }

      if (command === "etoile") {
        let nextStars;
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(stateRef);
          const current = snap.data()?.stars ?? 0;
          let next;
          const trimmed = String(args ?? "").trim();
          if (trimmed === "+1" || trimmed === "+") next = current + 1;
          else if (trimmed === "-1" || trimmed === "-") next = current - 1;
          else {
            const parsed = parseInt(trimmed, 10);
            next = Number.isNaN(parsed) ? current : parsed;
          }
          nextStars = Math.max(0, Math.min(STARS_MAX, next));
          tx.set(stateRef, { stars: nextStars }, { merge: true });
        });
        res.json({ ok: true, command, stars: nextStars });
        return;
      }

      // Sinon : la commande est un nom d'arme mappé dans la collection "weapons" via le panel admin.
      const weaponSnap = await db.collection("weapons").doc(command).get();
      if (!weaponSnap.exists) {
        res.status(404).json({ ok: false, error: `commande inconnue: ${command}` });
        return;
      }
      await stateRef.set(
        {
          weaponImageUrl: weaponSnap.data().imageUrl,
          weaponUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      res.json({ ok: true, command });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// Appelée depuis le panel admin (bouton reset). Auth requise : ID token Firebase d'un UID whitelisté.
exports.resetState = onRequest({ region: "europe-west1", cors: true }, async (req, res) => {
  const authHeader = req.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ ok: false, error: "missing token" });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (!ADMIN_UIDS.includes(decoded.uid)) {
      res.status(403).json({ ok: false, error: "not an admin" });
      return;
    }

    await db.collection("state").doc("gta").set({
      money: 0,
      stars: 0,
      weaponImageUrl: null,
      weaponUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(401).json({ ok: false, error: "invalid token" });
  }
});
