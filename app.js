/**
 * SCHEMA — Visual Link Builder
 * app.js
 *
 * Modes:  select | line | arrow
 * Panels: palette (left) | canvas (center) | inspector (right)
 *
 * Features added:
 *  1. Alignment guides while dragging
 *  2. Align/distribute buttons (H & V)
 *  3. Custom node icon: image upload, text/emoji, Flaticon URL
 *  4. PNG export uses correct dark/light background
 *  5. Dark mode: labels and edge arrows always white
 */

'use strict';

// ─────────────────────────────────────────────────────────────────
//  ENTITY TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────
const PERSON_SVG_URI = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
  '<circle cx="32" cy="20" r="13" fill="#909090"/>' +
  '<path d="M6 56 C6 40 18 33 32 33 C46 33 58 40 58 56 Z" fill="#909090"/>' +
  '</svg>'
);

const ENTITY_TYPES = [
  { id: 'whatsapp',     name: 'WhatsApp',     icon: '💬', iconUri: 'https://cdn-icons-png.flaticon.com/512/3938/3938041.png' },
  { id: 'person',       name: 'Person',       icon: '👤', iconUri: PERSON_SVG_URI },
  { id: 'organization', name: 'Organization', icon: '🏢' },
  { id: 'phone',        name: 'Phone',        icon: '📱' },
  { id: 'email',        name: 'Email',        icon: '✉️'  },
  { id: 'address',      name: 'Address',      icon: '📍' },
  { id: 'vehicle',      name: 'Vehicle',      icon: '🚗' },
  { id: 'event',        name: 'Event',        icon: '📅' },
  { id: 'bankaccount',  name: 'Bank Account', icon: '🏦' },
  { id: 'device',       name: 'Device',       icon: '💻' },
  { id: 'ipaddress',    name: 'IP Address',   icon: '🌐' },
  { id: 'timestamp',    name: 'Timestamp',    icon: '⏱️' },
];

// ─────────────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────────────
let cy            = null;
let mode          = 'select';   // 'select' | 'line' | 'arrow'
let connectSrc    = null;       // source node waiting for target
let selectedEl    = null;       // currently selected cy element
let history       = [];         // undo/redo stack (array of JSON strings)
let histIdx       = -1;
const MAX_HIST    = 60;
let currentLang   = 'en';       // 'en' | 'pt'
let isLight       = true;       // false = dark, true = light
let guidesEnabled = true;       // alignment guides active?
let cleanBgEnabled = false;     // 100% white bg, no details
let autosaveEnabled = false;    // autosave on/off
let autosaveTimer   = null;     // setInterval id
let autosaveMinutes = 10;       // interval in minutes
let autoSaveHandle  = null;     // FileSystemHandle for autosave
let timelineObj     = null;     // vis.Timeline instance

// ─────────────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────────────
const uid = () => 'id' + Math.random().toString(36).slice(2, 10);
const $   = id  => document.getElementById(id);

function getType(id) {
  return ENTITY_TYPES.find(t => t.id === id) ?? ENTITY_TYPES[0];
}

/** Build an SVG data-URI that renders an emoji, used as Cytoscape node background. */
function emojiSvg(emoji) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <text x="32" y="50" text-anchor="middle"
      font-size="38" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif"
    >${emoji}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** Build a text/label SVG — used when user sets a short text as the icon */
function textSvg(text, isDark) {
  const fill = isDark ? '#ffffff' : '#111111';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <text x="32" y="42" text-anchor="middle" dominant-baseline="middle"
      font-size="${text.length <= 2 ? 32 : 20}"
      font-weight="700"
      font-family="Inter,system-ui,sans-serif"
      fill="${fill}"
    >${text}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** Returns the data-URI to use as a Cytoscape node icon for a given entity type. */
function getIconUri(type) {
  return type.iconUri ?? emojiSvg(type.icon);
}

// ─────────────────────────────────────────────────────────────────
//  I18N
// ─────────────────────────────────────────────────────────────────
const I18N = {
  en: {
    select:       'Select',
    line:         'Line',
    arrow:        'Arrow',
    undo:         'Undo',
    redo:         'Redo',
    delete:       'Delete',
    fit:          'Fit',
    import:       'Import',
    save:         'Save',
    load:         'Load',
    guides:       'Guides',
    lineLbl:      'Line',
    arrowLbl:     'Arrow',
    removeEntity: 'Remove Entity',
    removeConn:   'Remove Connection',
    paletteHeading:   'Entities',
    canvasHint:       'Click an entity to add it \u00a0·\u00a0 Double-click a node to rename',
    inspEmptyText:    'Select an entity or connection to view its properties',
    lblName:          'Name',
    lblType:          'Type',
    lblSize:          'Size',
    lblFontSize:      'Text Size',
    lblEdgeLabel:     'Label',
    lblEdgeOptional:  '(optional)',
    lblConntype:      'Connection type',
    sbHints:          'S\u00a0\u2014 select \u00a0·\u00a0 L\u00a0\u2014 line \u00a0·\u00a0 A\u00a0\u2014 arrow \u00a0·\u00a0 F\u00a0\u2014 fit \u00a0·\u00a0 Del\u00a0\u2014 delete \u00a0·\u00a0 Ctrl+Z/Y\u00a0\u2014 undo/redo',
    iiNamePlaceholder: '\u2026',
    ieLabelPlaceholder: 'e.g. works_at',
    modeLineSrc:   '\u2014 Line mode \u00b7 click the source node',
    modeLineTgt:   '\u2014 Line mode \u00b7 now click the target node',
    modeArrowSrc:  '\u2192 Arrow mode \u00b7 click the source node',
    modeArrowTgt:  '\u2192 Arrow mode \u00b7 now click the target node',
    themeLight: 'Light',
    themeDark:  'Dark',
    lineConn:  'LINE CONNECTION',
    arrowConn: 'ARROW CONNECTION',
    uploadImage: 'Upload Image',
    resetIcon:   'Reset Icon',
    selectAll:   'All',
    cleanBg:     'Clean BG',
    timeline:    'Timeline',
    wallColor:   'Wall Color',
    timelineTitle: '\ud83d\udccb Timeline',
    autoSaved:   'Auto-saved!',
    noEntities:  'Add entities first',
    entity_whatsapp:     'WhatsApp',
    entity_person:       'Person',
    entity_organization: 'Organization',
    entity_phone:        'Phone',
    entity_email:        'Email',
    entity_address:      'Address',
    entity_vehicle:      'Vehicle',
    entity_event:        'Event',
    entity_bankaccount:  'Bank Account',
    entity_device:       'Device',
    entity_ipaddress:    'IP Address',
    entity_timestamp:    'Timestamp',
  },
  pt: {
    select:       'Selecionar',
    line:         'Linha',
    arrow:        'Seta',
    undo:         'Desfazer',
    redo:         'Refazer',
    delete:       'Excluir',
    fit:          'Ajustar',
    import:       'Importar',
    save:         'Salvar',
    load:         'Abrir',
    guides:       'Guias',
    lineLbl:      'Linha',
    arrowLbl:     'Seta',
    removeEntity: 'Remover Entidade',
    removeConn:   'Remover Conex\u00e3o',
    paletteHeading:   'Entidades',
    canvasHint:       'Clique em uma entidade para adicion\u00e1-la \u00a0·\u00a0 Duplo clique para renomear',
    inspEmptyText:    'Selecione uma entidade ou conex\u00e3o para ver suas propriedades',
    lblName:          'Nome',
    lblType:          'Tipo',
    lblSize:          'Tamanho',
    lblFontSize:      'Tamanho Texto',
    lblEdgeLabel:     'R\u00f3tulo',
    lblEdgeOptional:  '(opcional)',
    lblConntype:      'Tipo de conex\u00e3o',
    sbHints:          'S\u00a0\u2014 selecionar \u00a0·\u00a0 L\u00a0\u2014 linha \u00a0·\u00a0 A\u00a0\u2014 seta \u00a0·\u00a0 F\u00a0\u2014 ajustar \u00a0·\u00a0 Del\u00a0\u2014 excluir \u00a0·\u00a0 Ctrl+Z/Y\u00a0\u2014 desfazer/refazer',
    iiNamePlaceholder: '\u2026',
    ieLabelPlaceholder: 'ex: trabalha_em',
    modeLineSrc:   '\u2014 Modo linha \u00b7 clique no n\u00f3 de origem',
    modeLineTgt:   '\u2014 Modo linha \u00b7 agora clique no n\u00f3 de destino',
    modeArrowSrc:  '\u2192 Modo seta \u00b7 clique no n\u00f3 de origem',
    modeArrowTgt:  '\u2192 Modo seta \u00b7 agora clique no n\u00f3 de destino',
    themeLight: 'Claro',
    themeDark:  'Escuro',
    lineConn:  'CONEX\u00c3O EM LINHA',
    arrowConn: 'CONEX\u00c3O EM SETA',
    uploadImage: 'Carregar Imagem',
    resetIcon:   'Resetar \u00cdcone',
    selectAll:   'Tudo',
    cleanBg:     'Fundo Limpo',
    timeline:    'Linha do Tempo',
    wallColor:   'Cor da Parede',
    timelineTitle: '\ud83d\udccb Linha do Tempo',
    autoSaved:   'Salvo automaticamente!',
    noEntities:  'Adicione entidades primeiro',
    entity_whatsapp:     'WhatsApp',
    entity_person:       'Pessoa',
    entity_organization: 'Organiza\u00e7\u00e3o',
    entity_phone:        'Telefone',
    entity_email:        'E-mail',
    entity_address:      'Endere\u00e7o',
    entity_vehicle:      'Ve\u00edculo',
    entity_event:        'Evento',
    entity_bankaccount:  'Conta Banc\u00e1ria',
    entity_device:       'Dispositivo',
    entity_ipaddress:    'Endere\u00e7o IP',
    entity_timestamp:    'Timestamp',
  },
};

function t(key) {
  return I18N[currentLang][key] ?? I18N.en[key] ?? key;
}

function getEntityLocalName(typeId) {
  return t(`entity_${typeId}`);
}

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  $('palette-heading').textContent   = t('paletteHeading');
  $('canvas-hint').innerHTML         = t('canvasHint');
  $('insp-empty-text').textContent   = t('inspEmptyText');
  $('lbl-name').textContent          = t('lblName');
  $('lbl-type').textContent          = t('lblType');
  $('lbl-size').textContent          = t('lblSize');
  if ($('lbl-font-size')) $('lbl-font-size').textContent = t('lblFontSize');
  const lblEdge = $('lbl-edge-label');
  lblEdge.firstChild.textContent     = t('lblEdgeLabel') + ' ';
  $('lbl-edge-optional').textContent = t('lblEdgeOptional');
  $('lbl-conntype').textContent      = t('lblConntype');
  $('sb-hints').textContent          = t('sbHints');
  $('ii-name').placeholder           = t('iiNamePlaceholder');
  $('ie-label').placeholder          = t('ieLabelPlaceholder');
  $('btn-theme-label').textContent   = isLight ? t('themeDark') : t('themeLight');
  refreshPaletteNames();
  refreshTypeSelect();
  if (mode !== 'select') updateModePill(connectSrc ? 'target' : 'source');
  if (selectedEl?.isNode()) showNodeInspector(selectedEl);
  if (selectedEl?.isEdge()) showEdgeInspector(selectedEl);
}

