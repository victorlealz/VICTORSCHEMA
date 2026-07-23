/**
 * SCHEMA — Visual Link Builder
 * app.js
 *
 * Modes:  select | line | arrow
 * Panels: palette (left) | canvas (center) | inspector (right)
 */

'use strict';

// ─────────────────────────────────────────────────────────────────
//  ENTITY TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────
// Neutral person silhouette — avoids the platform-colored 👤 emoji
const PERSON_SVG_URI = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
  '<circle cx="32" cy="20" r="13" fill="#909090"/>' +
  '<path d="M6 56 C6 40 18 33 32 33 C46 33 58 40 58 56 Z" fill="#909090"/>' +
  '</svg>'
);

const ENTITY_TYPES = [
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
let isLight       = false;      // false = dark (default)

// ─────────────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────────────
const uid    = () => 'id' + Math.random().toString(36).slice(2, 10);
const $      = id  => document.getElementById(id);

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

/** Returns the data-URI to use as a Cytoscape node icon for a given entity type. */
function getIconUri(type) {
  return type.iconUri ?? emojiSvg(type.icon);
}

// ─────────────────────────────────────────────────────────────────
//  I18N
// ─────────────────────────────────────────────────────────────────
const I18N = {
  en: {
    // toolbar buttons
    select:       'Select',
    line:         'Line',
    arrow:        'Arrow',
    undo:         'Undo',
    redo:         'Redo',
    delete:       'Delete',
    fit:          'Fit',
    import:       'Import',
    // inspector edge
    lineLbl:      'Line',
    arrowLbl:     'Arrow',
    removeEntity: 'Remove Entity',
    removeConn:   'Remove Connection',
    // static ids
    paletteHeading:   'Entities',
    canvasHint:       'Click an entity to add it \u00a0·\u00a0 Double-click a node to rename',
    inspEmptyText:    'Select an entity or connection to view its properties',
    lblName:          'Name',
    lblType:          'Type',
    lblEdgeLabel:     'Label',
    lblEdgeOptional:  '(optional)',
    lblConntype:      'Connection type',
    sbHints:          'S\u00a0\u2014 select \u00a0·\u00a0 L\u00a0\u2014 line \u00a0·\u00a0 A\u00a0\u2014 arrow \u00a0·\u00a0 F\u00a0\u2014 fit \u00a0·\u00a0 Del\u00a0\u2014 delete \u00a0·\u00a0 Ctrl+Z/Y\u00a0\u2014 undo/redo',
    iiNamePlaceholder: '\u2026',
    ieLabelPlaceholder: 'e.g. works_at',
    // mode pill
    modeLineSrc:   '\u2014 Line mode \u00b7 click the source node',
    modeLineTgt:   '\u2014 Line mode \u00b7 now click the target node',
    modeArrowSrc:  '\u2192 Arrow mode \u00b7 click the source node',
    modeArrowTgt:  '\u2192 Arrow mode \u00b7 now click the target node',
    // theme button
    themeLight: 'Light',
    themeDark:  'Dark',
    // edge inspector kinds
    lineConn:  'LINE CONNECTION',
    arrowConn: 'ARROW CONNECTION',
    // entity type names
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
    lineLbl:      'Linha',
    arrowLbl:     'Seta',
    removeEntity: 'Remover Entidade',
    removeConn:   'Remover Conex\u00e3o',
    paletteHeading:   'Entidades',
    canvasHint:       'Clique em uma entidade para adicion\u00e1-la \u00a0·\u00a0 Duplo clique para renomear',
    inspEmptyText:    'Selecione uma entidade ou conex\u00e3o para ver suas propriedades',
    lblName:          'Nome',
    lblType:          'Tipo',
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
    // entity type names
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
  },
};

function t(key) {
  return I18N[currentLang][key] ?? I18N.en[key] ?? key;
}

/** Returns the localized display name for an entity type id. */
function getEntityLocalName(typeId) {
  return t(`entity_${typeId}`);
}

function applyLang() {
  // data-i18n spans
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  // static IDs
  $('palette-heading').textContent   = t('paletteHeading');
  $('canvas-hint').innerHTML         = t('canvasHint');
  $('insp-empty-text').textContent   = t('inspEmptyText');
  $('lbl-name').textContent          = t('lblName');
  $('lbl-type').textContent          = t('lblType');
  // edge label — preserve the <span> child
  const lblEdge = $('lbl-edge-label');
  lblEdge.firstChild.textContent     = t('lblEdgeLabel') + ' ';
  $('lbl-edge-optional').textContent = t('lblEdgeOptional');
  $('lbl-conntype').textContent      = t('lblConntype');
  $('sb-hints').textContent          = t('sbHints');
  $('ii-name').placeholder           = t('iiNamePlaceholder');
  $('ie-label').placeholder          = t('ieLabelPlaceholder');
  // update theme label
  $('btn-theme-label').textContent   = isLight ? t('themeDark') : t('themeLight');
  // refresh entity names in palette and type select
  refreshPaletteNames();
  refreshTypeSelect();
  // re-apply mode pill if active
  if (mode !== 'select') updateModePill(connectSrc ? 'target' : 'source');
  // refresh open inspector panels
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
}

function toggleTheme() {
  isLight = !isLight;
  document.documentElement.classList.toggle('light', isLight);
  // Give CSS time to compute new custom properties before reading them
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
    selectionType:       'additive',
    minZoom: 0.04,
    maxZoom: 6,
    wheelSensitivity: 0.22,
  });

  bindCyEvents();
}

