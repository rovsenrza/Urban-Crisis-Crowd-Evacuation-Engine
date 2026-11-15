import "@fontsource-variable/albert-sans";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./design/base.css";
import { getLocale, subscribe, t } from "./i18n";

// The document's language and title follow the UI language. This is web-only
// glue, so it lives here and not in the i18n module.
function applyLocale(): void {
  document.documentElement.lang = getLocale();
  document.title = t("app.title");
}
applyLocale();
subscribe(applyLocale);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