function toggleLang() {
  currentLang = currentLang === 'en' ? 'pt' : 'en';
  $('btn-lang').textContent = currentLang === 'en' ? 'PT-BR' : 'EN';
  applyLang();
}

// ─────────────────────────────────────────────────────────────────
//  THEME
// ─────────────────────────────────────────────────────────────────
function applyCyTheme() {
  cy.style(buildCyStyle()).update();
  // Re-render text-based icons so they use the right color
  cy.nodes().forEach(node => {
    const customText = node.data('customText');
    if (customText) {
      node.data('iconSvg', textSvg(customText, !isLight));
    }
  });
}

function toggleTheme() {
  isLight = !isLight;
  document.documentElement.classList.toggle('light', isLight);
  requestAnimationFrame(() => {
    applyCyTheme();
    $('btn-theme').firstChild.textContent = isLight ? '🌙 ' : '☀ ';
    $('btn-theme-label').textContent = isLight ? t('themeDark') : t('themeLight');
  });
}

// ─────────────────────────────────────────────────────────────────
//  CYTOSCAPE INITIALISATION
// ─────────────────────────────────────────────────────────────────
function initCy() {
  cy = cytoscape({
    container: $('cy'),
    style:     buildCyStyle(),
    layout:    { name: 'preset' },

    userZoomingEnabled:  true,
    userPanningEnabled:  true,
    boxSelectionEnabled: true,
    selectionType:       'single',
    minZoom: 0.04,
    maxZoom: 6,
    wheelSensitivity: 0.22,
  });

  // Initialize HTML labels for descriptions
  cy.nodeHtmlLabel([{
    query: 'node',
    halign: 'center',
    valign: 'bottom',
    halignBox: 'center',
    valignBox: 'bottom',
    tpl: function(data) {
      if (!data.description) return '<div></div>';
      const dist = data.descDist ?? 42;
      return `<div class="node-desc-label" style="margin-top: ${dist}px;">${data.description}</div>`;
    }
  }]);

  bindCyEvents();
}

