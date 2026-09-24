/**
 * SCHEMA - Visual Link Builder
 * Compatible with the supplied index.html and its existing CDN dependencies.
 * Plain browser JavaScript: no bundler, server, database or new dependency.
 * Original project: victorlealz/VICTORSCHEMA; original interface credit: winzip144.
 *
 * Fixes: connection selection, editable connection styles, responsive controls.
 * Additions: free text, CryptoAsset/CriptoAtivo, accessible file dropdown.
 * Existing graph JSON remains an array of Cytoscape element definitions.
 */
'use strict';

// ENTITY TYPE DEFINITIONS
const PERSON_SVG_URI = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
  '<circle cx="32" cy="20" r="13" fill="#909090"/>' +
  '<path d="M6 56 C6 40 18 33 32 33 C46 33 58 40 58 56 Z" fill="#909090"/></svg>'
);
const CRYPTO_SVG_URI = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
  '<circle cx="32" cy="32" r="27" fill="#f5a623"/>' +
  '<circle cx="32" cy="32" r="22" fill="none" stroke="#fff" stroke-width="2"/>' +
  '<path d="M26 18v28m8-28v4m0 20v4M23 23h12c10 0 10 9 0 9H26m0 0h10c11 0 11 10 0 10H23" ' +
  'fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
);
const ENTITY_TYPES = [
  { id: 'whatsapp', name: 'WhatsApp', icon: '\uD83D\uDCAC', iconUri: 'https://cdn-icons-png.flaticon.com/512/3938/3938041.png' },
  { id: 'person', name: 'Person', icon: '\uD83D\uDC64', iconUri: PERSON_SVG_URI },
  { id: 'organization', name: 'Organization', icon: '\uD83C\uDFE2' },
  { id: 'phone', name: 'Phone', icon: '\uD83D\uDCF1' },
  { id: 'email', name: 'Email', icon: '\u2709\uFE0F' },
  { id: 'address', name: 'Address', icon: '\uD83D\uDCCD' },
  { id: 'vehicle', name: 'Vehicle', icon: '\uD83D\uDE97' },
  { id: 'event', name: 'Event', icon: '\uD83D\uDCC5' },
  { id: 'bankaccount', name: 'Bank Account', icon: '\uD83C\uDFE6' },
  { id: 'cryptoasset', name: 'CriptoAtivo', icon: '\u20BF', iconUri: CRYPTO_SVG_URI },
  { id: 'device', name: 'Device', icon: '\uD83D\uDCBB' },
  { id: 'ipaddress', name: 'IP Address', icon: '\uD83C\uDF10' },
  { id: 'timestamp', name: 'Timestamp', icon: '\u23F1\uFE0F' },
  { id: 'text', name: 'Text', icon: 'T' },
];