function buildCyStyle() {
  // Read CSS custom properties so both themes are reflected automatically
  const nodeBg      = getCyTokenSafe('--cy-node-bg',      isLight ? '#f0f0f0' : '#161616');
  const nodeBdr     = getCyTokenSafe('--cy-node-border',  isLight ? '#cccccc' : '#353535');
  const nodeLbl     = getCyTokenSafe('--cy-node-label',   '#888888');
  const nodeSelBg   = getCyTokenSafe('--cy-node-sel-bg',  isLight ? '#e4e4e4' : '#1c1c1c');
  const nodeSelBdr  = getCyTokenSafe('--cy-node-sel-bdr', isLight ? '#111111' : '#ffffff');
  const nodeSelLbl  = getCyTokenSafe('--cy-node-sel-lbl', isLight ? '#111111' : '#ffffff');
  const edgeColor   = getCyTokenSafe('--cy-edge-color',   isLight ? '#bbbbbb' : '#383838');
  const edgeLbl     = getCyTokenSafe('--cy-edge-label',   isLight ? '#999999' : '#505050');
  const edgeTextBg  = getCyTokenSafe('--cy-edge-textbg',  isLight ? '#f0f0f0' : '#0c0c0c');
  const edgeSel     = getCyTokenSafe('--cy-edge-sel',     isLight ? '#111111' : '#ffffff');
  const nodeHoverBdr = isLight ? '#777777' : '#666666';
  const edgeHover    = isLight ? '#888888' : '#727272';

  return [
    /* ── Nodes (default) ── */
    {
      selector: 'node',
      style: {
        'background-color':      nodeBg,
        'background-image':      'data(iconSvg)',
        'background-width':      '78%',
        'background-height':     '78%',
        'background-position-x': '50%',
        'background-position-y': '50%',
        'background-clip':       'none',
        'border-color':          nodeBdr,
        'border-width':          1.5,
        'label':                 'data(name)',
        'color':                 nodeLbl,
        'font-size':             11,
        'font-family':           '"Inter", system-ui, sans-serif',
        'font-weight':           400,
        'text-valign':           'bottom',
        'text-halign':           'center',
        'text-margin-y':         8,
        'text-wrap':             'wrap',
        'text-max-width':        92,
        'width':'data(size)',
        'height':'data(size)',
        'shape':                 'round-rectangle',
        'transition-property':   'border-color, border-width, background-color, color',
        'transition-duration':   '110ms',
      }
    },
    /* ── Node hover ── */
    {
      selector: 'node:hover',
      style: {
        'border-color': nodeHoverBdr,
        'border-width': 2,
        'color':        isLight ? '#333333' : '#bbbbbb',
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
      }
    },
    /* ── Edge hover ── */
    {
      selector: 'edge:hover',
      style: {
        'line-color': edgeHover,
        'color':      isLight ? '#666666' : '#888888',
        'width':      2,
      }
    },
    /* ── Edge selected ── */
    {
      selector: 'edge:selected',
      style: {
        'line-color':          edgeSel,
        'color':               isLight ? '#333333' : '#cccccc',
        'width':               2,
        'target-arrow-color':  edgeSel,
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
  ];
}

/** Safe CSS variable reader — falls back to default if var not yet computed. */
function getCyTokenSafe(varName, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

// ─────────────────────────────────────────────────────────────────
//  CYTOSCAPE EVENT BINDINGS
// ─────────────────────────────────────────────────────────────────
function bindCyEvents() {
  /* Tap a node */
  cy.on('tap', 'node', e => {
    if (mode !== 'select') {
      handleConnectTap(e.target);
      return;
    }
    selectElement(e.target);
    showNodeInspector(e.target);
  });

  /* Tap an edge */
  cy.on('tap', 'edge', e => {
    if (mode !== 'select') return;
    selectElement(e.target);
    showEdgeInspector(e.target);
  });

  /* Tap empty canvas */
  cy.on('tap', e => {
    if (e.target !== cy) return;
    // Cancel pending connection
    if (connectSrc) {
      connectSrc.removeClass('connect-src');
      connectSrc = null;
      updateModePill('source');
      return;
    }
    if (mode === 'select') {
      clearSelection();
    }
  });

  /* Double-click a node → focus name field in inspector */
  cy.on('dblclick', 'node', e => {
    if (mode !== 'select') return;
    selectElement(e.target);
    showNodeInspector(e.target);
    setTimeout(focusNameInput, 60);
  });

  /* Save history after node drag */
  cy.on('dragfree', 'node', () => pushHistory());
}

// ─────────────────────────────────────────────────────────────────
//  CONNECT MODE LOGIC
// ─────────────────────────────────────────────────────────────────
function handleConnectTap(node) {
  if (!connectSrc) {
    // Set source
    connectSrc = node;
    node.addClass('connect-src');
    updateModePill('target');
  } else {
    // Set target and create edge
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
  // Switch back to select mode first
  setMode('select');

  const type = getType(typeId);
  const ext  = cy.extent();
  const cx   = (ext.x1 + ext.x2) / 2;
  const cy_  = (ext.y1 + ext.y2) / 2;

  // Auto-number: "Person", "Person 2", "Person 3" … (localized)
  const existing  = cy.nodes(`[type="${typeId}"]`).length;
  const localName = getEntityLocalName(typeId);
  const defName   = existing === 0 ? localName : `${localName} ${existing + 1}`;

  const node = addNodeToGraph(typeId, defName, {
    x: cx + (Math.random() - 0.5) * 110,
    y: cy_ + (Math.random() - 0.5) * 110,
  });

  pushHistory();

  // Select the new node and open inspector
  cy.elements().unselect();
  node.select();
  selectedEl = node;
  showNodeInspector(node);
  updateToolbar();

  // Pan canvas to newly added node
  cy.animate({ center: { eles: node }, duration: 160 });

  // Auto-focus name input so user can immediately type
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
      type:    typeId,
      iconSvg: getIconUri(type),
      size:68
    },
    position,
  });
  updateStatus();
  return cy.getElementById(id);
}

// ─────────────────────────────────────────────────────────────────
//  SELECTION HELPERS
// ─────────────────────────────────────────────────────────────────
function selectElement(el) {
  cy.elements().unselect();
  el.select();
  selectedEl = el;
  updateToolbar();
}

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
  // Cancel any in-progress connection
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

  // Prevent node dragging while in connect modes
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
  if (mode === 'select') {
    pill.classList.remove('visible');
    return;
  }
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

  $('ii-icon').textContent  = type.icon;
  $('ii-kind').textContent  = getEntityLocalName(type.id).toUpperCase();
  $('ii-title').textContent = node.data('name') || '—';
  $('ii-name').value        = node.data('name') || '';
  $('ii-type').value        = node.data('type') || 'person';
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
}