function buildCyStyle() {
  // ── Color tokens ──────────────────────────────────────
  const nodeBg      = getCyTokenSafe('--cy-node-bg',      isLight ? '#f0f0f0' : '#161616');
  const nodeBdr     = getCyTokenSafe('--cy-node-border',  isLight ? '#cccccc' : '#353535');
  const nodeLbl     = isLight ? '#333333' : '#ffffff';   // 5. white labels in dark mode
  const nodeSelBg   = getCyTokenSafe('--cy-node-sel-bg',  isLight ? '#e4e4e4' : '#1c1c1c');
  const nodeSelBdr  = getCyTokenSafe('--cy-node-sel-bdr', isLight ? '#111111' : '#ffffff');
  const nodeSelLbl  = isLight ? '#111111' : '#ffffff';
  const edgeColor   = isLight ? '#bbbbbb' : '#ffffff';   // 5. white edges in dark mode
  const edgeLbl     = isLight ? '#888888' : '#dddddd';   // 5. bright edge labels in dark
  const edgeTextBg  = isLight ? '#f0f0f0' : '#0c0c0c';
  const edgeSel     = isLight ? '#111111' : '#ffffff';
  const nodeHoverBdr = isLight ? '#777777' : '#aaaaaa';
  const edgeHover    = isLight ? '#888888' : '#ffffff';

  return [
    /* ── Nodes (default) ── */
    {
      selector: 'node',
      style: {
        'background-color':      nodeBg,
        'background-image':      'data(iconSvg)',
        'background-width':      '92%',
        'background-height':     '92%',
        'background-position-x': '50%',
        'background-position-y': '50%',
        'background-clip':       'none',
        'border-color':          nodeBdr,
        'border-width':          1.5,
        'label':                 'data(name)',
        'color':                 nodeLbl,
        'font-size':             'data(fontSize)',
        'font-family':           '"Inter", system-ui, sans-serif',
        'font-weight':           400,
        'text-valign':           'bottom',
        'text-halign':           'center',
        'text-margin-y':         8,
        'text-wrap':             'wrap',
        'text-max-width':        92,
        'width':  'data(size)',
        'height': 'data(size)',
        'shape':                 'round-rectangle',
        'transition-property':   'border-color, border-width, background-color, color',
        'transition-duration':   '110ms',
        'z-index':                 9999,
        'text-background-opacity': 0,
        'text-outline-width':      2.5,
        'text-outline-color':      nodeBg,
      }
    },
    /* ── Node hover ── */
    {
      selector: 'node:hover',
      style: {
        'border-color': nodeHoverBdr,
        'border-width': 2,
        'color':        isLight ? '#333333' : '#ffffff',
      }
    },
    /* ── Node selected ── */
    {
      selector: 'node:selected',
      style: {
        'background-color': nodeSelBg,
        'border-color':     nodeSelBdr,
        'border-width':     2,
        'color':            nodeSelLbl,
      }
    },
    /* ── Connect-source highlight (dashed) ── */
    {
      selector: 'node.connect-src',
      style: {
        'border-color': nodeSelBdr,
        'border-width': 2.5,
        'border-style': 'dashed',
        'color':        nodeSelLbl,
      }
    },

    /* ── Edges (default) ── */
    {
      selector: 'edge',
      style: {
        'width':                   1.5,
        'line-color':              edgeColor,
        'curve-style':             'bezier',
        'label':                   'data(label)',
        'color':                   edgeLbl,
        'font-size':               10,
        'font-family':             '"Inter", system-ui, sans-serif',
        'text-background-color':   edgeTextBg,
        'text-background-opacity': 1,
        'text-background-padding': '3px',
        'target-arrow-shape':      'none',
        'source-arrow-shape':      'none',
        'transition-property':     'line-color, width',
        'transition-duration':     '110ms',
        'z-index':                 1,
      }
    },
    /* ── Edge hover ── */
    {
      selector: 'edge:hover',
      style: {
        'line-color': edgeHover,
        'color':      isLight ? '#555555' : '#ffffff',
        'width':      2,
      }
    },
    /* ── Edge selected ── */
    {
      selector: 'edge:selected',
      style: {
        'line-color':          edgeSel,
        'color':               isLight ? '#333333' : '#ffffff',
        'width':               2,
        'target-arrow-color':  edgeSel,
      }
    },
    /* ── Dashed edges ── */
    {
      selector: 'edge[lineStyle="dashed"]',
      style: {
        'line-style': 'dashed',
        'line-dash-pattern': [6, 4]
      }
    },
    /* ── Curved edges ── */
    {
      selector: 'edge[curve="curved"]',
      style: {
        'curve-style': 'unbundled-bezier',
        'control-point-distances': [60],
        'control-point-weights': [0.5]
      }
    },
    /* ── Arrow edge variant ── */
    {
      selector: 'edge[edgeType="arrow"]',
      style: {
        'target-arrow-shape': 'triangle',
        'target-arrow-color': edgeColor,
      }
    },
    {
      selector: 'edge[edgeType="arrow"]:hover',
      style: { 'target-arrow-color': edgeHover }
    },
    {
      selector: 'edge[edgeType="arrow"]:selected',
      style: { 'target-arrow-color': edgeSel }
    },
    /* ── Node with custom wall color ── */
    {
      selector: 'node[wallColor]',
      style: {
        'border-color': 'data(wallColor)',
      }
    },
    {
      selector: 'node[wallColor]:selected',
      style: {
        'border-color': 'data(wallColor)',
        'border-width': 2,
      }
    },
  ];
}

