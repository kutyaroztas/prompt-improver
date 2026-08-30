const PLATFORMS = {
  chatgpt: {
    input: '#prompt-textarea, div[contenteditable="true"]',
    sendBtn: 'button[data-testid="send-button"]',
    attachment: '[data-testid="attachment-container"], img[alt="Uploaded image"]'
  },
  claude: {
    input: 'div[contenteditable="true"]',
    sendBtn: 'button[aria-label*="Send"], button[aria-label*="Gönder"], button[aria-label*="sent"]',
    attachment: '.file-upload-wrapper, [aria-label*="Attachment"]'
  },
  gemini: {
    input: 'div[contenteditable="true"], rich-textarea p',
    sendBtn: '.send-button, button[aria-label*="Send"], button[aria-label*="Gönder"]',
    attachment: '.image-preview-container, .file-preview'
  }
};

let currentPlatform = "chatgpt";
if (location.hostname.includes("claude.ai")) currentPlatform = "claude";
if (location.hostname.includes("gemini.google.com")) currentPlatform = "gemini";

let isShowButton = true;

chrome.storage.local.get({ showButton: true }, (config) => {
  isShowButton = config.showButton;
  applyButtonVisibility();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.showButton) {
    isShowButton = changes.showButton.newValue;
    applyButtonVisibility();
  }
});

function applyButtonVisibility() {
  const improveBtn = document.querySelector('#custom-improve-btn');
  if (improveBtn) {
    improveBtn.style.display = isShowButton ? 'inline-flex' : 'none';
  } else if (isShowButton) {
    injectImproveButton();
  }
}

function ExtractText(element) {
  if (!element) return "";
  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    return element.value || "";
  }
  let text = element.innerText || element.textContent || "";
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  return text;
}

function analyzeInput(inputEl) {
  const config = PLATFORMS[currentPlatform];
  
  const hasAttachment = document.querySelector(config.attachment) !== null;
  if (hasAttachment) {
    return { canImprove: false, reason: "Görsel/Dosya eki var (Bypass)." };
  }

  const text = ExtractText(inputEl);
  if (text.length < 3) {
    return { canImprove: false, reason: "Metin çok kısa." };
  }

  if (text.startsWith('```') && text.endsWith('```')) {
    return { canImprove: false, reason: "Metin sadece kod bloğundan oluşuyor." };
  }

  return { canImprove: true, reason: "", text: text };
}

function injectImproveButton() {
  const config = PLATFORMS[currentPlatform];
  const originalBtn = document.querySelector(config.sendBtn);
  const inputEl = document.querySelector(config.input);

  if (!originalBtn || !inputEl || document.querySelector('#custom-improve-btn')) return;

  const improveBtn = document.createElement('button');
  improveBtn.id = 'custom-improve-btn';
  improveBtn.type = 'button';
  improveBtn.className = `improve-prompt-btn improve-${currentPlatform}`;
  improveBtn.innerHTML = '✨ Improve';

  if (!isShowButton) {
    improveBtn.style.display = 'none';
  }

  originalBtn.parentNode.insertBefore(improveBtn, originalBtn);

  const validateState = () => {
    const status = analyzeInput(inputEl);
    if (!status.canImprove) {
      improveBtn.disabled = true;
      improveBtn.title = status.reason;
      improveBtn.classList.add('disabled');
    } else {
      improveBtn.disabled = false;
      improveBtn.title = "Prompt'u İyileştir (Ctrl+Y)";
      improveBtn.classList.remove('disabled');
    }
  };

  inputEl.addEventListener('input', validateState);
  inputEl.addEventListener('keyup', validateState);
  
  const observer = new MutationObserver(validateState);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  improveBtn.addEventListener('click', triggerImprovement);
  validateState();
}

async function triggerImprovement() {
  const config = PLATFORMS[currentPlatform];
  const inputEl = document.querySelector(config.input);
  const improveBtn = document.querySelector('#custom-improve-btn');

  if (!inputEl) return;

  const status = analyzeInput(inputEl);
  if (!status.canImprove) {
    console.warn("Prompt iyileştirilemedi:", status.reason);
    return;
  }

  if (!chrome?.runtime?.sendMessage) {
    alert("Eklenti bağlantısı yenilendi. Lütfen sayfayı (F5) tazeleyin.");
    return;
  }

  if (improveBtn) {
    improveBtn.disabled = true;
    improveBtn.innerHTML = '⏳ İşleniyor...';
  }

  try {
    chrome.runtime.sendMessage(
      { action: "improvePrompt", text: status.text },
      (response) => {
        if (chrome.runtime.lastError) {
          alert(`Eklenti Hatası: ${chrome.runtime.lastError.message}`);
          resetBtn(improveBtn);
          return;
        }

        if (response && response.success) {
          updateInputValue(inputEl, response.improvedText);
          if (improveBtn) {
            improveBtn.innerHTML = '✅ İyileştirildi';
            setTimeout(() => resetBtn(improveBtn), 2000);
          }
        } else {
          alert(`Hata: ${response?.error || 'Yanıt alınamadı.'}`);
          resetBtn(improveBtn);
        }
      }
    );
  } catch (err) {
    alert("Sayfa bağlantısı koptu. Lütfen sayfayı yenileyin (F5).");
    resetBtn(improveBtn);
  }
}

function resetBtn(btn) {
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = '✨ Improve';
}

function updateInputValue(element, text) {
  element.focus();
  
  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    element.value = text;
  } else {
    element.innerHTML = `<p>${text.replace(/\n/g, '<br>')}</p>`;
  }
  
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
    e.preventDefault();
    e.stopPropagation();
    triggerImprovement();
  }
}, true);

const initObserver = new MutationObserver(injectImproveButton);
initObserver.observe(document.body, { childList: true, subtree: true });