const slotsConfig = [
  { key: 'sl', title: 'СЛ' },
  { key: 'staff_current', title: 'Штат актуальный' },
  { key: 'staff_period', title: 'Штат на период' }
];

const slotsRoot = document.getElementById('slots');
const template = document.getElementById('slot-template');
const processAllBtn = document.getElementById('process-all-btn');
const processStatus = document.getElementById('process-status');
const downloadList = document.getElementById('download-list');

function setStatus(el, text, isError = false) {
  el.textContent = text;
  el.style.color = isError ? '#b00020' : '#1f2937';
}

async function readResponsePayload(res) {
  const raw = await res.text();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { detail: raw };
  }
}

function clearDownloadList() {
  downloadList.innerHTML = '';
}

function renderDownloadLinks(items) {
  clearDownloadList();

  items.forEach((item) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.download_url;
    link.textContent = `Скачать результат: ${item.title}`;
    link.setAttribute('download', '');

    li.appendChild(link);
    downloadList.appendChild(li);
  });
}

const slotStatusByKey = new Map();

slotsConfig.forEach(({ key, title }) => {
  const clone = template.content.cloneNode(true);
  const card = clone.querySelector('.card');
  const titleEl = clone.querySelector('.slot-title');
  const input = clone.querySelector('.file-input');
  const status = clone.querySelector('.status');
  const uploadBtn = clone.querySelector('.upload-btn');
  const clearBtn = clone.querySelector('.clear-btn');

  titleEl.textContent = title;
  card.dataset.slot = key;
  slotStatusByKey.set(key, status);

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
      const data = await readResponsePayload(res);

      if (!res.ok) {
        throw new Error(data.detail || 'Ошибка загрузки');
      }

      clearDownloadList();
      setStatus(status, `Загружено: ${data.filename}`);
      setStatus(processStatus, 'Можно запускать обработку', false);
    } catch (err) {
      setStatus(status, err.message, true);
    }
  });

  clearBtn.addEventListener('click', async () => {
    try {
      const res = await fetch(`/api/upload/${key}`, { method: 'DELETE' });
      const data = await readResponsePayload(res);
      if (!res.ok) {
        throw new Error(data.detail || 'Ошибка очистки');
      }

      input.value = '';
      clearDownloadList();
      setStatus(status, 'Файл не выбран');
    } catch (err) {
      setStatus(status, err.message, true);
    }
  });

  slotsRoot.appendChild(clone);
});

processAllBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/process', { method: 'POST' });
    const data = await readResponsePayload(res);
    if (!res.ok) {
      throw new Error(data.detail || 'Ошибка обработки');
    }

    renderDownloadLinks(data.processed_files || []);

    (data.processed_files || []).forEach((item) => {
      const status = slotStatusByKey.get(item.slot);
      if (status) {
        setStatus(status, 'Файл обработан. Результат доступен для скачивания.');
      }
    });

    setStatus(processStatus, `Обработано файлов: ${data.processed_count}`);
  } catch (err) {
    setStatus(processStatus, err.message, true);
  }
});
