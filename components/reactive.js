import {
  DataSource as DataSourceElement,
  DataTable,
  emitDataAction,
  readDataField,
  configureMetaproject as configureBase
} from './index.js';
import {
  DATA_SOURCE_CONTEXT_REQUEST,
  DataSourceConsumerController,
  createDataSource,
  getDefaultDataSource,
  requestDataSourceContext,
  setDefaultDataSource
} from '../data-source/index.js';

export * from './index.js';
export * from '../data-source/index.js';

/** Configure API/navigation and establish the runtime default DataSource. */
export function configureMetaproject(environment = {}) {
  const source = Object.prototype.hasOwnProperty.call(environment,'dataSource') ? environment.dataSource : undefined;
  if (source !== undefined) setDefaultDataSource(source);
  const next = source && environment.api === undefined
    ? { ...environment, api:source.api }
    : environment;
  return configureBase(next);
}

// Compatibility event retained for older applications. New code invalidates the
// resolved DataSource directly and does not create application-specific keys.
export const DATA_INVALIDATE_EVENT = 'metaproject-data-invalidate';

const PROVIDER_STATE = new WeakMap();
const TABLE_STATE = new WeakMap();
const AUTO_ROWS = new WeakMap();
const AUTO_ACTION_EVENTS = new WeakSet();

// <data-source> scopes a DataSource. Its historical .resource property remains
// available for compatibility, but resource context belongs on <data-resource>.
for (const [name, descriptor] of Object.entries({
  source:{
    get() { return providerState(this).source || resolveProviderSource(this); },
    set(value) { const state=providerState(this); state.source=value || null; state.ownedSource=null; notifyProvider(this); }
  },
  client:{
    get() { return providerState(this).client; },
    set(value) { const state=providerState(this); state.client=value || null; state.ownedSource=null; notifyProvider(this); }
  },
  url:{
    get() { return providerState(this).url || this.getAttribute?.('url') || ''; },
    set(value) { const state=providerState(this); state.url=value == null ? '' : String(value); state.ownedSource=null; notifyProvider(this); }
  }
})) Object.defineProperty(DataSourceElement.prototype, name, { configurable:true, ...descriptor });

DataSourceElement.prototype.invalidate = function invalidate(predicate) {
  return resolveProviderSource(this)?.invalidate?.(predicate);
};
DataSourceElement.prototype.refresh = function refresh(predicate) {
  return resolveProviderSource(this)?.refresh?.(predicate);
};

function providerState(element) {
  let state=PROVIDER_STATE.get(element);
  if (!state) {
    state={source:null,client:null,url:'',ownedSource:null,contextSubscribers:new Set()};
    PROVIDER_STATE.set(element,state);
  }
  return state;
}
function resolveProviderSource(element) {
  const state=providerState(element);
  if (state.source) return state.source;
  if (state.ownedSource) return state.ownedSource;
  const url=state.url || element.getAttribute?.('url') || '';
  if (state.client || url) {
    state.ownedSource=createDataSource({
      client:state.client || undefined,
      url,
      operations:getDefaultDataSource()?.operations || []
    });
    return state.ownedSource;
  }
  return getDefaultDataSource();
}
function notifyProvider(element) {
  const state=providerState(element);
  const source=resolveProviderSource(element);
  for (const callback of [...state.contextSubscribers]) callback(source);
}

if (typeof document !== 'undefined') {
  document.addEventListener(DATA_SOURCE_CONTEXT_REQUEST, event => {
    const detail=event.detail;
    if (typeof detail?.callback !== 'function') return;
    const path=typeof event.composedPath === 'function' ? event.composedPath() : [];
    // <data-resource> extends the historical DataSource element only to reuse
    // resource-context behavior. It must not shadow an ancestor <data-source>.
    const provider=path.find(node => node instanceof DataSourceElement && node.localName === 'data-source');
    if (!provider) return;
    const source=resolveProviderSource(provider);
    if (!source) return;
    event.stopPropagation();
    detail.resolved=true;
    detail.callback(source);
    if (detail.subscribe) {
      const state=providerState(provider);
      state.contextSubscribers.add(detail.callback);
      detail.unsubscribe=()=>state.contextSubscribers.delete(detail.callback);
    }
  }, true);
}

/** Generic resource-context wrapper, separate from the stateful <data-source>. */
export class DataResource extends DataSourceElement {
  static get observedAttributes() { return ['operation']; }