// STATE
let cy = null;
let mode = 'select';
let connectSrc = null;
let selectedEl = null;
let history = [];
let histIdx = -1;
const MAX_HIST = 60;
let currentLang = 'en';
let isLight = true;
let guidesEnabled = true;
let cleanBgEnabled = false;
let autosaveEnabled = false;
let autosaveTimer = null;
let autosaveMinutes = 10;
let autoSaveHandle = null;
let autosaveBusy = false;
let autosaveSetupVersion = 0;
let timelineObj = null;
let resizeObserver = null;
let resizeFrame = 0;
let descriptionFrame = 0;
let selectionFrame = 0;
let exportBackup = null;
let booted = false;
const descriptionElements = new Map();
const $ = id => document.getElementById(id);
const uid = () => 'id' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));
const isCanvasLight = () => isLight || cleanBgEnabled;
const clamp = (value, min, max, fallback) => {
  const n = value === null || value === '' || value === undefined ? NaN : Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const hexColor = (value, fallback = null) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
const escapeXML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
const on = (id, event, handler) => $(id)?.addEventListener(event, handler);
const setText = (id, value) => { if ($(id)) $(id).textContent = value; };
const setValue = (id, value) => { if ($(id)) $(id).value = value; };
const isTextNode = node => node?.isNode() && node.data('type') === 'text';
const liveSelection = kind => selectedEl && !selectedEl.removed() && (kind === 'node' ? selectedEl.isNode() : selectedEl.isEdge());

function canonicalType(id) {
  const key = String(id || 'person').toLowerCase();
  return ({ criptoativo:'cryptoasset', cryptoativo:'cryptoasset', crypto:'cryptoasset', cryptocurrency:'cryptoasset', texto:'text', freetext:'text' })[key] || key;
}
function getType(id) {
  return ENTITY_TYPES.find(type => type.id === canonicalType(id)) || ENTITY_TYPES[0];
}
function emojiSvg(emoji) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><text x="32" y="50" text-anchor="middle" ' +
    'font-size="38" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">' + escapeXML(emoji) + '</text></svg>'
  );
}
function textSvg(text, isDark) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><text x="32" y="42" text-anchor="middle" ' +
    'dominant-baseline="middle" font-size="' + (Array.from(text).length <= 2 ? 32 : 20) + '" font-weight="700" ' +
    'font-family="Inter,system-ui,sans-serif" fill="' + (isDark ? '#ffffff' : '#111111') + '">' + escapeXML(text) + '</text></svg>'
  );
}
function getIconUri(type) { return type.id === 'text' ? '' : type.iconUri || emojiSvg(type.icon); }
function getCyTokenSafe(varName, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

// I18N: original controls plus the new controls already present in index.html.
const I18N = {
  en: {
    select:'Select', line:'Line', arrow:'Arrow', addText:'Text', undo:'Undo', redo:'Redo', delete:'Delete', fit:'Fit',
    import:'Import', save:'Save', load:'Load', guides:'Guides', lineLbl:'Line', arrowLbl:'Arrow', removeEntity:'Remove Entity',
    removeConn:'Remove Connection', paletteHeading:'Entities', canvasHint:'Click an entity to add it \u00b7 Double-click a node or connection to edit text',
    inspEmptyText:'Select an entity or connection to view its properties', lblName:'Name', lblType:'Type', lblSize:'Size', lblFontSize:'Text Size',
    lblEdgeLabel:'Label', lblEdgeOptional:'(optional)', lblConntype:'Connection type',
    sbHints:'S \u2014 select \u00b7 L \u2014 line \u00b7 A \u2014 arrow \u00b7 T \u2014 text \u00b7 F \u2014 fit \u00b7 Del \u2014 delete \u00b7 Ctrl+Z/Y \u2014 undo/redo',
    iiNamePlaceholder:'\u2026', ieLabelPlaceholder:'e.g. works_at',
    modeLineSrc:'\u2014 Line mode \u00b7 click the source node', modeLineTgt:'\u2014 Line mode \u00b7 now click the target node',
    modeArrowSrc:'\u2192 Arrow mode \u00b7 click the source node', modeArrowTgt:'\u2192 Arrow mode \u00b7 now click the target node',
    themeLight:'Light', themeDark:'Dark', lineConn:'LINE CONNECTION', arrowConn:'ARROW CONNECTION', uploadImage:'Upload Image', resetIcon:'Reset Icon',
    selectAll:'All', cleanBg:'Clean BG', timeline:'Timeline', wallColor:'Wall Color', timelineTitle:'\uD83D\uDCCB Timeline', autoSaved:'Auto-saved!',
    noEntities:'Add entities first', entity_whatsapp:'WhatsApp', entity_person:'Person', entity_organization:'Organization', entity_phone:'Phone',
    entity_email:'Email', entity_address:'Address', entity_vehicle:'Vehicle', entity_event:'Event', entity_bankaccount:'Bank Account',
    entity_cryptoasset:'CryptoAsset', entity_device:'Device', entity_ipaddress:'IP Address', entity_timestamp:'Timestamp', entity_text:'Text',
    downloadPNG:'Download PNG', downloadPDF:'Download PDF', properties:'Properties', close:'Close', textWidth:'Text width', textColor:'Text color',
    automaticColor:'Auto', connectionColor:'Line / arrow color', lineWidth:'Line thickness', lineStyle:'Line Style', solid:'Solid', dashed:'Dashed',
    curve:'Curve', straight:'Straight', curved:'Curved', description:'Description (Sub-title)', startDate:'Start Date', endDate:'End Date',
    descDistance:'Desc Distance', customIcon:'Custom Icon / Image', textIcon:'Text / Emoji as Icon', applyText:'Apply Text', apply:'Apply',
    loaded:'Schema loaded successfully!', invalidJSON:'Invalid graph JSON. The current schema was not changed.', readError:'Could not read the file.',
    exportError:'Export failed. Check that external icons are accessible and try again.', missingPDF:'The PDF library did not load. Reload the page and try again.',
    missingSheet:'The spreadsheet library did not load.', missingTimeline:'The timeline library did not load.', invalidURL:'Invalid image URL.',
    invalidImage:'Choose a valid image file.', autosaveError:'Auto-save failed. Use Save to keep a copy.', noDates:'Set Start Date on entities first.',
    invalidDates:'Check the dates: End Date must not be earlier than Start Date.', newText:'Type your text here',
  },
  pt: {
    select:'Selecionar', line:'Linha', arrow:'Seta', addText:'Texto', undo:'Desfazer', redo:'Refazer', delete:'Excluir', fit:'Ajustar',
    import:'Importar', save:'Salvar', load:'Abrir', guides:'Guias', lineLbl:'Linha', arrowLbl:'Seta', removeEntity:'Remover Entidade',
    removeConn:'Remover Conex\u00e3o', paletteHeading:'Entidades', canvasHint:'Clique em uma entidade para adicion\u00e1-la \u00b7 Duplo clique no n\u00f3 ou conex\u00e3o para editar o texto',
    inspEmptyText:'Selecione uma entidade ou conex\u00e3o para ver suas propriedades', lblName:'Nome', lblType:'Tipo', lblSize:'Tamanho', lblFontSize:'Tamanho do texto',
    lblEdgeLabel:'R\u00f3tulo', lblEdgeOptional:'(opcional)', lblConntype:'Tipo de conex\u00e3o',
    sbHints:'S \u2014 selecionar \u00b7 L \u2014 linha \u00b7 A \u2014 seta \u00b7 T \u2014 texto \u00b7 F \u2014 ajustar \u00b7 Del \u2014 excluir \u00b7 Ctrl+Z/Y \u2014 desfazer/refazer',
    iiNamePlaceholder:'\u2026', ieLabelPlaceholder:'ex: trabalha_em',
    modeLineSrc:'\u2014 Modo linha \u00b7 clique no n\u00f3 de origem', modeLineTgt:'\u2014 Modo linha \u00b7 agora clique no n\u00f3 de destino',
    modeArrowSrc:'\u2192 Modo seta \u00b7 clique no n\u00f3 de origem', modeArrowTgt:'\u2192 Modo seta \u00b7 agora clique no n\u00f3 de destino',
    themeLight:'Claro', themeDark:'Escuro', lineConn:'CONEX\u00c3O EM LINHA', arrowConn:'CONEX\u00c3O EM SETA', uploadImage:'Carregar Imagem', resetIcon:'Resetar \u00cdcone',
    selectAll:'Tudo', cleanBg:'Fundo Limpo', timeline:'Linha do Tempo', wallColor:'Cor da Parede', timelineTitle:'\uD83D\uDCCB Linha do Tempo', autoSaved:'Salvo automaticamente!',
    noEntities:'Adicione entidades primeiro', entity_whatsapp:'WhatsApp', entity_person:'Pessoa', entity_organization:'Organiza\u00e7\u00e3o', entity_phone:'Telefone',
    entity_email:'E-mail', entity_address:'Endere\u00e7o', entity_vehicle:'Ve\u00edculo', entity_event:'Evento', entity_bankaccount:'Conta Banc\u00e1ria',
    entity_cryptoasset:'CriptoAtivo', entity_device:'Dispositivo', entity_ipaddress:'Endere\u00e7o IP', entity_timestamp:'Timestamp', entity_text:'Texto',
    downloadPNG:'Baixar PNG', downloadPDF:'Baixar PDF', properties:'Propriedades', close:'Fechar', textWidth:'Largura do texto', textColor:'Cor do texto',
    automaticColor:'Auto', connectionColor:'Cor da linha / seta', lineWidth:'Espessura da linha', lineStyle:'Estilo da linha', solid:'Cont\u00ednua', dashed:'Tracejada',
    curve:'Curvatura', straight:'Reta', curved:'Curva', description:'Descri\u00e7\u00e3o (subt\u00edtulo)', startDate:'Data Inicial', endDate:'Data Final',
    descDistance:'Dist\u00e2ncia da descri\u00e7\u00e3o', customIcon:'\u00cdcone / Imagem personalizada', textIcon:'Texto / Emoji como \u00edcone', applyText:'Aplicar Texto', apply:'Aplicar',
    loaded:'Esquema carregado com sucesso!', invalidJSON:'JSON de esquema inv\u00e1lido. O esquema atual n\u00e3o foi alterado.', readError:'N\u00e3o foi poss\u00edvel ler o arquivo.',
    exportError:'Falha na exporta\u00e7\u00e3o. Verifique o acesso aos \u00edcones externos e tente novamente.', missingPDF:'A biblioteca de PDF n\u00e3o carregou. Recarregue a p\u00e1gina e tente novamente.',
    missingSheet:'A biblioteca de planilhas n\u00e3o carregou.', missingTimeline:'A biblioteca da linha do tempo n\u00e3o carregou.', invalidURL:'URL de imagem inv\u00e1lida.',
    invalidImage:'Escolha um arquivo de imagem v\u00e1lido.', autosaveError:'Falha no salvamento autom\u00e1tico. Use Salvar para guardar uma c\u00f3pia.', noDates:'Adicione Data Inicial nas entidades primeiro.',
    invalidDates:'Verifique as datas: a Data Final n\u00e3o pode ser anterior \u00e0 Data Inicial.', newText:'Digite seu texto aqui',
  },
};
function t(key) { return I18N[currentLang][key] ?? I18N.en[key] ?? key; }
function getEntityLocalName(typeId) {
  const id = canonicalType(typeId);
  return I18N[currentLang]['entity_' + id] || getType(id).name;
}
function applyLang() {
  document.documentElement.lang = currentLang === 'pt' ? 'pt-BR' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  const labels = {
    'palette-heading':'paletteHeading', 'canvas-hint':'canvasHint', 'insp-empty-text':'inspEmptyText',
    'lbl-name':'lblName', 'lbl-type':'lblType', 'lbl-size':'lblSize', 'lbl-font-size':'lblFontSize',
    'lbl-edge-optional':'lblEdgeOptional', 'lbl-conntype':'lblConntype', 'sb-hints':'sbHints',
    'lbl-clean-bg':'cleanBg', 'lbl-wall-color':'wallColor', 'lbl-desc':'description', 'lbl-start-date':'startDate',
    'lbl-end-date':'endDate', 'lbl-desc-dist':'descDistance', 'lbl-custom-icon':'customIcon', 'lbl-text-icon':'textIcon',
    'btn-apply-text-icon':'applyText', 'btn-apply-flaticon':'apply',
  };
  Object.entries(labels).forEach(([id, key]) => setText(id, t(key)));
  if ($('lbl-edge-label')?.firstChild) $('lbl-edge-label').firstChild.textContent = t('lblEdgeLabel') + ' ';
  $('ii-name').placeholder = t('iiNamePlaceholder');
  $('ie-label').placeholder = t('ieLabelPlaceholder');
  setText('btn-lang', currentLang === 'en' ? 'PT-BR' : 'EN');
  setText('btn-theme-label', t(isLight ? 'themeDark' : 'themeLight'));
  $('inspector')?.setAttribute('aria-label', t('properties'));
  refreshPaletteNames();
  refreshTypeSelect();
  updateModePill(connectSrc ? 'target' : 'source');
  refreshInspector(false);
  updateStatus();
  scheduleResize();
}
function toggleLang() { currentLang = currentLang === 'en' ? 'pt' : 'en'; applyLang(); }
function applyCyTheme() {
  cy.style(buildCyStyle()).update();
  cy.nodes().forEach(node => {
    if (node.data('customText') && !isTextNode(node)) node.data('iconSvg', textSvg(node.data('customText'), !isCanvasLight()));
  });
  refreshInspector(false);
  scheduleDescriptions();
}
function toggleTheme() {
  isLight = !isLight;
  document.documentElement.classList.toggle('light', isLight);
  if ($('btn-theme')?.firstChild) $('btn-theme').firstChild.textContent = isLight ? '\uD83C\uDF19 ' : '\u2600 ';
  setText('btn-theme-label', t(isLight ? 'themeDark' : 'themeLight'));
  applyCyTheme();
}

// CYTOSCAPE INITIALISATION AND STYLES
function initCy() {
  cy = cytoscape({
    container:$('cy'), style:buildCyStyle(), layout:{ name:'preset' },
    userZoomingEnabled:true, userPanningEnabled:true, boxSelectionEnabled:true,
    selectionType:'single', minZoom:0.04, maxZoom:6, wheelSensitivity:0.22,
  });
  initDescriptions();
  bindCyEvents();
}
function buildCyStyle() {
  const light = isCanvasLight();
  const nodeBg = getCyTokenSafe('--cy-node-bg', light ? '#f0f0f0' : '#161616');
  const nodeBdr = getCyTokenSafe('--cy-node-border', light ? '#cccccc' : '#353535');
  const nodeLbl = light ? '#333333' : '#ffffff';
  const nodeSelBg = getCyTokenSafe('--cy-node-sel-bg', light ? '#e4e4e4' : '#1c1c1c');
  const nodeSelBdr = getCyTokenSafe('--cy-node-sel-bdr', light ? '#111111' : '#ffffff');
  const edgeColor = light ? '#bbbbbb' : '#ffffff';
  const edgeLbl = light ? '#888888' : '#dddddd';
  const edgeTextBg = cleanBgEnabled ? '#ffffff' : light ? '#f0f0f0' : '#0c0c0c';
  return [
    { selector:'node', style:{
      'background-color':nodeBg, 'background-image':node => node.data('iconSvg') || 'none',
      'background-width':'92%', 'background-height':'92%', 'background-position-x':'50%', 'background-position-y':'50%',
      'background-clip':'none', 'border-color':nodeBdr, 'border-width':1.5, 'label':'data(name)', 'color':nodeLbl,
      'font-size':node => clamp(node.data('fontSize'), 8, 48, 11), 'font-family':'"Inter", system-ui, sans-serif',
      'font-weight':400, 'text-valign':'bottom', 'text-halign':'center', 'text-margin-y':8, 'text-wrap':'wrap', 'text-max-width':92,
      'width':node => clamp(node.data('size'), 40, 180, 68), 'height':node => clamp(node.data('size'), 40, 180, 68),
      'shape':'round-rectangle', 'transition-property':'border-color, border-width, background-color', 'transition-duration':'110ms',
      'z-index':9999, 'text-background-opacity':0, 'text-outline-width':2.5, 'text-outline-color':nodeBg, 'text-events':'yes',
    } },
    { selector:'node.hovered', style:{ 'border-color':light ? '#777777' : '#aaaaaa', 'border-width':2 } },
    { selector:'node:selected', style:{ 'background-color':nodeSelBg, 'border-color':nodeSelBdr, 'border-width':2, 'color':light ? '#111111' : '#ffffff' } },
    { selector:'node.connect-src', style:{ 'border-color':nodeSelBdr, 'border-width':2.5, 'border-style':'dashed' } },
    { selector:'node[wallColor]', style:{ 'border-color':node => hexColor(node.data('wallColor'), nodeBdr) } },
    { selector:'node[wallColor]:selected', style:{ 'border-color':node => hexColor(node.data('wallColor'), nodeSelBdr), 'border-width':2 } },
    // Text is a real graph element, not HTML: it moves, saves, connects and exports.
    { selector:'node[type="text"]', style:{
      'background-image':'none', 'background-opacity':0, 'border-width':0, 'shape':'rectangle',
      'width':node => clamp(node.data('textWidth'), 80, 1000, 280), 'height':node => Math.max(24, Number(node.data('textHeight')) || 30),
      'label':'data(name)', 'text-valign':'center', 'text-margin-y':0, 'text-outline-width':0, 'text-background-opacity':0,
      'text-max-width':node => clamp(node.data('textWidth'), 80, 1000, 280), 'text-wrap':'wrap', 'text-overflow-wrap':'anywhere',
      'line-height':1.2, 'color':node => hexColor(node.data('textColor'), nodeLbl), 'transition-duration':0,
    } },
    { selector:'node[type="text"]:selected, node[type="text"].connect-src', style:{
      'background-opacity':0, 'border-width':0, 'overlay-color':'#4a9eff', 'overlay-opacity':0.09, 'overlay-padding':5,
    } },
    { selector:'edge', style:{
      'width':edge => clamp(edge.data('width'), 1, 12, 1.5),
      'line-color':edge => hexColor(edge.data('color'), edgeColor),
      'target-arrow-color':edge => hexColor(edge.data('color'), edgeColor),
      'source-arrow-color':edge => hexColor(edge.data('color'), edgeColor),
      'curve-style':'bezier', 'label':'data(label)', 'color':edge => hexColor(edge.data('textColor'), edgeLbl),
      'font-size':edge => clamp(edge.data('fontSize'), 8, 72, 10), 'font-family':'"Inter", system-ui, sans-serif',
      'text-wrap':'wrap', 'text-max-width':300, 'text-background-color':edgeTextBg, 'text-background-opacity':1,
      'text-background-padding':'3px', 'target-arrow-shape':'none', 'source-arrow-shape':'none',
      'z-index':1, 'events':'yes', 'text-events':'yes', 'overlay-opacity':0,
    } },
    // Selection overlays do not overwrite the user's colour or line width.
    { selector:'edge.hovered', style:{ 'overlay-color':'#4a9eff', 'overlay-opacity':0.08, 'overlay-padding':4 } },
    { selector:'edge:selected', style:{ 'overlay-color':'#4a9eff', 'overlay-opacity':0.16, 'overlay-padding':5 } },
    { selector:'edge[lineStyle="dashed"]', style:{ 'line-style':'dashed', 'line-dash-pattern':[6,4] } },
    { selector:'edge[curve="straight"]', style:{ 'curve-style':'straight' } },
    { selector:'edge[curve="curved"]', style:{ 'curve-style':'unbundled-bezier', 'control-point-distances':[60], 'control-point-weights':[0.5] } },
    { selector:'edge[edgeType="arrow"]', style:{ 'target-arrow-shape':'triangle' } },
    { selector:'edge:loop', style:{ 'curve-style':'bezier' } },
  ];
}

// Passive descriptions. Never put a hit-testing HTML layer inside #cy.
// This preserves subtitles even when the optional HTML-label CDN is unavailable.
function initDescriptions() {
  let layer = $('description-layer');
  if (!layer) { layer = document.createElement('div'); layer.id = 'description-layer'; $('canvas-wrap').appendChild(layer); }
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5;';
  cy.on('render pan zoom resize add remove data position', scheduleDescriptions);
}
function scheduleDescriptions() {
  if (descriptionFrame) return;
  descriptionFrame = requestAnimationFrame(() => { descriptionFrame = 0; renderDescriptions(); });
}
function renderDescriptions() {
  if (!cy || cy.destroyed()) return;
  const active = new Set();
  const layer = $('description-layer');
  const zoom = cy.zoom();
  cy.nodes().forEach(node => {
    const description = node.data('description');
    if (!description) return;
    active.add(node.id());
    let label = descriptionElements.get(node.id());
    if (!label) {
      label = document.createElement('div'); label.className = 'node-desc-label';
      label.style.cssText = 'position:absolute;margin-top:0;pointer-events:none;width:130px;transform-origin:top center;';
      layer.appendChild(label); descriptionElements.set(node.id(), label);
    }
    const p = node.renderedPosition();
    label.textContent = description;
    label.style.left = p.x + 'px';
    label.style.top = p.y + node.renderedOuterHeight() / 2 + clamp(node.data('descDist'), 0, 150, 42) * zoom + 'px';
    label.style.transform = 'translateX(-50%) scale(' + zoom + ')';
    label.style.display = node.visible() ? '' : 'none';
  });
  for (const [id, label] of descriptionElements) {
    if (!active.has(id)) { label.remove(); descriptionElements.delete(id); }
  }
}

// GRAPH EVENTS AND SELECTION
function bindCyEvents() {
  let beforeTap = [];
  let previousTapId = null, previousTapTime = 0, doubleTapId = null;
  cy.on('tap', 'node, edge', event => {
    const now = performance.now();
    doubleTapId = previousTapId === event.target.id() && now - previousTapTime < 400 ? event.target.id() : null;
    previousTapId = event.target.id(); previousTapTime = now;
  });
  cy.on('tapstart', () => { beforeTap = cy.elements(':selected').map(el => el.id()); });
  cy.on('tap', 'node', event => {
    if (mode !== 'select') {
      handleConnectTap(event.target);
      queueMicrotask(() => { if (mode !== 'select') clearSelection(); });
      return;
    }
    const target = event.target;
    const native = event.originalEvent;
    const additive = !!(native?.ctrlKey || native?.metaKey || native?.shiftKey);
    const previous = [...beforeTap];
    // Apply after Cytoscape's built-in tap selection to avoid double toggles.
    queueMicrotask(() => {
      if (target.removed()) return;
      if (!additive) { selectElement(target); return; }
      const ids = new Set(previous);
      if (ids.has(target.id())) ids.delete(target.id()); else ids.add(target.id());
      cy.elements().unselect();
      ids.forEach(id => cy.getElementById(id).select());
      selectedEl = cy.elements(':selected').last();
      if (!selectedEl.length) selectedEl = null;
      refreshInspector(true);
      updateToolbar();
    });
  });
  cy.on('tap', 'edge', event => {
    // An existing connection is editable even if drawing mode was left active.
    const edge = event.target;
    setMode('select');
    queueMicrotask(() => { if (!edge.removed()) selectElement(edge); });
  });
  cy.on('tap', event => {
    if (event.target !== cy) return;
    if (connectSrc) {
      connectSrc.removeClass('connect-src'); connectSrc = null; updateModePill('source');
    } else if (mode === 'select') clearSelection();
  });
  cy.on('dbltap', 'node, edge', event => {
    // Two fast clicks on different nodes or Ctrl-clicks are not rename gestures.
    if (event.originalEvent?.ctrlKey || event.originalEvent?.metaKey || event.originalEvent?.shiftKey || doubleTapId !== event.target.id()) return;
    if (event.target.isNode() && mode !== 'select') return;
    const target = event.target;
    setMode('select');
    queueMicrotask(() => {
      if (target.removed()) return;
      selectElement(target);
      requestAnimationFrame(() => {
        const input = $(target.isNode() ? 'ii-name' : 'ie-label');
        input?.focus(); input?.select();
      });
    });
  });
  cy.on('select unselect', () => {
    if (selectionFrame) return;
    selectionFrame = requestAnimationFrame(() => {
      selectionFrame = 0;
      if (exportBackup) return;
      if (selectedEl?.removed() || !selectedEl?.selected()) {
        selectedEl = cy.elements(':selected').last();
        if (!selectedEl.length) selectedEl = null;
      }
      refreshInspector(false);
      updateToolbar();
    });
  });
  cy.on('mouseover', 'node, edge', event => event.target.addClass('hovered'));
  cy.on('mouseout', 'node, edge', event => event.target.removeClass('hovered'));
  cy.on('dragfree', 'node', () => { clearGuides(); pushHistory(); });
  cy.on('drag', 'node', event => {
    if (!guidesEnabled) return;
    const dragged = event.target;
    const pos = dragged.position();
    const threshold = 10 / cy.zoom();
    const others = cy.nodes().filter(n => n.id() !== dragged.id() && !n.selected());
    const guides = [];
    let snappedX = false, snappedY = false;
    others.forEach(other => {
      const op = other.position();
      if (!snappedY && Math.abs(pos.y - op.y) < threshold) {
        dragged.position('y', op.y); guides.push({ type:'h', model:op.y }); snappedY = true;
      }
      if (!snappedX && Math.abs(pos.x - op.x) < threshold) {
        dragged.position('x', op.x); guides.push({ type:'v', model:op.x }); snappedX = true;
      }
    });
    renderGuides(guides);
  });
  cy.on('pan zoom', clearGuides);
}
/** Central selection helper, missing in the original connection click handler. */
function selectElement(element) {
  if (!element?.length || element.removed()) return;
  if (mode !== 'select') setMode('select');
  cy.elements().not(element).unselect();
  element.select();
  selectedEl = element;
  refreshInspector(true);
  updateToolbar();
}
function clearSelection() {
  cy.elements().unselect(); selectedEl = null; showEmpty(); updateToolbar();
}
function refreshInspector(open = false) {
  if (liveSelection('node')) showNodeInspector(selectedEl, open);
  else if (liveSelection('edge')) showEdgeInspector(selectedEl, open);
  else showEmpty();
}

// ALIGNMENT GUIDES
function modelToScreenCoords(x, y) { const pan = cy.pan(), z = cy.zoom(); return { x:x * z + pan.x, y:y * z + pan.y }; }
function renderGuides(guides) {
  const container = $('align-guides');
  container.replaceChildren();
  if (!guidesEnabled) return;
  guides.forEach(guide => {
    const line = document.createElement('div'); line.className = 'guide-line ' + guide.type;
    if (guide.type === 'h') line.style.top = modelToScreenCoords(0, guide.model).y + 'px';
    else line.style.left = modelToScreenCoords(guide.model, 0).x + 'px';
    container.appendChild(line);
  });
}
function clearGuides() { $('align-guides')?.replaceChildren(); }

// CONNECTIONS AND MODE MANAGEMENT
function handleConnectTap(node) {
  if (!connectSrc || connectSrc.removed()) {
    connectSrc = node; node.addClass('connect-src'); updateModePill('target');
  } else {
    if (connectSrc.id() !== node.id()) { createEdge(connectSrc, node, mode); pushHistory(); }
    connectSrc.removeClass('connect-src'); connectSrc = null; updateModePill('source');
  }
}
function createEdge(src, tgt, type) {
  const edge = cy.add({ group:'edges', data:{
    id:uid(), source:src.id(), target:tgt.id(), edgeType:type === 'arrow' ? 'arrow' : 'line', label:'',
    color:null, textColor:null, fontSize:10, width:1.5, lineStyle:'solid', curve:'straight',
  } });
  updateStatus();
  return edge;
}
function setMode(newMode) {
  if (!['select','line','arrow'].includes(newMode)) return;
  if (connectSrc) { connectSrc.removeClass('connect-src'); connectSrc = null; }
  mode = newMode;
  ['select','line','arrow'].forEach(id => $('btn-' + id)?.classList.toggle('active', mode === id));
  $('cy').style.cursor = mode === 'select' ? '' : 'crosshair';
  cy.autoungrabify(mode !== 'select');
  updateModePill('source');
  if (mode !== 'select') { clearSelection(); setInspectorOpen(false); }
}
function updateModePill(step) {
  const pill = $('mode-pill');
  if (!pill) return;
  pill.classList.toggle('visible', mode !== 'select');
  if (mode !== 'select') pill.textContent = t(mode === 'line' ? (step === 'target' ? 'modeLineTgt' : 'modeLineSrc') : (step === 'target' ? 'modeArrowTgt' : 'modeArrowSrc'));
}

// ENTITIES AND FREE TEXT
function addEntityFromPalette(typeId) {
  setMode('select');
  typeId = canonicalType(typeId);
  const ext = cy.extent();
  const existing = cy.nodes().filter(n => n.data('type') === typeId).length;
  const localName = getEntityLocalName(typeId);
  const name = typeId === 'text' ? t('newText') : existing ? localName + ' ' + (existing + 1) : localName;
  const node = addNodeToGraph(typeId, name, {
    x:(ext.x1 + ext.x2) / 2 + (Math.random() - 0.5) * 110,
    y:(ext.y1 + ext.y2) / 2 + (Math.random() - 0.5) * 110,
  });
  pushHistory(); selectElement(node);
  cy.animate({ center:{ eles:node }, duration:160 });
  setTimeout(() => { if (selectedEl?.id() === node.id()) focusNameInput(); }, 220);
  return node;
}
function addText() { return addEntityFromPalette('text'); }
function addNodeToGraph(typeId, name, position) {
  typeId = canonicalType(typeId);
  const type = getType(typeId);
  const node = cy.add({ group:'nodes', data:{
    id:uid(), name:String(name ?? ''), type:typeId, iconSvg:getIconUri(type), customImg:null, customText:null,
    description:'', startDate:'', endDate:'', size:68, fontSize:typeId === 'text' ? 18 : 11, descDist:42,
    textWidth:280, textHeight:30, textColor:null,
  }, position });
  syncTextDimensions(node); updateStatus(); return node;
}
let measureContext = null;
function syncTextDimensions(node) {
  if (!isTextNode(node)) return;
  const width = clamp(node.data('textWidth'), 80, 1000, 280);
  const font = clamp(node.data('fontSize'), 8, 48, 18);
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  measureContext.font = font + 'px Inter, system-ui, sans-serif';
  let lines = 0;
  String(node.data('name') || ' ').split('\n').forEach(paragraph => {
    let current = '';
    lines++;
    for (const char of Array.from(paragraph)) {
      if (current && measureContext.measureText(current + char).width > width) { lines++; current = char; }
      else current += char;
    }
  });
  const height = Math.max(24, Math.ceil(lines * font * 1.2 + 8));
  if (node.data('textHeight') !== height) node.data('textHeight', height);
}

// INSPECTOR
function setInspectorOpen(open) {
  $('workspace')?.classList.toggle('inspector-open', !!open);
  $('btn-inspector')?.setAttribute('aria-expanded', String(!!open));
}
function showEmpty() {
  if ($('insp-empty')) $('insp-empty').style.display = '';
  $('insp-node')?.classList.remove('visible'); $('insp-edge')?.classList.remove('visible');
}
function setRangeValue(id, value) {
  setValue(id, value); setText(id + '-value', value + 'px');
}
function showNodeInspector(node, open = true) {
  const type = getType(node.data('type'));
  const text = isTextNode(node);
  $('insp-empty').style.display = 'none'; $('insp-node').classList.add('visible'); $('insp-edge').classList.remove('visible');
  setRangeValue('ii-size', clamp(node.data('size'), 40, 180, 68));
  setRangeValue('ii-font-size', clamp(node.data('fontSize'), 8, 48, text ? 18 : 11));
  setRangeValue('ii-text-width', clamp(node.data('textWidth'), 80, 1000, 280));
  setValue('ii-desc-dist', clamp(node.data('descDist'), 0, 150, 42));
  setValue('ii-text-color', hexColor(node.data('textColor'), isCanvasLight() ? '#333333' : '#ffffff'));
  const iconEl = $('ii-icon'); iconEl.replaceChildren();
  const customImg = node.data('customImg');
  if (customImg && !text) {
    const img = document.createElement('img'); img.src = customImg; img.alt = 'icon'; iconEl.appendChild(img);
  } else iconEl.textContent = text ? 'T' : node.data('customText') || type.icon;
  setText('ii-kind', getEntityLocalName(type.id).toUpperCase());
  setText('ii-title', node.data('name') || '\u2014');
  setValue('ii-name', node.data('name') || '');
  $('ii-name').rows = text ? 4 : 1;
  setValue('ii-type', node.data('type') || 'person');
  setValue('ii-text-icon', node.data('customText') || '');
  setValue('ii-flaticon-url', typeof customImg === 'string' && /^https?:/i.test(customImg) ? customImg : '');
  setValue('ii-desc', node.data('description') || '');
  setValue('ii-start-date', node.data('startDate') || ''); setValue('ii-end-date', node.data('endDate') || '');
  if ($('ii-end-date')) $('ii-end-date').min = node.data('startDate') || '';
  const preview = $('upload-preview');
  if (customImg && !text) preview.src = customImg; else preview.removeAttribute('src');
  preview.classList.toggle('visible', !!customImg && !text);
  ['text-width-group','text-color-group'].forEach(id => { if ($(id)) $(id).hidden = !text; });
  ['node-size-group','custom-icon-group','wall-color-group'].forEach(id => { if ($(id)) $(id).hidden = text; });
  document.querySelectorAll('.wall-color-btn').forEach(button => button.classList.toggle('active', button.dataset.wallColor === (node.data('wallColor') || '#000000')));
  if (open) setInspectorOpen(true);
}
function showEdgeInspector(edge, open = true) {
  const isArrow = edge.data('edgeType') === 'arrow';
  $('insp-empty').style.display = 'none'; $('insp-node').classList.remove('visible'); $('insp-edge').classList.add('visible');
  setText('ie-glyph', isArrow ? '\u2192' : '\u2014'); setText('ie-kind', t(isArrow ? 'arrowConn' : 'lineConn'));
  setValue('ie-label', edge.data('label') || '');
  setValue('ie-color', hexColor(edge.data('color'), isCanvasLight() ? '#bbbbbb' : '#ffffff'));
  setValue('ie-text-color', hexColor(edge.data('textColor'), isCanvasLight() ? '#888888' : '#dddddd'));
  setRangeValue('ie-font-size', clamp(edge.data('fontSize'), 8, 72, 10));
  setRangeValue('ie-width', clamp(edge.data('width'), 1, 12, 1.5));
  $('ie-line-btn').classList.toggle('active', !isArrow); $('ie-arrow-btn').classList.toggle('active', isArrow);
  const dashed = edge.data('lineStyle') === 'dashed', curved = edge.data('curve') === 'curved';
  $('ie-solid-btn').classList.toggle('active', !dashed); $('ie-dashed-btn').classList.toggle('active', dashed);
  $('ie-straight-btn').classList.toggle('active', !curved); $('ie-curved-btn').classList.toggle('active', curved);
  if (open) setInspectorOpen(true);
}
function focusNameInput() { $('ii-name')?.focus(); $('ii-name')?.select(); }

// CUSTOM ICONS
function safeImageURL(url) {
  if (typeof url !== 'string') return false;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml|bmp|avif|x-icon)[;,]/i.test(url)) return true;
  try { return ['http:','https:','blob:'].includes(new URL(url).protocol); } catch (_) { return false; }
}
function applyNodeImage(node, url) {
  if (!node || node.removed() || isTextNode(node)) return;
  if (!safeImageURL(url)) { showToast(t('invalidURL')); return; }
  node.data({ iconSvg:url, customImg:url, customText:null });
  if (selectedEl?.id() === node.id()) showNodeInspector(node, false);
  pushHistory();
}
function applyNodeText(node, text) {
  if (!node || node.removed() || isTextNode(node) || !String(text).trim()) return;
  text = String(text).trim();
  node.data({ iconSvg:textSvg(text, !isCanvasLight()), customText:text, customImg:null });
  if (selectedEl?.id() === node.id()) showNodeInspector(node, false);
  pushHistory();
}
function resetNodeIcon(node) {
  if (!node || node.removed()) return;
  node.data({ iconSvg:getIconUri(getType(node.data('type'))), customImg:null, customText:null });
  if (selectedEl?.id() === node.id()) showNodeInspector(node, false);
  pushHistory();
}
function applyFlaticonURL() {
  if (!liveSelection('node')) return;
  let url = $('ii-flaticon-url').value.trim();
  if (!url) return;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    // Do not accidentally reinterpret direct CDN URLs as a different icon ID.
    if (host === 'flaticon.com' || host === 'www.flaticon.com') {
      const match = parsed.pathname.match(/_(\d+)\/?$/) || [null, parsed.searchParams.get('related_id')];
      if (match[1] && /^\d+$/.test(match[1])) {
        const id = match[1]; url = 'https://cdn-icons-png.flaticon.com/512/' + Math.floor(Number(id) / 1000) + '/' + id + '.png';
        setValue('ii-flaticon-url', url);
      }
    }
    if (!['https:','http:'].includes(parsed.protocol)) throw new Error('Invalid protocol');
  } catch (_) { showToast(t('invalidURL')); return; }
  applyNodeImage(selectedEl, url);
}