function getCyTokenSafe(varName, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

// ─────────────────────────────────────────────────────────────────
//  CYTOSCAPE EVENT BINDINGS
// ─────────────────────────────────────────────────────────────────
function bindCyEvents() {
  cy.on('tap', 'node', e => {
    if (mode !== 'select') { handleConnectTap(e.target); return; }
    
    // Handle Ctrl/Cmd+Click for multiple selection
    if (e.originalEvent.ctrlKey || e.originalEvent.metaKey) {
      if (e.target.selected()) {
        e.target.unselect();
      } else {
        e.target.select();
      }
      selectedEl = cy.nodes(':selected').last();
      if (!selectedEl.length) selectedEl = null;
    } else {
      cy.elements().unselect();
      e.target.select();
      selectedEl = e.target;
    }

    if (selectedEl) showNodeInspector(selectedEl);
    else showEmpty();
    
    updateToolbar();
  });

  cy.on('tap', 'edge', e => {
    if (mode !== 'select') return;
    selectElement(e.target);
    showEdgeInspector(e.target);
  });

  cy.on('tap', e => {
    if (e.target !== cy) return;
    if (connectSrc) {
      connectSrc.removeClass('connect-src');
      connectSrc = null;
      updateModePill('source');
      return;
    }
    if (mode === 'select') clearSelection();
  });

  cy.on('dblclick', 'node', e => {
    if (mode !== 'select') return;
    selectElement(e.target);
    showNodeInspector(e.target);
    setTimeout(focusNameInput, 60);
  });

  cy.on('dblclick', 'edge', e => {
    if (mode !== 'select') return;
    selectElement(e.target);
    showEdgeInspector(e.target);
    setTimeout(() => { const i = $('ie-label'); i.focus(); i.select(); }, 60);
  });

  cy.on('dragfree', 'node', () => {
    clearGuides();
    pushHistory();
  });

  // ── Alignment guides on drag ──────────────────────────
  cy.on('drag', 'node', e => {
    if (!guidesEnabled) return;
    const dragged = e.target;
    const pos = dragged.position();
    const zoom = cy.zoom();
    const snapThreshold = 10 / zoom; // 10 pixels on screen

    const others = cy.nodes().filter(n => n.id() !== dragged.id());
    const guides = [];
    let snappedY = false;
    let snappedX = false;

    others.forEach(other => {
      const op = other.position();
      // Horizontal guide (same Y)
      if (!snappedY && Math.abs(pos.y - op.y) < snapThreshold) {
        dragged.position('y', op.y);
        guides.push({ type: 'h', model: op.y });
        snappedY = true;
      }
      // Vertical guide (same X)
      if (!snappedX && Math.abs(pos.x - op.x) < snapThreshold) {
        dragged.position('x', op.x);
        guides.push({ type: 'v', model: op.x });
        snappedX = true;
      }
    });

    renderGuides(guides);
  });
}

// ─────────────────────────────────────────────────────────────────
//  ALIGNMENT GUIDES (DOM overlay)
// ─────────────────────────────────────────────────────────────────
function modelToScreenCoords(modelX, modelY) {
  const pan  = cy.pan();
  const zoom = cy.zoom();
  return {
    x: modelX * zoom + pan.x,
    y: modelY * zoom + pan.y,
  };
}

function renderGuides(guides) {
  const container = $('align-guides');
  container.innerHTML = '';
  if (!guidesEnabled || !guides.length) return;

  guides.forEach(g => {
    const line = document.createElement('div');
    line.className = 'guide-line ' + g.type;
    if (g.type === 'h') {
      const sc = modelToScreenCoords(0, g.model);
      line.style.top = sc.y + 'px';
    } else {
      const sc = modelToScreenCoords(g.model, 0);
      line.style.left = sc.x + 'px';
    }
    container.appendChild(line);
  });
}

function clearGuides() {
  $('align-guides').innerHTML = '';
}

// ─────────────────────────────────────────────────────────────────
//  CONNECT MODE LOGIC
// ─────────────────────────────────────────────────────────────────
function handleConnectTap(node) {
  if (!connectSrc) {
    connectSrc = node;
    node.addClass('connect-src');
    updateModePill('target');
  } else {
    if (connectSrc.id() !== node.id()) {
      createEdge(connectSrc, node, mode);
      pushHistory();
    }
    connectSrc.removeClass('connect-src');
    connectSrc = null;
    updateModePill('source');
  }
}

function createEdge(src, tgt, type) {
  cy.add({
    group: 'edges',
    data: {
      id:       uid(),
      source:   src.id(),
      target:   tgt.id(),
      edgeType: type === 'arrow' ? 'arrow' : 'line',
      label:    '',
    }
  });
  updateStatus();
}

// ─────────────────────────────────────────────────────────────────
//  ADD ENTITY (from palette click)
// ─────────────────────────────────────────────────────────────────
function addEntityFromPalette(typeId) {
  setMode('select');

  const type = getType(typeId);
  const ext  = cy.extent();
  const cx   = (ext.x1 + ext.x2) / 2;
  const cy_  = (ext.y1 + ext.y2) / 2;

  const existing  = cy.nodes(`[type="${typeId}"]`).length;
  const localName = getEntityLocalName(typeId);
  const defName   = existing === 0 ? localName : `${localName} ${existing + 1}`;

  const node = addNodeToGraph(typeId, defName, {
    x: cx + (Math.random() - 0.5) * 110,
    y: cy_ + (Math.random() - 0.5) * 110,
  });

  pushHistory();

  cy.elements().unselect();
  node.select();
  selectedEl = node;
  showNodeInspector(node);
  updateToolbar();

  cy.animate({ center: { eles: node }, duration: 160 });
  setTimeout(focusNameInput, 220);
}

function addNodeToGraph(typeId, name, position) {
  const type = getType(typeId);
  const id   = uid();
  cy.add({
    group: 'nodes',
    data: {
      id,
      name,
      type:      typeId,
      iconSvg:   getIconUri(type),
      customImg: null,   // base64 or URL set by user
      customText: null,  // text/emoji set by user
      description: '',
      startDate: '',
      endDate: '',
      size:      68,
      fontSize:  11,
      descDist:  42,
    },
    position,
  });
  updateStatus();
  return cy.getElementById(id);
}

// ─────────────────────────────────────────────────────────────────
//  SELECTION HELPERS
// ─────────────────────────────────────────────────────────────────
function clearSelection() {
  cy.elements().unselect();
  selectedEl = null;
  showEmpty();
  updateToolbar();
}

// ─────────────────────────────────────────────────────────────────
//  MODE MANAGEMENT
// ─────────────────────────────────────────────────────────────────
function setMode(newMode) {
  if (connectSrc) {
    connectSrc.removeClass('connect-src');
    connectSrc = null;
  }

  mode = newMode;

  $('btn-select').classList.toggle('active', mode === 'select');
  $('btn-line').classList.toggle('active',   mode === 'line');
  $('btn-arrow').classList.toggle('active',  mode === 'arrow');

  const cyEl = $('cy');
  cyEl.style.cursor = mode !== 'select' ? 'crosshair' : '';

  cy.autoungrabify(mode !== 'select');
  updateModePill('source');

  if (mode !== 'select') {
    cy.elements().unselect();
    showEmpty();
    selectedEl = null;
    updateToolbar();
  }
}

function updateModePill(step) {
  const pill = $('mode-pill');
  if (mode === 'select') { pill.classList.remove('visible'); return; }
  if (mode === 'line') {
    pill.textContent = step === 'target' ? t('modeLineTgt') : t('modeLineSrc');
  } else {
    pill.textContent = step === 'target' ? t('modeArrowTgt') : t('modeArrowSrc');
  }
  pill.classList.add('visible');
}

// ─────────────────────────────────────────────────────────────────
//  INSPECTOR PANELS
// ─────────────────────────────────────────────────────────────────
function showEmpty() {
  $('insp-empty').style.display = '';
  $('insp-node').classList.remove('visible');
  $('insp-edge').classList.remove('visible');
}

function showNodeInspector(node) {
  const type = getType(node.data('type'));
  $('insp-empty').style.display = 'none';
  $('insp-node').classList.add('visible');
  $('insp-edge').classList.remove('visible');
  $('ii-size').value = node.data('size') || 68;
  if ($('ii-font-size')) $('ii-font-size').value = node.data('fontSize') || 11;
  if ($('ii-desc-dist')) $('ii-desc-dist').value = node.data('descDist') ?? 42;

  // Update icon display in inspector head
  const iconEl = $('ii-icon');
  const customImg = node.data('customImg');
  if (customImg) {
    iconEl.innerHTML = `<img src="${customImg}" alt="icon">`;
  } else {
    iconEl.innerHTML = '';
    iconEl.textContent = type.icon;
  }

  $('ii-kind').textContent  = getEntityLocalName(type.id).toUpperCase();
  $('ii-title').textContent = node.data('name') || '—';
  $('ii-name').value        = node.data('name') || '';
  $('ii-type').value        = node.data('type') || 'person';

  // Populate custom icon fields
  $('ii-text-icon').value    = node.data('customText') || '';
  $('ii-flaticon-url').value = node.data('customImg')?.startsWith('http') ? node.data('customImg') : '';

  // Dates and description
  if ($('ii-desc')) $('ii-desc').value = node.data('description') || '';
  if ($('ii-start-date')) $('ii-start-date').value = node.data('startDate') || '';
  if ($('ii-end-date')) $('ii-end-date').value = node.data('endDate') || '';

  // Show preview if custom image
  const preview = $('upload-preview');
  if (customImg) {
    preview.src = customImg;
    preview.classList.add('visible');
  } else {
    preview.src = '';
    preview.classList.remove('visible');
  }

  // Sync wall color buttons
  const nodeWallColor = node.data('wallColor') || '#000000';
  document.querySelectorAll('.wall-color-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.wallColor === nodeWallColor);
  });
}

function showEdgeInspector(edge) {
  const isArrow = edge.data('edgeType') === 'arrow';
  $('insp-empty').style.display = 'none';
  $('insp-node').classList.remove('visible');
  $('insp-edge').classList.add('visible');

  $('ie-glyph').textContent = isArrow ? '→' : '—';
  $('ie-kind').textContent  = isArrow ? t('arrowConn') : t('lineConn');
  $('ie-label').value       = edge.data('label') || '';
  $('ie-line-btn').classList.toggle('active', !isArrow);
  $('ie-arrow-btn').classList.toggle('active', isArrow);

  const isDashed = edge.data('lineStyle') === 'dashed';
  $('ie-solid-btn').classList.toggle('active', !isDashed);
  $('ie-dashed-btn').classList.toggle('active', isDashed);

  const isCurved = edge.data('curve') === 'curved';
  $('ie-straight-btn').classList.toggle('active', !isCurved);
  $('ie-curved-btn').classList.toggle('active', isCurved);
}

function focusNameInput() {
  const inp = $('ii-name');
  inp.focus();
  inp.select();
}

// ─────────────────────────────────────────────────────────────────
//  CUSTOM NODE ICON
// ─────────────────────────────────────────────────────────────────