  constructor() {
    super();
    this._operation='';
    this._args={};
    this._load=null;
    this._dataSource=null;
    this._contextSource=null;
    this._contextUnsubscribe=null;
    this._sourceUnsubscribe=null;
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'operation' && oldValue !== newValue) this.operation=newValue || '';
  }
  connectedCallback() {
    super.connectedCallback();
    queueMicrotask(()=>{
      if (!this.isConnected) return;
      this._contextUnsubscribe?.();
      this._contextUnsubscribe=requestDataSourceContext(this, source=>{
        this._contextSource=source || null;
        this.#bindSource();
        this.#loadResource();
      }, {subscribe:true});
      this.#bindSource();
      this.#loadResource();
    });
  }
  disconnectedCallback() {
    this._contextUnsubscribe?.();
    this._sourceUnsubscribe?.();
    this._contextUnsubscribe=null;
    this._sourceUnsubscribe=null;
    super.disconnectedCallback();
  }
  set operation(value) { this._operation=value == null ? '' : String(value); this.#bindSource(); this.#loadResource(); }
  get operation() { return this._operation; }
  set args(value) { this._args=value && typeof value === 'object' ? value : {}; this.#loadResource(); }
  get args() { return this._args; }
  set load(value) { this._load=typeof value === 'function' ? value : null; this.#bindSource(); this.#loadResource(); }
  get load() { return this._load; }
  set dataSource(value) { this._dataSource=value || null; this.#bindSource(); this.#loadResource(); }
  get dataSource() { return this._dataSource; }
  set value(value) { this.resource=value; }
  get value() { return this.resolvedResource; }
  refresh() { return this.#loadResource(); }
  #source() { return this._dataSource || this._contextSource || getDefaultDataSource(); }
  #bindSource() {
    this._sourceUnsubscribe?.();
    this._sourceUnsubscribe=null;
    const source=this.#source();
    if ((this._operation || this._load) && typeof source?.subscribe === 'function') {
      this._sourceUnsubscribe=source.subscribe(event=>{
        if (event?.type==='query' || event?.type==='query-error') return;
        this.#loadResource();
      });
    }
  }
  #loadResource() {
    if (!this.isConnected) return this.resource;
    const source=this.#source();
    if (this._load) {
      if (!source) return this.resource;
      this.resource=this._load(source.api, source);
    } else if (this._operation) {
      const invoke=source?.api?.[this._operation];
      if (typeof invoke !== 'function') throw new Error(`Unknown DataResource operation: ${this._operation}`);
      this.resource=invoke(this._args || {});
    }
    return this.resource;
  }
}
if (typeof customElements !== 'undefined' && !customElements.get('data-resource')) customElements.define('data-resource',DataResource);

export function invalidateDataSource(keys, { broadcast = true } = {}) {
  const source=getDefaultDataSource();
  source?.invalidate?.();
  if (broadcast && typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DATA_INVALIDATE_EVENT,{detail:{keys,broadcast:true}}));
  }
  return Array.isArray(keys) ? keys : [keys].filter(Boolean);
}

const tableResource = Object.getOwnPropertyDescriptor(DataTable.prototype, 'resource');
const tableConnected = DataTable.prototype.connectedCallback;
const tableDisconnected = DataTable.prototype.disconnectedCallback;

Object.defineProperty(DataTable.prototype, 'columns', {
  configurable:true,
  get() { return tableState(this).columns; },
  set(value) { const state=tableState(this); state.columns=Array.isArray(value)?value:[]; state.columnsSet=true; scheduleAutoTable(this); }
});
Object.defineProperty(DataTable.prototype, 'actions', {
  configurable:true,
  get() { return tableState(this).actions; },
  set(value) { const state=tableState(this); state.actions=Array.isArray(value)?value:[]; state.actionsSet=true; scheduleAutoTable(this); }
});
Object.defineProperty(DataTable.prototype, 'resource', {
  configurable:true,
  get() { return tableResource.get.call(this); },
  set(value) {
    const state=tableState(this);
    const resourceVersion=++state.resourceVersion;
    tableResource.set.call(this,value);
    if (isPromiseLike(value)) Promise.resolve(value).then(()=>{
      if (resourceVersion===tableState(this).resourceVersion) scheduleAutoTable(this);
    },()=>{});
    scheduleAutoTable(this);
  }
});
DataTable.prototype.connectedCallback=function connectedCallback(){
  tableConnected.call(this);
  const state=tableState(this);
  if(!state.onLoaded)state.onLoaded=()=>scheduleAutoTable(this);
  if(!state.onClick)state.onClick=event=>handleAutoAction(this,event);
  this.addEventListener('data-loaded',state.onLoaded);
  this.addEventListener('click',state.onClick,true);
  scheduleAutoTable(this);
};
DataTable.prototype.disconnectedCallback=function disconnectedCallback(){
  const state=TABLE_STATE.get(this);
  if(state?.onLoaded)this.removeEventListener('data-loaded',state.onLoaded);
  if(state?.onClick)this.removeEventListener('click',state.onClick,true);
  tableDisconnected.call(this);
};