// ALIGN AND DISTRIBUTE: retain the original fallback to all nodes.
function getTargetNodes() { const selected = cy.nodes(':selected'); return selected.length >= 2 ? selected : cy.nodes(); }
function alignHorizontal() {
  const nodes = getTargetNodes();
  if (nodes.length < 2) { showToast(currentLang === 'pt' ? 'Selecione pelo menos 2 entidades' : 'Select at least 2 entities'); return; }
  const values = nodes.map(n => n.position('y')).sort((a,b) => a-b), median = values[Math.floor(values.length / 2)];
  nodes.forEach(n => n.position('y', median)); pushHistory();
  showToast(currentLang === 'pt' ? 'Alinhado horizontalmente' : 'Aligned horizontally');
}
function alignVertical() {
  const nodes = getTargetNodes();
  if (nodes.length < 2) { showToast(currentLang === 'pt' ? 'Selecione pelo menos 2 entidades' : 'Select at least 2 entities'); return; }
  const values = nodes.map(n => n.position('x')).sort((a,b) => a-b), median = values[Math.floor(values.length / 2)];
  nodes.forEach(n => n.position('x', median)); pushHistory();
  showToast(currentLang === 'pt' ? 'Alinhado verticalmente' : 'Aligned vertically');
}
function distributeNodes(axis) {
  const nodes = getTargetNodes();
  if (nodes.length < 3) { showToast(currentLang === 'pt' ? 'Selecione pelo menos 3 entidades' : 'Select at least 3 entities'); return; }
  const sorted = [...nodes].sort((a,b) => a.position(axis) - b.position(axis));
  const min = sorted[0].position(axis), gap = (sorted[sorted.length-1].position(axis) - min) / (sorted.length-1);
  sorted.forEach((node, i) => node.position(axis, min + gap * i)); pushHistory();
  showToast(currentLang === 'pt' ? 'Entidades distribu\u00eddas' : 'Entities distributed');
}
function distributeHorizontal() { distributeNodes('x'); }
function distributeVertical() { distributeNodes('y'); }
function deleteSelected() {
  pushHistory(); // Commit any live inspector edit before deletion.
  const targets = cy.elements(':selected');
  if (targets.length) targets.remove(); else if (selectedEl && !selectedEl.removed()) selectedEl.remove(); else return;
  if (connectSrc?.removed()) connectSrc = null;
  selectedEl = null; showEmpty(); clearGuides(); updateToolbar(); updateStatus(); pushHistory();
}

