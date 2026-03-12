import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DevStep3Page } from "./pages/DevStep3Page";
import "./index.css";

const normalizedPathname = window.location.pathname.replace(/\/+$/, "") || "/";
const RootComponent = normalizedPathname === "/dev/step3" ? DevStep3Page : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
