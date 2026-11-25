// Applies the saved light/dark choice before first paint.
try {
  const t = localStorage.getItem("fairsix:theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch { /* storage blocked: follow the system */ }