// SAVE / LOAD AND HISTORY
function graphElementsJSON() {
  return cy.elements().jsons().map(element => {
    // Selection and hover are editor state, not document contents.
    const copy = { ...element, data:{ ...element.data }, selected:false };
    if (copy.data.type === 'text') delete copy.data.textHeight;
    if (copy.data.customText) copy.data.iconSvg = textSvg(copy.data.customText,false);
    copy.classes = String(copy.classes || '').split(/\s+/).filter(name => name && name !== 'hovered' && name !== 'connect-src').join(' ');
    return copy;
  });
}
function snapshotJSON() {
  // Cytoscape restores nodes before edges; canonical ordering avoids false edits
  // (and lost Redo) when a text node was inserted after an existing connection.
  const elements = graphElementsJSON().sort((a,b) => {
    if (a.group !== b.group) return a.group === 'nodes' ? -1 : 1;
    return a.data.id < b.data.id ? -1 : a.data.id > b.data.id ? 1 : 0;
  });
  return JSON.stringify(elements);
}
function pushHistory() {
  if (!cy || exportBackup) return;
  const snap = snapshotJSON();
  if (history[histIdx] === snap) { updateToolbar(); return; }
  history = history.slice(0, histIdx + 1);
  history.push(snap);
  if (history.length > MAX_HIST) history.shift();
  histIdx = history.length - 1;
  updateToolbar();
}
function undo() {
  pushHistory();
  if (histIdx <= 0) return;
  applySnapshot(history[--histIdx]);
}
function redo() {
  if (snapshotJSON() !== history[histIdx]) { pushHistory(); return; }
  if (histIdx >= history.length - 1) return;
  applySnapshot(history[++histIdx]);
}
/** Validate the complete file before changing the current graph. */
function normalizeGraph(input) {
  let entries = input;
  if (!Array.isArray(entries) && entries && typeof entries === 'object') {
    if ('elements' in entries) entries = entries.elements;
    if (!Array.isArray(entries) && entries && (Array.isArray(entries.nodes) || Array.isArray(entries.edges))) {
      entries = [...(entries.nodes || []), ...(entries.edges || [])];
    }
  }
  if (!Array.isArray(entries)) throw new Error('Expected a Cytoscape element array');
  const ids = new Set(), nodeIds = new Set();
  const normalized = entries.map(entry => {
    if (!entry || typeof entry !== 'object' || !entry.data || typeof entry.data !== 'object' || Array.isArray(entry.data)) throw new Error('Invalid element');
    const element = JSON.parse(JSON.stringify(entry));
    const data = element.data;
    if (data.id === undefined || data.id === null || String(data.id).trim() === '') throw new Error('Missing element ID');
    data.id = String(data.id);
    if (ids.has(data.id)) throw new Error('Duplicate ID: ' + data.id);
    ids.add(data.id);
    const group = element.group || (data.source !== undefined || data.target !== undefined ? 'edges' : 'nodes');
    if (!['nodes','edges'].includes(group)) throw new Error('Invalid element group');
    element.group = group;
    element.selected = false;
    element.classes = String(element.classes || '').split(/\s+/).filter(name => name && name !== 'hovered' && name !== 'connect-src').join(' ');
    if (group === 'nodes') {
      nodeIds.add(data.id);
      data.type = canonicalType(data.type || 'person');
      data.name = String(data.name ?? '');
      data.description = String(data.description ?? '');
      data.startDate = String(data.startDate ?? ''); data.endDate = String(data.endDate ?? '');
      data.size = clamp(data.size, 40, 180, 68);
      data.fontSize = clamp(data.fontSize, 8, 48, data.type === 'text' ? 18 : 11);
      data.descDist = clamp(data.descDist, 0, 150, 42);
      data.textWidth = clamp(data.textWidth, 80, 1000, 280);
      data.textHeight = Math.max(24, Number(data.textHeight) || 30);
      data.textColor = hexColor(data.textColor);
      data.customText = data.customText == null ? null : String(data.customText);
      data.customImg = safeImageURL(data.customImg) ? data.customImg : null;
      if (data.type === 'text') data.iconSvg = '';
      else if (data.customText) data.iconSvg = textSvg(data.customText, !isCanvasLight());
      else if (data.customImg) data.iconSvg = data.customImg;
      else if (!safeImageURL(data.iconSvg)) data.iconSvg = getIconUri(getType(data.type));
      if (data.parent != null) data.parent = String(data.parent);
      if (element.position) {
        if (!Number.isFinite(Number(element.position.x)) || !Number.isFinite(Number(element.position.y))) throw new Error('Invalid position');
        element.position = { x:Number(element.position.x), y:Number(element.position.y) };
      }
    } else {
      if (data.source == null || data.target == null) throw new Error('Missing connection endpoint');
      data.source = String(data.source); data.target = String(data.target);
      data.label = String(data.label ?? '');
      data.edgeType = data.edgeType === 'arrow' ? 'arrow' : 'line';
      data.color = hexColor(data.color ?? data.lineColor);
      data.textColor = hexColor(data.textColor ?? data.labelColor);
      data.fontSize = clamp(data.fontSize, 8, 72, 10);
      data.width = clamp(data.width, 1, 12, 1.5);
      data.lineStyle = data.lineStyle === 'dashed' ? 'dashed' : 'solid';
      // A missing curve field keeps the original parallel-edge Bezier routing.
      if (data.curve != null) data.curve = data.curve === 'curved' ? 'curved' : 'straight';
    }
    return element;
  });
  const parents = new Map();
  normalized.forEach(element => {
    const data = element.data;
    if (element.group === 'edges' && (!nodeIds.has(data.source) || !nodeIds.has(data.target))) throw new Error('Connection refers to a missing node');
    if (element.group === 'nodes' && data.parent != null) {
      if (!nodeIds.has(data.parent)) throw new Error('Missing parent');
      parents.set(data.id, data.parent);
    }
  });
  for (const id of parents.keys()) {
    const visited = new Set([id]);
    let parent = parents.get(id);
    while (parent != null) {
      if (visited.has(parent)) throw new Error('Cyclic parent hierarchy');
      visited.add(parent); parent = parents.get(parent);
    }
  }
  return normalized;
}
function applySnapshot(snap) {
  const elements = normalizeGraph(JSON.parse(snap));
  const previous = graphElementsJSON();
  setMode('select'); selectedEl = null;
  cy.startBatch();
  try {
    cy.elements().remove(); cy.add(elements);
    cy.nodes().forEach(syncTextDimensions);
  } catch (error) {
    cy.elements().remove(); cy.add(previous); throw error;
  } finally { cy.endBatch(); }
  clearGuides(); showEmpty(); updateToolbar(); updateStatus(); scheduleDescriptions();
}
function downloadData(data, filename) {
  const blob = data instanceof Blob ? data : new Blob([data], { type:'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.style.display = 'none';
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  // Let the browser consume the object URL before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function exportJSON() {
  if (!cy.elements().length) { showToast(t('noEntities')); return; }
  pushHistory();
  downloadData(JSON.stringify(graphElementsJSON(), null, 2), 'schema_' + Date.now() + '.json');
}
function importJSON(file) {
  if (!file) return Promise.resolve(false);
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const data = normalizeGraph(JSON.parse(event.target.result));
        pushHistory(); applySnapshot(JSON.stringify(data)); pushHistory(); fitGraph(); showToast(t('loaded')); resolve(true);
      } catch (error) { console.warn('Schema import rejected:', error); showToast(t('invalidJSON')); resolve(false); }
    };
    reader.onerror = () => { showToast(t('readError')); resolve(false); };
    reader.readAsText(file);
  });
}
function updateToolbar() {
  if (!cy) return;
  if ($('btn-delete')) $('btn-delete').disabled = !(selectedEl && !selectedEl.removed()) && !cy.elements(':selected').length;
  if ($('btn-undo')) $('btn-undo').disabled = histIdx <= 0;
  if ($('btn-redo')) $('btn-redo').disabled = histIdx >= history.length - 1;
}
function updateStatus() {
  if (!cy) return;
  const nodes = cy.nodes().length, edges = cy.edges().length;
  setText('sb-nodes', nodes + ' ' + (currentLang === 'pt' ? (nodes === 1 ? 'entidade' : 'entidades') : (nodes === 1 ? 'entity' : 'entities')));
  setText('sb-edges', edges + ' ' + (currentLang === 'pt' ? (edges === 1 ? 'conex\u00e3o' : 'conex\u00f5es') : (edges === 1 ? 'connection' : 'connections')));
}
function fitGraph() { cy.resize(); if (cy.elements().length) cy.fit(undefined, 44); }

