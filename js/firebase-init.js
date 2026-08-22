import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { FIREBASE_CONFIG, POSTY_MAPS_FIREBASE_CONFIG } from "./config.js?v=1";

const overlayApp = initializeApp(FIREBASE_CONFIG);
const mapsApp = initializeApp(POSTY_MAPS_FIREBASE_CONFIG, "maps");

export const db = getFirestore(overlayApp);
export const auth = getAuth(overlayApp);
export const storage = getStorage(overlayApp);

export const mapsDb = getFirestore(mapsApp);
export const mapsRtdb = getDatabase(mapsApp);
