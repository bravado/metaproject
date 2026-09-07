import { DataSource, DataTable, emitDataAction, readDataField } from './index.js';

export * from './index.js';

export const DATA_INVALIDATE_EVENT = 'metaproject-data-invalidate';

const SOURCE_STATE = new WeakMap();
const TABLE_STATE = new WeakMap();
const AUTO_ROWS = new WeakMap();

const sourceResource = Object.getOwnPropertyDescriptor(DataSource.prototype, 'resource');
const sourceConnected = DataSource.prototype.connectedCallback;
const sourceDisconnected = DataSource.prototype.disconnectedCallback;

Object.defineProperty(DataSource.prototype, 'key', {
  configurable:true,
  get() { return sourceState(this).key; },
  set(value) {
    const state = sourceState(this);
    const next = value == null ? '' : String(value);
    if (next === state.key) return;
    state.key = next;
    state.keyChanged = true;
    if (state.initialized && state.loader) queueMicrotask(() => {
      if (!state.keyChanged || !this.isConnected) return;
      state.keyChanged = false;
      this.refresh();
    });
  }
});

Object.defineProperty(DataSource.prototype, 'resource', {
  configurable:true,
  get() {
    const state = SOURCE_STATE.get(this);
    return state ? state.input : sourceResource.get.call(this);
  },
  set(value) {
    const state = sourceState(this);
    state.input = value;
    state.loader = typeof value === 'function' ? value : null;
    if (state.loader) {
      const shouldLoad = !state.initialized || state.keyChanged || !state.key;
      state.initialized = true;
      state.keyChanged = false;
      if (shouldLoad) this.refresh();
    } else {
      state.initialized = true;
      state.keyChanged = false;
      sourceResource.set.call(this, value);
    }
  }
});

DataSource.prototype.refresh = function refresh() {
  const state = sourceState(this);
  let value;
  try {
    value = state.loader ? state.loader() : state.input;
  } catch (error) {
    this.dispatchEvent(new CustomEvent('data-error',{detail:{error},bubbles:true,composed:true}));
    throw error;
  }
  if (isPromiseLike(value)) sourceResource.set.call(this, undefined);
  sourceResource.set.call(this, value);
  return value;
};

DataSource.prototype.invalidate = function invalidate(keys = this.key) {
  return invalidateDataSource(keys);
};

DataSource.prototype.connectedCallback = function connectedCallback() {
  sourceConnected.call(this);
  const state = sourceState(this);
  if (!state.key && this.hasAttribute?.('key')) state.key = this.getAttribute('key') || '';
  const target = dataEventTarget();
  if (!target) return;
  if (!state.onInvalidate) {
    state.onInvalidate = event => {
      if (!state.key) return;
      const keys = normalizeKeys(event.detail?.keys ?? event.detail?.key);
      if (keys.includes(state.key)) this.refresh();
    };
  }
  target.addEventListener(DATA_INVALIDATE_EVENT, state.onInvalidate);
};

DataSource.prototype.disconnectedCallback = function disconnectedCallback() {
  const state = SOURCE_STATE.get(this);
  const target = dataEventTarget();
  if (state?.onInvalidate && target) target.removeEventListener(DATA_INVALIDATE_EVENT, state.onInvalidate);
  sourceDisconnected.call(this);
};

export function invalidateDataSource(keys, { broadcast = true } = {}) {
  const normalized = normalizeKeys(keys);
  if (!normalized.length) return normalized;
  const target = dataEventTarget();
  if (!target || typeof CustomEvent === 'undefined') return normalized;
  target.dispatchEvent(new CustomEvent(DATA_INVALIDATE_EVENT, {
    detail:{keys:normalized,broadcast:Boolean(broadcast)}
  }));
  return normalized;
}

const tableResource = Object.getOwnPropertyDescriptor(DataTable.prototype, 'resource');
const tableConnected = DataTable.prototype.connectedCallback;
const tableDisconnected = DataTable.prototype.disconnectedCallback;

Object.defineProperty(DataTable.prototype, 'columns', {
  configurable:true,
  get() { return tableState(this).columns; },
  set(value) {
    const state = tableState(this);
    state.columns = Array.isArray(value) ? value : [];
    state.columnsSet = true;
    scheduleAutoTable(this);
  }
});

Object.defineProperty(DataTable.prototype, 'actions', {
  configurable:true,
  get() { return tableState(this).actions; },
  set(value) {
    const state = tableState(this);
    state.actions = Array.isArray(value) ? value : [];
    state.actionsSet = true;
    scheduleAutoTable(this);
  }
});

Object.defineProperty(DataTable.prototype, 'resource', {
  configurable:true,
  get() { return tableResource.get.call(this); },
  set(value) {
    const state = tableState(this);
    const resourceVersion = ++state.resourceVersion;
    tableResource.set.call(this, value);
    // Base DataTable resolves Promise resources internally. Schedule the
    // automatic renderer from the same Promise settlement as well, so an
    // async resource cannot miss the data-loaded listener during element
    // connection/upgrade timing.
    if (isPromiseLike(value)) {
      Promise.resolve(value).then(
        () => {
          if (resourceVersion === tableState(this).resourceVersion) scheduleAutoTable(this);
        },
        () => {}
      );
    }
    scheduleAutoTable(this);
  }
});

