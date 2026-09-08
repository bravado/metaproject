import {
  getDataOperation,
  invokeDataRequest,
  subscribeDataRuntime,
  invalidateDataRuntime,
  selectDataSchema
} from '../data-source/index.js';
import { ResourceContextController } from './context.js';

export class DataSourceElement extends HTMLElement {
  static get observedAttributes() { return ['request','save','select']; }
  #resource;
  #schema;
  #client=null;
  #controller;
  #runtimeUnsubscribe=null;
  #observer=null;
  #version=0;

  constructor() {
    super();
    this.#controller=new ResourceContextController(this,()=>this.#resource,()=>this.#schema);
    this._onSave=event=>this.#saveEvent(event);
  }
  connectedCallback() {
    if (!this.style.display) this.style.display='contents';
    this.#controller.hostConnected();
    this.addEventListener('save',this._onSave);
    this.#runtimeUnsubscribe=subscribeDataRuntime(event=>{
      if (event?.type === 'invalidate' && this.request) this.load();
    });
    this.#observer=new MutationObserver(records=>{
      if (records.some(record=>!['loading','error'].includes(record.attributeName))) this.load();
    });
    this.#observer.observe(this,{attributes:true});
    this.load();
  }
  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#observer=null;
    this.#runtimeUnsubscribe?.();
    this.#runtimeUnsubscribe=null;
    this.removeEventListener('save',this._onSave);
    this.#controller.hostDisconnected();
  }
  attributeChangedCallback() { if (this.isConnected) this.load(); }
  get request() { return this.getAttribute('request') || ''; }
  set request(value) { value == null ? this.removeAttribute('request') : this.setAttribute('request',String(value)); }
  get save() { return this.getAttribute('save') || ''; }
  set save(value) { value == null ? this.removeAttribute('save') : this.setAttribute('save',String(value)); }
  get select() { return this.getAttribute('select') || ''; }
  set select(value) { value == null ? this.removeAttribute('select') : this.setAttribute('select',String(value)); }
  get client() { return this.#client; }
  set client(value) { this.#client=value || null; if (this.isConnected) this.load(); }
  get resource() { return this.#resource; }
  get schema() { return this.#schema; }
  refresh() { invalidateDataRuntime({reason:'refresh'}); }

  load() {
    const operationId=this.request;
    if (!operationId || !this.isConnected) return this.#resource;
    const operation=getDataOperation(operationId);
    if (!operation) return this.#fail(new Error(`Unknown OpenAPI operation: ${operationId}`));
    if (!['GET','HEAD'].includes(String(operation.method).toUpperCase())) {
      return this.#fail(new Error(`<data-source request="${operationId}"> must reference a GET/HEAD operation.`));
    }
    let result;
    try { result=invokeDataRequest(operationId,this.#parameters(operation),{client:this.#client || undefined}); }
    catch (error) { return this.#fail(error); }
    const version=++this.#version;
    if (isPromiseLike(result)) {
      this.toggleAttribute('loading',true);
      Promise.resolve(result).then(value=>{
        if (version!==this.#version) return;
        this.toggleAttribute('loading',false);
        this.#apply(value,operation);
      },error=>{ if (version===this.#version) this.#fail(error); });
      return result;
    }
    this.toggleAttribute('loading',false);
    this.#apply(result,operation);
    return result;
  }

  #parameters(operation) {
    const values={};
    for (const parameter of operation.parameters || []) {
      const attribute=camelToKebab(parameter.name);
      if (this.hasAttribute(attribute)) values[parameter.name]=this.getAttribute(attribute);
      else if (this[parameter.name] !== undefined && this[parameter.name] !== '') values[parameter.name]=this[parameter.name];
    }
    return values;
  }

  #apply(value,operation) {
    this.removeAttribute('error');
    this.#resource=selectValue(value,this.select);
    this.#schema=selectDataSchema(operation.responseSchema,this.select);
    this.#controller.resourceChanged();
    this.dispatchEvent(new CustomEvent('data-loaded',{detail:{resource:this.#resource,schema:this.#schema},bubbles:true,composed:true}));
  }

  #fail(error) {
    this.toggleAttribute('loading',false);
    this.setAttribute('error','');
    this.dispatchEvent(new CustomEvent('data-error',{detail:{error},bubbles:true,composed:true}));
    return undefined;
  }

  #saveEvent(event) {
    const nearest=event.composedPath().find(node=>node instanceof DataSourceElement);
    if (nearest !== this || !this.save) return;
    event.stopPropagation();
    const operation=getDataOperation(this.save);
    if (!operation) return this.#fail(new Error(`Unknown OpenAPI operation: ${this.save}`));
    let result;
    try {
      result=invokeDataRequest(this.save,this.#parameters(operation),{
        client:this.#client || undefined,
        body:event.detail?.resource
      });
    } catch (error) { return this.#fail(error); }
    Promise.resolve(result).then(value=>{
      this.dispatchEvent(new CustomEvent('saved',{detail:{resource:event.detail?.resource,value},bubbles:true,composed:true}));
    },error=>this.#fail(error));
  }
}

function selectValue(value,path){return String(path||'').split('.').filter(Boolean).reduce((current,key)=>current?.[key],value);}
function camelToKebab(value){return String(value||'').replace(/([a-z0-9])([A-Z])/g,'$1-$2').replace(/_/g,'-').toLowerCase();}
function isPromiseLike(value){return value!=null&&(typeof value==='object'||typeof value==='function')&&typeof value.then==='function';}