// PNG / PDF: keep names and selection intact, including when an export fails.
function prepareForExport() {
  if (exportBackup) return;
  exportBackup = { names:new Map(), selected:cy.elements(':selected'), hovered:cy.elements('.hovered'), source:connectSrc };
  cy.batch(() => {
    cy.elements().unselect().removeClass('hovered connect-src');
    cy.nodes().forEach(node => {
      const desc = node.data('description');
      if (desc) {
        exportBackup.names.set(node.id(), node.data('name'));
        node.data('name', node.data('name') + '\n\n\n' + desc);
        syncTextDimensions(node);
      }
    });
  });
}
function restoreAfterExport() {
  if (!exportBackup) return;
  const backup = exportBackup;
  cy.batch(() => {
    backup.names.forEach((name, id) => {
      const node = cy.getElementById(id);
      if (node.length) { node.data('name', name); syncTextDimensions(node); }
    });
    backup.selected.select(); backup.hovered.addClass('hovered');
    if (backup.source && !backup.source.removed()) backup.source.addClass('connect-src');
  });
  exportBackup = null;
  refreshInspector(false); scheduleDescriptions();
}
function exportPNG() {
  if (!cy.elements().length) { showToast(t('noEntities')); return; }
  try {
    prepareForExport();
    const bg = cleanBgEnabled ? '#ffffff' : isLight ? '#f0f0f0' : '#0c0c0c';
    const image = cy.png({ scale:3, bg, full:true });
    const anchor = document.createElement('a');
    anchor.href = image; anchor.download = 'schema_' + Date.now() + '.png';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
  } catch (error) { console.error('PNG export failed:', error); showToast(t('exportError')); }
  finally { restoreAfterExport(); }
}
function exportPDF() {
  if (!cy.elements().length) { showToast(t('noEntities')); return; }
  if (!window.jspdf?.jsPDF) { showToast(t('missingPDF')); return; }
  try {
    prepareForExport();
    const light = isCanvasLight(), bg = light ? '#ffffff' : '#0c0c0c';
    const bb = cy.elements().boundingBox();
    const doc = new window.jspdf.jsPDF({ orientation:bb.w >= bb.h ? 'landscape' : 'portrait', unit:'mm', format:'a4' });
    const pW = doc.internal.pageSize.getWidth(), pH = doc.internal.pageSize.getHeight();
    doc.setFillColor(...(light ? [255,255,255] : [12,12,12])); doc.rect(0,0,pW,pH,'F');
    doc.setTextColor(...(light ? [0,0,0] : [240,240,240])); doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.text('SCHEMA',14,17);
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(...(light ? [80,80,80] : [180,180,180]));
    const date = new Date().toLocaleDateString(currentLang === 'pt' ? 'pt-BR' : 'en', { year:'numeric', month:'long', day:'numeric' });
    doc.text('Visual Link Schema  -  ' + date,14,23.5);
    const count = cy.nodes().length + (currentLang === 'pt' ? ' entidades  -  ' : ' entities  -  ') + cy.edges().length + (currentLang === 'pt' ? ' conexoes' : ' connections');
    doc.text(count,pW-14,23.5,{ align:'right' });
    doc.setDrawColor(...(light ? [220,220,220] : [50,50,50])); doc.line(14,27,pW-14,27);
    const image = cy.png({ scale:2.5, bg, full:true });
    const props = doc.getImageProperties(image);
    const availableW = pW-28, availableH = pH-45;
    const ratio = Math.min(availableW/props.width, availableH/props.height);
    const w = props.width*ratio, h = props.height*ratio;
    doc.addImage(image,'PNG',14+(availableW-w)/2,31+(availableH-h)/2,w,h,undefined,'FAST');
    doc.save('schema_' + Date.now() + '.pdf');
  } catch (error) { console.error('PDF export failed:', error); showToast(t('exportError')); }
  finally { restoreAfterExport(); }
}

