# Accu-Z Accounting branding update

This release changes the application presentation from **Rightkey Accounting** to **Accu-Z Accounting** and moves the interface to a red theme. The demo company is now **Accu-Z Accounting Demo**.

## Branding

- Accu-Z logo (wordmark + red Z tile) cut from the supplied artwork: `assets/accuz-horizontal-light.png` (light backgrounds), `assets/accuz-horizontal-dark.png` (sidebar and dark mode, white wordmark), `assets/accuz-icon.png` and `assets/accuz-favicon.png`.
- Accu-Z Accounting name in page titles, onboarding, browser file selectors, backup messages and Indonesian translations.
- New document templates are labelled **Accu-Z Accounting – ...** and the standard layout is labelled **Accu-Z Standard**.
- The demo company embeds the Accu-Z logo for document printing.

## Theme

- Primary accent `#d91c1a` (sampled from the logo), hover/link `#b01512`, soft tint `#fdeceb`.
- Sidebar: deep oxblood `#2b1114`; warm off-white page and surfaces in light mode; matching dark-mode palette.
- New document templates default to a red accent (`#d91c1a`; Classic uses `#3a1114`). Templates already saved in a company file keep their stored accent.
- **Three themes** (Preferences → Appearance): Follow system, Light, Dark and **High contrast** (Kontras tinggi). High contrast uses a pure black background, white text and 2px white borders, a bright red accent with black button text, yellow focus rings and underlined links; text contrast is 10:1 or better.
- Green/red are still used for balance states (good/bad); red negatives use `--bad`, the brand red uses `--sky`.

## Compatibility

- Existing `.sqlite` company files are **not** renamed or rewritten, and templates created earlier keep their names.
- The internal `window.Buku` JS namespace, `meta('app')='Buku'` file-format discriminator, file schema, IndexedDB identity, and legacy `milikirumah` layout key are unchanged.
- Newly downloaded backups are named `accuz-accounting-backup-…` / `accuz-accounting-decrypted-…`.
- Previously created demo files keep their recorded company name unless changed in Company Settings.

## No migration logic changed

Rebranding is a UI/seed-content update only.
