import { createRoot } from "react-dom/client";
import "./styles.css";
import "./ui.css";
import App from "./v2/App";
import { DesktopDiag } from "./v2/DesktopDiag";
import "./v2/v2.css";

/** 打包时设 `VITE_DESKTOP_DIAG=1` 会叠加桌面端能力自检面板，用于真机确认。 */
const withDiag = import.meta.env.VITE_DESKTOP_DIAG === "1";

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    {withDiag && <DesktopDiag />}
  </>,
);
