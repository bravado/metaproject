import {
  RESOURCE_CONTEXT_REQUEST,
  RESOURCE_CHANGE_EVENT,
  requestResourceContext,
  readDataField,
  emitDataAction,
  humanizeField,
  claimDataActionEvent
} from './context.js';

const ROW_CONTEXTS = new WeakMap();
const ACTION_TEMPLATE_ATTRIBUTE = 'data-metaproject-action-template';

export class DataTable extends HTMLElement {
  #resourceInput;
  #resource;
  #schema;
  #contextUnsubscribe=null;
  #subscriptions=new Set();
  #renderQueued=false;
  #columns=[];
  #observer=null;
  #hostObserver=null;

  constructor() {
    super();
    this._onContext=event=>this.#provideContext(event);
    this._onClick=event=>this.#action(event);
    this._onChange=event=>this.#resourceChange(event);
  }
  connectedCallback() {
    if (!this.style.display) this.style.display='block';
    if (!this.style.maxWidth) this.style.maxWidth='100%';
    this.addEventListener(RESOURCE_CONTEXT_REQUEST,this._onContext);
    this.addEventListener('click',this._onClick,true);
    this.addEventListener(RESOURCE_CHANGE_EVENT,this._onChange);
    this.#observer=new MutationObserver(records=>{
      if (records.some(record=>directAuthoredChildrenChanged(record,this))) this.#schedule();
    });
    this.#observer.observe(this,{childList:true});
    const host=componentHost(this);
    if (host) {
      this.#hostObserver=new MutationObserver(()=>this.#schedule());
      this.#hostObserver.observe(host,{childList:true});
    }
    queueMicrotask(()=>{
      if (this.#resourceInput === undefined) {
        this.#contextUnsubscribe=requestResourceContext(this,(resource,schema)=>{
          this.#resource=resource;
          this.#schema=schema;
          this.#schedule();
        },{subscribe:true});
      }
      this.#schedule();
    });
  }
  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#observer=null;
    this.#hostObserver?.disconnect();
    this.#hostObserver=null;
    this.#contextUnsubscribe?.();
    this.#contextUnsubscribe=null;
    this.removeEventListener(RESOURCE_CONTEXT_REQUEST,this._onContext);
    this.removeEventListener('click',this._onClick,true);
    this.removeEventListener(RESOURCE_CHANGE_EVENT,this._onChange);
    this.#subscriptions.clear();
  }
  set resource(value) { this.#resourceInput=value; this.#resource=value; this.#schedule(); }
  get resource() { return this.#resourceInput; }
  get resolvedResource() { return this.#resource; }
  set columns(value) { this.#columns=Array.isArray(value)?value:[]; this.#schedule(); }
  get columns() { return this.#columns; }
  set actions(_value) { throw new Error('<data-table>.actions was removed. Author data-action/data-operation HTML inside <data-table> instead.'); }

  #schedule() {
    if (this.#renderQueued) return;
    this.#renderQueued=true;
    queueMicrotask(()=>{this.#renderQueued=false;if(this.isConnected)this.#render();});
  }
  #render() {
    const template=this.querySelector('template[data-row]');
    if (template) return this.#renderTemplate(template);
    if (this.querySelector(':scope > table:not([data-metaproject-auto])')) return;
    this.#renderAuto();
  }
  #renderTemplate(template) {
    this.querySelector(':scope > table[data-metaproject-auto]')?.remove();
    const container=template.parentElement;
    if (!container) return;
    for (const generated of container.querySelectorAll(':scope > [data-metaproject-row]')) generated.remove();
    const rows=Array.isArray(this.#resource)?this.#resource:[];
    const rowSchema=this.#schema?.type==='array'?this.#schema.items:null;
    for (const row of rows) {
      const fragment=template.content.cloneNode(true);
      for (const root of [...fragment.children]) {
        root.setAttribute('data-metaproject-row','');
        ROW_CONTEXTS.set(root,{resource:row,schema:rowSchema});
      }
      container.insertBefore(fragment,template);
    }
  }
  #renderAuto() {
    const authored=authoredActionTemplates(this);
    for (const source of authored) markActionTemplate(source);
    const overrides=componentActionOverrides(this);
    const actionTemplates=overrides.length?overrides:authored;

    let table=this.querySelector(':scope > table[data-metaproject-auto]');
    if (!table) { table=document.createElement('table');table.setAttribute('data-metaproject-auto','');this.append(table); }
    const model=tableModel(this.#resource,this.#schema,this.#columns);
    const thead=document.createElement('thead'), head=document.createElement('tr');
    for (const column of model.columns) { const th=document.createElement('th');th.textContent=column.label;head.append(th); }
    if (actionTemplates.length) { const th=document.createElement('th');th.textContent='Actions';head.append(th); }
    thead.append(head);
    const tbody=document.createElement('tbody');
    for (const row of model.rows) {
      const tr=document.createElement('tr');
      tr.setAttribute('data-metaproject-row','');
      ROW_CONTEXTS.set(tr,{resource:row.resource,schema:row.schema});
      for (const column of model.columns) { const td=document.createElement('td');td.textContent=formatValue(column.read(row));tr.append(td); }
      if (actionTemplates.length) {
        const td=document.createElement('td');
        td.setAttribute('data-metaproject-actions','');
        for (const source of actionTemplates) td.append(cloneActionTemplate(source));
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.replaceChildren(thead,tbody);
  }
  #rowContext(event) {
    for (const node of event.composedPath()) {
      if (ROW_CONTEXTS.has(node)) return ROW_CONTEXTS.get(node);
      if (node===this) break;
    }
    return {resource:this.#resource,schema:this.#schema};
  }
  #provideContext(event) {
    if (event.target === this) return;
    const detail=event.detail;
    if (typeof detail?.callback !== 'function') return;
    event.stopPropagation();
    const context=this.#rowContext(event);
    detail.callback(context.resource,context.schema);
    if (detail.subscribe) {
      const subscription={callback:detail.callback,context};
      this.#subscriptions.add(subscription);
      detail.unsubscribe=()=>this.#subscriptions.delete(subscription);
    }
  }
  #resourceChange(event) {
    const resource=event.detail?.resource;
    if (resource===undefined) return;
    event.stopPropagation();
    for (const item of [...this.#subscriptions]) if (item.context.resource===resource) item.callback(resource,item.context.schema);
  }
  #action(event) {
    const element=actionElementForEvent(event,this);
    if (!element || !claimDataActionEvent(event)) return;
    event.preventDefault?.();
    emitDataAction(element,this.#rowContext(event).resource,event);
  }
}

function authoredActionTemplates(table){
  return [...table.children].filter(element=>{
    if (!(element instanceof Element)) return false;
    if (element.matches('table,template[data-row]')) return false;
    if (element.hasAttribute('data-metaproject-auto')) return false;
    return hasActionIntent(element);
  });
}
function componentActionOverrides(table){
  const root=table.getRootNode?.();
  const host=componentHost(table);
  if (!host || root?.querySelector?.('data-table')!==table) return [];
  return [...host.children].filter(element=>hasActionIntent(element));
}
function componentHost(table){
  const root=table.getRootNode?.();
  const host=root?.host;
  return typeof Element!=='undefined'&&host instanceof Element?host:null;
}
function hasActionIntent(element){return element.hasAttribute('data-action')||element.hasAttribute('data-operation')||Boolean(element.querySelector?.('[data-action],[data-operation]'));}
function markActionTemplate(element){
  if (!element.hasAttribute(ACTION_TEMPLATE_ATTRIBUTE)) {
    element.setAttribute(ACTION_TEMPLATE_ATTRIBUTE,element.hasAttribute('hidden')?'hidden':'visible');
    element.toggleAttribute('hidden',true);
  }
}
function cloneActionTemplate(source){
  const clone=source.cloneNode(true);
  const templateState=source.getAttribute(ACTION_TEMPLATE_ATTRIBUTE);
  const authoredHidden=templateState?templateState==='hidden':source.hasAttribute('hidden');
  clone.removeAttribute(ACTION_TEMPLATE_ATTRIBUTE);
  clone.toggleAttribute('hidden',authoredHidden);
  return clone;
}
function directAuthoredChildrenChanged(record,table){
  if (record.target!==table) return false;
  const changed=[...record.addedNodes,...record.removedNodes].filter(node=>node instanceof Element);
  return changed.some(element=>!element.hasAttribute?.('data-metaproject-auto'));
}

function tableModel(resource,schema,configuredColumns){
  if(Array.isArray(resource)){
    const itemSchema=schema?.type==='array'?schema.items:null;
    const objectRow=resource.find(value=>value&&typeof value==='object'&&!Array.isArray(value));
    if(objectRow){
      const columns=columnModel(configuredColumns,itemSchema,objectRow);
      return{columns,rows:resource.map(value=>({resource:value,schema:itemSchema,value}))};
    }
    return{columns:[{field:'value',label:'Value',read:row=>row.value}],rows:resource.map(value=>({resource:value,schema:itemSchema,value}))};
  }
  if(resource&&typeof resource==='object'){
    return{
      columns:[{field:'field',label:'Field',read:row=>row.name},{field:'value',label:'Value',read:row=>row.value}],
      rows:Object.entries(resource).map(([name,value])=>({resource:{field:name,value},schema:null,name,value}))
    };
  }
  return{columns:[{field:'value',label:'Value',read:row=>row.value}],rows:resource==null?[]:[{resource,value:resource}]};
}
function columnModel(configured,schema,row){
  const values=configured.length?configured:Object.keys(schema?.properties||row||{});
  return values.map(column=>{
    const field=typeof column==='string'?column:String(column?.field??column?.name??'');
    return{field,label:typeof column==='string'?humanizeField(field):String(column?.label??humanizeField(field)),read:item=>readDataField(item.resource,field)};
  }).filter(column=>column.field);
}
function actionElementForEvent(event,provider){for(const node of event.composedPath()){if(node===provider)break;if(node instanceof Element&&node.hasAttribute?.('data-action'))return node;}return null;}
function formatValue(value){if(value==null)return'';if(typeof value==='object'){try{return JSON.stringify(value);}catch{return String(value);}}return String(value);}
