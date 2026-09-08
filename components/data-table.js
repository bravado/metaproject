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

export class DataTable extends HTMLElement {
  #resourceInput;
  #resource;
  #schema;
  #contextUnsubscribe=null;
  #subscriptions=new Set();
  #renderQueued=false;
  #columns=[];
  #actions=[];

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
  set actions(value) { this.#actions=Array.isArray(value)?value:[]; this.#schedule(); }
  get actions() { return this.#actions; }

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
    let table=this.querySelector(':scope > table[data-metaproject-auto]');
    if (!table) { table=document.createElement('table');table.setAttribute('data-metaproject-auto','');this.append(table); }
    const model=tableModel(this.#resource,this.#schema,this.#columns);
    const actions=normalizeActions(this.#actions);
    const thead=document.createElement('thead'), head=document.createElement('tr');
    for (const column of model.columns) { const th=document.createElement('th');th.textContent=column.label;head.append(th); }
    if (actions.length) { const th=document.createElement('th');th.textContent='Actions';head.append(th); }
    thead.append(head);
    const tbody=document.createElement('tbody');
    for (const row of model.rows) {
      const tr=document.createElement('tr');
      tr.setAttribute('data-metaproject-row','');
      ROW_CONTEXTS.set(tr,{resource:row.resource,schema:row.schema});
      for (const column of model.columns) { const td=document.createElement('td');td.textContent=formatValue(column.read(row));tr.append(td); }
      if (actions.length) {
        const td=document.createElement('td');
        for (const action of actions) {
          const button=document.createElement('button');
          button.type='button';button.setAttribute('data-action',action.name);button.textContent=action.label;
          if(action.title)button.title=action.title;
          td.append(button);
        }
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
function normalizeActions(actions){
  return actions.map(action=>typeof action==='string'
    ?{name:action,label:humanizeField(action),title:''}
    :{name:String(action?.name??''),label:String(action?.label??humanizeField(action?.name??'')),title:String(action?.title??'')}
  ).filter(action=>action.name);
}
function actionElementForEvent(event,provider){for(const node of event.composedPath()){if(node===provider)break;if(node instanceof Element&&node.hasAttribute?.('data-action'))return node;}return null;}
function formatValue(value){if(value==null)return'';if(typeof value==='object'){try{return JSON.stringify(value);}catch{return String(value);}}return String(value);}
