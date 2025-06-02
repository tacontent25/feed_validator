const PARAMS = [
  { name: "Название ЖК", key: "object", required: false, warningIfMissing: true },
  { name: "Корпус", key: "building", required: false, warningIfMissing: true },
  { name: "Секция", key: "section", required: false },
  { name: "Этаж", key: "floor", required: false },
  { name: "Номер квартиры", key: "flat", required: true },
  { name: "Площадь", key: "area", required: true },
  { name: "Статус", key: "status", required: false, warningIfMissing: true },
  { name: "Цена", key: "price", required: true }, // для поиска всех цен
  { name: "Цена 100%", key: "priceFull", required: false }, // только для отображения
  { name: "Цена базовая", key: "priceBase", required: false }, // только для отображения
  { name: "Отделка", key: "renovation", required: false },
  { name: "Виды", key: "view", required: false },
  { name: "Акции", key: "discount", required: false }
];

function switchTab(tab) {
  document.getElementById('tab-url').classList.toggle('active', tab === 'url');
  document.getElementById('tab-text').classList.toggle('active', tab === 'text');
  document.getElementById('content-url').style.display = tab === 'url' ? 'block' : 'none';
  document.getElementById('content-text').style.display = tab === 'text' ? 'block' : 'none';
  document.getElementById('result').innerHTML = '';
}

function createCustomTagInputs() {
  const container = document.getElementById("custom-tags");
  PARAMS.forEach(p => {
    const input = document.createElement("input");
    input.placeholder = `Дополнительные теги для "${p.name}" через запятую`;
    input.id = `custom-${p.key}`;
    container.appendChild(input);
  });
}

function getTagCandidates(param) {
  const input = document.getElementById(`custom-${param.key}`);
  const custom = input?.value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) || [];

  const presets = {
    object: ["object", "building-name", "building_name", "complex-housing", "complex", "JKSchema"],
    building: ["building", "corpus", "corpus-name", "building-section", "building_section", "building-name", "building_name", "house"],
    section: ["section", "section-name", "section_name", "building-section", "building_section", "SectionNumber"],
    floor: ["floor","floornumber"],
    flat: ["flat", "apartment", "number", "flat-number","flat_number","ApartmentNumber", "Num", "FlatNumber"],
    area: ["area", "totalarea", "square","SquareTotal"],
    price: ["price", "DiscountPrice", "price-discount", "price_discount", "price_min", "price100", "pricesale", "PriceTotal", "price-base", "base_price", "price_base", "oldprice", "old-price", "old_price", "price-old", "price_old", "priceold"],
    status: ["status", "status-humanized", "status_humanized", "statuscode", "StateBase"],
    discount: ["discount","discounts", "promo", "special-offer", "special_offer"],
    renovation: ["renovation", "decoration", "furnish","facing"],
    view: ["view","ViewFromWindows", "window-view","window_view", "WindowsViewType"]
  };

  return [...(presets[param.key] || []), ...custom];
}

