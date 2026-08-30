document.addEventListener('DOMContentLoaded', () => {
  const providerSelect = document.getElementById('provider');
  const localSettings = document.getElementById('local-settings');
  const apiSettings = document.getElementById('api-settings');
  const llamaUrlInput = document.getElementById('llamaUrl');
  const modelsUrlInput = document.getElementById('modelsUrl');
  const fetchLocalModelsBtn = document.getElementById('fetchLocalModelsBtn');
  const localModelSelect = document.getElementById('localModelSelect');
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('modelSelect');
  const customModelInput = document.getElementById('customModelInput');
  const fetchCloudModelsBtn = document.getElementById('fetchCloudModelsBtn');
  const showButtonCheckbox = document.getElementById('showButtonCheckbox');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  chrome.storage.local.get({
    provider: 'llama',
    llamaUrl: 'http://127.0.0.1:8080/v1/chat/completions',
    modelsUrl: 'http://127.0.0.1:8081/v1/models',
    selectedLocalModel: '',
    apiKey: '',
    modelName: 'gpt-4o-mini',
    showButton: true
  }, (config) => {
    providerSelect.value = config.provider;
    llamaUrlInput.value = config.llamaUrl;
    modelsUrlInput.value = config.modelsUrl;
    apiKeyInput.value = config.apiKey;
    customModelInput.value = config.modelName;
    showButtonCheckbox.checked = config.showButton;
    
    if (config.selectedLocalModel) {
      const opt = document.createElement('option');
      opt.value = config.selectedLocalModel;
      opt.textContent = config.selectedLocalModel;
      opt.selected = true;
      localModelSelect.appendChild(opt);
    }

    if (config.modelName) {
      const opt = document.createElement('option');
      opt.value = config.modelName;
      opt.textContent = config.modelName;
      opt.selected = true;
      modelSelect.appendChild(opt);
    }

    updateVisibility(config.provider);
  });

  providerSelect.addEventListener('change', () => {
    updateVisibility(providerSelect.value);
  });

  modelSelect.addEventListener('change', () => {
    if (modelSelect.value) {
      customModelInput.value = modelSelect.value;
    }
  });

  function updateVisibility(provider) {
    if (provider === 'llama') {
      localSettings.classList.remove('hidden');
      apiSettings.classList.add('hidden');
    } else {
      localSettings.classList.add('hidden');
      apiSettings.classList.remove('hidden');
    }
  }

  fetchLocalModelsBtn.addEventListener('click', async () => {
    const targetUrl = modelsUrlInput.value.trim() || 'http://127.0.0.1:8081/v1/models';
    fetchLocalModelsBtn.textContent = '⏳...';

    try {
      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      localModelSelect.innerHTML = '';
      const modelsList = data.data || data.models || [];
      if (Array.isArray(modelsList) && modelsList.length > 0) {
        modelsList.forEach(m => {
          const mId = typeof m === 'string' ? m : (m.id || m.name);
          const opt = document.createElement('option');
          opt.value = mId;
          opt.textContent = mId;
          localModelSelect.appendChild(opt);
        });
        showStatus('Local modeller başarıyla çekildi!', 'green');
      } else {
        throw new Error('Model listesi boş döndü.');
      }
    } catch (err) {
      showStatus(`Model çekme hatası: ${err.message}`, 'red');
    } finally {
      fetchLocalModelsBtn.textContent = 'Çek';
    }
  });

  fetchCloudModelsBtn.addEventListener('click', async () => {
    const provider = providerSelect.value;
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showStatus('Lütfen önce API Key girin!', 'red');
      return;
    }

    fetchCloudModelsBtn.textContent = '⏳...';

    try {
      let modelsList = [];

      if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        modelsList = (data.data || []).map(m => m.id).filter(id => id.includes('gpt'));

      } else if (provider === 'claude') {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          }
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        modelsList = (data.data || []).map(m => m.id);

      } else if (provider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        modelsList = (data.models || [])
          .map(m => m.name.replace('models/', ''))
          .filter(name => name.includes('gemini'));
      }

      modelSelect.innerHTML = '';
      if (modelsList.length > 0) {
        modelsList.forEach(mId => {
          const opt = document.createElement('option');
          opt.value = mId;
          opt.textContent = mId;
          modelSelect.appendChild(opt);
        });
        customModelInput.value = modelsList[0];
        showStatus(`${provider.toUpperCase()} modelleri çekildi!`, 'green');
      } else {
        throw new Error('Uygun model bulunamadı.');
      }

    } catch (err) {
      showStatus(`API Hatası: ${err.message}`, 'red');
    } finally {
      fetchCloudModelsBtn.textContent = 'Çek';
    }
  });

  saveBtn.addEventListener('click', () => {
    const config = {
      provider: providerSelect.value,
      llamaUrl: llamaUrlInput.value.trim(),
      modelsUrl: modelsUrlInput.value.trim(),
      selectedLocalModel: localModelSelect.value,
      apiKey: apiKeyInput.value.trim(),
      modelName: customModelInput.value.trim() || modelSelect.value,
      showButton: showButtonCheckbox.checked
    };

    chrome.storage.local.set(config, () => {
      showStatus('Ayarlar başarıyla kaydedildi!', 'green');
    });
  });

  function showStatus(msg, color) {
    statusDiv.style.color = color;
    statusDiv.textContent = msg;
    setTimeout(() => { statusDiv.textContent = ''; }, 3000);
  }
});