function focusNameInput() {
  const inp = $('ii-name');
  inp.focus();
  inp.select();
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
  // Truncate any forward history
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
  if (connectSrc) {
    connectSrc.removeClass('connect-src');
    connectSrc = null;
  }
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
//  EXPORT — PNG
// ─────────────────────────────────────────────────────────────────
function exportPNG() {
  if (!cy.elements().length) { showToast('Add some entities first!'); return; }

  const imgData = cy.png({ scale: 3, bg: '#0c0c0c', full: true });
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
  const imgData = cy.png({
    scale:2.5,
    bg:'#ffffff',
    full:true
});
  const bb         = cy.elements().boundingBox();
  const isLandscape = bb.w >= bb.h;

  const doc  = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pW   = doc.internal.pageSize.getWidth();
  const pH   = doc.internal.pageSize.getHeight();

  // Dark page background
  doc.setFillColor(255,255,255);
  doc.rect(0, 0, pW, pH, 'F');

  // Header: logo
  doc.setTextColor(0,0,0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('SCHEMA', 14, 17);

  // Header: subtitle / date
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80,80,80);
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Visual Link Schema  ·  ${dateStr}`, 14, 23.5);

  // Header: stats (right-aligned)
  const n = cy.nodes().length;
  const e = cy.edges().length;
  doc.text(`${n} ${n === 1 ? 'entity' : 'entities'}  ·  ${e} ${e === 1 ? 'connection' : 'connections'}`, pW - 14, 23.5, { align: 'right' });

  // Divider
  doc.setDrawColor(220,220,220);
  doc.line(14, 27, pW - 14, 27);

  // Graph image
  const margin = 14;
  const imgY   = 31;
  const imgW   = pW - margin * 2;
  const imgH   = pH - imgY - margin;
  doc.addImage(imgData, 'PNG', margin, imgY, imgW, imgH, undefined, 'FAST');

  doc.save(`schema_${Date.now()}.pdf`);
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

/**
 * Process rows from CSV/XLSX import.
 *
 * Expected columns (case-insensitive, spaces become underscores):
 *   source       — source entity name         (required)
 *   source_type  — entity type id             (optional, default: person)
 *   target       — target entity name         (optional)
 *   target_type  — entity type id             (optional, default: person)
 *   label        — edge label text            (optional)
 *   edge_type    — "arrow" or "line"          (optional, default: line)
 */
function processRows(rows) {
  if (!rows?.length) { showToast('No data found in file.'); return; }

  let newNodes = 0;
  let newEdges = 0;

  rows.forEach(row => {
    // Normalize keys
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

    // Find or create source node
    let src = cy.nodes().filter(n => n.data('name') === srcName).first();
    if (!src.length) {
      src = addNodeToGraph(srcType, srcName, {
        x: 100 + Math.random() * 700,
        y: 100 + Math.random() * 400,
      });
      newNodes++;
    }

    // Find or create target node (if provided)
    if (tgtName) {
      let tgt = cy.nodes().filter(n => n.data('name') === tgtName).first();
      if (!tgt.length) {
        tgt = addNodeToGraph(tgtType, tgtName, {
          x: 100 + Math.random() * 700,
          y: 100 + Math.random() * 400,
        });
        newNodes++;
      }

      // Avoid duplicate edges
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

  // Auto-layout after import
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
  const t = document.createElement('div');
  t.className   = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 260);
  }, 2200);
}

// ─────────────────────────────────────────────────────────────────
//  KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────────
function initKeyboard() {
  document.addEventListener('keydown', e => {
    // Don't capture while typing in form fields
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
    // icon (custom SVG or emoji text)
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
    // name span (rebuilt on language change)
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

  $('btn-import').onclick = () => $('file-input').click();
  $('file-input').addEventListener('change', e => {
    if (e.target.files[0]) {
      importFile(e.target.files[0]);
      e.target.value = ''; // allow re-import of same file
    }
  });

  // Theme toggle
  $('btn-theme').onclick = toggleTheme;

  // Language toggle
  $('btn-lang').onclick = toggleLang;
}

// ─────────────────────────────────────────────────────────────────
//  INSPECTOR EVENTS
// ─────────────────────────────────────────────────────────────────
function initInspector() {
  // Node: name input → update canvas label live
  $('ii-name').addEventListener('input', function () {
    if (selectedEl?.isNode()) {
      selectedEl.data('name', this.value);
      $('ii-title').textContent = this.value || '—';
    }
  });
  $('ii-name').addEventListener('change', () => pushHistory());

  // Node: type select → swap icon
  $('ii-type').addEventListener('change', function () {
    if (selectedEl?.isNode()) {
      const t = getType(this.value);
      selectedEl.data({ type: this.value, iconSvg: emojiSvg(t.icon) });
      $('ii-icon').textContent = t.icon;
      $('ii-kind').textContent = t.name.toUpperCase();
      pushHistory();
    }
  });

  // Node: delete
  $('btn-del-node').onclick = deleteSelected;

  // Edge: label input
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

  // Edge: delete
  $('btn-del-edge').onclick = deleteSelected;
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

  // Save initial empty state for undo baseline
  pushHistory();
  updateToolbar();
  updateStatus();
});
