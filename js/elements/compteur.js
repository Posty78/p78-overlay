import { makeProxyIframe } from "./proxyIframeBase.js?v=1";

const FIXED_URL =
  "https://europe-west1-posty78-overlay.cloudfunctions.net/widgetProxy?url=" +
  encodeURIComponent("https://posty78.fr/widget/compteurs");

export const { create, applyConfig } = makeProxyIframe(FIXED_URL);