// Lifecycle callbacks can be captured before the prototype patch above. Keep
// generated action dispatch delegated at document level as the canonical path.
if (typeof document !== 'undefined') document.addEventListener('click',event=>{
  const path=typeof event.composedPath==='function'?event.composedPath():[];
  const host=path.find(node=>node instanceof DataTable);
  if(host)handleAutoAction(host,event);
},true);

function tableState(table){let state=TABLE_STATE.get(table);if(!state){state={columns:[],actions:[],columnsSet:false,actionsSet:false,scheduled:false,resourceVersion:0,onLoaded:null,onClick:null};TABLE_STATE.set(table,state);}return state;}
function scheduleAutoTable(table){const state=tableState(table);if(state.scheduled)return;state.scheduled=true;queueMicrotask(()=>{state.scheduled=false;if(table.isConnected)renderAutoTable(table);});}
function renderAutoTable(host){
  const state=tableState(host);
  if(host.querySelector('template[data-row]')){host.querySelector(':scope > table[data-metaproject-auto-table]')?.remove();return;}
  const existing=host.querySelector(':scope > table[data-metaproject-auto-table]');
  const authoredChildren=[...host.children].filter(child=>child!==existing);
  if(authoredChildren.length&&!state.columnsSet&&!state.actionsSet)return;
  const rows=Array.isArray(host.resolvedResource)?host.resolvedResource:[];
  const columns=normalizeColumns(state.columns,rows);
  const actions=normalizeActions(state.actions);
  const table=existing||document.createElement('table');table.setAttribute('data-metaproject-auto-table','');
  const thead=document.createElement('thead'),headRow=document.createElement('tr');
  for(const column of columns){const th=document.createElement('th');th.textContent=column.label;headRow.append(th);}
  if(actions.length){const th=document.createElement('th');th.textContent='Actions';headRow.append(th);}thead.append(headRow);
  const tbody=document.createElement('tbody');
  for(const row of rows){
    const tr=document.createElement('tr');tr.setAttribute('data-metaproject-row','');AUTO_ROWS.set(tr,row);
    for(const column of columns){const td=document.createElement('td');td.textContent=formatValue(readDataField(row,column.field));tr.append(td);}
    if(actions.length){const td=document.createElement('td');td.setAttribute('data-metaproject-actions','');for(const action of actions){const button=document.createElement('button');button.type='button';button.setAttribute('data-action',action.name);button.setAttribute('data-metaproject-auto-action','');button.textContent=action.label;if(action.title)button.title=action.title;if(action.className)button.className=action.className;td.append(button);}tr.append(td);}
    tbody.append(tr);
  }
  table.replaceChildren(thead,tbody);if(!existing)host.append(table);
}
function handleAutoAction(host,event){
  if(AUTO_ACTION_EVENTS.has(event))return;
  const button=event.composedPath().find(node=>node instanceof Element&&node.hasAttribute?.('data-metaproject-auto-action'));
  if(!button||!host.contains(button))return;
  const row=event.composedPath().map(node=>AUTO_ROWS.get(node)).find(value=>value!==undefined);
  if(row===undefined)return;
  AUTO_ACTION_EVENTS.add(event);event.preventDefault();event.stopImmediatePropagation();emitDataAction(button,row,event);
}
function normalizeColumns(configured,rows){const values=configured.length?configured:inferColumns(rows);return values.map(column=>{if(typeof column==='string')return{field:column,label:humanize(column)};const field=String(column?.field??column?.name??'');return{field,label:String(column?.label??humanize(field))};}).filter(column=>column.field);}
function inferColumns(rows){const row=rows.find(value=>value&&typeof value==='object'&&!Array.isArray(value));return row?Object.keys(row):[];}
function normalizeActions(actions){return actions.map(action=>{if(typeof action==='string')return{name:action,label:humanize(action),title:'',className:''};const name=String(action?.name??action?.action??'');return{name,label:String(action?.label??humanize(name)),title:String(action?.title??''),className:String(action?.className??action?.class??'')};}).filter(action=>/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(action.name));}
function formatValue(value){if(value===undefined||value===null)return'';if(typeof value==='object'){try{return JSON.stringify(value);}catch{return String(value);}}return String(value);}
function humanize(value){return String(value||'').replace(/[_-]+/g,' ').replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/^./,char=>char.toUpperCase());}
function isPromiseLike(value){return value!=null&&(typeof value==='object'||typeof value==='function')&&typeof value.then==='function';}

export { DataSourceConsumerController };