function validateXMLString(xmlStr) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "application/xml");
  const errors = doc.getElementsByTagName("parsererror");

  if (errors.length > 0) {
    return { valid: false, errors: ["Синтаксическая ошибка в XML"], tagInfo: {} };
  }

  const namespace = doc.documentElement.namespaceURI || null;
  const allTags = Array.from(doc.getElementsByTagNameNS(namespace, "*"));

  const tagInfo = {};
  const issues = [];
  
  // Специальная обработка для цен
  const priceTags = [];
  
  // Сначала обрабатываем все параметры, кроме цен
  PARAMS.forEach(param => {
    if (param.key !== "priceFull" && param.key !== "priceBase") {
      const candidates = getTagCandidates(param);
      const tagValuesMap = new Map();

      allTags.forEach(el => {
        const tagName = el.localName?.toLowerCase();
        if (!tagName) return;

        const matches = candidates.some(c => tagName.toLowerCase() === c.toLowerCase());
        if (matches) {
          const hasData = 
            (el.textContent && el.textContent.trim() !== "") ||
            el.querySelector("name, value, title") !== null;

          if (!hasData) {
            return;
          }

          let actualTag = tagName;
          let val = el.textContent.trim().replace(",", ".");

          // Обработка вложенных тегов
          if (tagName === "value" && el.parentElement) {
            const parentTag = el.parentElement.localName?.toLowerCase();
            if (candidates.some(c => parentTag?.includes(c))) {
              actualTag = parentTag;
              val = el.parentElement.textContent.trim().replace(",", ".");
            } else {
              return;
            }
          }
          
          if (tagName === "name" && el.parentElement) {
            const parentTag = el.parentElement.localName?.toLowerCase();
            if (candidates.some(c => parentTag?.includes(c))) {
              actualTag = parentTag;
              val = el.parentElement.textContent.trim().replace(",", ".");
            } else {
              return;
            }
          }

          if (tagName === "title" && el.parentElement) {
            const parentTag = el.parentElement.localName?.toLowerCase();
            if (candidates.some(c => parentTag?.includes(c))) {
              actualTag = parentTag;
              val = el.parentElement.textContent.trim().replace(",", ".");
            } else {
              return;
            }
          }

          if (!actualTag) return;

          if (!tagValuesMap.has(actualTag)) {
            tagValuesMap.set(actualTag, []);
          }
          tagValuesMap.get(actualTag).push(val);
        }

        // Обработка <custom-field>
        if (tagName === "custom-field") {
          const nameElement = el.querySelector("name");
          const valueElement = el.querySelector("value");
          
          if (!nameElement || !valueElement || !valueElement.textContent.trim()) return;

          const fieldName = nameElement.textContent.trim().toLowerCase();
          const matchesCustomField = candidates.some(c => fieldName.includes(c));

          if (matchesCustomField) {
            const val = valueElement.textContent.trim().replace(",", ".");
            const actualTag = `custom-field:${fieldName}`;

            if (!tagValuesMap.has(actualTag)) {
              tagValuesMap.set(actualTag, []);
            }
            tagValuesMap.get(actualTag).push(val);
          }
        }
      });

      const filteredTags = [];
      tagValuesMap.forEach((values, tag) => {
        const normalized = values.map(v => v.trim().replace(",", "."));
        const numericValues = normalized.map(v => parseFloat(v)).filter(v => !isNaN(v));
        const allBinary = numericValues.length > 0 && numericValues.every(v => v === 0 || v === 1);

        const isFlat = param.key === "flat";
        const flatInvalids = normalized.every(v => ["true", "false", ""].includes(v.toLowerCase()));

        const skip =
          (numericValues.length > 0 && allBinary) ||
          (isFlat && flatInvalids);

        if (!skip && tag) {
          filteredTags.push(`<${tag}>`);
        }
      });

      const clean = [...new Set(filteredTags)].filter(Boolean);
      tagInfo[param.name] = clean;

      if (clean.length === 0) {
        if (param.required) {
          issues.push(`Не найден обязательный параметр: ${param.name}.`);
        } else if (param.warningIfMissing) {
          if (param.key === "status") {
            issues.push("⚠️ Не найден тег для статуса. Он обязателен, если в фиде представлены не только свободные квартиры.");
          }
          if (param.key === "building") {
            issues.push("⚠️ Не найден тег для корпуса. Он обязателен, если в ЖК несколько корпусов с одинаковыми номерами квартир в них.");
          }
        }
      }
    }
  });

  // Теперь обрабатываем цены
  const priceCandidates = getTagCandidates({ key: "price" });
  
  allTags.forEach(el => {
    const tagName = el.localName?.toLowerCase();
    if (!tagName) return;

    const matches = priceCandidates.some(c => tagName.toLowerCase() === c.toLowerCase());
    if (matches) {
      const val = parseFloat(el.textContent.trim().replace(",", "."));
      if (!isNaN(val)) {
        priceTags.push({
          tag: tagName,
          value: val
        });
      }
    }

    // Обработка custom-field для цен
    if (tagName === "custom-field") {
      const nameElement = el.querySelector("name");
      const valueElement = el.querySelector("value");
      
      if (!nameElement || !valueElement || !valueElement.textContent.trim()) return;

      const fieldName = nameElement.textContent.trim().toLowerCase();
      const matchesCustomField = priceCandidates.some(p => fieldName.includes(p));

      if (matchesCustomField) {
        const val = parseFloat(valueElement.textContent.trim().replace(",", "."));
        if (!isNaN(val)) {
          priceTags.push({
            tag: `custom-field:${fieldName}`,
            value: val
          });
        }
      }
    }
  });
  
  const uniqueTagNames = [...new Set(priceTags.map(p => p.tag))];  
  
  // Логика распределения цен
  if (uniqueTagNames.length === 0) {
    issues.push("Не найден обязательный параметр: Цена. Необходимо добавить в фид хотя бы одну цену.");
    tagInfo["Цена 100%"] = [];
    tagInfo["Цена базовая"] = [];
  } else {
    // Сортируем цены по убыванию
    priceTags.sort((a, b) => b.value - a.value);

  if (uniqueTagNames.length === 1) {
    const only = priceTags[0];
    tagInfo["Цена 100%"] = [`<${only.tag}>`];
    tagInfo["Цена базовая"] = []; // Не найдено
  } else if (uniqueTagNames.length > 1) {
    const basePrice = priceTags[0];
    tagInfo["Цена базовая"] = [`<${basePrice.tag}>`];
    const fullPrices = priceTags
      .filter(p => p.tag !== basePrice.tag)
      .map(p => `<${p.tag}>`);
    tagInfo["Цена 100%"] = [...new Set(fullPrices)];
  }

    // Предупреждение, если только одна цена
    if (uniqueTagNames.length === 1) {
      issues.push("⚠️ Найдена только одна цена. Если базовая и 100% цена различаются, необходимо добавить в фид обе.");
    }
  }

  let infoMessage = "";
  if (issues.length != 0) {
    infoMessage = "Если недостающий тег есть в фиде, но не найден валидатором, то можно добавить его в пользовательские теги перед валидацией и попробовать еще раз.";
  }

  return {
    valid: issues.filter(e => !e.startsWith("⚠️")).length === 0,
    errors: issues,
    tagInfo,
    infoMessage
  };
}

