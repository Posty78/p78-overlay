const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

// Comparaison en temps constant (pas de court-circuit au 1er caractere
// different) - une comparaison "!==" classique laisse fuir, via le temps de
// reponse, le nombre de caracteres corrects, ce qui permettrait en theorie de
// deviner un secret petit a petit.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // meme cout que le cas egal, pour ne pas fuir la longueur non plus
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

admin.initializeApp();
const db = admin.firestore();

const COMMAND_SECRET = defineSecret("COMMAND_SECRET");
const WEATHER_API_KEY = defineSecret("WEATHER_API_KEY");
// Secret partage avec les Cloud Functions posty78-maps (submitSpeed/updateFuel) -
// distinct de COMMAND_SECRET, cote serveur-a-serveur uniquement (jamais transmis a Botsty78).
const VEHICLE_SECRET = defineSecret("VEHICLE_SECRET");
const VEHICLE_FUNCTIONS_BASE_URL = "https://europe-west1-posty78-maps.cloudfunctions.net";

// UID Firebase Auth whitelistés (Jean-Didier + pote Botsty78)
const ADMIN_UIDS = [
  "EJFPIvxkW3ZFifiwYPINg3uixRr1",
  "FMubOvLPieNplbiSv07s1Tvf63X2",
];

const STARS_MAX = 6;

// Limiteur de debit simple (memoire du process, par IP) - reduit fortement
// l'abus "un script qui boucle" sur les fonctions publiques sans auth
// (weatherProxy, widgetProxy). Pas une protection absolue (n'importe qui avec
// beaucoup d'IP differentes peut contourner un compteur en memoire), mais
// combine a maxInstances ci-dessous, ca borne le pire cas. Le vrai plafond
// dur reste le budget de facturation Google Cloud (voir doc separee).
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map();

function isRateLimited(key, maxPerWindow) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > maxPerWindow;
}

// Appelée par Botsty78 (ou tout autre bot chat plus tard) sur chaque commande !argent / !etoile / !<arme>.
// Protégée par une clé secrète fixe (COMMAND_SECRET) connue uniquement du bot.
exports.commandWebhook = onRequest(
  { region: "europe-west1", secrets: [COMMAND_SECRET, VEHICLE_SECRET], cors: true, maxInstances: 10 },
  async (req, res) => {
    const providedSecret = req.get("x-overlay-secret") || req.query.key;
    if (!safeEqual(providedSecret, COMMAND_SECRET.value())) {
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

      // Masque de censure plein écran (!censureon / !censureoff) - doc separe de
      // "state/gta" expres, pour ne jamais etre touche par resetState (qui ne
      // reinitialise que argent/etoiles/arme).
      if (command === "censureon" || command === "censureoff") {
        await db.collection("state").doc("censure").set(
          {
            visible: command === "censureon",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        res.json({ ok: true, command });
        return;
      }

      // Masquage cible (mini map + météo) et masquage global (tout le stage) -
      // doc separe encore une fois, independant de censure/gta/resetState. Les
      // deux drapeaux sont volontairement independants l'un de l'autre (voir
      // mapsHidden vs allHidden cote overlay) : !overlayon ne leve QUE son
      // propre masquage, jamais celui pose par !mapsoff.
      if (command === "mapson" || command === "mapsoff") {
        await db.collection("state").doc("widgets").set(
          {
            mapsHidden: command === "mapsoff",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        res.json({ ok: true, command });
        return;
      }

      if (command === "overlayon" || command === "overlayoff") {
        await db.collection("state").doc("widgets").set(
          {
            allHidden: command === "overlayoff",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        res.json({ ok: true, command });
        return;
      }

      // Widget de supervision reseau Peplink (!regis, moderateurs uniquement,
      // filtre cote bot Botsty78, meme principe que !censureon). On pose juste
      // un horodatage ici : c'est le widget cote overlay (peplink.js) qui va
      // chercher les donnees fraiches lui-meme via la Cloud Function peplinkStatus.
      if (command === "regis") {
        await db.collection("state").doc("peplink").set(
          { triggeredAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
        res.json({ ok: true, command });
        return;
      }

      // Jauge essence de la 206 (!jauge = valeur exacte en %, !essence = ajout de litres).
      // La vitesse/l'essence vivent cote posty78-maps (meme projet que la position GPS
      // et le calcul de distance parcourue dont l'essence a besoin) - on relaie donc
      // l'appel vers la Cloud Function updateFuel de ce projet, avec un secret dedie.
      if (command === "jauge" || command === "essence") {
        const mode = command === "jauge" ? "set" : "add";
        const body = mode === "set" ? { mode, value: args } : { mode, liters: args };

        try {
          const upstream = await fetch(`${VEHICLE_FUNCTIONS_BASE_URL}/updateFuel`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-vehicle-secret": VEHICLE_SECRET.value(),
            },
            body: JSON.stringify(body),
          });
          const data = await upstream.json();
          if (!upstream.ok || !data.ok) {
            res.status(upstream.status || 500).json({ ok: false, error: data.error || "echec mise a jour essence" });
            return;
          }
          res.json({ ok: true, command, fuelPercent: data.fuelPercent });
        } catch (err) {
          res.status(502).json({ ok: false, error: err.message });
        }
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
const ALLOWED_PROXY_HOSTS = ["posty78.fr", "regis.posty78.fr"];

// Sert un widget externe qui bloque son intégration en iframe (X-Frame-Options/CSP) sans
// toucher au serveur source : récupère la page côté serveur, ne retransmet pas ces en-têtes,
// et absolutise les chemins relatifs + le endpoint socket.io pour que le widget reste
// pleinement fonctionnel (connexion temps réel branchée directement sur le vrai serveur).
exports.widgetProxy = onRequest({ region: "europe-west1", cors: true, maxInstances: 10 }, async (req, res) => {
  if (isRateLimited(`widget:${req.ip}`, 60)) {
    res.status(429).send("trop de requetes, reessaie dans une minute");
    return;
  }

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
  // maxInstances borne le pire cas (nombre d'executions paralleles, donc
  // d'appels payants Google simultanes) meme si le rate-limit par IP est
  // contourne par un attaquant avec plusieurs IP.
  { region: "europe-west1", secrets: [WEATHER_API_KEY], cors: true, maxInstances: 5 },
  async (req, res) => {
    if (isRateLimited(`weather:${req.ip}`, 20)) {
      res.status(429).json({ ok: false, error: "trop de requetes, reessaie dans une minute" });
      return;
    }

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

// ---------------------------------------------------------------------------
// PROJET "REGIS" (supervision reseau) : plus de Cloud Function ici.
// ---------------------------------------------------------------------------
// L'API cloud InControl2 (peplinkStatus, retiree) ne pouvait pas donner de vrai
// Mbps par ligne (verifie en conditions reelles - limite documentee du cote
// Peplink). La supervision reseau passe maintenant par l'APK PostyMonitor, qui
// scrape en local (Peplink ou wifi generique selon detection) et pousse les
// resultats directement dans Firestore (state/peplink_result) : le widget
// overlay et regis.posty78.fr lisent ce document, sans intermediaire ici.

// Appelée depuis le panel admin (bouton reset). Auth requise : ID token Firebase d'un UID whitelisté.
exports.resetState = onRequest({ region: "europe-west1", cors: true, maxInstances: 5 }, async (req, res) => {
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