/** Apply an image URL (data: or https:) as the node icon */
function applyNodeImage(node, url) {
  node.data('iconSvg', url);
  node.data('customImg', url);
  node.data('customText', null);

  // Update inspector preview
  const preview = $('upload-preview');
  preview.src = url;
  preview.classList.add('visible');

  const iconEl = $('ii-icon');
  iconEl.innerHTML = `<img src="${url}" alt="icon">`;

  pushHistory();
}

/** Apply a text/emoji string as the node icon */
function applyNodeText(node, text) {
  if (!text.trim()) return;
  const svg = textSvg(text.trim(), !isLight);
  node.data('iconSvg', svg);
  node.data('customText', text.trim());
  node.data('customImg', null);

  const preview = $('upload-preview');
  preview.src = '';
  preview.classList.remove('visible');

  const type = getType(node.data('type'));
  const iconEl = $('ii-icon');
  iconEl.innerHTML = '';
  iconEl.textContent = text.trim();

  pushHistory();
}

/** Reset node icon to default entity type icon */
function resetNodeIcon(node) {
  const type = getType(node.data('type'));
  node.data('iconSvg', getIconUri(type));
  node.data('customImg', null);
  node.data('customText', null);

  const preview = $('upload-preview');
  preview.src = '';
  preview.classList.remove('visible');

  const iconEl = $('ii-icon');
  iconEl.innerHTML = '';
  iconEl.textContent = type.icon;
  $('ii-text-icon').value = '';
  $('ii-flaticon-url').value = '';

  pushHistory();
}

// ─────────────────────────────────────────────────────────────────
//  ALIGNMENT — ALIGN & DISTRIBUTE
// ─────────────────────────────────────────────────────────────────

/** Get currently selected nodes (falls back to all nodes if none selected) */
function getTargetNodes() {
  const sel = cy.nodes(':selected');
  return sel.length >= 2 ? sel : cy.nodes();
}

/** Align selected nodes to same Y (horizontal line) */
function alignHorizontal() {
  const nodes = getTargetNodes();
  if (nodes.length < 2) { showToast('Select ≥ 2 entities first'); return; }
  // Use median Y to minimise movement
  const ys = nodes.map(n => n.position('y')).sort((a, b) => a - b);
  const medY = ys[Math.floor(ys.length / 2)];
  nodes.forEach(n => n.position('y', medY));
  pushHistory();
  showToast('Aligned horizontally');
}

/** Align selected nodes to same X (vertical column) */
function alignVertical() {
  const nodes = getTargetNodes();
  if (nodes.length < 2) { showToast('Select ≥ 2 entities first'); return; }
  const xs = nodes.map(n => n.position('x')).sort((a, b) => a - b);
  const medX = xs[Math.floor(xs.length / 2)];
  nodes.forEach(n => n.position('x', medX));
  pushHistory();
  showToast('Aligned vertically');
}

/** Distribute nodes evenly on the X axis */
function distributeHorizontal() {
  const nodes = getTargetNodes();
  if (nodes.length < 3) { showToast('Select ≥ 3 entities first'); return; }
  const sorted = [...nodes].sort((a, b) => a.position('x') - b.position('x'));
  const minX = sorted[0].position('x');
  const maxX = sorted[sorted.length - 1].position('x');
  const gap  = (maxX - minX) / (sorted.length - 1);
  sorted.forEach((n, i) => n.position('x', minX + gap * i));
  pushHistory();
  showToast('Distributed horizontally');
}

/** Distribute nodes evenly on the Y axis */
function distributeVertical() {
  const nodes = getTargetNodes();
  if (nodes.length < 3) { showToast('Select ≥ 3 entities first'); return; }
  const sorted = [...nodes].sort((a, b) => a.position('y') - b.position('y'));
  const minY = sorted[0].position('y');
  const maxY = sorted[sorted.length - 1].position('y');
  const gap  = (maxY - minY) / (sorted.length - 1);
  sorted.forEach((n, i) => n.position('y', minY + gap * i));
  pushHistory();
  showToast('Distributed vertically');
}

// ─────────────────────────────────────────────────────────────────
//  DELETE
// ─────────────────────────────────────────────────────────────────
function deleteSelected() {
  const sel = cy.elements(':selected');
  if (sel.length) {
    sel.remove();
  } else if (selectedEl) {
    selectedEl.remove();
  } else {
    return;
  }
  selectedEl = null;
  showEmpty();
  updateToolbar();
  updateStatus();
  pushHistory();
}

// ─────────────────────────────────────────────────────────────────
//  HISTORY — UNDO / REDO
// ─────────────────────────────────────────────────────────────────
function pushHistory() {
  const snap = JSON.stringify(cy.elements().jsons());
  history = history.slice(0, histIdx + 1);
  history.push(snap);
  if (history.length > MAX_HIST) history.shift();
  histIdx = history.length - 1;
  updateToolbar();
}

function undo() {
  if (histIdx <= 0) return;
  histIdx--;
  applySnapshot(history[histIdx]);
}

function redo() {
  if (histIdx >= history.length - 1) return;
  histIdx++;
  applySnapshot(history[histIdx]);
}

function applySnapshot(snap) {
  if (connectSrc) { connectSrc.removeClass('connect-src'); connectSrc = null; }
  selectedEl = null;
  cy.elements().remove();
  cy.add(JSON.parse(snap));
  showEmpty();
  updateToolbar();
  updateStatus();
}

// ─────────────────────────────────────────────────────────────────
//  TOOLBAR STATE
// ─────────────────────────────────────────────────────────────────
function updateToolbar() {
  const hasSel = !!(selectedEl || cy.elements(':selected').length);
  $('btn-delete').disabled = !hasSel;
  $('btn-undo').disabled   = histIdx <= 0;
  $('btn-redo').disabled   = histIdx >= history.length - 1;
}

// ─────────────────────────────────────────────────────────────────
//  STATUS BAR
// ─────────────────────────────────────────────────────────────────
function updateStatus() {
  const n = cy.nodes().length;
  const e = cy.edges().length;
  $('sb-nodes').textContent = `${n} ${n === 1 ? 'entity' : 'entities'}`;
  $('sb-edges').textContent = `${e} ${e === 1 ? 'connection' : 'connections'}`;
}

// ─────────────────────────────────────────────────────────────────
//  EXPORT HELPERS (Merge description into label for PNG/PDF)
// ─────────────────────────────────────────────────────────────────
function prepareForExport() {
  cy.nodes().forEach(n => {
    const desc = n.data('description');
    if (desc) {
      n.data('originalName', n.data('name'));
      n.data('name', n.data('name') + '\n\n\n' + desc);
    }
  });
}

function restoreAfterExport() {
  cy.nodes().forEach(n => {
    const orig = n.data('originalName');
    if (orig !== undefined) {
      n.data('name', orig);
      n.removeData('originalName');
    }
  });
}

// ─────────────────────────────────────────────────────────────────
//  EXPORT — PNG  (4. correct background color)
// ─────────────────────────────────────────────────────────────────
function exportPNG() {
  if (!cy.elements().length) { showToast('Add some entities first!'); return; }

  // Use current theme background color
  const bgColor = isLight ? '#f0f0f0' : '#0c0c0c';

  prepareForExport();
  const imgData = cy.png({ scale: 3, bg: bgColor, full: true });
  restoreAfterExport();
  
  const a = document.createElement('a');
  a.href     = imgData;
  a.download = `schema_${Date.now()}.png`;
  a.click();
}

