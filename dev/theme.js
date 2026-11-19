// Dev-only: load the app's fonts and theme files, and apply ?theme=light|charcoal|pine to the harness root.
import "@fontsource-variable/geist";
import "../src/tailwind.css";
import "../src/styles.css";
import "../src/clinic-appearance.css";
import "../src/clinic-theme.css";
import "../src/clinic-brand.css";
const theme = new URLSearchParams(location.search).get("theme") || "light";
const root = document.getElementById("root");
root.className = `app-stage${theme === "light" ? "" : " dark-theme"}`;
root.dataset.clinicTheme = theme;
document.body.style.margin = "0";
document.body.style.background = "var(--app)";