function renderTagTable(tagInfo) {
  
  const tbody = document.querySelector("#tag-table tbody");
  tbody.innerHTML = "";

  PARAMS.forEach(param => {
    // Пропускаем параметр "Цена", так как он используется только для поиска
    if (param.key === "price") return;
    
    const tags = (tagInfo[param.name] || []).filter(tag => tag && tag.trim());
    
    const tr = document.createElement("tr");
    tr.className = tags.length ? "found" : "not-found";

    const td1 = document.createElement("td");
    td1.textContent = param.name;

    const td2 = document.createElement("td");
    if (tags.length) {
      const uniqueTags = [...new Set(tags)].map(tag => 
        tag.startsWith("custom-field:") 
          ? tag.replace("custom-field:", "") 
          : tag.replace(/[<>]/g, '')
      );
      td2.textContent = uniqueTags.join(", ");
    } else {
      td2.innerHTML = "<i>Не найдено</i>";
    }
    const td3 = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Дополнительный тег";
    input.className = "custom-input";
    input.id = `custom-${param.key}`;
    td3.appendChild(input);

    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tbody.appendChild(tr);
  });
}

function displayResult(result) {
  const resultDiv = document.getElementById("result");
  const errors = result.errors.filter(e => !e.startsWith("⚠️"));
  const warnings = result.errors.filter(e => e.startsWith("⚠️"));

  let html = "";
  // Ошибки
  if (errors.length > 0) {
    html += "❌ Ошибки:<ul>" + errors.map(e => `<li>${e}</li>`).join("") + "</ul>";
  }
  // Предупреждения
  if (warnings.length > 0) {
    html += "⚠️ Предупреждения:<ul>" + warnings.map(w => `<li>${w.slice(2)}</li>`).join("") + "</ul>";
  }
  // Информационное сообщение (если есть ошибки/предупреждения И есть само сообщение)
  if ((errors.length > 0 || warnings.length > 0) && result.infoMessage) {
    html += `<div class="info-message">${result.infoMessage}</div>`;
  }
  // Сообщение об успехе
  if (errors.length === 0 && warnings.length === 0) {
    html += "✅ XML валиден: все обязательные поля присутствуют и корректны";
  }
  resultDiv.innerHTML = html;
  renderTagTable(result.tagInfo);
}

function validateFromText() {
  const xml = document.getElementById("xml-input").value.trim();
  const result = validateXMLString(xml);
  displayResult(result);
}

async function validateFromURL() {
  const url = document.getElementById("url-input").value.trim();
  try {
    const response = await fetch('https://xml-proxy.onrender.com/fetch?url=' + encodeURIComponent(url));
    if (!response.ok) throw new Error("Ошибка загрузки XML");
    const text = await response.text();
    const result = validateXMLString(text);
    displayResult(result);
  } catch (err) {
    document.getElementById("result").innerHTML = "❌ Ошибка: " + err.message;
  }
}

function validateAgain() {
  const xml = document.getElementById("xml-input").value.trim();
  if (!xml) return alert("Сначала вставьте XML");
  const result = validateXMLString(xml);
  displayResult(result);
}

document.addEventListener("DOMContentLoaded", () => {
  createCustomTagInputs;

  // отрисовать пустую таблицу до валидации
  const initialEmptyInfo = Object.fromEntries(PARAMS.map(p => [p.name, []]));
  renderTagTable(initialEmptyInfo);
});