const LOG_LIMIT = 100;

async function writeLog(level, message, details = null) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, message, details };
  console.log(`[${level.toUpperCase()}] ${message}`, details || '');

  chrome.storage.local.get({ logs: [] }, (result) => {
    let logs = result.logs;
    logs.push(logEntry);
    if (logs.length > LOG_LIMIT) logs = logs.slice(logs.length - LOG_LIMIT);
    chrome.storage.local.set({ logs });
  });
}

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get({
      provider: "llama",
      apiKey: "",
      modelName: "gpt-4o-mini",
      llamaUrl: "http://127.0.0.1:8080/v1/chat/completions",
      selectedLocalModel: ""
    }, resolve);
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "improvePrompt") {
    handleImprovement(request.text)
      .then(res => sendResponse({ success: true, improvedText: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleImprovement(userPrompt) {
  const config = await getConfig();
  writeLog("info", `Prompt improve isteği başladı. Provider: ${config.provider}`, { promptLength: userPrompt.length });

  const systemInstruction = "Sen uzman bir prompt mühendisisin. Kullanıcının verdiği soruyu daha net, açık, bağlamlı ve Frontier LLM modellerinin en iyi yanıtı verebileceği şekilde yeniden yapılandır. Yanıt olarak SADECE düzenlenmiş metni döndür. Giriş/çıkış açıklaması, selamlaşma veya tırnak işaretleri ekleme.";

  try {
    let responseText = "";

    if (config.provider === "llama") {
      const modelToUse = config.selectedLocalModel || "local-model";
      const res = await fetch(config.llamaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer no-key" },
        body: JSON.stringify({
          model: modelToUse,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.3
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "Llama Server Hatası");
      responseText = data.choices?.[0]?.message?.content?.trim();

    } else if (config.provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.modelName || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
          ]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "OpenAI API Hatası");
      responseText = data.choices?.[0]?.message?.content?.trim();

    } else if (config.provider === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: config.modelName || "claude-3-haiku-20240307",
          max_tokens: 1000,
          system: systemInstruction,
          messages: [{ role: "user", content: userPrompt }]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "Claude API Hatası");
      
      if (Array.isArray(data.content) && data.content.length > 0) {
        responseText = data.content[0]?.text?.trim();
      } else {
        throw new Error("Claude API beklenmeyen bir yanıt döndürdü.");
      }

    } else if (config.provider === "gemini") {
      const model = config.modelName || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${systemInstruction}\n\nSoru: ${userPrompt}` }] }
          ]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "Gemini API Hatası");
      
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    }

    if (!responseText) throw new Error("API'den geçerli bir metin döndürülemedi.");

    writeLog("info", "Prompt başarıyla iyileştirildi.");
    return responseText;

  } catch (err) {
    writeLog("error", `Improvement hatası (${config.provider}): ${err.message}`, err);
    throw err;
  }
}