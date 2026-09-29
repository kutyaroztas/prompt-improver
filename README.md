# Multi-Provider LLM Prompt Improver

A Chrome extension that adds a **"✨ Improve"** button (and a `Ctrl+Y` shortcut) next to the send button on ChatGPT, Claude, and Gemini. Click it before you hit send, and it rewrites whatever you typed into a clearer, better-structured prompt — using either your own local LLM server or a cloud API of your choice.

## What it does

- Injects an **"✨ Improve"** button right next to the native send button on:
  - `chatgpt.com`
  - `claude.ai`
  - `gemini.google.com`
- Clicking it (or pressing `Ctrl+Y`/`Cmd+Y`) sends your current draft to a background service worker, which asks an LLM to rewrite it into a clearer, more explicit, better-contextualized prompt, then replaces the text in the input box with the improved version.
- You choose the LLM provider yourself, via the extension's popup:
  - **Local LLM** — any OpenAI-compatible server (e.g. `llama-server`, `llama.cpp`, LM Studio, Ollama's OpenAI-compatible endpoint) reachable at a URL you configure (default `http://127.0.0.1:8080/v1/chat/completions`). A "Fetch" button can pull the list of available models from a `/v1/models`-style endpoint.
  - **Cloud APIs** — OpenAI, Anthropic (Claude), or Google (Gemini), using an API key you paste into the popup. A "Fetch" button lists the models your key has access to.
- The improve button automatically **disables itself** when it shouldn't run: input too short, input is a pure code block, or an image/file attachment is present in the composer (so it won't mangle multimodal prompts).
- The button's visibility can be toggled off from the popup if you don't want it always showing.
- Basic activity/error logging (last 100 entries) is kept in `chrome.storage.local` for debugging.

## How it works (technical notes)

- **Manifest V3** extension: a `background.js` service worker does all outbound network calls (avoids CORS/CSP issues on the target sites), while `content.js` handles DOM injection and UI.
- `content.js` watches the page with a `MutationObserver` (chat UIs are highly dynamic SPAs) and injects the improve button next to the platform's send button as soon as it appears. Per-platform CSS selectors for the input box, send button, and attachment indicators are defined in the `PLATFORMS` object.
- Improving a prompt sends `{ action: "improvePrompt", text }` from the content script to the background worker via `chrome.runtime.sendMessage`.
- `background.js` builds a fixed system instruction ("rewrite this prompt to be clearer and more explicit for a frontier LLM, return only the rewritten text") and calls the configured provider's chat-completions endpoint:
  - `llama` → your configured local OpenAI-compatible endpoint
  - `openai` → `api.openai.com/v1/chat/completions`
  - `claude` → `api.anthropic.com/v1/messages` (with `anthropic-dangerous-direct-browser-access: true`, since the call is made directly from the extension, not a backend)
  - `gemini` → `generativelanguage.googleapis.com/.../generateContent`
- The rewritten text then replaces the value of the input field (native `value` for `<textarea>`/`<input>`, `innerHTML` for `contenteditable` composers), followed by dispatched `input`/`change` events so the site's own framework picks up the change.
- All settings (provider, endpoint URLs, API key, selected model, button visibility) are stored locally via `chrome.storage.local` — configured through `popup.html`/`popup.js`.

## Installation (load as an unpacked extension)

This extension is not published on the Chrome Web Store — you load it directly from this folder.

1. **Download/clone this repository**.
   ```bash
   git clone https://github.com/kutyaroztas/prompt-improver.git
   ```
2. Open Chrome and go to `chrome://extensions`.
3. In the top-right corner, turn on **Developer mode**.
4. Click **"Load unpacked"**.
5. Select the `prompt-improver` folder (the one that directly contains `manifest.json`).
6. The extension appears as **"Multi-Provider LLM Prompt Improver"**. Pin it to your toolbar for quick access to its settings.

## Configuration

Click the extension's toolbar icon to open its settings popup.

### Option A — Use a local LLM (no API key needed, runs on your machine)

1. Set **LLM Provider** to `Local LLM (llama-server)`.
2. Start an OpenAI-compatible local server (e.g. `llama-server`, LM Studio, or Ollama's OpenAI-compatible mode).
3. Set **Local LLM Endpoint URL** to your server's chat-completions endpoint (default: `http://127.0.0.1:8080/v1/chat/completions`).
4. Optionally set **Models Endpoint URL** (default: `http://127.0.0.1:8081/v1/models`) and click **"Çek" (Fetch)** to pull the list of loaded models, or leave the model field blank to use whatever model your server defaults to.
5. Click **"Ayarları Kaydet" (Save Settings)**.

### Option B — Use a cloud provider (OpenAI, Claude, or Gemini)

1. Set **LLM Provider** to the provider you want.
2. Paste your API key into the **API Key** field.
   - OpenAI: get a key at https://platform.openai.com/api-keys
   - Anthropic: get a key at https://console.anthropic.com/
   - Google Gemini: get a key at https://aistudio.google.com/apikey
3. Click **"Çek" (Fetch)** next to the model field to list the models available to your key, or type a model name manually (e.g. `gpt-4o-mini`, `claude-3-haiku-20240307`, `gemini-1.5-flash`).
4. Click **"Ayarları Kaydet" (Save Settings)**.

Your API key is stored only in `chrome.storage.local` on your machine and is sent directly from your browser to that provider's API — it never passes through any third-party server.

## Usage

1. Go to ChatGPT, Claude, or Gemini and start typing your message as usual.
2. Before sending, click the **"✨ Improve"** button next to the send button, or press **`Ctrl+Y`** (`Cmd+Y` on macOS).
3. Wait a moment while it shows **"⏳ İşleniyor..." (Processing...)** — your draft is sent to the configured LLM and rewritten in place.
4. Review the rewritten prompt, edit if needed, and send it normally.

The button is automatically disabled (grayed out) when:
- the input is empty or too short,
- the input is only a fenced code block, or
- there's an image/file attached to the message (to avoid breaking multimodal prompts).

## Troubleshooting

- **Button doesn't appear**: Refresh the chat page tab after installing/reloading the extension. The button only appears on `chatgpt.com`, `claude.ai`, and `gemini.google.com`.
- **"Eklenti bağlantısı yenilendi..." / extension connection refreshed**: The extension was reloaded (e.g. after an update) while the tab was open — press F5 to refresh the page.
- **Local LLM errors**: Confirm your local server is running and reachable at the exact URL configured in the popup, and that `host_permissions` in `manifest.json` covers the port you're using (`8080`/`8081` and generic `localhost`/`127.0.0.1` are pre-configured; add your port to `manifest.json` if it differs and reload the extension).
- **Cloud API errors ("API Hatası")**: Double-check the API key and that the selected model name is valid/available for that key. The exact error message from the provider is shown in the popup status line.
- **After updating the code**: Go to `chrome://extensions`, click the reload icon on this extension, then refresh the target site's tab.

## Privacy

- Settings (provider, endpoint URLs, API key, selected model, button visibility) and a small rolling activity/error log (last 100 entries) are stored locally via `chrome.storage.local`.
- The only network calls made are: (a) to your configured local LLM server, or (b) directly to the cloud provider you selected, using your own API key. No data is sent to any server operated by the author of this extension.

## License

No license specified. All rights reserved by the author unless stated otherwise.
