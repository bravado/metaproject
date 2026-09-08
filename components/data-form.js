import { LitElement, html, nothing, css } from 'lit';
import {
  RESOURCE_CHANGE_EVENT,
  requestResourceContext,
  readDataField,
  writeDataField,
  humanizeField
} from './context.js';

export class DataForm extends LitElement {
  static properties={resource:{attribute:false},_value:{state:true},_schema:{state:true}};
  static styles=css`
    :host{display:block;font:inherit;color:inherit}.form{display:grid;gap:12px}.field{display:grid;gap:5px}.label{font-size:12px;font-weight:650;color:#475569}
    input,select,textarea{width:100%;box-sizing:border-box;font:inherit;border:1px solid #cbd5e1;border-radius:7px;padding:8px 9px;background:#fff}input[type=checkbox]{width:auto}
    button{justify-self:start;border:0;border-radius:7px;padding:8px 13px;background:#3157d5;color:white;font:inherit;cursor:pointer}.empty{color:#64748b}
  `;
  constructor(){super();this.resource=undefined;this._value=undefined;this._schema=null;this._contextUnsubscribe=null;}
  connectedCallback(){
    super.connectedCallback();
    queueMicrotask(()=>{
      if(this.resource===undefined)this._contextUnsubscribe=requestResourceContext(this,(resource,schema)=>this.#setContext(resource,schema),{subscribe:true});
    });
  }
  disconnectedCallback(){this._contextUnsubscribe?.();super.disconnectedCallback();}
  updated(changed){if(changed.has('resource')&&this.resource!==undefined)this.#setContext(this.resource,null);}
  render(){
    const value=this._value;
    if(!value||typeof value!=='object'||Array.isArray(value))return html`<div class="empty">No object resource.</div>`;
    const keys=fieldNames(value,this._schema);
    return html`<div class="form" role="form">
      ${keys.map(name=>this.#field(name,value[name],this._schema?.properties?.[name]))}
      <button type="button" @click=${()=>this.#save()}>Save</button>
    </div>`;
  }
  #setContext(resource,schema){this._schema=schema||null;this._value=cloneValue(resource);this.requestUpdate();}
  #field(name,value,schema){
    const label=humanizeField(name), required=Boolean(this._schema?.required?.includes(name)), disabled=Boolean(schema?.readOnly);
    if(Array.isArray(schema?.enum))return html`<label class="field"><span class="label">${label}</span><select ?required=${required} ?disabled=${disabled} .value=${String(value??'')} @change=${e=>this.#set(name,e.currentTarget.value)}>${schema.enum.map(option=>html`<option value=${String(option)}>${String(option)}</option>`)}</select></label>`;
    const type=schema?.type||runtimeType(value);
    if(type==='boolean')return html`<label class="field"><span class="label">${label}</span><input type="checkbox" ?disabled=${disabled} .checked=${Boolean(value)} @change=${e=>this.#set(name,e.currentTarget.checked)}></label>`;
    if(type==='object'||type==='array')return html`<label class="field"><span class="label">${label}</span><textarea ?required=${required} ?disabled=${disabled} .value=${formatJson(value)} @input=${e=>this.#setJson(name,e.currentTarget.value)}></textarea></label>`;
    const inputType=type==='integer'||type==='number'?'number':schema?.format==='email'?'email':schema?.format==='date'?'date':schema?.format==='date-time'?'datetime-local':'text';
    return html`<label class="field"><span class="label">${label}</span><input type=${inputType} ?required=${required} ?disabled=${disabled} .value=${value==null?'':String(value)} @input=${e=>this.#set(name,inputType==='number'?(e.currentTarget.value===''?null:e.currentTarget.valueAsNumber):e.currentTarget.value)}></label>`;
  }
  #set(name,value){if(this._value&&typeof this._value==='object'){this._value[name]=value;this.requestUpdate();}}
  #setJson(name,text){try{this.#set(name,JSON.parse(text));}catch{/* keep last valid value */}}
  #save(){
    for(const control of this.renderRoot.querySelectorAll('input,select,textarea')){
      if(typeof control.reportValidity==='function'&&!control.reportValidity())return;
    }
    this.dispatchEvent(new CustomEvent('save',{detail:{resource:cloneValue(this._value)},bubbles:true,composed:true}));
  }
}

export class DataLabel extends LitElement {
  static properties={field:{type:String},resource:{attribute:false},_contextResource:{state:true}};
  constructor(){super();this.field='';this.resource=undefined;this._contextResource=undefined;this.unsubscribe=null;}
  connectedCallback(){super.connectedCallback();queueMicrotask(()=>{this.unsubscribe=requestResourceContext(this,resource=>{this._contextResource=resource;this.requestUpdate();},{subscribe:true});});}
  disconnectedCallback(){this.unsubscribe?.();super.disconnectedCallback();}
  render(){const source=this.resource!==undefined?this.resource:this._contextResource;const value=this.field?readDataField(source,this.field):source;return html`<span part="value">${formatDisplay(value)}</span>`;}
}

