export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

// UID Firebase Auth whitelistés (Jean-Didier + pote Botsty78)
export const ADMIN_UIDS = [
  "EJFPIvxkW3ZFifiwYPINg3uixRr1", // Jean-Didier
  "FMubOvLPieNplbiSv07s1Tvf63X2", // pote (droogz)
];

// Projet Firebase principal de l'overlay (scenes, state, weapons)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDRwbfhM7zzQWH9md8DzwbtRsEe1G4Lh30",
  authDomain: "posty78-overlay.firebaseapp.com",
  projectId: "posty78-overlay",
  storageBucket: "posty78-overlay.firebasestorage.app",
  messagingSenderId: "815738211609",
  appId: "1:815738211609:web:833120a585f5d9e5a5c988",
};

// Projet Firebase existant posty78-maps, lu en cross-projet (batterie/temp/position)
export const POSTY_MAPS_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAMpcR8oV6kCDPHwoPiCZky8JriA9TiRuc",
  authDomain: "posty78-maps.firebaseapp.com",
  projectId: "posty78-maps",
  storageBucket: "posty78-maps.firebasestorage.app",
  messagingSenderId: "264681377127",
  appId: "1:264681377127:web:59cc8c638a03c0ef9cb3c2",
  databaseURL: "https://posty78-maps-default-rtdb.europe-west1.firebasedatabase.app",
};

// Chemins RTDB pour batterie/température par appareil.
// "tracking" = chemin réel déjà utilisé par PostyMonitor (vérifié en direct sur la base).
// "stream" = n'existe pas encore (PostyMonitor ne tourne que sur le tel tracking pour
// l'instant) ; à créer quand un 2e appareil écrira ses propres stats.
export const DEVICE_RTDB_PATHS = {
  tracking: "battery_status",
  stream: "battery_status_stream",
};

// Doc Firestore posty78-maps où la nouvelle APK de tracking écrit la position live.
export const TRACKING_POSITION_DOC = { collection: "tracking", document: "live" };

// TODO: clé API Google Maps JS (Google Cloud Console > APIs & Services > Identifiants),
// à restreindre à "Maps JavaScript API" + referrer overlay.posty78.fr
export const GOOGLE_MAPS_API_KEY = "";

// Base URL des Cloud Functions posty78-overlay (région europe-west1)
export const FUNCTIONS_BASE_URL = "https://europe-west1-posty78-overlay.cloudfunctions.net";
