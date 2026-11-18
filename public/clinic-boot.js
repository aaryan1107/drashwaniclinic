try {
  const theme = localStorage.getItem("clinicAppearance");
  if (theme === "light" || theme === "charcoal" || theme === "pine") {
    document.documentElement.dataset.clinicBootTheme = theme;
  }
} catch {
  // The loader follows the system appearance when storage is unavailable.
}
