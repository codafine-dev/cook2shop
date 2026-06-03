# panier-recette

A lean, AI-powered PWA that transforms messy recipe URLs into structured, actionable shopping lists and cooking guides.

## 🎯 The Concept: "Lean AI Wrapper"

`panier-recette` is an experiment in **Strategic Arbitrage**. Instead of building fragile scrapers or paying for expensive LLM APIs, it leverages the user as the "bridge." 

The app generates a high-precision prompt $\rightarrow$ the user runs it through their preferred AI (ChatGPT/Gemini) $\rightarrow$ the app parses the structured JSON response into a local database.

## 🚀 Features

- **Precision Prompting**: Automatically generates strict JSON schemas to ensure AI consistency across different models.
- **Local-First Storage**: All recipes are saved to `localStorage` for instant, private access with zero latency.
- **AI Agnostic**: Works with any LLM capable of following JSON instructions.
- **Structured Workflow**: Transforms a chaotic web page into a clean interface with checkboxes for ingredients and steps.

## 🛠️ How it works

1. **Input**: Paste a URL from any recipe site.
2. **Bridge**: The app creates a strict prompt $\rightarrow$ you copy it to your AI of choice.
3. **Ingest**: Paste the AI's JSON response back into the app.
4. **Cook**: Enjoy a clean, structured view of your recipe.

## 🧠 Engineering Note

This project demonstrates a "Low-Friction" approach to AI product development:
- **Zero Backend**: No servers, no databases, and zero API costs.
- **High Reliability**: By using the user's own AI session, it bypasses the fragility of web scraping and anti-bot protections.
- **User-Centric**: Focused on a fast, private, and lightweight experience.
