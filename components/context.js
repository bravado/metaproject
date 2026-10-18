export const RESOURCE_CONTEXT_REQUEST = 'metaproject-resource-context-request';
export const RESOURCE_CHANGE_EVENT = 'metaproject-resource-change';
export const METAPROJECT_ACTION_EVENT = 'metaproject-action';
const ACTION_EVENTS = new WeakSet();

export function claimDataActionEvent(event){if(ACTION_EVENTS.has(event))return false;ACTION_EVENTS.add(event);return true;}

export function requestResourceContext(host, callback, { subscribe = false } = {}) {
  const detail = { callback, subscribe, unsubscribe:null };
  host.dispatchEvent(new CustomEvent(RESOURCE_CONTEXT_REQUEST, { detail, bubbles:true, composed:true }));
  return typeof detail.unsubscribe === 'function' ? detail.unsubscribe : () => {};
}

export class ResourceContextController {
  constructor(host, resource, schema = () => null) {
    this.host = host;
    this.resource = typeof resource === 'function' ? resource : () => resource;
    this.schema = typeof schema === 'function' ? schema : () => schema;
    this.subscribers = new Set();
    this.onContext = event => this.#context(event);
    this.onClick = event => this.#action(event);
    this.onSubmit = event => this.#action(event);
    this.onChange = event => this.#change(event);
    host.addController?.(this);
  }
  hostConnected() {
    this.host.addEventListener(RESOURCE_CONTEXT_REQUEST, this.onContext);
    this.host.addEventListener('click', this.onClick);
    this.host.addEventListener('submit', this.onSubmit);
    this.host.addEventListener(RESOURCE_CHANGE_EVENT, this.onChange);
  }
  hostDisconnected() {
    this.host.removeEventListener(RESOURCE_CONTEXT_REQUEST, this.onContext);
    this.host.removeEventListener('click', this.onClick);
    this.host.removeEventListener('submit', this.onSubmit);
    this.host.removeEventListener(RESOURCE_CHANGE_EVENT, this.onChange);
    this.subscribers.clear();
  }
  resourceChanged() {
    const resource=this.resource(), schema=this.schema();
    for (const callback of [...this.subscribers]) callback(resource, schema);
  }
  #context(event) {
    if (event.target === this.host) return;
    const detail=event.detail;
    if (typeof detail?.callback !== 'function') return;
    event.stopPropagation();
    detail.callback(this.resource(), this.schema());
    if (detail.subscribe) {
      this.subscribers.add(detail.callback);
      detail.unsubscribe=()=>this.subscribers.delete(detail.callback);
    }
  }
  #change(event) {
    if (event.target === this.host) return;
    event.stopPropagation();
    this.resourceChanged();
  }
  #action(event) {
    const actionElement=actionElementForEvent(event,this.host);
    if (!actionElement || !claimDataActionEvent(event)) return;
    if (event.type === 'submit') event.preventDefault();
    if (actionElement.hasAttribute?.('data-validate')) {
      const form=actionElement.form || actionElement.closest?.('form');
      if (form && !validateFormControls(form)) return;
    }
    emitDataAction(actionElement,this.resource(),event);
  }
}

export function readDataField(resource,path){
  if(!path)return resource;
  return String(path).split('.').reduce((value,key)=>value?.[key],resource);
}

export function writeDataField(resource,path,value){
  if(!resource||typeof resource!=='object')return resource;
  const parts=String(path||'').split('.').filter(Boolean);
  let target=resource;
  for(const key of parts.slice(0,-1)){
    if(!target[key]||typeof target[key]!=='object')target[key]={};
    target=target[key];
  }
  if(parts.length)target[parts.at(-1)]=value;
  return resource;
}

export function emitDataAction(element,resource,originalEvent){
  const action=element.getAttribute('data-action')?.trim();
  if(!action||!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(action))return;
  const detail={action,resource,originalEvent};
  element.dispatchEvent(new CustomEvent(action,{bubbles:true,composed:true,detail}));
  element.dispatchEvent(new CustomEvent(METAPROJECT_ACTION_EVENT,{bubbles:true,composed:true,detail:{action,resource}}));
}

export function humanizeField(value){
  return String(value||'').replace(/[_-]+/g,' ').replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/^./,char=>char.toUpperCase());
}

function actionElementForEvent(event,provider){
  if(event.type==='submit'&&event.submitter?.hasAttribute?.('data-action'))return event.submitter;
  for(const node of event.composedPath()){
    if(node===provider)break;
    if(node instanceof Element&&node.hasAttribute?.('data-action'))return node;
  }
  return null;
}

function validateFormControls(form){
  if(!(form instanceof HTMLFormElement))return true;
  let valid=true;
  for(const control of form.querySelectorAll('form-input,form-textarea,form-select,form-checkbox,form-radio')){
    if(control.reportValidity&&!control.reportValidity())valid=false;
  }
  return valid;
}