// ORIGINAL CSV / XLSX IMPORT HELPERS (no new toolbar control added).
function importFile(file) {
  if (!window.XLSX) { showToast(t('missingSheet')); return; }
  const csv = file.name.split('.').pop().toLowerCase() === 'csv';
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const workbook = XLSX.read(event.target.result, { type:csv ? 'string' : 'array' });
      processRows(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]));
    } catch (error) { console.warn('Spreadsheet import failed:', error); showToast(t('readError')); }
  };
  reader.onerror = () => showToast(t('readError'));
  if (csv) reader.readAsText(file); else reader.readAsArrayBuffer(file);
}
function processRows(rows) {
  if (!rows?.length) { showToast(currentLang === 'pt' ? 'Nenhum dado encontrado.' : 'No data found in file.'); return; }
  pushHistory();
  let newNodes = 0, newEdges = 0;
  rows.forEach(row => {
    const r = {};
    Object.entries(row).forEach(([key,value]) => { r[key.toLowerCase().trim().replace(/\s+/g,'_')] = String(value ?? '').trim(); });
    const srcName = r.source || r.source_name || r.from || '', srcType = r.source_type || r.from_type || 'person';
    const tgtName = r.target || r.target_name || r.to || '', tgtType = r.target_type || r.to_type || 'person';
    const label = r.label || r.relationship || r.relation || '';
    const edgeType = (r.edge_type || r.type || '').toLowerCase() === 'arrow' ? 'arrow' : 'line';
    if (!srcName) return;
    let src = cy.nodes().filter(node => node.data('name') === srcName).first();
    if (!src.length) { src = addNodeToGraph(srcType,srcName,{ x:100+Math.random()*700,y:100+Math.random()*400 }); newNodes++; }
    if (!tgtName) return;
    let tgt = cy.nodes().filter(node => node.data('name') === tgtName).first();
    if (!tgt.length) { tgt = addNodeToGraph(tgtType,tgtName,{ x:100+Math.random()*700,y:100+Math.random()*400 }); newNodes++; }
    const duplicate = cy.edges().some(edge => (edge.data('source') === src.id() && edge.data('target') === tgt.id()) || (edge.data('source') === tgt.id() && edge.data('target') === src.id()));
    if (!duplicate) { createEdge(src,tgt,edgeType).data('label',label); newEdges++; }
  });
  if (newNodes) {
    cy.layout({ name:'cose', animate:true, animationDuration:700, randomize:false, nodeRepulsion:9000, idealEdgeLength:130, stop:() => pushHistory() }).run();
  } else pushHistory();
  updateStatus();
  showToast(currentLang === 'pt' ? 'Importadas ' + newNodes + ' entidades e ' + newEdges + ' conex\u00f5es' : 'Imported ' + newNodes + ' entities - ' + newEdges + ' connections');
}

// DROPDOWN: the five actions are already in the supplied HTML.
function menuIsOpen() { return !!$('file-menu') && !$('file-menu').hidden; }
function menuItems() { return Array.from($('file-menu')?.querySelectorAll('[role="menuitem"]:not(:disabled)') || []); }
function positionFileMenu() {
  if (!menuIsOpen()) return;
  const menu = $('file-menu'), button = $('btn-file-menu'), rect = button.getBoundingClientRect();
  const viewport = window.visualViewport;
  const leftLimit = viewport?.offsetLeft || 0, topLimit = viewport?.offsetTop || 0;
  const width = viewport?.width || document.documentElement.clientWidth;
  const height = viewport?.height || document.documentElement.clientHeight;
  const rightLimit = leftLimit + width, bottomLimit = topLimit + height, gap = 8;
  menu.style.width = Math.max(0, Math.min(210,width-gap*2)) + 'px';
  const below = Math.max(0,bottomLimit-rect.bottom-gap*2), above = Math.max(0,rect.top-topLimit-gap*2);
  const useBelow = below >= Math.min(menu.scrollHeight,220) || below >= above;
  const available = Math.max(0,(useBelow ? below : above));
  menu.style.maxHeight = available + 'px';
  const menuHeight = Math.min(menu.scrollHeight,available);
  const menuWidth = menu.getBoundingClientRect().width;
  menu.style.left = Math.max(leftLimit+gap,Math.min(rect.right-menuWidth,rightLimit-menuWidth-gap)) + 'px';
  menu.style.top = Math.max(topLimit+gap,useBelow ? rect.bottom+gap : rect.top-menuHeight-gap) + 'px';
}
function openFileMenu(focus = true, last = false) {
  if (!$('file-menu')) return;
  $('file-menu').hidden = false; $('btn-file-menu').setAttribute('aria-expanded','true'); positionFileMenu();
  if (focus) { const items = menuItems(); (last ? items[items.length-1] : items[0])?.focus(); }
}
function closeFileMenu(restoreFocus = false) {
  if (!$('file-menu')) return;
  $('file-menu').hidden = true; $('btn-file-menu')?.setAttribute('aria-expanded','false');
  if (restoreFocus) $('btn-file-menu')?.focus();
}
function initFileMenu() {
  on('btn-file-menu','click',() => menuIsOpen() ? closeFileMenu(true) : openFileMenu());
  on('btn-file-menu','keydown',event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openFileMenu(true,event.key === 'ArrowUp'); }
  });
  on('file-menu','keydown',event => {
    const items = menuItems(), index = items.indexOf(document.activeElement);
    let next = null;
    if (event.key === 'ArrowDown') next = (index+1)%items.length;
    if (event.key === 'ArrowUp') next = (index-1+items.length)%items.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length-1;
    if (next !== null) { event.preventDefault(); items[next]?.focus(); return; }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeFileMenu(true); }
    if (event.key === 'Tab') { closeFileMenu(true); }
  });
  document.addEventListener('pointerdown',event => {
    if (menuIsOpen() && !$('file-menu').contains(event.target) && !$('btn-file-menu').contains(event.target)) closeFileMenu();
  });
  on('file-menu','focusout',() => setTimeout(() => {
    if (menuIsOpen() && !$('file-menu').contains(document.activeElement) && document.activeElement !== $('btn-file-menu')) closeFileMenu();
  },0));
}
function bindMenuAction(id, action) {
  on(id,'click',() => { closeFileMenu(); action(); });
}

