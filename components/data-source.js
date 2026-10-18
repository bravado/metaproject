import {
  getDataOperation,
  invokeDataRequest,
  subscribeDataRuntime,
  invalidateDataRuntime,
  selectDataSchema
} from '../data-source/index.js';
import { ResourceContextController, requestResourceContext } from './context.js';
import { operationBodyFromResource } from './operation-body.js';

export class DataSourceElement extends HTMLElement {
  static get observedAttributes() { return ['request','select','scope']; }
  #resource;
  #schema;
  #client=null;
  #explicitScope=null;
  #controller;
  #runtimeUnsubscribe=null;
  #observer=null;
  #version=0;

  constructor() {
    super();
    this.#controller=new ResourceContextController(this,()=>this.#resource,()=>this.#schema);
    this._onOperation=event=>this.#operationEvent(event);
  }
  connectedCallback() {
    if (!this.style.display) this.style.display='contents';
    this.#controller.hostConnected();
    this.addEventListener('click',this._onOperation);
    this.#runtimeUnsubscribe=subscribeDataRuntime(event=>{
      if (event?.type === 'invalidate' && this.request) this.load();
    }, { scope:this.scope });
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
    this.removeEventListener('click',this._onOperation);
    this.#controller.hostDisconnected();
  }
  attributeChangedCallback(name) {
    if (!this.isConnected) return;
    if (name === 'scope') {
      this.#runtimeUnsubscribe?.();
      this.#runtimeUnsubscribe=subscribeDataRuntime(event=>{ if (event?.type === 'invalidate' && this.request) this.load(); }, { scope:this.scope });
    }
    this.load();
  }
  get scope() {
    if (this.#explicitScope) return this.#explicitScope;
    if (this.getAttribute('scope')) return this.getAttribute('scope');
    const host = this.getRootNode()?.host;
    return host?.metaprojectScope || host?.getAttribute?.('scope') || 'default';
  }
  set scope(value) {
    this.#explicitScope = value == null ? null : String(value);
    if (this.isConnected) { this.#runtimeUnsubscribe?.(); this.#runtimeUnsubscribe=subscribeDataRuntime(event=>{ if (event?.type === 'invalidate' && this.request) this.load(); }, { scope:this.scope }); this.load(); }
  }
  get request() { return this.getAttribute('request') || ''; }
  set request(value) { value == null ? this.removeAttribute('request') : this.setAttribute('request',String(value)); }
  get select() { return this.getAttribute('select') || ''; }
  set select(value) { value == null ? this.removeAttribute('select') : this.setAttribute('select',String(value)); }
  get client() { return this.#client; }
  set client(value) { this.#client=value || null; if (this.isConnected) this.load(); }
  get resource() { return this.#resource; }
  get schema() { return this.#schema; }
  refresh() { invalidateDataRuntime({scope:this.scope,reason:'refresh'}); }

  load() {
    const operationId=this.request;
    if (!operationId || !this.isConnected) return this.#resource;
    const operation=getDataOperation(operationId, this.scope);
    if (!operation) return this.#fail(new Error(`Unknown OpenAPI operation: ${operationId}`));
    if (!['GET','HEAD'].includes(String(operation.method).toUpperCase())) {
      return this.#fail(new Error(`<data-source request="${operationId}"> must reference a GET/HEAD operation.`));
    }
    let result;
    try { result=invokeDataRequest(operationId,this.#parameters(operation),{scope:this.scope,client:this.#client || undefined}); }
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

  #parameters(operation,resource) {
    const values={};
    for (const parameter of operation.parameters || []) {
      const attribute=camelToKebab(parameter.name);
      if (this.hasAttribute(attribute)) values[parameter.name]=this.getAttribute(attribute);
      else if (this[parameter.name] !== undefined && this[parameter.name] !== '') values[parameter.name]=this[parameter.name];
      else if (resource && typeof resource === 'object' && resource[parameter.name] !== undefined) values[parameter.name]=resource[parameter.name];
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

  #operationEvent(event) {
    const path=event.composedPath();
    const trigger=path.find(node=>node instanceof Element&&node.hasAttribute?.('data-operation'));
    if (!trigger) return;
    const nearest=path.find(node=>node instanceof DataSourceElement);
    if (nearest !== this) return;
    const operationId=trigger.getAttribute('data-operation')?.trim();
    if (!operationId) return;
    const operation=getDataOperation(operationId, this.scope);
    if (!operation) return this.#fail(new Error(`Unknown OpenAPI operation: ${operationId}`));

    event.preventDefault();
    event.stopPropagation();

    const form=path.find(node=>node?.localName==='data-form');
    if (operation.requestBody && typeof form?.reportValidity==='function' && !form.reportValidity()) return;

    let resource;
    requestResourceContext(trigger,value=>{resource=value;});

    let result;
    try {
      result=invokeDataRequest(operationId,this.#parameters(operation,resource),{
        scope:this.scope,client:this.#client || undefined,
        body:operationBodyFromResource(operation,resource)
      });
    } catch (error) { return this.#fail(error); }

    Promise.resolve(result).then(value=>{
      trigger.dispatchEvent(new CustomEvent('operation-complete',{
        detail:{operationId,resource,value},
        bubbles:true,
        composed:true
      }));
    },error=>this.#fail(error));
  }
}

function selectValue(value,path){return String(path||'').split('.').filter(Boolean).reduce((current,key)=>current?.[key],value);}
function camelToKebab(value){return String(value||'').replace(/([a-z0-9])([A-Z])/g,'$1-$2').replace(/_/g,'-').toLowerCase();}
function isPromiseLike(value){return value!=null&&(typeof value==='object'||typeof value==='function')&&typeof value.then==='function';}
