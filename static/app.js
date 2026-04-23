const slotsConfig = [
  { key: 'sl', title: 'СЛ' },
  { key: 'staff_current', title: 'Штат актуальный' },
  { key: 'staff_period', title: 'Штат на период' }
];

const slotsRoot = document.getElementById('slots');
const template = document.getElementById('slot-template');

function setStatus(el, text, isError = false) {
  el.textContent = text;
  el.style.color = isError ? '#b00020' : '#1f2937';
}

slotsConfig.forEach(({ key, title }) => {
  const clone = template.content.cloneNode(true);
  const card = clone.querySelector('.card');
  const titleEl = clone.querySelector('.slot-title');
  const input = clone.querySelector('.file-input');
  const status = clone.querySelector('.status');
  const uploadBtn = clone.querySelector('.upload-btn');
  const clearBtn = clone.querySelector('.clear-btn');
  const processBtn = clone.querySelector('.process-btn');
  const downloadBtn = clone.querySelector('.download-btn');

  titleEl.textContent = title;
  card.dataset.slot = key;

  input.addEventListener('change', () => {
    if (input.files.length > 0) {
      setStatus(status, `Выбран файл: ${input.files[0].name}`);
    } else {
      setStatus(status, 'Файл не выбран');
    }
  });

  uploadBtn.addEventListener('click', async () => {
    if (!input.files.length) {
      setStatus(status, 'Сначала выберите файл', true);
      return;
    }

    const formData = new FormData();
    formData.append('file', input.files[0]);

    try {
      const res = await fetch(`/api/upload/${key}`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Ошибка загрузки');
      }

      downloadBtn.classList.add('disabled');
      downloadBtn.removeAttribute('href');
      setStatus(status, `Загружено: ${data.filename}`);
    } catch (err) {
      setStatus(status, err.message, true);
    }
  });

  clearBtn.addEventListener('click', async () => {
    try {
      const res = await fetch(`/api/upload/${key}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Ошибка очистки');
      }

      input.value = '';
      downloadBtn.classList.add('disabled');
      downloadBtn.removeAttribute('href');
      setStatus(status, 'Файл не выбран');
    } catch (err) {
      setStatus(status, err.message, true);
    }
  });

  processBtn.addEventListener('click', async () => {
    try {
      const res = await fetch(`/api/process/${key}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Ошибка обработки');
      }

      downloadBtn.href = data.download_url;
      downloadBtn.classList.remove('disabled');
      setStatus(status, 'Файл обработан. Можно скачать результат.');
    } catch (err) {
      setStatus(status, err.message, true);
    }
  });

  slotsRoot.appendChild(clone);
});