// RESPONSIVE CANVAS: changes to the wrapping header must update hit coordinates.
function scheduleResize() {
  if (resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    if (cy && !cy.destroyed()) cy.resize();
    clearGuides(); scheduleDescriptions(); positionFileMenu();
    if (timelineObj && $('timeline-modal')?.style.display !== 'none') timelineObj.redraw();
  });
}
function initResponsive() {
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleResize);
    [document.querySelector('.toolbar'),$('canvas-wrap'),$('workspace')].filter(Boolean).forEach(el => resizeObserver.observe(el));
  }
  window.addEventListener('resize',scheduleResize);
  window.visualViewport?.addEventListener('resize',scheduleResize);
  window.visualViewport?.addEventListener('scroll',positionFileMenu);
  document.querySelector('.toolbar')?.addEventListener('scroll',positionFileMenu,{ passive:true });
  on('btn-inspector','click',() => setInspectorOpen(!$('workspace').classList.contains('inspector-open')));
  on('btn-close-inspector','click',() => { setInspectorOpen(false); $('btn-inspector')?.focus(); });
  document.fonts?.ready.then(() => { cy.nodes().forEach(syncTextDimensions); scheduleResize(); });
  scheduleResize();
}

// PALETTE AND TYPE SELECT
function initPalette() {
  const list = $('palette-list'); list.replaceChildren();
  ENTITY_TYPES.forEach(type => {
    const item = document.createElement('button'); item.type = 'button'; item.className = 'palette-item'; item.dataset.typeId = type.id;
    const icon = document.createElement('span'); icon.className = 'palette-icon';
    if (type.iconUri) {
      const image = document.createElement('img'); image.src = type.iconUri; image.width = 20; image.height = 20; image.alt = '';
      image.style.cssText = 'vertical-align:middle;display:block'; icon.appendChild(image);
    } else icon.textContent = type.icon;
    const name = document.createElement('span'); name.className = 'palette-name';
    item.append(icon,name); item.addEventListener('click',() => addEntityFromPalette(type.id)); list.appendChild(item);
  });
  refreshPaletteNames();
}
function refreshPaletteNames() {
  $('palette-list')?.querySelectorAll('.palette-item').forEach(item => {
    const name = getEntityLocalName(item.dataset.typeId); item.title = name; item.setAttribute('aria-label',name);
    item.querySelector('.palette-name').textContent = name;
  });
}
function initTypeSelect() {
  $('ii-type').replaceChildren();
  ENTITY_TYPES.forEach(type => { const option = document.createElement('option'); option.value = type.id; $('ii-type').appendChild(option); });
  refreshTypeSelect();
}
function refreshTypeSelect() {
  Array.from($('ii-type')?.options || []).forEach(option => { const type = getType(option.value); option.textContent = type.icon + '  ' + getEntityLocalName(type.id); });
}

// TOOLBAR EVENTS
function closeStartup() { if ($('startup-modal')) $('startup-modal').style.display = 'none'; $('btn-select')?.focus(); scheduleResize(); }
function closeTimeline() { if ($('timeline-modal')) $('timeline-modal').style.display = 'none'; $('btn-timeline')?.focus(); }
function initToolbar() {
  on('btn-select','click',() => setMode('select')); on('btn-line','click',() => setMode('line')); on('btn-arrow','click',() => setMode('arrow'));
  on('btn-text','click',addText); on('btn-undo','click',undo); on('btn-redo','click',redo); on('btn-delete','click',deleteSelected); on('btn-fit','click',fitGraph);
  bindMenuAction('btn-png',exportPNG); bindMenuAction('btn-pdf',exportPDF); bindMenuAction('btn-save',exportJSON);
  bindMenuAction('btn-load',() => $('load-input')?.click());
  bindMenuAction('btn-flaticon-menu',() => window.open('https://www.flaticon.com/','_blank','noopener,noreferrer'));
  on('load-input','change',event => { const file = event.target.files[0]; event.target.value = ''; if (file) importJSON(file); });
  on('file-input','change',event => { const file = event.target.files[0]; event.target.value = ''; if (file) importFile(file); });
  on('btn-import','click',() => $('file-input')?.click());
  on('btn-close-modal','click',closeStartup);
  on('btn-align-h','click',alignHorizontal); on('btn-align-v','click',alignVertical);
  on('btn-distribute-h','click',distributeHorizontal); on('btn-distribute-v','click',distributeVertical);
  on('btn-guides','click',() => {
    guidesEnabled = !guidesEnabled; $('btn-guides').classList.toggle('active',guidesEnabled);
    if (!guidesEnabled) clearGuides();
    showToast(currentLang === 'pt' ? (guidesEnabled ? 'Guias ativadas' : 'Guias desativadas') : (guidesEnabled ? 'Alignment guides ON' : 'Alignment guides OFF'));
  });
  $('btn-guides')?.classList.add('active');
  on('toggle-clean-bg','change',event => {
    cleanBgEnabled = event.target.checked; $('canvas-wrap').classList.toggle('clean-bg',cleanBgEnabled);
    $('cy').style.background = cleanBgEnabled ? '#ffffff' : '';
    applyCyTheme();
    showToast(currentLang === 'pt' ? (cleanBgEnabled ? 'Fundo limpo ativado' : 'Fundo limpo desativado') : (cleanBgEnabled ? 'Clean background ON' : 'Clean background OFF'));
  });
  on('toggle-autosave','change',async event => {
    autosaveEnabled = event.target.checked;
    if (autosaveEnabled) {
      await setupAutosave();
      if (autosaveEnabled) showToast(currentLang === 'pt' ? 'Salvamento autom\u00e1tico: ' + autosaveMinutes + 'min' : 'Autosave: every ' + autosaveMinutes + 'min');
    } else {
      autosaveSetupVersion++;
      if (autosaveTimer) clearInterval(autosaveTimer);
      autosaveTimer = null;
      showToast(currentLang === 'pt' ? 'Salvamento autom\u00e1tico desativado' : 'Autosave OFF');
    }
  });
  on('autosave-interval','change',event => { autosaveMinutes = clamp(event.target.value,1,1440,10); if (autosaveEnabled) setupAutosave(); });
  on('btn-timeline','click',showTimeline); on('btn-close-timeline','click',closeTimeline);
  on('btn-theme','click',toggleTheme); on('btn-lang','click',toggleLang);
  initFileMenu();
}