// ─────────────────────────────────────────────────────────────────
//  EXPORT — PDF
// ─────────────────────────────────────────────────────────────────
function exportPDF() {
  if (!cy.elements().length) { showToast('Add some entities first!'); return; }

  const { jsPDF }  = window.jspdf;
  const bgColor = isLight ? '#ffffff' : '#0c0c0c';
  const bb         = cy.elements().boundingBox();
  const isLandscape = bb.w >= bb.h;

  const doc  = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pW   = doc.internal.pageSize.getWidth();
  const pH   = doc.internal.pageSize.getHeight();

  if (isLight) {
    doc.setFillColor(255,255,255);
  } else {
    doc.setFillColor(12,12,12);
  }
  doc.rect(0, 0, pW, pH, 'F');

  const textColor = isLight ? [0,0,0] : [240,240,240];
  const dimColor  = isLight ? [80,80,80] : [180,180,180];

  doc.setTextColor(...textColor);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('SCHEMA', 14, 17);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...dimColor);
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Visual Link Schema  ·  ${dateStr}`, 14, 23.5);

  const n = cy.nodes().length;
  const e = cy.edges().length;
  doc.text(`${n} ${n === 1 ? 'entity' : 'entities'}  ·  ${e} ${e === 1 ? 'connection' : 'connections'}`, pW - 14, 23.5, { align: 'right' });

  doc.setDrawColor(isLight ? 220 : 50, isLight ? 220 : 50, isLight ? 220 : 50);
  doc.line(14, 27, pW - 14, 27);

  const margin = 14;
  const imgY   = 31;
  const imgW   = pW - margin * 2;
  const imgH   = pH - imgY - margin;
  
  prepareForExport();
  const imgData = cy.png({ scale: 2.5, bg: bgColor, full: true });
  restoreAfterExport();

  doc.addImage(imgData, 'PNG', margin, imgY, imgW, imgH, undefined, 'FAST');

  doc.save(`schema_${Date.now()}.pdf`);
}

// ─────────────────────────────────────────────────────────────────
//  SAVE / LOAD JSON
// ─────────────────────────────────────────────────────────────────
function exportJSON() {
  if (!cy.elements().length) { showToast('Add some entities first!'); return; }
  const dataStr = JSON.stringify(cy.elements().jsons(), null, 2);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
  const a = document.createElement('a');
  a.href = dataUri;
  a.download = `schema_${Date.now()}.json`;
  a.click();
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      applySnapshot(JSON.stringify(data));
      pushHistory();
      showToast('Schema loaded successfully!');
    } catch(err) {
      showToast('Error loading JSON');
    }
  };
  reader.readAsText(file);
}

// ─────────────────────────────────────────────────────────────────
//  IMPORT — CSV / XLSX
// ─────────────────────────────────────────────────────────────────
function importFile(file) {
  const ext    = file.name.split('.').pop().toLowerCase();
  const reader = new FileReader();

  if (ext === 'csv') {
    reader.onload = e => {
      const wb = XLSX.read(e.target.result, { type: 'string' });
      processRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
    };
    reader.readAsText(file);
  } else {
    reader.onload = e => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      processRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
    };
    reader.readAsArrayBuffer(file);
  }
}

function processRows(rows) {
  if (!rows?.length) { showToast('No data found in file.'); return; }

  let newNodes = 0;
  let newEdges = 0;

  rows.forEach(row => {
    const r = {};
    for (const k in row) {
      r[k.toLowerCase().trim().replace(/\s+/g, '_')] = String(row[k] ?? '').trim();
    }

    const srcName = r.source || r.source_name || r.from || '';
    const srcType = r.source_type || r.from_type || 'person';
    const tgtName = r.target || r.target_name || r.to  || '';
    const tgtType = r.target_type || r.to_type  || 'person';
    const label   = r.label  || r.relationship  || r.relation || '';
    const eType   = (r.edge_type || r.type || '').toLowerCase() === 'arrow' ? 'arrow' : 'line';

    if (!srcName) return;

    let src = cy.nodes().filter(n => n.data('name') === srcName).first();
    if (!src.length) {
      src = addNodeToGraph(srcType, srcName, {
        x: 100 + Math.random() * 700,
        y: 100 + Math.random() * 400,
      });
      newNodes++;
    }

    if (tgtName) {
      let tgt = cy.nodes().filter(n => n.data('name') === tgtName).first();
      if (!tgt.length) {
        tgt = addNodeToGraph(tgtType, tgtName, {
          x: 100 + Math.random() * 700,
          y: 100 + Math.random() * 400,
        });
        newNodes++;
      }

      const dup = cy.edges().some(edge =>
        (edge.data('source') === src.id() && edge.data('target') === tgt.id()) ||
        (edge.data('source') === tgt.id() && edge.data('target') === src.id())
      );

      if (!dup) {
        createEdge(src, tgt, eType);
        if (label) cy.edges().last().data('label', label);
        newEdges++;
      }
    }
  });

  if (newNodes > 0) {
    cy.layout({
      name:              'cose',
      animate:           true,
      animationDuration: 700,
      randomize:         false,
      nodeRepulsion:     9000,
      idealEdgeLength:   130,
    }).run();
    setTimeout(() => pushHistory(), 800);
  }

  updateStatus();
  showToast(`Imported ${newNodes} entities · ${newEdges} connections`);
}

// ─────────────────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────────────────
function showToast(msg) {
  const el = document.createElement('div');
  el.className   = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  }, 2200);
}

// ─────────────────────────────────────────────────────────────────
//  KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────────
function initKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const ctrl = e.ctrlKey || e.metaKey;

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        deleteSelected();
        break;

      case 'Escape':
        if (connectSrc) {
          connectSrc.removeClass('connect-src');
          connectSrc = null;
          updateModePill('source');
        } else if (mode !== 'select') {
          setMode('select');
        } else {
          clearSelection();
        }
        break;

      case 's': case 'S':
        if (!ctrl) setMode('select');
        break;
      case 'l': case 'L':
        setMode('line');
        break;
      case 'a': case 'A':
        if (!ctrl) setMode('arrow');
        break;
      case 'f': case 'F':
        cy.fit(undefined, 44);
        break;
      
      case 'a': case 'A':
        if (ctrl) {
          e.preventDefault();
          setMode('select');
          cy.nodes().select();
          updateToolbar();
        } else {
          setMode('arrow');
        }
        break;

      case 'z':
        if (ctrl) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
        break;
      case 'y':
        if (ctrl) { e.preventDefault(); redo(); }
        break;
    }
  });
}

// ─────────────────────────────────────────────────────────────────
//  PALETTE INIT
// ─────────────────────────────────────────────────────────────────
function initPalette() {
  const list = $('palette-list');
  ENTITY_TYPES.forEach(type => {
    const item = document.createElement('div');
    item.className      = 'palette-item';
    item.dataset.typeId = type.id;
    const iconSpan = document.createElement('span');
    iconSpan.className = 'palette-icon';
    if (type.iconUri) {
      const img = document.createElement('img');
      img.src    = type.iconUri;
      img.width  = 20;
      img.height = 20;
      img.style.cssText = 'vertical-align:middle;display:block';
      iconSpan.appendChild(img);
    } else {
      iconSpan.textContent = type.icon;
    }
    const nameSpan = document.createElement('span');
    nameSpan.className = 'palette-name';
    item.append(iconSpan, nameSpan);
    item.addEventListener('click', () => addEntityFromPalette(type.id));
    list.appendChild(item);
  });
  refreshPaletteNames();
}

function refreshPaletteNames() {
  $('palette-list').querySelectorAll('.palette-item').forEach(item => {
    const localName = getEntityLocalName(item.dataset.typeId);
    item.title = localName;
    item.querySelector('.palette-name').textContent = localName;
  });
}

// ─────────────────────────────────────────────────────────────────
//  NODE TYPE SELECT (inspector) INIT
// ─────────────────────────────────────────────────────────────────
function initTypeSelect() {
  const sel = $('ii-type');
  ENTITY_TYPES.forEach(type => {
    const opt = document.createElement('option');
    opt.value = type.id;
    sel.appendChild(opt);
  });
  refreshTypeSelect();
}

function refreshTypeSelect() {
  Array.from($('ii-type').options).forEach(opt => {
    const type = getType(opt.value);
    opt.textContent = `${type.icon}  ${getEntityLocalName(type.id)}`;
  });
}

// ─────────────────────────────────────────────────────────────────
//  TOOLBAR EVENTS
// ─────────────────────────────────────────────────────────────────
function initToolbar() {
  $('btn-select').onclick = () => setMode('select');
  $('btn-line').onclick   = () => setMode('line');
  $('btn-arrow').onclick  = () => setMode('arrow');

  $('btn-undo').onclick   = undo;
  $('btn-redo').onclick   = redo;
  $('btn-delete').onclick = deleteSelected;

  $('btn-fit').onclick    = () => cy.fit(undefined, 44);
  $('btn-png').onclick    = exportPNG;
  $('btn-pdf').onclick    = exportPDF;

  if ($('btn-save')) $('btn-save').onclick = exportJSON;
  if ($('btn-load')) $('btn-load').onclick = () => $('load-input').click();
  if ($('load-input')) {
    $('load-input').addEventListener('change', e => {
      if (e.target.files[0]) {
        importJSON(e.target.files[0]);
        e.target.value = '';
      }
    });
  }

  if ($('btn-close-modal')) {
    $('btn-close-modal').onclick = () => $('startup-modal').style.display = 'none';
  }

  // ── Alignment buttons ──────────────────────────────────
  $('btn-align-h').onclick      = alignHorizontal;
  $('btn-align-v').onclick      = alignVertical;
  $('btn-distribute-h').onclick = distributeHorizontal;
  $('btn-distribute-v').onclick = distributeVertical;

  if ($('btn-flaticon-menu')) {
    $('btn-flaticon-menu').onclick = () => window.open('https://www.flaticon.com/', '_blank');
  }

  // ── Guides toggle ──────────────────────────────────────
  $('btn-guides').onclick = () => {
    guidesEnabled = !guidesEnabled;
    $('btn-guides').classList.toggle('active', guidesEnabled);
    if (!guidesEnabled) clearGuides();
    showToast(guidesEnabled ? 'Alignment guides ON' : 'Alignment guides OFF');
  };
  // Guides are ON by default — mark button active
  $('btn-guides').classList.add('active');

  // ── Clean Background toggle ────────────────────────
  $('toggle-clean-bg').onchange = function() {
    cleanBgEnabled = this.checked;
    $('canvas-wrap').classList.toggle('clean-bg', cleanBgEnabled);
    // Also override cytoscape container bg
    if (cleanBgEnabled) {
      $('cy').style.background = '#ffffff';
    } else {
      $('cy').style.background = '';
    }
    showToast(cleanBgEnabled
      ? (currentLang === 'pt' ? 'Fundo limpo ativado' : 'Clean background ON')
      : (currentLang === 'pt' ? 'Fundo limpo desativado' : 'Clean background OFF')
    );
  };

  // ── Autosave toggle ────────────────────────────────
  $('toggle-autosave').onchange = async function() {
    autosaveEnabled = this.checked;
    if (autosaveEnabled) {
      await setupAutosave();
      if (autosaveEnabled) { // check again in case user cancelled picker
        showToast(currentLang === 'pt' ? `Salvamento automático: ${autosaveMinutes}min` : `Autosave: every ${autosaveMinutes}min`);
      }
    } else {
      if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
      showToast(currentLang === 'pt' ? 'Salvamento automático desativado' : 'Autosave OFF');
    }
  };
  $('autosave-interval').onchange = function() {
    autosaveMinutes = Number(this.value);
    if (autosaveEnabled) setupAutosave();
  };

  // ── Timeline ───────────────────────────────────────
  $('btn-timeline').onclick = showTimeline;
  $('btn-close-timeline').onclick = () => $('timeline-modal').style.display = 'none';

  // Theme & language
  $('btn-theme').onclick = toggleTheme;
  $('btn-lang').onclick  = toggleLang;
}

// ─────────────────────────────────────────────────────────────────
//  INSPECTOR EVENTS
// ─────────────────────────────────────────────────────────────────
function initInspector() {
  // Node: name input
  $('ii-name').addEventListener('input', function () {
    if (selectedEl?.isNode()) {
      selectedEl.data('name', this.value);
      $('ii-title').textContent = this.value || '—';
    }
  });
  $('ii-name').addEventListener('change', () => pushHistory());

  // Node: size slider
  $('ii-size').addEventListener('input', function () {
    if (selectedEl?.isNode()) selectedEl.data('size', Number(this.value));
  });
  $('ii-size').addEventListener('change', () => pushHistory());

  // Node: font size slider
  if ($('ii-font-size')) {
    $('ii-font-size').addEventListener('input', function () {
      if (selectedEl?.isNode()) selectedEl.data('fontSize', Number(this.value));
    });
    $('ii-font-size').addEventListener('change', () => pushHistory());
  }

  // Node: description & dates
  if ($('ii-desc')) {
    $('ii-desc').addEventListener('input', function() {
      if (selectedEl?.isNode()) selectedEl.data('description', this.value);
    });
    $('ii-desc').addEventListener('change', () => pushHistory());
  }
  
  if ($('ii-desc-dist')) {
    $('ii-desc-dist').addEventListener('input', function() {
      if (selectedEl?.isNode()) {
        selectedEl.data('descDist', Number(this.value));
        // Force cytoscape-node-html-label to update
        selectedEl.position(selectedEl.position());
      }
    });
    $('ii-desc-dist').addEventListener('change', () => pushHistory());
  }

  if ($('ii-start-date')) {
    $('ii-start-date').addEventListener('input', function() {
      if (selectedEl?.isNode()) selectedEl.data('startDate', this.value);
    });
    $('ii-start-date').addEventListener('change', () => pushHistory());
  }
  if ($('ii-end-date')) {
    $('ii-end-date').addEventListener('input', function() {
      if (selectedEl?.isNode()) selectedEl.data('endDate', this.value);
    });
    $('ii-end-date').addEventListener('change', () => pushHistory());
  }

  // Node: type select → swap icon
  $('ii-type').addEventListener('change', function () {
    if (selectedEl?.isNode()) {
      const tp = getType(this.value);
      selectedEl.data({
        type:       this.value,
        iconSvg:    getIconUri(tp),
        customImg:  null,
        customText: null,
      });
      const iconEl = $('ii-icon');
      iconEl.innerHTML = '';
      iconEl.textContent = tp.icon;
      $('ii-kind').textContent = tp.name.toUpperCase();
      $('upload-preview').classList.remove('visible');
      $('ii-text-icon').value    = '';
      $('ii-flaticon-url').value = '';
      pushHistory();
    }
  });

  // Node: delete
  $('btn-del-node').onclick = deleteSelected;

  // ── Custom icon: image upload ──────────────────────────
  $('btn-upload-img').onclick = () => $('node-img-input').click();
  $('node-img-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file || !selectedEl?.isNode()) return;
    const reader = new FileReader();
    reader.onload = ev => applyNodeImage(selectedEl, ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  // ── Custom icon: text/emoji ────────────────────────────
  $('btn-apply-text-icon').onclick = () => {
    if (selectedEl?.isNode()) applyNodeText(selectedEl, $('ii-text-icon').value);
  };
  $('ii-text-icon').addEventListener('keydown', e => {
    if (e.key === 'Enter' && selectedEl?.isNode()) applyNodeText(selectedEl, e.target.value);
  });

  // ── Custom icon: Flaticon URL ──────────────────────────
  // Accepts both page URLs (flaticon.com/free-icon/name_12345) and
  // direct CDN URLs (cdn-icons-png.flaticon.com/…).
  $('btn-apply-flaticon').onclick = () => {
    let url = $('ii-flaticon-url').value.trim();
    if (!url) return;

    // Convert Flaticon page URL → CDN URL
    // Pattern: https://www.flaticon.com/free-icon/NAME_ICONID or …?related_id=ICONID
    const pageMatch = url.match(/flaticon\.com\/(?:free-icon|br\/free-icon)\/[^_]+_(\d+)/i)
                   || url.match(/[?&]related_id=(\d+)/i)
                   || url.match(/flaticon\.com\/.*?[_\/](\d{5,})/i);

    if (pageMatch) {
      const iconId = pageMatch[1];
      const folder = Math.floor(parseInt(iconId) / 1000);
      url = `https://cdn-icons-png.flaticon.com/512/${folder}/${iconId}.png`;
      $('ii-flaticon-url').value = url;
      showToast('URL convertida para CDN ✓');
    }

    if (!url.startsWith('http')) { showToast('URL inválida'); return; }
    if (selectedEl?.isNode()) applyNodeImage(selectedEl, url);
  };

  // ── Reset icon ─────────────────────────────────────────
  $('btn-reset-icon').onclick = () => {
    if (selectedEl?.isNode()) resetNodeIcon(selectedEl);
  };

  // Edge: label
  $('ie-label').addEventListener('input', function () {
    if (selectedEl?.isEdge()) selectedEl.data('label', this.value);
  });
  $('ie-label').addEventListener('change', () => pushHistory());

  // Edge: type toggle
  $('ie-line-btn').onclick = () => {
    if (selectedEl?.isEdge()) {
      selectedEl.data('edgeType', 'line');
      $('ie-line-btn').classList.add('active');
      $('ie-arrow-btn').classList.remove('active');
      $('ie-glyph').textContent = '—';
      $('ie-kind').textContent  = t('lineConn');
      pushHistory();
    }
  };

  $('ie-arrow-btn').onclick = () => {
    if (selectedEl?.isEdge()) {
      selectedEl.data('edgeType', 'arrow');
      $('ie-arrow-btn').classList.add('active');
      $('ie-line-btn').classList.remove('active');
      $('ie-glyph').textContent = '→';
      $('ie-kind').textContent  = t('arrowConn');
      pushHistory();
    }
  };

  $('ie-solid-btn').onclick = () => {
    if (selectedEl?.isEdge()) {
      selectedEl.data('lineStyle', 'solid');
      $('ie-solid-btn').classList.add('active');
      $('ie-dashed-btn').classList.remove('active');
      pushHistory();
    }
  };

  $('ie-dashed-btn').onclick = () => {
    if (selectedEl?.isEdge()) {
      selectedEl.data('lineStyle', 'dashed');
      $('ie-dashed-btn').classList.add('active');
      $('ie-solid-btn').classList.remove('active');
      pushHistory();
    }
  };

  $('ie-straight-btn').onclick = () => {
    if (selectedEl?.isEdge()) {
      selectedEl.data('curve', 'straight');
      $('ie-straight-btn').classList.add('active');
      $('ie-curved-btn').classList.remove('active');
      pushHistory();
    }
  };

  $('ie-curved-btn').onclick = () => {
    if (selectedEl?.isEdge()) {
      selectedEl.data('curve', 'curved');
      $('ie-curved-btn').classList.add('active');
      $('ie-straight-btn').classList.remove('active');
      pushHistory();
    }
  };

  // Edge: delete
  $('btn-del-edge').onclick = deleteSelected;

  // ── Wall (border) color buttons ────────────────────
  document.querySelectorAll('.wall-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.wallColor;
      // Update active state
      document.querySelectorAll('.wall-color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Apply to all selected nodes
      const sel = cy.nodes(':selected');
      const targets = sel.length ? sel : (selectedEl?.isNode() ? selectedEl : null);
      if (targets) {
        (targets.forEach ? targets : cy.collection().union(targets)).forEach(n => {
          n.data('wallColor', color);
        });
        pushHistory();
        showToast(currentLang === 'pt' ? 'Cor da parede alterada' : 'Wall color changed');
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────
//  BOOTSTRAP
// ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCy();
  initPalette();
  initTypeSelect();
  initToolbar();
  initInspector();
  initKeyboard();

  pushHistory();
  updateToolbar();
  updateStatus();
});

// ─────────────────────────────────────────────────────────────────
//  AUTOSAVE
// ─────────────────────────────────────────────────────────────────
async function setupAutosave() {
  if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
  if (!autosaveEnabled) return;

  // Ask for file handle on first activation so we can overwrite silently
  try {
    if (!autoSaveHandle && window.showSaveFilePicker) {
      autoSaveHandle = await window.showSaveFilePicker({
        suggestedName: 'schema.json',
        types: [{ description: 'JSON File', accept: {'application/json': ['.json']} }]
      });
    }
  } catch (err) {
    // User cancelled file picker
    $('toggle-autosave').checked = false;
    autosaveEnabled = false;
    return;
  }

  autosaveTimer = setInterval(async () => {
    if (!cy.elements().length) return;
    const dataStr = JSON.stringify(cy.elements().jsons(), null, 2);
    
    if (autoSaveHandle) {
      try {
        const writable = await autoSaveHandle.createWritable();
        await writable.write(dataStr);
        await writable.close();
        showToast(t('autoSaved'));
      } catch (err) {
        console.error('Autosave failed:', err);
      }
    } else {
      // Fallback if browser doesn't support File System Access API
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schema_autosave_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('autoSaved'));
    }
  }, autosaveMinutes * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────────
//  TIMELINE
// ─────────────────────────────────────────────────────────────────
function showTimeline() {
  const nodesWithDates = cy.nodes().filter(n => n.data('startDate'));
  if (!nodesWithDates.length) { showToast(currentLang === 'pt' ? 'Adicione Data Inicial nas entidades primeiro.' : 'Set Start Date on entities first.'); return; }

  const container = $('vis-timeline-container');
  container.innerHTML = '';

  const items = new vis.DataSet(
    nodesWithDates.map((n, i) => {
      const type = getType(n.data('type'));
      return {
        id: n.id(),
        content: `<strong>${type.icon} ${n.data('name')}</strong><br><span style="color:var(--text-dim);font-size:10px">${n.data('description') || ''}</span>`,
        start: n.data('startDate'),
        end: n.data('endDate') || undefined,
        title: n.data('description') || n.data('name') // tooltip
      };
    })
  );

  const options = {
    width: '100%',
    height: '100%',
    margin: { item: 10, axis: 5 },
    showCurrentTime: false,
  };

  if (timelineObj) {
    timelineObj.destroy();
  }
  timelineObj = new vis.Timeline(container, items, options);

  $('timeline-title').textContent = t('timelineTitle');
  $('timeline-modal').style.display = 'flex';
}
