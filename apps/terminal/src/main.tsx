import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { loadBranding } from "./branding";
import "./styles/index.css";

loadBranding().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