DataTable.prototype.connectedCallback = function connectedCallback() {
  tableConnected.call(this);
  const state = tableState(this);
  if (!state.onLoaded) state.onLoaded = () => scheduleAutoTable(this);
  if (!state.onClick) state.onClick = event => handleAutoAction(this, event);
  this.addEventListener('data-loaded', state.onLoaded);
  this.addEventListener('click', state.onClick, true);
  scheduleAutoTable(this);
};

DataTable.prototype.disconnectedCallback = function disconnectedCallback() {
  const state = TABLE_STATE.get(this);
  if (state?.onLoaded) this.removeEventListener('data-loaded', state.onLoaded);
  if (state?.onClick) this.removeEventListener('click', state.onClick, true);
  tableDisconnected.call(this);
};

function sourceState(source) {
  let state = SOURCE_STATE.get(source);
  if (!state) {
    state = {key:'',keyChanged:false,input:undefined,loader:null,initialized:false,onInvalidate:null};
    SOURCE_STATE.set(source,state);
  }
  return state;
}

function tableState(table) {
  let state = TABLE_STATE.get(table);
  if (!state) {
    state = {columns:[],actions:[],columnsSet:false,actionsSet:false,scheduled:false,resourceVersion:0,onLoaded:null,onClick:null};
    TABLE_STATE.set(table,state);
  }
  return state;
}

function scheduleAutoTable(table) {
  const state = tableState(table);
  if (state.scheduled) return;
  state.scheduled = true;
  queueMicrotask(() => {
    state.scheduled = false;
    if (table.isConnected) renderAutoTable(table);
  });
}

function renderAutoTable(host) {
  const state = tableState(host);
  if (host.querySelector('template[data-row]')) {
    host.querySelector(':scope > table[data-metaproject-auto-table]')?.remove();
    return;
  }
  const existing = host.querySelector(':scope > table[data-metaproject-auto-table]');
  const authoredChildren = [...host.children].filter(child => child !== existing);
  if (authoredChildren.length && !state.columnsSet && !state.actionsSet) return;

  const rows = Array.isArray(host.resolvedResource) ? host.resolvedResource : [];
  const columns = normalizeColumns(state.columns, rows);
  const actions = normalizeActions(state.actions);
  const table = existing || document.createElement('table');
  table.setAttribute('data-metaproject-auto-table','');

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const column of columns) {
    const th = document.createElement('th');
    th.textContent = column.label;
    headRow.append(th);
  }
  if (actions.length) {
    const th = document.createElement('th');
    th.textContent = 'Actions';
    headRow.append(th);
  }
  thead.append(headRow);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-metaproject-row','');
    AUTO_ROWS.set(tr,row);
    for (const column of columns) {
      const td = document.createElement('td');
      td.textContent = formatValue(readDataField(row,column.field));
      tr.append(td);
    }
    if (actions.length) {
      const td = document.createElement('td');
      td.setAttribute('data-metaproject-actions','');
      for (const action of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-action',action.name);
        button.setAttribute('data-metaproject-auto-action','');
        button.textContent = action.label;
        if (action.title) button.title = action.title;
        if (action.className) button.className = action.className;
        td.append(button);
      }
      tr.append(td);
    }
    tbody.append(tr);
  }

  table.replaceChildren(thead,tbody);
  if (!existing) host.append(table);
}

function handleAutoAction(host, event) {
  const button = event.composedPath().find(node => node instanceof Element && node.hasAttribute?.('data-metaproject-auto-action'));
  if (!button || !host.contains(button)) return;
  const row = event.composedPath().map(node => AUTO_ROWS.get(node)).find(value => value !== undefined);
  if (row === undefined) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  emitDataAction(button,row,event);
}

function normalizeColumns(configured, rows) {
  const values = configured.length ? configured : inferColumns(rows);
  return values.map(column => {
    if (typeof column === 'string') return {field:column,label:humanize(column)};
    const field = String(column?.field ?? column?.name ?? '');
    return {field,label:String(column?.label ?? humanize(field))};
  }).filter(column => column.field);
}

function inferColumns(rows) {
  const row = rows.find(value => value && typeof value === 'object' && !Array.isArray(value));
  return row ? Object.keys(row) : [];
}

function normalizeActions(actions) {
  return actions.map(action => {
    if (typeof action === 'string') return {name:action,label:humanize(action),title:'',className:''};
    const name = String(action?.name ?? action?.action ?? '');
    return {
      name,
      label:String(action?.label ?? humanize(name)),
      title:String(action?.title ?? ''),
      className:String(action?.className ?? action?.class ?? '')
    };
  }).filter(action => /^[A-Za-z][A-Za-z0-9_.:-]*$/.test(action.name));
}

function formatValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); }
    catch { return String(value); }
  }
  return String(value);
}

function humanize(value) {
  return String(value || '').replace(/[_-]+/g,' ').replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/^./,char => char.toUpperCase());
}

function isPromiseLike(value) {
  return value != null && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function';
}

function normalizeKeys(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map(item => item == null ? '' : String(item).trim()).filter(Boolean))];
}

function dataEventTarget() {
  return typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
}
