import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "../../js/firebase-init.js";
import { ADMIN_UIDS } from "../../js/config.js";

const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const btnLogout = document.getElementById("btn-logout");

export function initAuth(onReady) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      loginError.textContent = "Connexion impossible (email/mot de passe incorrect).";
    }
  });

  btnLogout.addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, (user) => {
    if (user && ADMIN_UIDS.includes(user.uid)) {
      loginScreen.style.display = "none";
      appScreen.classList.add("is-visible");
      onReady(user);
    } else {
      if (user) {
        loginError.textContent = "Ce compte n'a pas les droits admin.";
        signOut(auth);
      }
      loginScreen.style.display = "flex";
      appScreen.classList.remove("is-visible");
    }
  });
}

export function getIdToken() {
  return auth.currentUser?.getIdToken();
}
