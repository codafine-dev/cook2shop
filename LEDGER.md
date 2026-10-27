# 🎯 SUBJECT: cook2shop (PanierRecette)
*Last updated: 2026-10-27*



## 1. 🚀 ACTIVE PRIORITY (The Single Focus)
> **Rule:** If it's not written here, it doesn't exist for the next 4 working days.

**Cycle objective:** [Not set yet]  
**Estimated duration:** —  
**Cycle dates:** —

**Next action (Atomic Task):**  
- [ ] On the old phone, open cook2shop.vercel.app → « Envoyer mes recettes » → email to self; on the new phone, import the attachment or the pasted text

---

## 2. 📊 CURRENT STATE (Context-Saver)
*So you never have to wonder "Where was I?" after a break.*

| Component | Status | Technical Note |
| :--- | :--- | :--- |
| **What's working** | ✅ | Live at https://cook2shop.vercel.app (Vercel). Recipes stored in the browser (`localStorage` key `c2s_recipes`). Export/import between phones is live |
| **What's blocking** | ❌ | Nothing. Export share sheet not yet tried on a real phone |
| **Last action** | 🏁 | 2026-10-27 — Export/import + source link shipped (`51009d3`), deploy checked live |

---

## 3. 🧠 THE 4 PILLARS (Raw Storage)

### 📌 DECISIONS (The "Why")
*List of strategic or technical choices not to revisit.*

- **2026-10-27** — Moving recipes between phones stays local-first: a manual export/import through email, not accounts or server sync. It fits the zero-backend design and needs no login.
- **2026-10-27** — The export email carries the full JSON twice: in the message body (to copy and paste) and as an attachment (to import as a file). Lin wanted both options.

### 🧩 LEARNINGS (The "How")
*Links, snippets, concepts to keep.*

- **2026-10-27** — Recipes live only in the phone's browser, so a new phone starts empty. Each recipe already saves its source link as `sourceUrl` (`app.js`, `importJSON`), which can also be pasted recipe text.
- **2026-10-27** — `/api/log` writes every `ai_imported` event with the full recipe JSON and its URL to MongoDB (`cook2shop.logs`). This is a recovery path if a phone is lost, but rows have no user id and later edits (ticks, servings) are not logged.
- **2026-10-27** — A web page cannot attach files through `mailto:`. The Web Share API can (`navigator.share({files, text})`). Android Chrome refuses to share `.json` files, so the export falls back to a `.txt` file with the same content. Desktop browsers mostly can't share files, so they download it and copy the text.

### 🛠️ IMPLEMENTATION (The "What")
*Dev notes, code snippets, architecture.*

- **2026-10-27** — « Changer de téléphone » section (`index.html`, `app.js`): `exportRecipes()` shares `{app, version, exported_at, recipes}` as the mail text and an attachment; `importBackup()` reads a file or pasted mail text (takes the JSON between the first `{`/`[` and the last `}`/`]`), merges by `id`, skips duplicates. Logs `backup_exported` / `backup_imported` with counts only. Commit `51009d3`.
- **2026-10-27** — Recipe card « Fiche » shows « Recette d'origine » as a link (hostname) when `sourceUrl` starts with http(s). Commit `51009d3`.

### 💡 FUTURE IDEAS (Parking Lot)
*Anything interesting but off-limits for this cycle.*

- [ ] **2026-10-27** — Automatic sync with a shared "sync code" on the existing MongoDB: two phones enter the same code and share one recipe list. Needs new API routes and a privacy decision.
- [ ] **2026-10-27** — Script to rebuild a backup JSON from the `ai_imported` rows in MongoDB, in the same format as the export, for a lost phone (needs `MONGODB_URI`).

---

## 4. 📝 LOGBOOK
*Format: Date - Action - Energy - Blocker.*

- **2026-10-27**: Added export by email (JSON in body + attachment) and import by file or pasted text, plus the source link on each recipe; deployed — Energy: 🔋🔋🔋/5 — Blocker: No

---

## 5. 🔄 CYCLE HISTORY
*To build on and learn from.*

*(No closed cycle yet.)*

---

## 📋 META (Instructions for the AI)
*How to maintain this document.*

**When to update:**
- After each session
- When a new idea comes up (→ Parking Lot)
- At the end of a cycle (→ Archives)

**AI rules:**
1. Never delete archives
2. Always keep dates
3. No new sections (4 pillars = maximum)
4. Respect the table and list format
