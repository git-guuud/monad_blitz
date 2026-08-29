export const THEME_KEY = "blitz.theme";

/// Injected into <head> and run before first paint. Applying the stored theme
/// from a React effect instead would paint one white frame on every load in
/// dark mode.
export const themeBootScript = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)})||"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;
