import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { mapsDb } from "../firebase-init.js?v=1";
import { GOOGLE_MAPS_API_KEY, TRACKING_POSITION_DOC } from "../config.js?v=1";

let apiLoadPromise = null;

// Charge l'API Google Maps JS une seule fois pour toute la durée du stream
// (la source OBS ne recharge jamais la page -> un seul "load" facturé sur 365 jours).
function loadGoogleMapsApi() {
  if (apiLoadPromise) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve, reject) => {
    if (!GOOGLE_MAPS_API_KEY) {
      reject(new Error("GOOGLE_MAPS_API_KEY manquante dans config.js"));
      return;
    }
    window.__onGoogleMapsLoaded = () => resolve(window.google);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=__onGoogleMapsLoaded`;
    script.async = true;
    script.onerror = () => reject(new Error("Echec chargement Google Maps JS API"));
    document.head.appendChild(script);
  });
  return apiLoadPromise;
}

export function create() {
  const el = document.createElement("div");
  el.className = "hud-minimap";
  const mapDiv = document.createElement("div");
  mapDiv.className = "hud-minimap__map";
  el.appendChild(mapDiv);

  let map = null;
  let marker = null;

  loadGoogleMapsApi()
    .then((google) => {
      map = new google.maps.Map(mapDiv, {
        center: { lat: 46.6034, lng: 1.8883 },
        zoom: 14,
        disableDefaultUI: true,
        gestureHandling: "none",
        keyboardShortcuts: false,
        clickableIcons: false,
      });
      // Point bleu "position actuelle" (comme le standard Google Maps/GPS live),
      // pas le pin rouge par défaut qui sert normalement à repérer un lieu fixe.
      marker = new google.maps.Marker({
        map,
        position: map.getCenter(),
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#4285f4",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });

      const ref = doc(mapsDb, TRACKING_POSITION_DOC.collection, TRACKING_POSITION_DOC.document);
      onSnapshot(ref, (snapshot) => {
        const data = snapshot.data();
        if (!data || typeof data.lat !== "number" || typeof data.lng !== "number") return;
        const pos = { lat: data.lat, lng: data.lng };
        marker.setPosition(pos);
        map.panTo(pos);
      }, (err) => console.warn("[minimap] lecture position impossible:", err.message));
    })
    .catch((err) => console.warn("[minimap]", err.message));

  return el;
}
