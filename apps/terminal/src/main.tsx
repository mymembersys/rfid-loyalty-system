import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { loadBranding } from "./branding";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Branding fetches in the background — useBranding subscribers re-render once it lands.
// Defaults render immediately, so a cold-start API doesn't show a white screen.
loadBranding();
