(function() {
  'use strict';
  var $ = function(id) { return document.getElementById(id); };

  /* Перезапуск одноразовой CSS-анимации: снять класс → reflow → надеть класс */
  function retrig(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  var hiddenPanels = {};
  /* Плавное сворачивание/разворачивание панелей: scale+fade через .panel-hide,
     display:none — только по завершении перехода (transitionend + таймер-страховка) */
  window.closePanel = function(id) {
    var el = $(id);
    if (el) {
      hiddenPanels[id] = true;
      el.classList.add('panel-hide');
      var done = function() {
        el.removeEventListener('transitionend', done);
        if (hiddenPanels[id]) el.style.display = 'none';
        el.classList.remove('panel-hide');
      };
      el.addEventListener('transitionend', done);
      setTimeout(done, 300); /* страховка при reduced-motion / пропущенном событии */
    }
    var rb = $('restore-' + id); if (rb) rb.style.display = 'block';
  };
  window.restorePanel = function(id) {
    var el = $(id);
    if (el) {
      var flexPanels = { ctrl: 1, tl: 1 };
      hiddenPanels[id] = false;
      el.classList.add('panel-hide');
      el.style.display = flexPanels[id] ? 'flex' : 'block';
      void el.offsetWidth; /* reflow — чтобы переход сработал */
      el.classList.remove('panel-hide');
    }
    var rb = $('restore-' + id); if (rb) rb.style.display = 'none';
  };

  var SRC = 'https://rainradar.ru/composite', FZ = 5, MDBZ = 5, DELAY = 600, STEP = 600;
  var HISTORY_MINUTES = 190, MAX_HISTORY_SEC = HISTORY_MINUTES * 60;
  var BASE_RES_KM = 2;

  /* ─── Спутник EUMETSAT: сетка времени 15 мин, задержка публикации ~20 мин, история 12 ч ─── */
  var SAT_STEP = 900, SAT_DELAY = 1200, SAT_HISTORY_SEC = 12 * 3600;

  /* ─── Определение устройства: мобильный → меньше кэш, легче обработка, DPR-потолок ─── */
  var IS_MOBILE = matchMedia('(max-width: 768px)').matches || matchMedia('(pointer: coarse)').matches;
  var REDUCE_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2); /* потолок 2: выше — только расход памяти */

  var BUILTIN_RADAR = [
    { v: 70, r: [113, 0, 0], l: '70 dBZ' },
    { v: 65, r: [168, 0, 254], l: '65 dBZ' },
    { v: 60, r: [244, 0, 244], l: '60 dBZ' },
    { v: 55, r: [0, 168, 0], l: '55 dBZ' },
    { v: 50, r: [73, 219, 0], l: '50 dBZ' },
    { v: 40, r: [254, 58, 54], l: '40 dBZ' },
    { v: 35, r: [254, 125, 0], l: '35 dBZ' },
    { v: 30, r: [254, 254, 0], l: '30 dBZ' },
    { v: 25, r: [0, 0, 125], l: '25 dBZ' },
    { v: 20, r: [0, 0, 205], l: '20 dBZ' },
    { v: 15, r: [0, 76, 254], l: '15 dBZ' },
    { v: 10, r: [0, 168, 254], l: '10 dBZ' },
    { v: 5, r: [83, 254, 56], l: '5 dBZ' }
  ];

  var BUILTIN_WX = [
    { v: 70, r: [43, 43, 43], l: 'Смерч' },
    { v: 65, r: [128, 60, 110], l: 'Шквал сильный' },
    { v: 59, r: [204, 117, 181], l: 'Шквал умеренный' },
    { v: 57, r: [253, 201, 239], l: 'Шквал слабый' },
    { v: 54, r: [77, 57, 35], l: 'Град сильный' },
    { v: 52, r: [112, 84, 51], l: 'Град умеренный' },
    { v: 50, r: [161, 123, 79], l: 'Град слабый' },
    { v: 48, r: [255, 61, 61], l: 'Гроза A+ (>90%)' },
    { v: 46, r: [220, 80, 80], l: 'Гроза A (71-90%)' },
    { v: 45, r: [242, 186, 156], l: 'Гроза B (30-70%)' },
    { v: 37, r: [15, 55, 107], l: 'Ливень сильный' },
    { v: 35, r: [37, 87, 152], l: 'Ливень умеренный' },
    { v: 30, r: [75, 149, 247], l: 'Ливень слабый' },
    { v: 28, r: [238, 240, 132], l: 'Осадки сильные' },
    { v: 24, r: [26, 97, 64], l: 'Осадки умеренные' },
    { v: 16, r: [53, 146, 103], l: 'Осадки слабые' },
    { v: 13, r: [88, 249, 174], l: 'Морось' },
    { v: 9, r: [129, 204, 223], l: 'Легкая морось' },
    { v: 6, r: [145, 145, 145], l: 'Облака' },
    { v: 5, r: [107, 107, 107], l: 'Нет явления' }
  ];

  var S = {
    ts: 0, px: 1, layer: 'radar', playing: false, timer: null, speedI: 0, speeds: [1, 2, 4],
    frameI: 0, frames: [], cache: new Map(), pending: new Set(), failed: new Set(),
    cacheMax: (IS_MOBILE ? 130 : 400), loadN: 0, manualTime: false, legendVis: true, smooth: false, smoothStrength: 1,
    fade: { active: false, start: 0, duration: 300, alpha: 1 },
    pxLevels: [0.5, 1, 2, 4], pxIndex: 1,
    ruler: { active: false, points: [], markers: [], polyline: null, label: null, segmentLabels: [] }
  };
  S.px = S.pxLevels[S.pxIndex];
  var palettes = { radar: { list: [], activeIdx: 0 }, wx: { list: [], activeIdx: 0 } };

  var eumetsatLayer = null;
  var satOldLayer = null;      /* предыдущий слой — снимается после загрузки нового (без «чёрной вспышки») */
  var satLoading = false;      /* индикация загрузки WMS-тайлов */
  var satErrToastTs = 0;       /* троттлинг тоста об ошибке */

  /* ─── Каналы EUMETSAT (WMS view.eumetsat.int, проверенные слои msg_fes:*).
     day:true — канал информативен только в светлое время суток.
     legend: grad — градиентная шкала, rows — дискретные строки ─── */
  var SAT_CHANNELS = [
    { id: 'ir108',       label: 'IR 10.8 (ИК)',        wms: 'msg_fes:ir108',            legend: { grad: ['#ffffff', '#999999', '#222222'], rows: [['#ffffff', 'Очень холодные вершины (грозы)'], ['#999999', 'Облака среднего яруса'], ['#333333', 'Тепло / земля / море']] } },
    { id: 'wv062',       label: 'WV 6.2 (водяной пар)', wms: 'msg_fes:wv062',           legend: { grad: ['#ffffff', '#888888', '#1a1a1a'], rows: [['#ffffff', 'Влажная верхняя тропосфера'], ['#333333', 'Сухой воздух']] } },
    { id: 'vis006',      label: 'VIS 0.6 (видимый)',    wms: 'msg_fes:vis006', day: true, legend: { rows: [['#ffffff', 'Яркие облака / снег'], ['#888888', 'Тонкая облачность'], ['#222222', 'Поверхность (день)']] } },
    { id: 'rgb_natural', label: 'Натуральные цвета',    wms: 'msg_fes:rgb_natural', day: true, legend: { rows: [['#f5f5f5', 'Водяные облака'], ['#7fd4e6', 'Лёд / снег (циан)'], ['#3d7a3d', 'Растительность']] } },
    { id: 'rgb_microphysics', label: 'Микрофизика облаков', wms: 'msg_fes:rgb_microphysics', legend: { rows: [['#d4553d', 'Мощные капельные облака'], ['#e6d44f', 'Тонкие перистые'], ['#4f66e6', 'Ледяные вершины']] } },
    { id: 'rgb_convection', label: 'Конвекция',         wms: 'msg_fes:rgb_convection', legend: { rows: [['#e6e64f', 'Сильная конвекция (жёлтое)'], ['#b34fe6', 'Развивающиеся ячейки'], ['#4f9ae6', 'Зрелые наковальни']] } },
    { id: 'rgb_fog',     label: 'Туман (ночь)',         wms: 'msg_fes:rgb_fog',         legend: { rows: [['#4fe67a', 'Туман / низкая облачность'], ['#e64f4f', 'Плотные облака'], ['#3d3d80', 'Ясно (ночь)']] } },
    { id: 'rgb_dust',    label: 'Пыль',                 wms: 'msg_fes:rgb_dust',        legend: { rows: [['#e654c8', 'Пыль (розовое)'], ['#c8a03c', 'Сухой воздух'], ['#5a78b4', 'Облака']] } },
    { id: 'rgb_airmass', label: 'Воздушные массы',      wms: 'msg_fes:rgb_airmass',     legend: { rows: [['#4fb4e6', 'Холодная ВМ (голубое)'], ['#4fe6b4', 'Тёплая ВМ (зелёное)'], ['#b44fe6', 'Стратосферное вторжение']] } },
    { id: 'cth',         label: 'Высота вершин облаков', wms: 'msg_fes:cth',            legend: { rows: [['#d4553d', 'Очень высокие (>12 км)'], ['#e6d44f', 'Средние (5–8 км)'], ['#4f66e6', 'Низкие (<3 км)']] } },
    { id: 'fire',        label: 'Пожары',               wms: 'msg_fes:fire',            legend: { rows: [['#ff3d3d', 'Активный очаг'], ['#ffb43d', 'Вероятный очаг']] } },
    { id: 'rdt',         label: 'Грозы (RDT)',          wms: 'msg_fes:rdt',             legend: { rows: [['#ff3d3d', 'Зрелая грозовая ячейка'], ['#ffb43d', 'Развивающаяся'], ['#ffe63d', 'Зарождающаяся']] } },
    { id: 'gii_kindex',  label: 'K-индекс',             wms: 'msg_fes:gii_kindex',      legend: { rows: [['#d4553d', 'K > 35 (высокая неустойчивость)'], ['#e6d44f', 'K 25–35 (умеренная)'], ['#4f66e6', 'K < 25 (стабильно)']] } },
    { id: 'gii_liftedindex', label: 'Lifted Index',     wms: 'msg_fes:gii_liftedindex', legend: { rows: [['#d4553d', 'LI < −4 (сильная неустойчивость)'], ['#e6d44f', 'LI −4…0 (умеренная)'], ['#4f66e6', 'LI > 0 (стабильно)']] } }
  ];
  var satChIdx = 0;
  try { var savedCh = localStorage.getItem('satChannel'); var fi = SAT_CHANNELS.findIndex(function(c) { return c.id === savedCh; }); if (fi >= 0) satChIdx = fi; } catch (e) {}

  function satIso(ts) { return new Date(ts * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'); }

  /* Создание WMS-слоя: канал + опционально время кадра (null = актуальный «LIVE» кадр) */
  function createEumetsatLayer(opacity, channel, ts) {
    var ch = channel || SAT_CHANNELS[satChIdx];
    var params = {
      layers: ch.wms,
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      attribution: '© EUMETSAT',
      opacity: opacity !== undefined ? opacity : 0.8,
      tileSize: 256,
      maxZoom: 10 /* как у карты — не гонять WMS на бесполезных зумах */
    };
    if (ts) params.time = satIso(ts);
    return L.tileLayer.wms('https://view.eumetsat.int/geoserver/wms', params);
  }

  /* Индикация загрузки/ошибок WMS + авто-retry упавших тайлов (макс. 2 попытки) */
  function attachSatEvents(lyr) {
    var tries = {};
    lyr.on('loading', function() { if (lyr === eumetsatLayer) { satLoading = true; $('pulse').classList.add('busy'); satUpdateChip(); } });
    lyr.on('load', function() { if (lyr === eumetsatLayer) { satLoading = false; $('pulse').classList.remove('busy'); satUpdateChip(); } });
    lyr.on('tileerror', function(e) {
      var k = e.coords.x + ':' + e.coords.y + ':' + e.coords.z;
      var n = tries[k] || 0;
      if (n < 2) { /* повторная попытка с нарастающей паузой */
        tries[k] = n + 1;
        setTimeout(function() { if (map.hasLayer(lyr) && e.tile) e.tile.src = lyr.getTileUrl(e.coords); }, 900 * (n + 1));
      } else {
        if (lyr === eumetsatLayer) { satLoading = false; $('pulse').classList.remove('busy'); } /* не висим в .busy вечно */
        var now = Date.now();
        if (now - satErrToastTs > 30000) { satErrToastTs = now; toast('⚠️ Спутник недоступен — нажмите ↻ для повтора'); }
        satUpdateChip(true);
      }
    });
  }

  function loadPalettesFromStorage() {
    try {
      var r = localStorage.getItem('radarPalettes');
      if (r) {
        var parsedR = JSON.parse(r);
        if (Array.isArray(parsedR) && parsedR.length > 0) {
          var customR = parsedR.filter(function(p) { return !p.builtin; });
          palettes.radar.list = [{ name: 'Стандартная (радар)', items: BUILTIN_RADAR, builtin: true }].concat(customR);
        } else { initDefaultPalettes('radar'); }
      } else { initDefaultPalettes('radar'); }

      var w = localStorage.getItem('wxPalettes');
      if (w) {
        var parsedW = JSON.parse(w);
        if (Array.isArray(parsedW) && parsedW.length > 0) {
          var customW = parsedW.filter(function(p) { return !p.builtin; });
          palettes.wx.list = [{ name: 'Стандартная (явления)', items: BUILTIN_WX, builtin: true }].concat(customW);
        } else { initDefaultPalettes('wx'); }
      } else { initDefaultPalettes('wx'); }
    } catch (e) { initDefaultPalettes('radar'); initDefaultPalettes('wx'); }

    if (palettes.radar.activeIdx >= palettes.radar.list.length) palettes.radar.activeIdx = 0;
    if (palettes.wx.activeIdx >= palettes.wx.list.length) palettes.wx.activeIdx = 0;
  }
  function initDefaultPalettes(layer) { var items = layer === 'radar' ? BUILTIN_RADAR : BUILTIN_WX; var name = layer === 'radar' ? 'Стандартная (радар)' : 'Стандартная (явления)'; palettes[layer].list = [{ name: name, items: items, builtin: true }]; palettes[layer].activeIdx = 0; savePalettesToStorage(layer); }
  function savePalettesToStorage(layer) { try { localStorage.setItem(layer + 'Palettes', JSON.stringify(palettes[layer].list)); } catch (e) {} }
  function getCurrentPaletteItems() { var layer = S.layer; var list = palettes[layer].list; var idx = palettes[layer].activeIdx; if (!list || list.length === 0 || idx >= list.length) { initDefaultPalettes(layer); idx = 0; } return list[idx].items; }

  /* ─── Время: сетка и глубина истории зависят от слоя (радар 10 мин / спутник 15 мин) ─── */
  function stepSec() { return S.layer === 'sat' ? SAT_STEP : STEP; }
  function delaySec() { return S.layer === 'sat' ? SAT_DELAY : DELAY; }
  function histSec() { return S.layer === 'sat' ? SAT_HISTORY_SEC : MAX_HISTORY_SEC; }
  function nowTs() { return Math.floor((Date.now() / 1000 - delaySec()) / stepSec()) * stepSec(); }
  function minTs() { return nowTs() - histSec(); }
  S.ts = nowTs();
  function setTime(t, m) { S.ts = Math.max(minTs(), Math.min(t, nowTs())); S.manualTime = !!m; }

  var map = L.map('map', { center: [57, 55], zoom: 6, minZoom: 3, maxZoom: 10, zoomControl: false, fadeAnimation: false, markerZoomAnimation: false, scrollWheelZoom: true, doubleClickZoom: true, boxZoom: true, touchZoom: true, keyboard: true });
  var darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', { subdomains: 'abcd', maxZoom: 20, attribution: '© OpenStreetMap, © CARTO' });
  var lightTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', { subdomains: 'abcd', maxZoom: 20, attribution: '© OpenStreetMap, © CARTO' });
  darkTileLayer.addTo(map);
  L.control.scale({ position: 'bottomright', metric: true, imperial: false }).addTo(map);
  setTimeout(function() { map.invalidateSize(); }, 500);

  var canvas = $('radar'), ctx = canvas.getContext('2d');
  /* ─── Retina: физический размер = CSS-пиксели × DPR, вся геометрия остаётся в CSS-пикселях
     благодаря ctx.setTransform(DPR,...) в doRender ─── */
  function resizeCanvas() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * DPR);
    canvas.height = Math.round(innerHeight * DPR);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    updThumb(); schedRender();
  }
  addEventListener('resize', resizeCanvas); resizeCanvas();

  /* ─── Crossfade кадров радара: снимок текущего canvas в offscreen-канвас,
     старый кадр гаснет (1-alpha), новый проявляется (alpha) через rAF ─── */
  var prevFrame = { canvas: document.createElement('canvas'), valid: false };
  function startFrameFade() {
    if (S.layer === 'sat') return;
    try {
      if (canvas.width > 0 && canvas.height > 0) {
        prevFrame.canvas.width = canvas.width; prevFrame.canvas.height = canvas.height;
        prevFrame.canvas.getContext('2d').drawImage(canvas, 0, 0);
        prevFrame.valid = true;
      }
    } catch (e) { prevFrame.valid = false; }
    S.fade.active = true; S.fade.start = performance.now(); S.fade.alpha = 0;
  }

  /* ─── Статус-чип (#dbg): слой · время кадра · состояние ─── */
  function setChip(text) { var el = $('dbg'); if (el.textContent !== text) el.textContent = text; }
  function satUpdateChip(err) {
    if (S.layer !== 'sat') return;
    var ch = SAT_CHANNELS[satChIdx];
    var live = S.ts >= nowTs();
    var tstr = new Date((live ? nowTs() : S.ts) * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
    setChip('🛰 ' + ch.label + ' · ' + tstr + ' МСК' + (live ? ' (LIVE, ~15 мин задержка)' : '') + (satLoading ? ' · ⏳' : '') + (err ? ' · ⚠️' : '') + ' · © EUMETSAT');
  }

  /* ─── Применение времени/канала спутника: новый WMS-слой поверх, старый снимается
     после загрузки нового — ни пустой карты, ни «чёрной вспышки».
     Дебаунс 180мс гасит лавину запросов при перетаскивании трека ─── */
  var satSwapTmr = null;
  function satApplyTime(immediate) {
    if (S.layer !== 'sat') return;
    clearTimeout(satSwapTmr);
    satSwapTmr = setTimeout(function() {
      if (S.layer !== 'sat') return;
      var ch = SAT_CHANNELS[satChIdx];
      var live = S.ts >= nowTs();
      var old = eumetsatLayer;
      /* Недогруженный «предыдущий предыдущий» слой убираем сразу */
      if (satOldLayer && map.hasLayer(satOldLayer)) { map.removeLayer(satOldLayer); satOldLayer = null; }
      var lyr = createEumetsatLayer(parseInt($('opacity-slider').value) / 100, ch, live ? null : S.ts);
      attachSatEvents(lyr);
      lyr.addTo(map);
      eumetsatLayer = lyr;
      if (old) {
        satOldLayer = old;
        var rm = function() { if (satOldLayer === old && map.hasLayer(old)) { map.removeLayer(old); satOldLayer = null; } };
        lyr.once('load', rm);
        setTimeout(rm, 5000); /* страховка, если 'load' не пришёл (ошибки тайлов) */
      }
      satUpdateChip();
    }, immediate ? 0 : 180);
  }

  /* ─── Crossfade канваса радара при переключении radar↔sat (вместо резкого display) ─── */
  function fadeCanvas(show) {
    var target = parseInt($('opacity-slider').value) / 100;
    if (REDUCE_MOTION) { canvas.style.display = show ? 'block' : 'none'; canvas.style.opacity = target; return; }
    if (show) {
      canvas.style.display = 'block'; canvas.style.opacity = 0; void canvas.offsetWidth;
      canvas.classList.add('cfade'); canvas.style.opacity = target;
      setTimeout(function() { canvas.classList.remove('cfade'); }, 300);
    } else {
      canvas.classList.add('cfade'); canvas.style.opacity = 0;
      setTimeout(function() { canvas.classList.remove('cfade'); if (S.layer === 'sat') canvas.style.display = 'none'; canvas.style.opacity = target; }, 280);
    }
  }

  function lon2x(lon, z) { return Math.floor((lon + 180) / 360 * (1 << z)); }
  function lat2y(lat, z) { var r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z)); }
  function x2lon(x, z) { return x / (1 << z) * 360 - 180; }
  function y2lat(y, z) { var n = Math.PI - 2 * Math.PI * y / (1 << z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }
  function visTiles() { var b = map.getBounds(), mx = (1 << FZ) - 1, x0 = Math.max(0, lon2x(b.getWest(), FZ)), x1 = Math.min(mx, lon2x(b.getEast(), FZ)), y0 = Math.max(0, lat2y(b.getNorth(), FZ)), y1 = Math.min(mx, lat2y(b.getSouth(), FZ)), l = []; for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) l.push({ x: x, y: y }); return l; }
  function tileRect(x, y) { var nw = map.latLngToContainerPoint(L.latLng(y2lat(y, FZ), x2lon(x, FZ))); var se = map.latLngToContainerPoint(L.latLng(y2lat(y + 1, FZ), x2lon(x + 1, FZ))); return { sx: Math.round(nw.x), sy: Math.round(nw.y), sw: Math.round(se.x - nw.x), sh: Math.round(se.y - nw.y) }; }
  function makeCK(l, t, p, x, y) { return l + '|' + t + '|' + p + '|' + x + '|' + y; }
  function CK(x, y) { return makeCK(S.layer, S.ts, S.px, x, y); }
  function getColor(raw) { if (raw < MDBZ) return null; var items = getCurrentPaletteItems(); for (var i = 0; i < items.length; i++) { if (raw >= items[i].v) return items[i].r; } return null; }

  function interpolateRaw(raw, w, h, scale) {
    var nw = w * scale, nh = h * scale; var newRaw = new Float32Array(nw * nh);
    for (var y = 0; y < nh; y++) { for (var x = 0; x < nw; x++) {
      var gx = x / scale, gy = y / scale; var x0 = Math.floor(gx), y0 = Math.floor(gy); var x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
      var tx = gx - x0, ty = gy - y0; var p00 = raw[y0 * w + x0], p01 = raw[y0 * w + x1], p10 = raw[y1 * w + x0], p11 = raw[y1 * w + x1];
      if (p00 < 0 && p01 < 0 && p10 < 0 && p11 < 0) { newRaw[y * nw + x] = -1; } 
      else { var sum = 0, count = 0; if (p00 >= 0) { sum += p00 * (1-tx) * (1-ty); count += (1-tx)*(1-ty); } if (p01 >= 0) { sum += p01 * tx * (1-ty); count += tx*(1-ty); } if (p10 >= 0) { sum += p10 * (1-tx) * ty; count += (1-tx)*ty; } if (p11 >= 0) { sum += p11 * tx * ty; count += tx*ty; } newRaw[y * nw + x] = count > 0 ? sum / count : -1; }
    } }
    return { data: newRaw, w: nw, h: nh };
  }

  function applySmoothing(raw, w, h, strength) { 
    if (strength === 0) return raw; 
    var size = strength * 2 + 1; var half = Math.floor(size / 2); var result = new Float32Array(raw.length); var kernel = []; var sigma = strength * 0.6 + 0.5; var sum = 0; 
    for (var i = -half; i <= half; i++) { for (var j = -half; j <= half; j++) { var d = Math.sqrt(i * i + j * j); var val = Math.exp(-(d * d) / (2 * sigma * sigma)); kernel.push(val); sum += val; } } 
    for (var ki = 0; ki < kernel.length; ki++) kernel[ki] /= sum; 
    var kw = size, kh = size; 
    for (var y = 0; y < h; y++) { for (var x = 0; x < w; x++) { var acc = 0, wsum = 0; for (var ky = -half; ky <= half; ky++) { for (var kx = -half; kx <= half; kx++) { var px = x + kx, py = y + ky; if (px < 0 || px >= w || py < 0 || py >= h) continue; var idx = py * w + px; if (raw[idx] >= 0) { var kidx = (ky + half) * kw + (kx + half); acc += raw[idx] * kernel[kidx]; wsum += kernel[kidx]; } } } var idx2 = y * w + x; result[idx2] = (wsum > 0) ? acc / wsum : -1; } } 
    return result; 
  }

  function processTile(img, px, smooth, smoothStrength) {
    var src = document.createElement('canvas'); src.width = src.height = 256; var sc = src.getContext('2d'); sc.drawImage(img, 0, 0);
    var id = sc.getImageData(0, 0, 256, 256), d = id.data; var w = 256, h = 256; var raw = new Float32Array(w * h);
    for (var i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) { var v = (d[i] + d[i + 1] + d[i + 2]) / 3 | 0; raw[i / 4] = v; } else { raw[i / 4] = -1; } }
    var targetRaw = raw, targetW = w, targetH = h;
    /* На мобильных пропускаем 2× интерполяцию (px<1): в 4 раза меньше вычислений, разница на экране телефона незаметна */
    if (px < 1 && !IS_MOBILE) { var scale = 1 / px; var interp = interpolateRaw(raw, w, h, scale); targetRaw = interp.data; targetW = interp.w; targetH = interp.h; }
    var smoothed = targetRaw;
    if (smooth && smoothStrength > 0) { smoothed = applySmoothing(targetRaw, targetW, targetH, smoothStrength); }
    var out = document.createElement('canvas'); out.width = targetW; out.height = targetH; var oc = out.getContext('2d'); oc.imageSmoothingEnabled = false;
    var effectivePx = (px < 1) ? 1 : px; var bw = Math.ceil(targetW / effectivePx), bh = Math.ceil(targetH / effectivePx);
    for (var py = 0; py < bh; py++) { for (var pxx = 0; pxx < bw; pxx++) {
      var x0 = pxx * effectivePx, y0 = py * effectivePx, x1 = Math.min(x0 + effectivePx, targetW), y1 = Math.min(y0 + effectivePx, targetH);
      var sum = 0, n = 0;
      for (var yy = y0; yy < y1; yy++) { for (var xx = x0; xx < x1; xx++) { var idx = yy * targetW + xx; if (smoothed[idx] >= 0) { sum += smoothed[idx]; n++; } } }
      if (n > 0) { var avg = Math.round(sum / n); var rgb = getColor(avg); if (rgb) { oc.fillStyle = 'rgb(' + rgb.join(',') + ')'; oc.fillRect(x0, y0, x1 - x0, y1 - y0); } }
    } }
    return { canvas: out, raw: smoothed, px: px, scaled: false };
  }

  function bumpLoad(d) { S.loadN = Math.max(0, S.loadN + d); $('pulse').classList.toggle('busy', S.loadN > 0 || satLoading); }

  /* ─── Очередь обработки тайлов: тяжёлые processTile выполняются порциями ≤8мс на кадр rAF,
     чтобы главный поток (и UI) не замирал при сглаживании/смене разрешения ─── */
  var procQueue = [], procScheduled = false;
  function drainProcQueue() {
    procScheduled = false;
    var t0 = performance.now();
    while (procQueue.length && (performance.now() - t0) < 8) {
      var job = procQueue.shift();
      if (S.ts !== job.sts || S.layer !== job.sl) continue; /* кадр уже неактуален */
      try {
        var result = processTile(job.img, job.spx, job.ssmooth, job.sstrength);
        if (S.cache.size >= S.cacheMax) S.cache.delete(S.cache.keys().next().value);
        S.cache.set(job.ck, result);
      } catch (e) { S.failed.add(job.ck); }
    }
    if (procQueue.length && !procScheduled) { procScheduled = true; requestAnimationFrame(drainProcQueue); }
    schedRender();
  }
  function enqueueTile(job) { procQueue.push(job); if (!procScheduled) { procScheduled = true; requestAnimationFrame(drainProcQueue); } }

  function fetchTile(x, y) {
    var ck = CK(x, y); if (S.cache.has(ck) || S.pending.has(ck) || S.failed.has(ck)) return;
    S.pending.add(ck); bumpLoad(1); var url = SRC + '/' + S.ts + '/' + FZ + '/' + x + '_' + y + '.png'; var img = new Image(); img.crossOrigin = 'anonymous';
    var spx = S.px, sl = S.layer, sts = S.ts, ssmooth = S.smooth, sstrength = S.smoothStrength;
    var tid = setTimeout(function() { S.pending.delete(ck); bumpLoad(-1); S.failed.add(ck); }, 8000);
    img.onload = function() { clearTimeout(tid); S.pending.delete(ck); bumpLoad(-1); if (S.ts !== sts || S.layer !== sl) return; enqueueTile({ img: img, ck: ck, spx: spx, sl: sl, sts: sts, ssmooth: ssmooth, sstrength: sstrength }); };
    img.onerror = function() { clearTimeout(tid); S.pending.delete(ck); bumpLoad(-1); S.failed.add(ck); };
    img.src = url;
  }

  var renderPend = false;
  function schedRender() { if (!renderPend) { renderPend = true; requestAnimationFrame(doRender); } }
  function doRender() {
    renderPend = false;
    /* DPR-масштаб: рисуем в CSS-пикселях, физически — в device-пикселях (чёткость на retina) */
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (S.layer === 'sat') { satUpdateChip(); return; }
    if (S.fade.active) { var elapsed = (performance.now() - S.fade.start) / S.fade.duration; if (elapsed >= 1) { S.fade.active = false; S.fade.alpha = 1; prevFrame.valid = false; } else { S.fade.alpha = Math.min(elapsed, 1); S.fade.alpha = 1 - Math.pow(1 - S.fade.alpha, 3); schedRender(); } }
    var alpha = S.fade.active ? S.fade.alpha : 1; var tiles = visTiles();
    /* Старый кадр гаснет под новым; снимок хранится в device-пикселях → рисуем с identity-матрицей */
    if (S.fade.active && prevFrame.valid) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1 - alpha; ctx.drawImage(prevFrame.canvas, 0, 0); ctx.restore(); }
    ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
    var hit = 0, miss = 0;
    for (var i = 0; i < tiles.length; i++) { 
      var t = tiles[i], ck = CK(t.x, t.y), entry = S.cache.get(ck); 
      if (entry && entry.canvas) { var r = tileRect(t.x, t.y); if (r.sw > 0 && r.sh > 0) { ctx.drawImage(entry.canvas, r.sx, r.sy, r.sw, r.sh); hit++; } } else { fetchTile(t.x, t.y); miss++; } 
    }
    ctx.globalAlpha = 1;
    /* Статус-чип: слой · время кадра МСК · загрузка */
    var lname = S.layer === 'radar' ? 'dBZ' : 'ОЯ';
    var tstr = new Date(S.ts * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
    setChip(lname + ' · ' + tstr + ' МСК' + (miss > 0 ? ' · ⏳' + miss : ''));
    if (S.layer === 'wx') { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1; ctx.beginPath(); for (var gi = 0; gi < tiles.length; gi++) { var gt = tiles[gi], gr = tileRect(gt.x, gt.y); if (gr.sw <= 0 || gr.sh <= 0) continue; var scX = gr.sw / 256, scY = gr.sh / 256, bW = S.px * scX, bH = S.px * scY; if (bW < 1 || bH < 1) continue; var cols = Math.ceil(256 / S.px); for (var ci = 0; ci <= cols; ci++) { var lx = gr.sx + Math.round(ci * bW) + 0.5; ctx.moveTo(lx, gr.sy); ctx.lineTo(lx, gr.sy + gr.sh); } for (var ri = 0; ri <= cols; ri++) { var ly = gr.sy + Math.round(ri * bH) + 0.5; ctx.moveTo(gr.sx, ly); ctx.lineTo(gr.sx + gr.sw, ly); } } ctx.stroke(); ctx.restore(); }
  }

  map.on('move', schedRender); map.on('movestart', function() { prevFrame.valid = false; }); map.on('moveend zoomend', function() { if (S.layer !== 'sat') S.failed.clear(); schedRender(); });
  function forceRefresh() { S.cache.clear(); S.failed.clear(); S.pending.clear(); S.loadN = 0; $('pulse').classList.remove('busy'); schedRender(); }
  /* Вращение иконки ↻ — видимый статус обновления */
  function spinRefreshBtn() { var b = $('btn-refresh'); retrig(b, 'spinning'); setTimeout(function() { b.classList.remove('spinning'); }, 850); }
  function doRefresh() { 
    spinRefreshBtn();
    if (S.layer === 'sat') { 
      /* Пересоздаём слой с сохранением выбранного канала и времени кадра */
      satErrToastTs = 0;
      satApplyTime(true);
      buildFrames(); updHUD();
      toast('Спутник обновлён'); 
      return; 
    }
    setTime(nowTs(), false); startFrameFade(); buildFrames(); updHUD(); forceRefresh(); toast('Обновлено'); 
  }
  function updHUD() { updThumb(); }
  /* Прогресс и thumb — через transform (scaleX/translateX), а не left/width: без layout-перерасчётов */
  function updThumb() { var f = S.frames; if (!f.length) return; var r = f[f.length - 1] - f[0], p = r === 0 ? 0 : Math.max(0, Math.min(1, (S.ts - f[0]) / r)); var tw = $('track').offsetWidth; $('tfill').style.transform = 'scaleX(' + p + ')'; $('tthumb').style.transform = 'translate(' + (p * tw) + 'px, -50%) translateX(-50%)'; }
  function buildFrames() {
    /* Работает для радара И спутника: сетка времени задаётся stepSec()/histSec() */
    var mx = nowTs(), from = mx - histSec(), frames = [];
    for (var t = from; t <= mx; t += stepSec()) frames.push(t);
    S.frames = frames;
    buildFramesUI();
  }
  function buildFramesUI() {
    var el = $('tlbls'); el.innerHTML = '';
    if (!S.frames.length) return;
    for (var i = 0; i < 5; i++) {
      var idx = Math.round(i / 4 * (S.frames.length - 1));
      if (idx >= S.frames.length) idx = S.frames.length - 1;
      var s = document.createElement('span');
      s.textContent = new Date(S.frames[idx] * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
      el.appendChild(s);
    }
    updThumb();
  }

  var drag = false, timeTooltip = $('time-tooltip');
  function tsFromX(cx) { var r = $('track').getBoundingClientRect(); var p = Math.max(0, Math.min(1, (cx - r.left) / r.width)); return S.frames[Math.round(p * (S.frames.length - 1))] || nowTs(); }
  function pctFromX(cx) { var r = $('track').getBoundingClientRect(); return Math.max(0, Math.min(1, (cx - r.left) / r.width)) * 100; }
  function formatTimeDiff(ts) { var now = nowTs(), diff = ts - now, ad = Math.abs(diff); if (ad < 60) return { text: 'сейчас', cls: 'now' }; var mins = Math.round(ad / 60), hours = Math.floor(mins / 60), rm = mins % 60, text = ''; if (hours > 0) { text = hours + 'ч'; if (rm > 0) text += ' ' + rm + 'м'; } else text = mins + 'м'; return diff < 0 ? { text: '−' + text + ' назад', cls: 'past' } : { text: '+' + text + ' вперёд', cls: 'future' }; }
  function showTimeTooltip(ts, pct) { var d = new Date(ts * 1000), ts2 = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Moscow' }), ds = d.toLocaleDateString('ru', { day: '2-digit', month: 'short', timeZone: 'Europe/Moscow' }), di = formatTimeDiff(ts); timeTooltip.innerHTML = '<div class="tt-time">' + ts2 + '</div><div class="tt-date">' + ds + ' МСК</div><div class="tt-diff ' + di.cls + '">' + di.text + '</div>'; timeTooltip.style.left = pct + '%'; timeTooltip.classList.add('visible'); }
  function hideTimeTooltip() { timeTooltip.classList.remove('visible'); }
  $('track').addEventListener('pointerdown', function(e) { drag = true; this.classList.add('dragging'); var ts = tsFromX(e.clientX), pct = pctFromX(e.clientX); S.ts = ts; updHUD(); S.manualTime = true; schedRender(); showTimeTooltip(ts, pct); this.setPointerCapture(e.pointerId); });
  $('track').addEventListener('pointermove', function(e) { if (drag) { var ts = tsFromX(e.clientX), pct = pctFromX(e.clientX); S.ts = ts; updHUD(); schedRender(); showTimeTooltip(ts, pct); if (S.layer === 'sat') satApplyTime(); } });
  document.addEventListener('pointerup', function() { if (drag) { drag = false; $('track').classList.remove('dragging'); hideTimeTooltip(); if (S.layer === 'sat') { satApplyTime(true); } else { startFrameFade(); buildFrames(); S.failed.clear(); forceRefresh(); } } });
  $('track').addEventListener('mousemove', function(e) { if (!drag) showTimeTooltip(tsFromX(e.clientX), pctFromX(e.clientX)); });
  $('track').addEventListener('mouseleave', function() { if (!drag) hideTimeTooltip(); });

  /* Для спутника базовый интервал больше: каждый кадр — сетевые WMS-тайлы */
  function animMs() { return (S.layer === 'sat' ? 2000 : 900) / S.speeds[S.speedI]; }
  function togglePlay() { S.playing ? stopPlay() : startPlay(); }
  function startPlay() {
    buildFrames(); S.frameI = 0; 
    S.timer = setInterval(function() {
      S.frameI = (S.frameI + 1) % S.frames.length;
      startFrameFade(); /* crossfade между кадрами (для sat — no-op) */
      S.ts = S.frames[S.frameI];
      if (S.layer === 'sat') { satApplyTime(); } else { S.failed.clear(); schedRender(); }
      updHUD();
    }, animMs());
    S.playing = true; $('playbtn').innerHTML = '&#x25A0;'; retrig($('playbtn'), 'pop');
  }
  function stopPlay() { var was = S.playing; clearInterval(S.timer); S.timer = null; S.playing = false; $('playbtn').innerHTML = '&#x25B6;'; if (was) retrig($('playbtn'), 'pop'); }
  function cycleSpeed() { S.speedI = (S.speedI + 1) % S.speeds.length; var spd = $('spd'); spd.textContent = S.speeds[S.speedI] + '×'; spd.classList.toggle('on', S.speedI > 0); retrig(spd, 'bump'); if (S.playing) { stopPlay(); startPlay(); } }
  function shiftTs(d) {
    stopPlay();
    var n = Math.round((S.ts + d) / stepSec()) * stepSec(); var mn = minTs(), mx = nowTs();
    n = Math.max(mn, Math.min(n, mx)); if (n <= mn) toast('⚠️ Максимум ' + Math.round(histSec() / 60) + ' мин назад');
    if (S.layer === 'sat') { setTime(n, true); buildFrames(); updHUD(); satApplyTime(true); }
    else { startFrameFade(); setTime(n, true); buildFrames(); updHUD(); S.failed.clear(); forceRefresh(); }
    toast('⏱ ' + new Date(S.ts * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }));
  }
  
  function setLayer(newLayer) {
    if (!newLayer || newLayer === S.layer) return;
    S.layer = newLayer;
    document.querySelectorAll('#layers-dropdown .dd-item').forEach(function(item) { item.classList.toggle('active', item.dataset.layer === S.layer); });
    $('btn-layers-menu').textContent = 'Слои: ' + (S.layer === 'radar' ? 'dBZ' : (S.layer === 'wx' ? 'ОЯ' : 'Спутник'));

    stopPlay();
    if (S.layer === 'sat') {
      /* Спутник: канвас радара плавно гаснет, таймлайн ОСТАЁТСЯ (история WMS через time=) */
      fadeCanvas(false);
      $('channel-wrapper').style.display = 'block';
      S.manualTime = false; S.ts = nowTs();
      buildFrames(); updHUD();
      satApplyTime(true);
      map.invalidateSize();
      toast('Спутник EUMETSAT: ' + SAT_CHANNELS[satChIdx].label);
    } else {
      /* Возврат к радару: снимаем WMS-слои, канвас плавно проявляется */
      startFrameFade(); /* снимок старого слоя для crossfade (radar↔wx) */
      if (eumetsatLayer) { map.removeLayer(eumetsatLayer); eumetsatLayer = null; }
      if (satOldLayer) { if (map.hasLayer(satOldLayer)) map.removeLayer(satOldLayer); satOldLayer = null; }
      satLoading = false; $('pulse').classList.remove('busy');
      $('channel-wrapper').style.display = 'none';
      fadeCanvas(true);
      S.manualTime = false; S.ts = nowTs();
      S.pxIndex = 1; S.px = S.pxLevels[S.pxIndex]; updatePxLabel();
      S.cache.clear(); S.pending.clear(); S.failed.clear();
      buildFrames(); forceRefresh();
    }
    buildLegend(); hidePopup();
    if (S.ruler.active) toggleRuler();
  }

  /* ─── Выбор канала спутника ─── */
  function setSatChannel(idx) {
    if (idx < 0 || idx >= SAT_CHANNELS.length || idx === satChIdx) { $('channel-dropdown').classList.remove('visible'); return; }
    satChIdx = idx;
    try { localStorage.setItem('satChannel', SAT_CHANNELS[idx].id); } catch (e) {}
    var ch = SAT_CHANNELS[idx];
    $('btn-channel').textContent = 'Канал: ' + ch.label;
    document.querySelectorAll('#channel-dropdown .dd-item').forEach(function(item, i) { item.classList.toggle('active', i === idx); });
    $('channel-dropdown').classList.remove('visible');
    /* Подсказка для дневных каналов ночью (грубая оценка: 03–17 UTC ≈ светлое время для зоны MSG) */
    var utcH = new Date().getUTCHours();
    if (ch.day && (utcH < 3 || utcH > 17)) toast('☀️ Канал «' + ch.label + '» информативен только днём');
    buildLegend();
    satApplyTime(true);
    satUpdateChip();
  }
  function initChannelUI() {
    var dd = $('channel-dropdown');
    SAT_CHANNELS.forEach(function(ch, i) {
      var item = document.createElement('div');
      item.className = 'dd-item' + (i === satChIdx ? ' active' : '');
      item.setAttribute('tabindex', '0'); item.setAttribute('role', 'button');
      item.textContent = ch.label + (ch.day ? ' ☀️' : '');
      item.addEventListener('click', function() { setSatChannel(i); });
      item.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSatChannel(i); $('btn-channel').focus(); } });
      dd.appendChild(item);
    });
    $('btn-channel').textContent = 'Канал: ' + SAT_CHANNELS[satChIdx].label;
    $('btn-channel').addEventListener('click', function(e) { e.stopPropagation(); dd.classList.toggle('visible'); });
    document.addEventListener('click', function(e) { if (!$('channel-wrapper').contains(e.target)) dd.classList.remove('visible'); });
  }
  initChannelUI();

  function cyclePx() { if (S.layer === 'sat') return; S.pxIndex = (S.pxIndex + 1) % S.pxLevels.length; S.px = S.pxLevels[S.pxIndex]; updatePxLabel(); S.cache.clear(); S.pending.clear(); S.failed.clear(); forceRefresh(); var resKm = (S.px * BASE_RES_KM).toFixed(1); toast('Разрешение: ' + resKm + ' км/пиксель'); schedRender(); }
  function updatePxLabel() { var resKm = (S.px * BASE_RES_KM); var label = resKm.toFixed(1) + ' км'; if (resKm === 1) label = '1x1 км'; if (resKm === 2) label = '2x2 км'; if (resKm === 4) label = '4x4 км'; if (resKm === 8) label = '8x8 км'; $('pxbtn').textContent = label; }
  /* Текст кнопок не меняем на «✓» — активность показывает состояние .on (без прыжков ширины) */
  function toggleSmooth() { if (S.layer === 'sat') return; S.smooth = !S.smooth; var btn = $('btn-smooth'); var ctrl = $('smooth-control'); if (S.smooth) { btn.classList.add('on'); ctrl.classList.add('active'); } else { btn.classList.remove('on'); ctrl.classList.remove('active'); } S.cache.clear(); S.pending.clear(); S.failed.clear(); forceRefresh(); toast(S.smooth ? 'Сглаживание включено (сила ' + S.smoothStrength + ')' : 'Сглаживание выключено'); }

  function toggleRuler() { S.ruler.active = !S.ruler.active; var btn = $('btn-ruler'); if (S.ruler.active) { btn.classList.add('on'); toast('Клик — точка, двойной клик — завершить.'); map.on('click', rulerClick); map.on('dblclick', rulerFinish); if (crosshairMode) toggleCrosshair(); } else { btn.classList.remove('on'); map.off('click', rulerClick); map.off('dblclick', rulerFinish); clearRuler(); } }
  function rulerClick(e) { if (!S.ruler.active) return; var latlng = e.latlng; S.ruler.points.push(latlng); var marker = L.circleMarker(latlng, { radius: 5, color: '#5b8def', fillColor: '#fff', fillOpacity: 1, weight: 2, className: 'ruler-marker' }).addTo(map); S.ruler.markers.push(marker); updateRulerLine(); updateRulerLabels(); }
  function updateRulerLine() { if (S.ruler.polyline) { map.removeLayer(S.ruler.polyline); S.ruler.polyline = null; } if (S.ruler.points.length >= 2) { S.ruler.polyline = L.polyline(S.ruler.points, { color: '#5b8def', weight: 2, dashArray: '6 4', opacity: 0.8, className: 'ruler-line' }).addTo(map); } }
  function updateRulerLabels() { S.ruler.segmentLabels.forEach(function(l) { map.removeLayer(l); }); S.ruler.segmentLabels = []; if (S.ruler.label) { map.removeLayer(S.ruler.label); S.ruler.label = null; } if (S.ruler.points.length < 2) return; var totalDist = 0; for (var i = 1; i < S.ruler.points.length; i++) { totalDist += S.ruler.points[i - 1].distanceTo(S.ruler.points[i]); } var distKm = (totalDist / 1000).toFixed(1); var midIdx = Math.floor((S.ruler.points.length - 1) / 2); var midLatLng = S.ruler.points[midIdx]; var labelHtml = '<div class="ruler-label">📏 ' + distKm + ' км</div>'; S.ruler.label = L.marker(midLatLng, { icon: L.divIcon({ className: '', html: labelHtml, iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(map); for (var j = 1; j < S.ruler.points.length; j++) { var p1 = S.ruler.points[j - 1], p2 = S.ruler.points[j]; var segDist = (p1.distanceTo(p2) / 1000).toFixed(1); var midSeg = L.latLng((p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2); var segLabel = L.marker(midSeg, { icon: L.divIcon({ className: '', html: '<div class="ruler-segment-label">' + segDist + ' км</div>', iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(map); S.ruler.segmentLabels.push(segLabel); } }
  function clearRuler() { S.ruler.points = []; if (S.ruler.polyline) { map.removeLayer(S.ruler.polyline); S.ruler.polyline = null; } if (S.ruler.label) { map.removeLayer(S.ruler.label); S.ruler.label = null; } S.ruler.segmentLabels.forEach(function(l) { map.removeLayer(l); }); S.ruler.segmentLabels = []; S.ruler.markers.forEach(function(m) { map.removeLayer(m); }); S.ruler.markers = []; }
  function rulerFinish(e) { if (!S.ruler.active) return; if (S.ruler.points.length < 2) { toast('Нужно минимум 2 точки'); } else { var total = 0; for (var i = 1; i < S.ruler.points.length; i++) { total += S.ruler.points[i - 1].distanceTo(S.ruler.points[i]); } toast('📏 Длина: ' + (total / 1000).toFixed(1) + ' км'); } toggleRuler(); }

  function setLegendTitle(t) { var el = $('ltitle'); if (el.textContent !== t) { el.textContent = t; retrig(el, 'title-swap'); } }
  function buildLegend() { 
    var el = $('lbody'); el.innerHTML = ''; 
    if (S.layer === 'sat') {
      var ch = SAT_CHANNELS[satChIdx];
      setLegendTitle('СПУТНИК · ' + ch.label.toUpperCase());
      var lg = ch.legend || {}; var idx = 0;
      /* Градиентная шкала для grayscale-каналов (IR/WV): холодно → тепло */
      if (lg.grad) {
        var g = document.createElement('div'); g.className = 'lgrad';
        g.style.background = 'linear-gradient(to right, ' + lg.grad.join(', ') + ')';
        g.style.setProperty('--i', idx++); g.classList.add('li');
        el.appendChild(g);
        var cap = document.createElement('div'); cap.className = 'li lgrad-cap'; cap.style.setProperty('--i', idx++);
        cap.innerHTML = '<span>холодно</span><span>тепло</span>';
        el.appendChild(cap);
      }
      (lg.rows || []).forEach(function(r) {
        var row = document.createElement('div'); row.className = 'li'; row.style.setProperty('--i', Math.min(idx++, 14));
        var sq = document.createElement('div'); sq.className = 'lsq'; sq.style.background = r[0];
        var t = document.createElement('span'); t.textContent = r[1];
        row.appendChild(sq); row.appendChild(t); el.appendChild(row);
      });
      if (ch.day) { var d = document.createElement('div'); d.className = 'li legend-note'; d.style.setProperty('--i', Math.min(idx++, 14)); d.textContent = '☀️ Канал информативен только днём'; el.appendChild(d); }
      /* Обязательная атрибуция по лицензии EUMETSAT */
      var attr = document.createElement('div'); attr.className = 'li legend-note'; attr.style.setProperty('--i', Math.min(idx++, 14)); attr.textContent = '© EUMETSAT'; el.appendChild(attr);
      return;
    }
    var items = getCurrentPaletteItems(); var title = S.layer === 'radar' ? 'ОТРАЖАЕМОСТЬ dBZ' : 'ПОГОДНЫЕ ЯВЛЕНИЯ'; setLegendTitle(title); 
    items.forEach(function(p, i) { var row = document.createElement('div'); row.className = 'li'; row.style.setProperty('--i', Math.min(i, 14)); var sq = document.createElement('div'); sq.className = 'lsq'; sq.style.background = 'rgb(' + p.r + ')'; if (!p.r[0] && !p.r[1] && !p.r[2]) sq.style.border = '1px solid #555'; var t = document.createElement('span'); t.textContent = p.l; row.appendChild(sq); row.appendChild(t); el.appendChild(row); }); 
  }
  function toggleLegend() { var lg = $('legend'), btn = $('toggle-legend-btn'); if (S.legendVis) { lg.classList.add('collapsed'); btn.innerHTML = '+'; } else { lg.classList.remove('collapsed'); btn.innerHTML = '−'; } S.legendVis = !S.legendVis; }
  /* ─── Toast: отдельный элемент снизу по центру, fade+slide, очередь сообщений.
     Сигнатура toast(m) сохранена — все существующие вызовы работают ─── */
  var toastEl = document.createElement('div');
  toastEl.id = 'toast'; toastEl.setAttribute('role', 'status');
  document.body.appendChild(toastEl);
  var toastQueue = [], toastActive = false;
  function toast(m) {
    toastQueue.push(m);
    if (toastQueue.length > 3) toastQueue = toastQueue.slice(-3); /* не копим лавину */
    if (!toastActive) nextToast();
  }
  function nextToast() {
    if (!toastQueue.length) { toastActive = false; return; }
    toastActive = true;
    toastEl.textContent = toastQueue.shift();
    toastEl.classList.add('show');
    setTimeout(function() {
      toastEl.classList.remove('show');
      setTimeout(nextToast, REDUCE_MOTION ? 30 : 220); /* дождаться fade-out */
    }, 2500);
  }

  /* Авто-подтяжка данных: радар — каждую минуту; спутник — при появлении нового 15-мин кадра */
  setInterval(function() {
    if (S.playing || S.manualTime) { if (S.layer !== 'sat') buildFrames(); return; }
    var n = nowTs();
    if (n !== S.ts) {
      S.ts = n; updHUD();
      if (S.layer === 'sat') { satApplyTime(true); buildFrames(); toast('Новый снимок спутника'); }
      else { forceRefresh(); toast('Новые данные'); }
    }
    buildFrames();
  }, 60000);

  var hoverEl = $('hover-indicator'), popupEl = $('pixel-popup'), crosshairEl = $('crosshair'), crosshairLbl = $('crosshair-label');
  var popupVisible = false, crosshairMode = false;
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function findPalEntry(r, g, b) { var items = getCurrentPaletteItems(), best = null, bd = 1e9; for (var i = 0; i < items.length; i++) { var p = items[i], dr = r - p.r[0], dg = g - p.r[1], db = b - p.r[2], d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; best = p; } } return bd < 3000 ? { label: best.l, v: best.v } : null; }
  
  function getBlockAt(mx, my) { 
    if (S.layer === 'sat') return null; 
    var tiles = visTiles(); 
    for (var i = 0; i < tiles.length; i++) { 
      var t = tiles[i], r = tileRect(t.x, t.y); 
      if (r.sw <= 0 || r.sh <= 0 || mx < r.sx || mx >= r.sx + r.sw || my < r.sy || my >= r.sy + r.sh) continue; 
      var ck = CK(t.x, t.y), entry = S.cache.get(ck); 
      if (!entry || !entry.canvas) return null; 
      var targetSize = entry.canvas.width; var effectivePx = (S.px < 1) ? 1 : S.px; 
      var oxF = Math.max(0, Math.min(targetSize - 0.1, (mx - r.sx) / r.sw * targetSize)); 
      var oyF = Math.max(0, Math.min(targetSize - 0.1, (my - r.sy) / r.sh * targetSize)); 
      var bx = Math.floor(oxF / effectivePx) * effectivePx; var by = Math.floor(oyF / effectivePx) * effectivePx; 
      var bx2 = Math.min(bx + effectivePx, targetSize); var by2 = Math.min(by + effectivePx, targetSize); 
      var cx2 = (bx + bx2) / 2 | 0; var cy2 = (by + by2) / 2 | 0; 
      try { 
        var pd = entry.canvas.getContext('2d').getImageData(cx2, cy2, 1, 1).data; 
        if (!pd[3]) return null; 
        var scX = r.sw / targetSize; var scY = r.sh / targetSize; var dbz = -1; 
        if (entry.raw && entry.raw.length > 0) { var ix = Math.round(cx2); var iy = Math.round(cy2); if (ix >= 0 && ix < targetSize && iy >= 0 && iy < targetSize) { var rawIdx = iy * targetSize + ix; if (rawIdx < entry.raw.length) { dbz = entry.raw[rawIdx]; } } } 
        return { sx: r.sx + Math.round(bx * scX), sy: r.sy + Math.round(by * scY), sw: Math.max(4, Math.round(effectivePx * scX)), sh: Math.max(4, Math.round(effectivePx * scY)), color: 'rgb(' + pd[0] + ',' + pd[1] + ',' + pd[2] + ')', r: pd[0], g: pd[1], b: pd[2], info: findPalEntry(pd[0], pd[1], pd[2]), dbz: dbz }; 
      } catch (e) { return null; } 
    } 
    return null; 
  }
  
  function updateCrosshair() { if (!crosshairMode || S.layer === 'sat') return; var cx = innerWidth / 2, cy = innerHeight / 2, block = getBlockAt(cx, cy); if (block) { hoverEl.style.display = 'block'; hoverEl.style.left = block.sx + 'px'; hoverEl.style.top = block.sy + 'px'; hoverEl.style.width = block.sw + 'px'; hoverEl.style.height = block.sh + 'px'; hoverEl.style.background = 'transparent'; var info = block.info; var txt = '—'; if (info) { if (S.layer === 'radar') { if (block.dbz >= 0) { txt = Math.round(block.dbz) + ' dBZ | ' + info.label; } else { txt = '≥' + info.v + ' dBZ | ' + info.label; } } else { txt = info.label; } } crosshairLbl.innerHTML = '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + block.color + ';border:1px solid #000;vertical-align:middle;margin-right:6px"></span>' + txt; crosshairLbl.style.display = 'block'; var lw = crosshairLbl.offsetWidth || 200, lh = crosshairLbl.offsetHeight || 36, lx = cx - lw / 2, ly = cy - 50 - lh; if (ly < 8) ly = cy + 50; crosshairLbl.style.left = lx + 'px'; crosshairLbl.style.top = ly + 'px'; } else { hoverEl.style.display = 'none'; crosshairLbl.innerHTML = '<span style="color:#888">нет данных</span>'; crosshairLbl.style.display = 'block'; crosshairLbl.style.left = (innerWidth / 2 - (crosshairLbl.offsetWidth || 120) / 2) + 'px'; crosshairLbl.style.top = (innerHeight / 2 - 60) + 'px'; } }
  function toggleCrosshair() { crosshairMode = !crosshairMode; var btn = $('btn-crosshair'); if (crosshairMode) { btn.classList.add('on'); crosshairEl.style.display = 'block'; updateCrosshair(); } else { btn.classList.remove('on'); crosshairEl.style.display = 'none'; crosshairLbl.style.display = 'none'; hoverEl.style.display = 'none'; } if (S.ruler.active) toggleRuler(); }
  function showPopup(block, mx, my) { var info = block.info; var lbl = info ? escHtml(info.label) : '—'; var meta = ''; if (info) { if (S.layer === 'radar') { if (block.dbz >= 0) { meta = 'Слой: <b>Отражаемость</b><br>Значение: <b>' + Math.round(block.dbz) + '</b> dBZ<br>Категория: ' + info.label; } else { meta = 'Слой: <b>Отражаемость</b><br>Порог: ≥' + info.v + ' dBZ<br>Категория: ' + info.label; } } else { meta = 'Слой: <b>Явления</b><br>' + info.label; } } else { meta = 'Нет данных'; } popupEl.innerHTML = '<div class="popup-header"><div class="popup-swatch" style="background:' + block.color + '"></div><div class="popup-label">' + lbl + '</div></div><div class="popup-meta">' + meta + '</div><span class="popup-close" onclick="document.getElementById(\'pixel-popup\').style.display=\'none\'">✕</span>'; popupEl.style.display = 'block'; popupEl.classList.remove('popup-in'); void popupEl.offsetWidth; popupEl.classList.add('popup-in'); var px2 = mx + 16, py2 = my - 55; if (px2 + 230 > innerWidth - 8) px2 = mx - 246; if (py2 < 8) py2 = 8; if (py2 + 110 > innerHeight - 8) py2 = innerHeight - 118; popupEl.style.left = px2 + 'px'; popupEl.style.top = py2 + 'px'; popupVisible = true; }
  function hidePopup() { popupEl.style.display = 'none'; popupVisible = false; }
  map.on('mousemove', function(e) { if (crosshairMode) { requestAnimationFrame(updateCrosshair); return; } if (S.layer === 'sat') return; var p = e.containerPoint, block = getBlockAt(p.x, p.y); if (block) { hoverEl.style.display = 'block'; hoverEl.style.left = block.sx + 'px'; hoverEl.style.top = block.sy + 'px'; hoverEl.style.width = block.sw + 'px'; hoverEl.style.height = block.sh + 'px'; hoverEl.style.background = block.color; } else hoverEl.style.display = 'none'; });
  map.on('click', function(e) { if (S.ruler.active || S.layer === 'sat') return; var p = crosshairMode ? { x: innerWidth / 2, y: innerHeight / 2 } : e.containerPoint, block = getBlockAt(p.x, p.y); block ? showPopup(block, p.x, p.y) : hidePopup(); });

  var modal = $('palette-modal'), modalClose = $('modal-close'), modalTabs = document.querySelectorAll('.modal-tabs button'), paletteListContainer = $('palette-list-container'), loadPaletteBtn = $('load-palette-btn'), fileInput = $('file-input'), createPaletteBtn = $('create-palette-btn'), deletePaletteBtn = $('delete-palette-btn'), exportPaletteBtn = $('export-palette-btn'), createForm = $('create-form'), newPalName = $('new-pal-name'), entryVal = $('entry-val'), entryColor = $('entry-color'), entryLabel = $('entry-label'), addEntryBtn = $('add-entry-btn'), entriesList = $('entries-list'), savePaletteBtn = $('save-palette-btn'), cancelCreateBtn = $('cancel-create-btn');
  var currentLayerForModal = 'radar'; var tempEntries = []; var editingIndex = -1; var editingEntryIndex = -1;
  /* a11y: фокус уходит в модалку при открытии и возвращается на вызвавшую кнопку при закрытии */
  var lastFocused = null;
  function focusModal(m) { var mc = m.querySelector('.modal-content'); if (mc) { mc.setAttribute('tabindex', '-1'); mc.focus({ preventScroll: true }); } }
  function restoreFocus() { if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus(); lastFocused = null; }
  function openModal() { lastFocused = document.activeElement; modal.classList.add('open'); focusModal(modal); currentLayerForModal = (S.layer === 'sat' ? 'radar' : S.layer); modalTabs.forEach(function(btn) { btn.classList.toggle('active', btn.dataset.layer === currentLayerForModal); }); renderPaletteList(); closeForm(); editingIndex = -1; editingEntryIndex = -1; tempEntries = []; renderEntries(); }
  function closeModal() { modal.classList.remove('open'); closeForm(); restoreFocus(); }
  function renderPaletteList() { var list = palettes[currentLayerForModal].list; var activeIdx = palettes[currentLayerForModal].activeIdx; var html = ''; list.forEach(function(p, idx) { var activeClass = idx === activeIdx ? 'active' : ''; var builtinBadge = p.builtin ? '<span class="badge">встроенная</span>' : ''; var editBtn = p.builtin ? '' : '<button class="edit-btn" data-idx="' + idx + '" title="Редактировать">✎</button>'; html += '<div class="palette-item ' + activeClass + '" data-idx="' + idx + '">' + '<span class="name">' + escHtml(p.name) + ' ' + builtinBadge + '</span>' + '<div>' + editBtn + (p.builtin ? '' : '<button class="del" data-idx="' + idx + '" title="Удалить">✕</button>') + '</div></div>'; }); paletteListContainer.innerHTML = html; paletteListContainer.querySelectorAll('.palette-item').forEach(function(el) { el.addEventListener('click', function(e) { if (e.target.classList.contains('del') || e.target.classList.contains('edit-btn')) return; var idx = parseInt(this.dataset.idx); palettes[currentLayerForModal].activeIdx = idx; savePalettesToStorage(currentLayerForModal); renderPaletteList(); if (currentLayerForModal === S.layer) { buildLegend(); forceRefresh(); } }); }); paletteListContainer.querySelectorAll('.edit-btn').forEach(function(btn) { btn.addEventListener('click', function(e) { e.stopPropagation(); var idx = parseInt(this.dataset.idx); startEditingPalette(idx); }); }); paletteListContainer.querySelectorAll('.del').forEach(function(btn) { btn.addEventListener('click', function(e) { e.stopPropagation(); var idx = parseInt(this.dataset.idx); var list2 = palettes[currentLayerForModal].list; if (list2[idx].builtin) return; if (confirm('Удалить палитру "' + list2[idx].name + '"?')) { list2.splice(idx, 1); if (palettes[currentLayerForModal].activeIdx >= list2.length) palettes[currentLayerForModal].activeIdx = list2.length - 1; if (palettes[currentLayerForModal].activeIdx < 0) palettes[currentLayerForModal].activeIdx = 0; savePalettesToStorage(currentLayerForModal); renderPaletteList(); if (currentLayerForModal === S.layer) { buildLegend(); forceRefresh(); } } }); }); }
  function startEditingPalette(idx) { var list = palettes[currentLayerForModal].list; if (idx < 0 || idx >= list.length) return; var pal = list[idx]; if (pal.builtin) { toast('Встроенную палитру нельзя редактировать'); return; } editingIndex = idx; newPalName.value = pal.name; tempEntries = pal.items.map(function(item) { return { val: item.v, color: '#' + item.r.map(function(c) { return c.toString(16).padStart(2, '0'); }).join(''), label: item.l, r: { r: item.r[0], g: item.r[1], b: item.r[2] } }; }); editingEntryIndex = -1; renderEntries(); createForm.classList.add('open'); savePaletteBtn.textContent = '💾 Обновить'; toast('Редактирование палитры "' + pal.name + '"'); }
  function closeForm() { createForm.classList.remove('open'); editingIndex = -1; editingEntryIndex = -1; tempEntries = []; renderEntries(); savePaletteBtn.textContent = '💾 Сохранить'; newPalName.value = 'Новая палитра'; entryVal.value = '0'; entryColor.value = '#00aaff'; entryLabel.value = 'Осадки'; }
  function renderEntries() { entriesList.innerHTML = ''; tempEntries.forEach(function(e, idx) { var div = document.createElement('div'); div.className = 'entry'; if (editingEntryIndex === idx) { div.innerHTML = `<input type="number" class="edit-val" value="${e.val}" step="1" style="width:50px;background:#121212;border:1px solid #333;border-radius:4px;color:#fff;padding:2px;"><input type="color" class="edit-color" value="${e.color}" style="width:28px;height:28px;padding:0;border:0;background:transparent;cursor:pointer;"><input type="text" class="edit-label" value="${escHtml(e.label)}" style="flex:1;background:#121212;border:1px solid #333;border-radius:4px;color:#fff;padding:2px;"><button class="save-entry-btn" data-idx="${idx}" style="background:#4a7fe8;border:none;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer;font-weight:600;">✓</button>`; } else { div.innerHTML = `<span><span class="color-swatch" style="background:${e.color}"></span> ${e.val} → ${escHtml(e.label)}</span><div><button class="edit-entry-btn" data-idx="${idx}" style="background:none;border:none;color:#888;cursor:pointer;font-size:12px;margin-right:4px;">✎</button><button class="del-entry" data-idx="${idx}" style="background:none;border:none;color:#ff5252;cursor:pointer;font-size:12px;">✕</button></div>`; } entriesList.appendChild(div); }); entriesList.querySelectorAll('.save-entry-btn').forEach(function(btn) { btn.addEventListener('click', function() { var idx = parseInt(this.dataset.idx); var entryDiv = this.closest('.entry'); var valInput = entryDiv.querySelector('.edit-val'); var colorInput = entryDiv.querySelector('.edit-color'); var labelInput = entryDiv.querySelector('.edit-label'); var newVal = parseFloat(valInput.value); if (isNaN(newVal)) { toast('Введите число'); return; } var newColor = colorInput.value; var newLabel = labelInput.value.trim() || 'без метки'; var rgb = hexToRgb(newColor); if (!rgb) { toast('Неверный цвет'); return; } tempEntries[idx] = { val: newVal, color: newColor, label: newLabel, r: rgb }; editingEntryIndex = -1; renderEntries(); }); }); entriesList.querySelectorAll('.edit-entry-btn').forEach(function(btn) { btn.addEventListener('click', function() { var idx = parseInt(this.dataset.idx); editingEntryIndex = idx; renderEntries(); }); }); entriesList.querySelectorAll('.del-entry').forEach(function(btn) { btn.addEventListener('click', function() { var idx = parseInt(this.dataset.idx); tempEntries.splice(idx, 1); if (editingEntryIndex === idx) editingEntryIndex = -1; else if (editingEntryIndex > idx) editingEntryIndex--; renderEntries(); }); }); }
  function addEntry() { var v = parseFloat(entryVal.value); if (isNaN(v)) { toast('Введите число'); return; } var color = entryColor.value; var label = entryLabel.value.trim() || 'без метки'; var rgb = hexToRgb(color); if (!rgb) { toast('Неверный цвет'); return; } tempEntries.push({ val: v, color: color, label: label, r: rgb }); renderEntries(); entryVal.value = ''; entryLabel.value = ''; var maxVal = tempEntries.reduce(function(mx, e) { return Math.max(mx, e.val); }, 0); entryVal.value = (maxVal + 5); }
  function hexToRgb(hex) { var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null; }
  function savePalette() { var name = newPalName.value.trim() || 'Без названия'; if (tempEntries.length === 0) { toast('Добавьте хотя бы одну запись'); return; } var sorted = tempEntries.slice().sort(function(a, b) { return b.val - a.val; }); var items = sorted.map(function(e) { return { v: e.val, r: [e.r.r, e.r.g, e.r.b], l: e.label }; }); if (editingIndex >= 0) { var list = palettes[currentLayerForModal].list; if (editingIndex >= list.length) { toast('Ошибка: палитра не найдена'); return; } if (list[editingIndex].builtin) { toast('Нельзя редактировать встроенную палитру'); return; } list[editingIndex].name = name; list[editingIndex].items = items; savePalettesToStorage(currentLayerForModal); renderPaletteList(); if (currentLayerForModal === S.layer) { buildLegend(); forceRefresh(); } toast('Палитра "' + name + '" обновлена'); closeForm(); } else { var newPal = { name: name, items: items, builtin: false }; palettes[currentLayerForModal].list.push(newPal); palettes[currentLayerForModal].activeIdx = palettes[currentLayerForModal].list.length - 1; savePalettesToStorage(currentLayerForModal); renderPaletteList(); if (currentLayerForModal === S.layer) { buildLegend(); forceRefresh(); } toast('Палитра "' + name + '" сохранена'); closeForm(); } }
  function exportPalette() { var layer = currentLayerForModal || S.layer; var list = palettes[layer].list; var idx = palettes[layer].activeIdx; if (!list || list.length === 0 || idx >= list.length) { toast('Нет палитры для экспорта'); return; } var pal = list[idx]; var content = generatePalFile(pal.items, pal.name, layer); var blob = new Blob([content], { type: 'text/plain;charset=utf-8' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = (pal.name || 'palette') + '.pal'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); toast('Палитра "' + pal.name + '" экспортирована'); }
  function generatePalFile(items, name, layer) { var sorted = items.slice().sort(function(a, b) { return a.v - b.v; }); var lines = []; lines.push('Product: ' + (layer === 'radar' ? 'BR' : 'WX')); lines.push('Units: dBZ'); lines.push('Scale: 1'); lines.push('Offset: 0'); lines.push('Step: 5'); lines.push('RF: 0 0 0'); lines.push(''); for (var i = 0; i < sorted.length; i++) { var p = sorted[i]; var r = p.r[0], g = p.r[1], b = p.r[2]; lines.push('Color: ' + p.v + ' ' + r + ' ' + g + ' ' + b); } return lines.join('\n'); }
  function loadPaletteFromFile(file) { var reader = new FileReader(); reader.onload = function(e) { try { var content = e.target.result; var data = parsePaletteFile(content); if (data) { var name = file.name.replace(/\.[^.]+$/, '') || 'Загруженная'; var newPal = { name: name, items: data, builtin: false }; palettes[currentLayerForModal].list.push(newPal); palettes[currentLayerForModal].activeIdx = palettes[currentLayerForModal].list.length - 1; savePalettesToStorage(currentLayerForModal); renderPaletteList(); if (currentLayerForModal === S.layer) { buildLegend(); forceRefresh(); } toast('Палитра загружена'); } else { toast('Ошибка парсинга файла'); } } catch (err) { toast('Ошибка: ' + err.message); } }; reader.readAsText(file); }
  function parsePaletteFile(text) { try { var parsed = JSON.parse(text); if (Array.isArray(parsed) && parsed.length && parsed[0].v !== undefined && parsed[0].r && parsed[0].l) { return parsed; } } catch (e) {} var lines = text.split(/\r?\n/).filter(function(line) { return line.trim().length > 0; }); var items = []; var inTable = false; for (var i = 0; i < lines.length; i++) { var line = lines[i].trim(); if (/^ColorTable\s*\{/.test(line)) { inTable = true; continue; } if (/^\}/.test(line)) { inTable = false; continue; } if (!inTable) continue; var match = line.match(/Color\s*\[\s*([\d.]+)\s*\]\s*=\s*(rgb|gradient)\s*\(\s*([^)]+)\s*\)/i); if (match) { var v = parseFloat(match[1]); var type = match[2].toLowerCase(); var params = match[3].split(/\s*,\s*/).filter(function(s) { return s.length > 0; }); if (type === 'rgb' && params.length >= 3) { var r = parseInt(params[0]); var g = parseInt(params[1]); var b = parseInt(params[2]); if (!isNaN(r) && !isNaN(g) && !isNaN(b)) { items.push({ v: v, r: [r, g, b], l: '>= ' + v + ' dBZ' }); } } else if (type === 'gradient' && params.length >= 6) { var r2 = parseInt(params[1]), g2 = parseInt(params[2]), b2 = parseInt(params[3]); if (!isNaN(r2) && !isNaN(g2) && !isNaN(b2)) { items.push({ v: v, r: [r2, g2, b2], l: '>= ' + v + ' dBZ' }); } } } } if (items.length > 0) { items.sort(function(a, b) { return b.v - a.v; }); return items; } var colorLines = []; var product = null; for (var j = 0; j < lines.length; j++) { var line2 = lines[j].trim(); if (/^Product:/i.test(line2)) { product = line2; } if (/^Color:/i.test(line2)) { colorLines.push(line2); } } if (colorLines.length > 0) { var newItems = []; for (var k = 0; k < colorLines.length; k++) { var parts = colorLines[k].split(/\s+/); if (parts.length >= 5) { var val = parseFloat(parts[1]); var r3 = parseInt(parts[2]); var g3 = parseInt(parts[3]); var b3 = parseInt(parts[4]); if (!isNaN(val) && !isNaN(r3) && !isNaN(g3) && !isNaN(b3)) { newItems.push({ v: val, r: [r3, g3, b3], l: val + ' dBZ' }); } } } if (newItems.length > 0) { newItems.sort(function(a, b) { return b.v - a.v; }); return newItems; } } var csvItems = []; for (var m = 0; m < lines.length; m++) { var line3 = lines[m].trim(); var parts2 = line3.split(/\s*,\s*/); if (parts2.length >= 5) { var v2 = parseFloat(parts2[0]); if (isNaN(v2)) continue; var r4 = parseInt(parts2[1]), g4 = parseInt(parts2[2]), b4 = parseInt(parts2[3]); if (isNaN(r4) || isNaN(g4) || isNaN(b4)) continue; var label = parts2.slice(4).join(',').trim() || 'без метки'; csvItems.push({ v: v2, r: [r4, g4, b4], l: label }); } else { var m2 = line3.match(/^([\d.]+)\s+#([a-fA-F0-9]{6})\s+(.+)$/); if (m2) { var v3 = parseFloat(m2[1]); if (isNaN(v3)) continue; var rgb = hexToRgb('#' + m2[2]); if (!rgb) continue; csvItems.push({ v: v3, r: [rgb.r, rgb.g, rgb.b], l: m2[3].trim() }); } } } if (csvItems.length === 0) return null; csvItems.sort(function(a, b) { return b.v - a.v; }); return csvItems; }

  modalClose.addEventListener('click', closeModal);
  modalTabs.forEach(function(btn) { btn.addEventListener('click', function() { currentLayerForModal = this.dataset.layer; modalTabs.forEach(function(b) { b.classList.toggle('active', b === btn); }); renderPaletteList(); closeForm(); }); });
  loadPaletteBtn.addEventListener('click', function() { fileInput.click(); });
  fileInput.addEventListener('change', function(e) { if (this.files && this.files[0]) { loadPaletteFromFile(this.files[0]); } this.value = ''; });
  exportPaletteBtn.addEventListener('click', exportPalette);
  createPaletteBtn.addEventListener('click', function() { closeForm(); editingIndex = -1; editingEntryIndex = -1; newPalName.value = 'Новая палитра'; tempEntries = []; renderEntries(); createForm.classList.add('open'); savePaletteBtn.textContent = '💾 Сохранить'; });
  cancelCreateBtn.addEventListener('click', function() { closeForm(); });
  addEntryBtn.addEventListener('click', addEntry);
  document.querySelectorAll('#entry-val, #entry-label').forEach(function(inp) { inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') addEntry(); }); });
  savePaletteBtn.addEventListener('click', savePalette);
  deletePaletteBtn.addEventListener('click', function() { var list = palettes[currentLayerForModal].list; var idx = palettes[currentLayerForModal].activeIdx; if (idx >= list.length) return; if (list[idx].builtin) { toast('Нельзя удалить встроенную палитру'); return; } if (confirm('Удалить активную палитру "' + list[idx].name + '"?')) { list.splice(idx, 1); if (palettes[currentLayerForModal].activeIdx >= list.length) palettes[currentLayerForModal].activeIdx = list.length - 1; if (palettes[currentLayerForModal].activeIdx < 0) palettes[currentLayerForModal].activeIdx = 0; savePalettesToStorage(currentLayerForModal); renderPaletteList(); if (currentLayerForModal === S.layer) { buildLegend(); forceRefresh(); } } });
  $('btn-palettes').addEventListener('click', openModal);

  var opacitySlider = $('opacity-slider');
  var opacityVal = $('opacity-val');
  if (opacitySlider) {
    canvas.style.opacity = parseInt(opacitySlider.value) / 100;
    opacitySlider.addEventListener('input', function() {
      var val = parseInt(this.value);
      if (S.layer === 'sat' && eumetsatLayer) {
        eumetsatLayer.setOpacity(val / 100);
      } else {
        canvas.style.opacity = val / 100;
      }
      opacityVal.textContent = val + '%';
      retrig(opacityVal, 'bump'); /* лёгкий отклик значения */
    });
  }

  var helpModal = $('help-modal');
  var helpClose = $('help-close');
  function closeHelp() { if (helpModal) { helpModal.classList.remove('open'); restoreFocus(); } }
  if ($('btn-help')) { $('btn-help').addEventListener('click', function() { if (helpModal) { lastFocused = document.activeElement; helpModal.classList.add('open'); focusModal(helpModal); } }); }
  if (helpClose) { helpClose.addEventListener('click', closeHelp); }
  /* Клик по фону закрывает модалки */
  modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
  if (helpModal) { helpModal.addEventListener('click', function(e) { if (e.target === helpModal) closeHelp(); }); }

  /* ─── Смена темы: мягкий кроссфейд тайл-слоёв CARTO (новый слой проявляется поверх ~350мс) ─── */
  function swapBaseLayer(toLayer, fromLayer) {
    if (REDUCE_MOTION) { map.removeLayer(fromLayer); toLayer.addTo(map); return; }
    toLayer.setOpacity(0); toLayer.addTo(map);
    var t0 = performance.now(), D = 350;
    (function step() {
      var k = Math.min(1, (performance.now() - t0) / D);
      toLayer.setOpacity(k);
      if (k < 1) requestAnimationFrame(step);
      else { map.removeLayer(fromLayer); fromLayer.setOpacity(1); }
    })();
  }
  if ($('btn-theme')) { $('btn-theme').addEventListener('click', function() { document.body.classList.toggle('light-theme'); var isLight = document.body.classList.contains('light-theme'); toast(isLight ? 'Светлая тема включена' : 'Тёмная тема включена'); if (map.hasLayer(darkTileLayer)) { swapBaseLayer(lightTileLayer, darkTileLayer); } else { swapBaseLayer(darkTileLayer, lightTileLayer); } }); }

  /* На таче приглушаем панели во время перетаскивания карты — карту видно целиком */
  if (IS_MOBILE) {
    var dragDimTmr = null;
    map.on('movestart', function() { clearTimeout(dragDimTmr); document.body.classList.add('map-drag'); });
    map.on('moveend', function() { clearTimeout(dragDimTmr); dragDimTmr = setTimeout(function() { document.body.classList.remove('map-drag'); }, 250); });
  }

  loadPalettesFromStorage(); buildLegend(); buildFrames(); updHUD(); updatePxLabel(); schedRender();

  $('playbtn').addEventListener('click', togglePlay);
  $('spd').addEventListener('click', cycleSpeed);
  $('pxbtn').addEventListener('click', cyclePx);
  $('btn-smooth').addEventListener('click', toggleSmooth);
  $('btn-refresh').addEventListener('click', doRefresh);
  $('btn-crosshair').addEventListener('click', toggleCrosshair);
  $('btn-ruler').addEventListener('click', toggleRuler);
  $('b-minus1h').addEventListener('click', function() { retrig(this, 'bump'); shiftTs(-3600); });
  $('b-minus10m').addEventListener('click', function() { retrig(this, 'bump'); shiftTs(-600); });
  $('b-plus10m').addEventListener('click', function() { retrig(this, 'bump'); shiftTs(600); });
  $('toggle-legend-btn').addEventListener('click', function(e) { e.stopPropagation(); toggleLegend(); });
  $('legend-header').addEventListener('click', toggleLegend);

  $('btn-layers-menu').addEventListener('click', function(e) { e.stopPropagation(); $('layers-dropdown').classList.toggle('visible'); });
  document.querySelectorAll('#layers-dropdown .dd-item').forEach(function(item) {
    item.addEventListener('click', function() { setLayer(this.dataset.layer); $('layers-dropdown').classList.remove('visible'); });
    /* Клавиатура: Enter/Space выбирают слой */
    item.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLayer(this.dataset.layer); $('layers-dropdown').classList.remove('visible'); $('btn-layers-menu').focus(); } });
  });
  document.addEventListener('click', function(e) { if (!$('layers-wrapper').contains(e.target)) { $('layers-dropdown').classList.remove('visible'); } });

  var smoothSlider = $('smooth-strength');
  var smoothValEl = $('smooth-val');
  smoothSlider.addEventListener('input', function() { S.smoothStrength = parseInt(this.value); smoothValEl.textContent = S.smoothStrength; retrig(smoothValEl, 'bump'); if (S.smooth) { S.cache.clear(); S.pending.clear(); S.failed.clear(); forceRefresh(); toast('Сила сглаживания: ' + S.smoothStrength); } });

  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') { if (crosshairMode) { toggleCrosshair(); return; } if (S.ruler.active) { toggleRuler(); return; } if (helpModal && helpModal.classList.contains('open')) { closeHelp(); return; } if (modal.classList.contains('open')) { closeModal(); return; } } });
  map.on('zoomstart', function() { if (crosshairMode) hoverEl.style.display = 'none'; });
  map.on('move moveend zoomend', function() { if (crosshairMode) updateCrosshair(); });
  window.addEventListener('resize', function() { if (crosshairMode) updateCrosshair(); });

  window.closeModal = closeModal; window.openModal = openModal; window.setLayer = setLayer;
  console.log('2×2 Радар загружен. 1x1 км интерполяция, EUMETSAT WMS и обновленные палитры активны.');
})();