// INSPECTOR EVENTS: live input + committed history on change.
function bindInspectorField(id, kind, key, parse = value => value, after = null) {
  const update = event => {
    if (!liveSelection(kind)) return;
    const element = selectedEl;
    element.data(key,parse(event.target.value));
    if (kind === 'node') syncTextDimensions(element);
    if (after) after(element,event.target.value);
    if (event.type === 'change') pushHistory();
  };
  on(id,'input',update); on(id,'change',update);
}
function initInspector() {
  bindInspectorField('ii-name','node','name',String,(node,value) => setText('ii-title',value || '\u2014'));
  bindInspectorField('ii-size','node','size',value => clamp(value,40,180,68));
  bindInspectorField('ii-font-size','node','fontSize',value => clamp(value,8,48,11),(node) => setText('ii-font-size-value',node.data('fontSize')+'px'));
  bindInspectorField('ii-desc','node','description',String);
  bindInspectorField('ii-desc-dist','node','descDist',value => clamp(value,0,150,42));
  bindInspectorField('ii-start-date','node','startDate',String,(_node,value) => { if ($('ii-end-date')) $('ii-end-date').min = value; });
  bindInspectorField('ii-end-date','node','endDate',String);
  bindInspectorField('ii-text-width','node','textWidth',value => clamp(value,80,1000,280),node => setText('ii-text-width-value',node.data('textWidth')+'px'));
  bindInspectorField('ii-text-color','node','textColor',value => hexColor(value));
  on('btn-reset-text-color','click',() => { if (liveSelection('node')) { selectedEl.data('textColor',null); showNodeInspector(selectedEl,false); pushHistory(); } });
  on('ii-type','change',event => {
    if (!liveSelection('node')) return;
    const node = selectedEl, type = getType(event.target.value), wasText = isTextNode(node);
    node.data({ type:type.id, iconSvg:getIconUri(type), customImg:null, customText:null });
    if (type.id === 'text' && !wasText && node.data('fontSize') === 11) node.data('fontSize',18);
    syncTextDimensions(node); showNodeInspector(node,false); pushHistory();
  });
  on('btn-del-node','click',deleteSelected); on('btn-del-edge','click',deleteSelected);
  on('btn-upload-img','click',() => { if (liveSelection('node') && !isTextNode(selectedEl)) $('node-img-input').click(); });
  on('node-img-input','change',event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file || !liveSelection('node') || isTextNode(selectedEl)) return;
    if (!/^image\//i.test(file.type)) { showToast(t('invalidImage')); return; }
    const node = selectedEl; // Capture the intended node before asynchronous reading.
    const reader = new FileReader();
    reader.onload = ev => { if (!node.removed()) applyNodeImage(node,ev.target.result); };
    reader.onerror = () => showToast(t('readError'));
    reader.readAsDataURL(file);
  });
  on('btn-apply-text-icon','click',() => { if (liveSelection('node')) applyNodeText(selectedEl,$('ii-text-icon').value); });
  on('ii-text-icon','keydown',event => { if (event.key === 'Enter' && liveSelection('node')) { event.preventDefault(); applyNodeText(selectedEl,event.target.value); } });
  on('btn-apply-flaticon','click',applyFlaticonURL);
  on('ii-flaticon-url','keydown',event => { if (event.key === 'Enter') { event.preventDefault(); applyFlaticonURL(); } });
  on('btn-reset-icon','click',() => { if (liveSelection('node')) resetNodeIcon(selectedEl); });
  bindInspectorField('ie-label','edge','label',String);
  bindInspectorField('ie-color','edge','color',value => hexColor(value));
  bindInspectorField('ie-text-color','edge','textColor',value => hexColor(value));
  bindInspectorField('ie-font-size','edge','fontSize',value => clamp(value,8,72,10),edge => setText('ie-font-size-value',edge.data('fontSize')+'px'));
  bindInspectorField('ie-width','edge','width',value => clamp(value,1,12,1.5),edge => setText('ie-width-value',edge.data('width')+'px'));
  [['btn-reset-edge-color','color'],['btn-reset-edge-text-color','textColor']].forEach(([id,key]) => {
    on(id,'click',() => { if (liveSelection('edge')) { selectedEl.data(key,null); showEdgeInspector(selectedEl,false); pushHistory(); } });
  });
  [
    ['ie-line-btn','edgeType','line'], ['ie-arrow-btn','edgeType','arrow'],
    ['ie-solid-btn','lineStyle','solid'], ['ie-dashed-btn','lineStyle','dashed'],
    ['ie-straight-btn','curve','straight'], ['ie-curved-btn','curve','curved'],
  ].forEach(([id,key,value]) => on(id,'click',() => {
    if (liveSelection('edge')) { selectedEl.data(key,value); showEdgeInspector(selectedEl,false); pushHistory(); }
  }));
  document.querySelectorAll('.wall-color-btn').forEach(button => button.addEventListener('click',() => {
    const selected = cy.nodes(':selected');
    const targets = selected.length ? selected : liveSelection('node') ? selectedEl : cy.collection();
    targets.filter(node => !isTextNode(node)).forEach(node => node.data('wallColor',button.dataset.wallColor));
    document.querySelectorAll('.wall-color-btn').forEach(item => item.classList.toggle('active',item === button));
    pushHistory();
  }));
}

// KEYBOARD SHORTCUTS
function visibleModal() {
  if ($('timeline-modal') && getComputedStyle($('timeline-modal')).display !== 'none') return $('timeline-modal');
  if ($('startup-modal') && getComputedStyle($('startup-modal')).display !== 'none') return $('startup-modal');
  return null;
}
function initKeyboard() {
  document.addEventListener('keydown',event => {
    const modal = visibleModal();
    if (modal) {
      if (event.key === 'Escape') { event.preventDefault(); modal.id === 'startup-modal' ? closeStartup() : closeTimeline(); }
      if (event.key === 'Tab') {
        const controls = Array.from(modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(el => el.getClientRects().length);
        const first = controls[0], last = controls[controls.length-1];
        if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
      return;
    }
    if (menuIsOpen()) { if (event.key === 'Escape') { event.preventDefault(); closeFileMenu(true); } return; }
    const active = document.activeElement;
    if (['INPUT','TEXTAREA','SELECT'].includes(active?.tagName) || active?.isContentEditable) return;
    const ctrl = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (ctrl) {
      if (key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (key === 'y') { event.preventDefault(); redo(); }
      else if (key === 'a') { event.preventDefault(); setMode('select'); cy.nodes().select(); selectedEl = cy.nodes(':selected').last(); if (!selectedEl.length) selectedEl = null; refreshInspector(false); updateToolbar(); }
      return;
    }
    if (event.altKey || event.repeat) return;
    switch (key) {
      case 'delete': case 'backspace': event.preventDefault(); deleteSelected(); break;
      case 'escape':
        if (connectSrc) { connectSrc.removeClass('connect-src'); connectSrc = null; updateModePill('source'); }
        else if (mode !== 'select') setMode('select');
        else if (window.matchMedia('(max-width:900px)').matches && $('workspace')?.classList.contains('inspector-open')) setInspectorOpen(false);
        else clearSelection();
        break;
      case 's': setMode('select'); break;
      case 'l': setMode('line'); break;
      case 'a': setMode('arrow'); break;
      case 't': event.preventDefault(); addText(); break;
      case 'f': fitGraph(); break;
    }
  });
}
function showToast(message) {
  const element = document.createElement('div'); element.className = 'toast'; element.textContent = message; element.setAttribute('role','status');
  document.body.appendChild(element); requestAnimationFrame(() => element.classList.add('show'));
  setTimeout(() => { element.classList.remove('show'); setTimeout(() => element.remove(),260); },2600);
}

// AUTOSAVE: preserve file-handle mode and download fallback; no server storage.
async function setupAutosave() {
  const version = ++autosaveSetupVersion;
  if (autosaveTimer) clearInterval(autosaveTimer);
  autosaveTimer = null;
  if (!autosaveEnabled) return;
  try {
    if (!autoSaveHandle && typeof window.showSaveFilePicker === 'function') {
      autoSaveHandle = await window.showSaveFilePicker({ suggestedName:'schema.json', types:[{ description:'JSON File', accept:{ 'application/json':['.json'] } }] });
    }
  } catch (error) {
    if (version === autosaveSetupVersion) { autosaveEnabled = false; if ($('toggle-autosave')) $('toggle-autosave').checked = false; }
    if (error.name !== 'AbortError') { console.warn('Autosave setup failed:',error); showToast(t('autosaveError')); }
    return;
  }
  if (version !== autosaveSetupVersion || !autosaveEnabled) return;
  autosaveTimer = setInterval(autosaveOnce,autosaveMinutes*60*1000);
}
async function autosaveOnce() {
  if (!autosaveEnabled || autosaveBusy || !cy.elements().length) return;
  autosaveBusy = true;
  try {
    const data = JSON.stringify(graphElementsJSON(),null,2);
    if (autoSaveHandle) {
      const writable = await autoSaveHandle.createWritable();
      try { await writable.write(data); await writable.close(); }
      catch (error) { try { await writable.abort?.(); } catch (_) { /* Preserve original failure. */ } throw error; }
    } else downloadData(data,'schema_autosave_' + Date.now() + '.json');
    showToast(t('autoSaved'));
  } catch (error) { console.error('Autosave failed:',error); showToast(t('autosaveError')); }
  finally { autosaveBusy = false; }
}

// TIMELINE
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}
function showTimeline() {
  const nodes = cy.nodes().filter(node => node.data('startDate'));
  if (!nodes.length) { showToast(t('noDates')); return; }
  if (!window.vis?.Timeline || !window.vis?.DataSet) { showToast(t('missingTimeline')); return; }
  if (nodes.some(node => !validDate(node.data('startDate')) || (node.data('endDate') && (!validDate(node.data('endDate')) || node.data('endDate') < node.data('startDate'))))) {
    showToast(t('invalidDates')); return;
  }
  try {
    if (timelineObj) { timelineObj.destroy(); timelineObj = null; }
    const container = $('vis-timeline-container'); container.replaceChildren();
    const items = new window.vis.DataSet(nodes.map(node => ({
      id:node.id(), content:'<strong>' + escapeXML(getType(node.data('type')).icon) + ' ' + escapeXML(node.data('name')) + '</strong><br>' +
        '<span style="color:var(--text-dim);font-size:10px">' + escapeXML(node.data('description') || '') + '</span>',
      start:node.data('startDate'), end:node.data('endDate') || undefined, title:escapeXML(node.data('description') || node.data('name')),
    })));
    setText('timeline-title',t('timelineTitle')); $('timeline-modal').style.display = 'flex';
    timelineObj = new window.vis.Timeline(container,items,{ width:'100%', height:'100%', margin:{ item:10,axis:5 }, showCurrentTime:false });
    requestAnimationFrame(() => { timelineObj?.redraw(); timelineObj?.fit(); });
    $('btn-close-timeline')?.focus();
  } catch (error) { console.error('Timeline failed:',error); closeTimeline(); showToast(t('missingTimeline')); }
}

// BOOTSTRAP
function bootstrap() {
  if (booted) return;
  booted = true;
  try {
    if (typeof window.cytoscape !== 'function') throw new Error('Cytoscape did not load from the CDN.');
    isLight = document.documentElement.classList.contains('light');
    initCy(); initPalette(); initTypeSelect(); initToolbar(); initInspector(); initKeyboard(); initResponsive();
    applyLang(); pushHistory(); updateToolbar(); updateStatus();
    if ($('startup-error')) $('startup-error').hidden = true;
    if (visibleModal()?.id === 'startup-modal') $('btn-close-modal')?.focus();
  } catch (error) {
    console.error('SCHEMA startup failed:',error);
    if ($('startup-modal')) $('startup-modal').style.display = 'none';
    let message = $('startup-error');
    if (!message) { message = document.createElement('div'); message.id = 'startup-error'; message.setAttribute('role','alert'); document.body.appendChild(message); }
    message.textContent = 'N\u00e3o foi poss\u00edvel iniciar o SCHEMA. Verifique sua conex\u00e3o e o carregamento das bibliotecas externas; depois recarregue a p\u00e1gina. / Unable to start SCHEMA. Check CDN access and reload. ' + error.message;
    message.hidden = false;
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',bootstrap,{ once:true });
else bootstrap();