class FormBoundControl extends LitElement {
  static properties={field:{type:String},label:{type:String},resource:{attribute:false},required:{type:Boolean},disabled:{type:Boolean},_contextResource:{state:true}};
  static styles=css`:host{display:block}label{display:grid;gap:5px}.label{font-size:12px;font-weight:650;color:#475569}input,select,textarea{width:100%;box-sizing:border-box;font:inherit;border:1px solid #cbd5e1;border-radius:7px;padding:8px 9px}`;
  constructor(){super();this.field='';this.label='';this.resource=undefined;this.required=false;this.disabled=false;this._contextResource=undefined;this.unsubscribe=null;}
  connectedCallback(){super.connectedCallback();queueMicrotask(()=>{this.unsubscribe=requestResourceContext(this,resource=>{this._contextResource=resource;this.requestUpdate();},{subscribe:true});});}
  disconnectedCallback(){this.unsubscribe?.();super.disconnectedCallback();}
  currentResource(){return this.resource!==undefined?this.resource:this._contextResource;}
  currentValue(){return this.field?readDataField(this.currentResource(),this.field):this.currentResource();}
  updateValue(value,originalEvent){
    const resource=this.currentResource();
    if(!resource||typeof resource!=='object'||!this.field)return;
    writeDataField(resource,this.field,value);
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent(RESOURCE_CHANGE_EVENT,{detail:{resource,field:this.field,value,originalEvent},bubbles:true,composed:true}));
  }
  fieldLabel(){return this.label||humanizeField(this.field);}
  reportValidity(){return this.renderRoot?.querySelector('input,select,textarea')?.reportValidity?.()??true;}
}

export class FormInput extends FormBoundControl {
  static properties={...FormBoundControl.properties,type:{type:String}};
  constructor(){super();this.type='text';}
  render(){const value=this.currentValue();return html`<label><span class="label">${this.fieldLabel()}</span><input type=${this.type} .value=${value==null?'':String(value)} ?required=${this.required} ?disabled=${this.disabled} @input=${e=>this.updateValue(this.type==='number'?(e.currentTarget.value===''?null:e.currentTarget.valueAsNumber):e.currentTarget.value,e)}></label>`;}
}
export class FormTextarea extends FormBoundControl {
  render(){return html`<label><span class="label">${this.fieldLabel()}</span><textarea .value=${this.currentValue()==null?'':String(this.currentValue())} ?required=${this.required} ?disabled=${this.disabled} @input=${e=>this.updateValue(e.currentTarget.value,e)}></textarea></label>`;}
}
export class FormSelect extends FormBoundControl {
  static properties={...FormBoundControl.properties,_options:{state:true}};
  constructor(){super();this._options=[];}
  connectedCallback(){super.connectedCallback();queueMicrotask(()=>this.#syncOptions());}
  #syncOptions(){this._options=[...this.querySelectorAll(':scope > option')].map(option=>({value:option.value,label:option.textContent||option.value,disabled:option.disabled}));this.requestUpdate();}
  render(){return html`<label><span class="label">${this.fieldLabel()}</span><select .value=${String(this.currentValue()??'')} ?required=${this.required} ?disabled=${this.disabled} @change=${e=>this.updateValue(e.currentTarget.value,e)}>${this._options.map(option=>html`<option value=${option.value} ?disabled=${option.disabled}>${option.label}</option>`)} </select><slot hidden @slotchange=${()=>this.#syncOptions()}></slot></label>`;}
}
export class FormCheckbox extends FormBoundControl {
  render(){return html`<label><input type="checkbox" .checked=${Boolean(this.currentValue())} ?disabled=${this.disabled} @change=${e=>this.updateValue(e.currentTarget.checked,e)}><span><slot>${this.fieldLabel()}</slot></span></label>`;}
}
export class FormRadio extends FormBoundControl {
  static properties={...FormBoundControl.properties,optionValue:{attribute:'value'}};
  constructor(){super();this.optionValue='';}
  render(){return html`<label><input type="radio" name=${this.field} value=${this.optionValue} .checked=${String(this.currentValue()??'')===String(this.optionValue)} ?disabled=${this.disabled} @change=${e=>{if(e.currentTarget.checked)this.updateValue(this.optionValue,e);}}><span><slot>${this.label||this.optionValue}</slot></span></label>`;}
}

function runtimeType(value){if(Array.isArray(value))return'array';if(value===null)return'string';return typeof value;}
function formatDisplay(value){if(value==null)return nothing;if(typeof value==='object')return formatJson(value);return String(value);}
function formatJson(value){try{return JSON.stringify(value,null,2);}catch{return String(value);}}
function fieldNames(value,schema){const fromSchema=Object.keys(schema?.properties||{});return fromSchema.length?fromSchema:Object.keys(value||{});}
function cloneValue(value){if(value===undefined)return undefined;if(typeof structuredClone==='function')return structuredClone(value);return JSON.parse(JSON.stringify(value));}
