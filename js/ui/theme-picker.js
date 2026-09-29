/**
 * ui/theme-picker.js
 * ------------------------------------------------------------
 * Builds the row of color-swatch buttons and wires each one to
 * toggle the device element's `data-theme` attribute, which
 * drives every themed CSS custom property defined in
 * css/variables.css.
 */

/**
 * @param {HTMLElement} swatchesEl - empty container to populate
 * @param {HTMLElement} deviceEl - the `.device` element carrying `data-theme`
 * @param {{id: string, label: string, swatch: string}[]} themes
 * @param {number} themeSlot - zero-based workspace position
 */
export function initThemePicker(swatchesEl, deviceEl, themes, themeSlot = 0) {
  let storageKey = `coldcard-simulator-theme-${themeSlot}`;
  const savedTheme = localStorage.getItem(storageKey);
  if (themes.some((theme) => theme.id === savedTheme)) {
    deviceEl.dataset.theme = savedTheme;
  }
  const activeTheme = deviceEl.dataset.theme;

  themes.forEach((theme) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch" + (theme.id === activeTheme ? " active" : "");
    btn.style.background = theme.swatch;
    btn.title = theme.label;
    btn.setAttribute("aria-label", `Color theme ${theme.label}`);

    btn.addEventListener("click", () => {
      deviceEl.dataset.theme = theme.id;
      localStorage.setItem(storageKey, theme.id);
      swatchesEl
        .querySelectorAll(".swatch")
        .forEach((s) => s.classList.remove("active"));
      btn.classList.add("active");
    });

    swatchesEl.appendChild(btn);
  });

  return (nextSlot) => {
    const nextStorageKey = `coldcard-simulator-theme-${nextSlot}`;
    if (nextStorageKey === storageKey) return;

    localStorage.setItem(nextStorageKey, deviceEl.dataset.theme);
    localStorage.removeItem(storageKey);
    storageKey = nextStorageKey;
  };
}
