const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const COMMAND_SECRET = defineSecret("COMMAND_SECRET");
const WEATHER_API_KEY = defineSecret("WEATHER_API_KEY");

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

// Domaines autorisés à être proxifiés (évite d'exposer un proxy ouvert exploitable).
const ALLOWED_PROXY_HOSTS = ["posty78.fr"];

// Sert un widget externe qui bloque son intégration en iframe (X-Frame-Options/CSP) sans
// toucher au serveur source : récupère la page côté serveur, ne retransmet pas ces en-têtes,
// et absolutise les chemins relatifs + le endpoint socket.io pour que le widget reste
// pleinement fonctionnel (connexion temps réel branchée directement sur le vrai serveur).
exports.widgetProxy = onRequest({ region: "europe-west1", cors: true }, async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    res.status(400).send("missing url param");
    return;
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    res.status(400).send("invalid url");
    return;
  }

  if (!ALLOWED_PROXY_HOSTS.includes(parsed.hostname)) {
    res.status(403).send("host not allowed");
    return;
  }

  try {
    const upstream = await fetch(targetUrl);
    const contentType = upstream.headers.get("content-type") || "text/html";
    let body = await upstream.text();

    if (contentType.includes("text/html")) {
      const origin = parsed.origin;
      // Absolutise les chemins racine-relatifs (src="/..." href="/...")
      body = body.replace(/(src|href)="\/(?!\/)/g, `$1="${origin}/`);
      // Force le client socket.io à se connecter directement au vrai serveur, pas au proxy
      body = body.replace(/io\(\s*\{/g, `io("${origin}", {`);
      body = body.replace(/io\(\s*\)/g, `io("${origin}")`);

      // Certains widgets détectent leur mode démo via location.search (ex: ?demo=1).
      // À travers le proxy, ce paramètre est caché dans l'URL encodée du "url=" et
      // n'apparaît jamais tel quel dans location.search. On le repasse en paramètre
      // de la requête au proxy (?...&demo=1) et on le réinjecte ici via history.replaceState
      // AVANT le script du widget, pour que location.search corresponde à ce qu'il attend.
      if (req.query.demo) {
        const bootstrap = `<script>history.replaceState(null, "", location.pathname + "?demo=1");</script>`;
        body = body.replace(/<head[^>]*>/i, (m) => `${m}${bootstrap}`);
      }
    }

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "no-store");
    // Volontairement aucun X-Frame-Options / CSP frame-ancestors transmis : c'est tout
    // l'intérêt du proxy, autoriser l'intégration que la source interdit.
    res.status(upstream.status).send(body);
  } catch (err) {
    res.status(502).send("proxy error: " + err.message);
  }
});

// Cache mémoire simple (par instance de fonction chaude) pour éviter de re-facturer
// des appels Geocoding/Weather quand la position n'a quasiment pas bougé entre deux
// appels du widget météo. Clé = position arrondie à ~1km, TTL 10 min.
const weatherCache = new Map();
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;

function extractCity(geocodeResult) {
  for (const result of geocodeResult.results || []) {
    const locality = result.address_components?.find(
      (c) => c.types.includes("locality") || c.types.includes("postal_town")
    );
    if (locality) return locality.long_name;
  }
  return geocodeResult.results?.[0]?.formatted_address?.split(",")[0] || null;
}

// Ville + météo réelles à partir d'une position GPS, pour le petit widget météo de
// l'overlay. Clé Geocoding/Weather gardée côté serveur (pas de restriction par
// referrer possible sur ces APIs, donc jamais exposée au navigateur).
exports.weatherProxy = onRequest(
  { region: "europe-west1", secrets: [WEATHER_API_KEY], cors: true },
  async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      res.status(400).json({ ok: false, error: "lat/lng manquants ou invalides" });
      return;
    }

    const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.at < WEATHER_CACHE_TTL_MS) {
      res.json(cached.data);
      return;
    }

    const key = WEATHER_API_KEY.value();

    try {
      const [geocodeRes, weatherRes] = await Promise.all([
        fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`),
        fetch(`https://weather.googleapis.com/v1/currentConditions:lookup?key=${key}&location.latitude=${lat}&location.longitude=${lng}`),
      ]);

      const geocodeData = await geocodeRes.json();
      const weatherData = await weatherRes.json();

      const data = {
        ok: true,
        city: extractCity(geocodeData),
        tempC: weatherData?.temperature?.degrees ?? null,
      };

      weatherCache.set(cacheKey, { at: Date.now(), data });
      res.json(data);
    } catch (err) {
      res.status(502).json({ ok: false, error: err.message });
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
