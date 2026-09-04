import { LitElement, html, nothing, css } from 'lit';

export const RESOURCE_CONTEXT_REQUEST = 'metaproject-resource-context-request';
export const RESOURCE_CHANGE_EVENT = 'metaproject-resource-change';
const ACTION_EVENTS = new WeakSet();
const ROW_RESOURCES = new WeakMap();

let currentEnvironment = Object.freeze({
  api: Object.freeze({}),
  navigate: () => {
    throw new Error('Metaproject navigation is not configured. Call configureMetaproject({ navigate }).');
  }
});

/** Configure the runtime used by compiled application components. */
export function configureMetaproject(environment = {}) {
  currentEnvironment = Object.freeze({
    ...currentEnvironment,
    ...environment,
    api: environment.api ?? currentEnvironment.api,
    navigate: environment.navigate ?? currentEnvironment.navigate
  });
  return currentEnvironment;
}

export function metaprojectEnvironment() {
  return currentEnvironment;
}

/**
 * Provides resource context to descendants and translates native
 * data-action elements into semantic DOM events.
 */
export class ResourceContextController {
  constructor(host, resource) {
    this.host = host;
    this.resource = typeof resource === 'function' ? resource : () => resource;
    this.subscriptions = new Set();
    this.onContextRequest = event => this.#provideContext(event);
    this.onClick = event => this.#handleAction(event);
    this.onSubmit = event => this.#handleAction(event);
    this.onResourceChange = event => this.#handleResourceChange(event);
    host.addController?.(this);
  }

  hostConnected() {
    this.host.addEventListener(RESOURCE_CONTEXT_REQUEST, this.onContextRequest);
    this.host.addEventListener('click', this.onClick);
    this.host.addEventListener('submit', this.onSubmit);
    this.host.addEventListener(RESOURCE_CHANGE_EVENT, this.onResourceChange);
  }

  hostDisconnected() {
    this.host.removeEventListener(RESOURCE_CONTEXT_REQUEST, this.onContextRequest);
    this.host.removeEventListener('click', this.onClick);
    this.host.removeEventListener('submit', this.onSubmit);
    this.host.removeEventListener(RESOURCE_CHANGE_EVENT, this.onResourceChange);
    this.subscriptions.clear();
  }

  resourceChanged() {
    const value = this.resource();
    for (const callback of [...this.subscriptions]) callback(value);
  }

  #provideContext(event) {
    // Requests originating from the provider itself are allowed to bubble to a
    // parent provider. This lets a reusable component inherit a parent row
    // context before becoming a provider for its own descendants.
    if (event.target === this.host) return;
    const detail = event.detail;
    if (typeof detail?.callback !== 'function') return;
    event.stopPropagation();
    detail.callback(this.resource());
    if (detail.subscribe) {
      const callback = detail.callback;
      this.subscriptions.add(callback);
      detail.unsubscribe = () => this.subscriptions.delete(callback);
    }
  }

  #handleResourceChange(event) {
    if (event.target === this.host) return;
    event.stopPropagation();
    this.resourceChanged();
  }

  #handleAction(event) {
    if (ACTION_EVENTS.has(event)) return;
    const actionElement = actionElementForEvent(event, this.host);
    if (!actionElement) return;
    ACTION_EVENTS.add(event);
    if (event.type === 'submit') {
      event.preventDefault();
      if (!validateFormControls(event.target)) return;
    } else if (event.type === 'click') {
      // data-action buttons are semantic application actions, never native
      // browser form submissions. This also makes an omitted type="button"
      // safe inside a form.
      if ((actionElement instanceof HTMLButtonElement || actionElement instanceof HTMLInputElement) && actionElement.form) event.preventDefault();
      if (actionElement.hasAttribute('data-validate')) {
        const form=actionElement.form || actionElement.closest?.('form');
        if (form && !validateFormControls(form)) return;
      }
    }
    emitDataAction(actionElement, this.resource(), event);
  }
}

/** Request the nearest resource context. */
export function requestResourceContext(host, callback, { subscribe = false } = {}) {
  const detail = { callback, subscribe, unsubscribe: null };
  host.dispatchEvent(new CustomEvent(RESOURCE_CONTEXT_REQUEST, {
    detail,
    bubbles: true,
    composed: true
  }));
  return typeof detail.unsubscribe === 'function' ? detail.unsubscribe : () => {};
}

export class DataSource extends HTMLElement {
  #resource;
  #input;
  #version = 0;
  #controller;

  constructor() {
    super();
    this.#controller = new ResourceContextController(this, () => this.#resource);
  }

  connectedCallback() {
    if (!this.style.display) this.style.display = 'contents';
    this.#controller.hostConnected();
  }

  disconnectedCallback() {
    this.#controller.hostDisconnected();
  }

  set resource(value) {
    this.#input = value;
    const version = ++this.#version;
    if (isPromiseLike(value)) {
      this.toggleAttribute('loading', true);
      Promise.resolve(value).then(resource => {
        if (version !== this.#version) return;
        this.toggleAttribute('loading', false);
        this.#resource = resource;
        this.#controller.resourceChanged();
        this.dispatchEvent(new CustomEvent('data-loaded',{detail:{resource},bubbles:true,composed:true}));
      }).catch(error => {
        if (version !== this.#version) return;
        this.toggleAttribute('loading', false);
        this.dispatchEvent(new CustomEvent('data-error',{detail:{error},bubbles:true,composed:true}));
      });
      return;
    }
    this.toggleAttribute('loading', false);
    this.#resource = value;
    this.#controller.resourceChanged();
  }
  get resource() { return this.#input; }
  get resolvedResource() { return this.#resource; }
}

/**
 * Array resource provider. Authors supply valid table markup containing a
 * <template data-row>. The template is cloned once per resource and each row
 * becomes the resource context for data-label/custom context consumers.
 */
export class DataTable extends HTMLElement {
  #resource = [];
  #input = [];
  #version = 0;
  #renderQueued = false;
  #subscriptions = new Set();

  constructor() {
    super();
    this.onContextRequest = event => this.#provideContext(event);
    this.onClick = event => this.#handleAction(event);
    this.onSubmit = event => this.#handleAction(event);
    this.onResourceChange = event => this.#handleResourceChange(event);
  }

  connectedCallback() {
    if (!this.style.display) this.style.display = 'block';
    if (!this.style.maxWidth) this.style.maxWidth = '100%';
    if (!this.style.overflow) this.style.overflow = 'auto';
    this.addEventListener(RESOURCE_CONTEXT_REQUEST, this.onContextRequest);
    this.addEventListener('click', this.onClick);
    this.addEventListener('submit', this.onSubmit);
    this.addEventListener(RESOURCE_CHANGE_EVENT, this.onResourceChange);
    this.#scheduleRows();
  }

  disconnectedCallback() {
    this.removeEventListener(RESOURCE_CONTEXT_REQUEST, this.onContextRequest);
    this.removeEventListener('click', this.onClick);
    this.removeEventListener('submit', this.onSubmit);
    this.removeEventListener(RESOURCE_CHANGE_EVENT, this.onResourceChange);
    this.#subscriptions.clear();
  }

  set resource(value) {
    this.#input = value;
    const version = ++this.#version;
    if (isPromiseLike(value)) {
      this.toggleAttribute('loading', true);
      this.#resource = [];
      this.#scheduleRows();
      Promise.resolve(value).then(resource => {
        if (version !== this.#version) return;
        this.toggleAttribute('loading', false);
        this.#resource = resource;
        this.#scheduleRows();
        this.dispatchEvent(new CustomEvent('data-loaded',{detail:{resource},bubbles:true,composed:true}));
      }).catch(error => {
        if (version !== this.#version) return;
        this.toggleAttribute('loading', false);
        this.dispatchEvent(new CustomEvent('data-error',{detail:{error},bubbles:true,composed:true}));
      });
      return;
    }
    this.toggleAttribute('loading', false);
    this.#resource = value;
    this.#scheduleRows();
  }
  get resource() { return this.#input; }
  get resolvedResource() { return this.#resource; }

  #scheduleRows() {
    if (this.#renderQueued) return;
    this.#renderQueued = true;
    queueMicrotask(() => {
      this.#renderQueued = false;
      if (this.isConnected) this.#renderRows();
    });
  }

  #renderRows() {
    const template = this.querySelector('template[data-row]');
    if (!template) return;
    const container = template.parentElement;
    if (!container) return;
    for (const generated of container.querySelectorAll(':scope > [data-metaproject-row]')) generated.remove();
    const rows = Array.isArray(this.#resource) ? this.#resource : [];
    for (const row of rows) {
      const fragment = template.content.cloneNode(true);
      for (const root of [...fragment.children]) {
        root.setAttribute('data-metaproject-row', '');
        ROW_RESOURCES.set(root, row);
      }
      container.insertBefore(fragment, template);
    }
  }

  #rowResource(event) {
    for (const node of event.composedPath()) {
      if (ROW_RESOURCES.has(node)) return ROW_RESOURCES.get(node);
      if (node === this) break;
    }
    return this.#resource;
  }

  #provideContext(event) {
    const detail = event.detail;
    if (typeof detail?.callback !== 'function') return;
    event.stopPropagation();
    const resource = this.#rowResource(event);
    detail.callback(resource);
    if (detail.subscribe) {
      const subscription = { callback:detail.callback, resource };
      this.#subscriptions.add(subscription);
      detail.unsubscribe = () => this.#subscriptions.delete(subscription);
    }
  }

  #handleResourceChange(event) {
    const resource = event.detail?.resource;
    if (resource === undefined) return;
    event.stopPropagation();
    for (const subscription of [...this.#subscriptions]) {
      if (subscription.resource === resource) subscription.callback(resource);
    }
  }

  #handleAction(event) {
    if (ACTION_EVENTS.has(event)) return;
    const actionElement = actionElementForEvent(event, this);
    if (!actionElement) return;
    ACTION_EVENTS.add(event);
    if (event.type === 'submit') {
      event.preventDefault();
      if (!validateFormControls(event.target)) return;
    } else if (event.type === 'click') {
      if ((actionElement instanceof HTMLButtonElement || actionElement instanceof HTMLInputElement) && actionElement.form) event.preventDefault();
      if (actionElement.hasAttribute('data-validate')) {
        const form=actionElement.form || actionElement.closest?.('form');
        if (form && !validateFormControls(form)) return;
      }
    }
    emitDataAction(actionElement, this.#rowResource(event), event);
  }
}

export class DataLabel extends LitElement {
  static properties = {
    field: { type: String },
    resource: { attribute: false },
    _contextResource: { state: true }
  };

  constructor() {
    super();
    this.field = '';
    this.resource = undefined;
    this._contextResource = undefined;
    this.unsubscribe = null;
  }

  connectedCallback() {
    super.connectedCallback();
    queueMicrotask(() => {
      this.unsubscribe?.();
      this.unsubscribe = requestResourceContext(this, resource => {
        this._contextResource = resource;
        this.requestUpdate();
      }, { subscribe: true });
    });
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    super.disconnectedCallback();
  }

  render() {
    const source = this.resource !== undefined ? this.resource : this._contextResource;
    const value = this.field ? readDataField(source, this.field) : source;
    return html`<span part="value">${value ?? nothing}</span>`;
  }
}


class FormBoundControl extends LitElement {
  static properties = {
    field: { type:String },
    label: { type:String },
    resource: { attribute:false },
    required: { type:Boolean },
    disabled: { type:Boolean },
    _contextResource: { state:true }
  };

  static styles = css`
    :host{display:block;min-width:0;font:inherit;color:inherit}
    label{display:grid;gap:5px;color:inherit;font:inherit}
    .label{font-size:12px;font-weight:650;color:#475569}
    input,select,textarea{width:100%;max-width:100%;min-width:0;box-sizing:border-box;font:inherit;color:inherit;background:#fff;border:1px solid #cbd5e1;border-radius:7px;padding:8px 9px;outline:none}
    input:focus,select:focus,textarea:focus{border-color:#7c98ef;box-shadow:0 0 0 2px rgba(49,87,213,.12)}
    input:disabled,select:disabled,textarea:disabled{background:#f1f5f9;color:#94a3b8}
  `;

  constructor() {
    super();
    this.field = '';
    this.label = '';
    this.resource = undefined;
    this.required = false;
    this.disabled = false;
    this._contextResource = undefined;
    this.unsubscribe = null;
  }

  connectedCallback() {
    super.connectedCallback();
    queueMicrotask(() => {
      this.unsubscribe?.();
      this.unsubscribe = requestResourceContext(this, resource => {
        this._contextResource = resource;
        this.requestUpdate();
      }, { subscribe:true });
    });
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    super.disconnectedCallback();
  }

  currentResource() {
    return this.resource !== undefined ? this.resource : this._contextResource;
  }

  currentValue() {
    return this.field ? readDataField(this.currentResource(), this.field) : this.currentResource();
  }

  updateValue(value, originalEvent) {
    const resource = this.currentResource();
    if (resource == null || typeof resource !== 'object') return;
    if (!this.field) throw new Error(`${this.localName} requires a field attribute when bound to an object resource.`);
    writeDataField(resource, this.field, value);
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent(RESOURCE_CHANGE_EVENT, {
      detail:{ resource, field:this.field, value, originalEvent },
      bubbles:true,
      composed:true
    }));
    this.dispatchEvent(new CustomEvent('field-change', {
      detail:{ resource, field:this.field, value, originalEvent },
      bubbles:true,
      composed:true
    }));
  }

  checkValidity() {
    if (this.disabled) return true;
    const control = this.renderRoot?.querySelector('input,select,textarea');
    return control?.checkValidity?.() ?? true;
  }

  reportValidity() {
    if (this.disabled) return true;
    const control = this.renderRoot?.querySelector('input,select,textarea');
    return control?.reportValidity?.() ?? this.checkValidity();
  }

  fieldLabel() {
    return this.label || humanizeField(this.field);
  }
}

export class FormInput extends FormBoundControl {
  static properties = {
    ...FormBoundControl.properties,
    type: { type:String },
    placeholder: { type:String },
    autocomplete: { type:String }
  };

  constructor() {
    super();
    this.type = 'text';
    this.placeholder = '';
    this.autocomplete = '';
  }

  render() {
    const value = this.currentValue();
    return html`<label>
      ${this.fieldLabel() ? html`<span class="label" part="label">${this.fieldLabel()}</span>` : nothing}
      <input
        part="input"
        type=${this.type || 'text'}
        .value=${value == null ? '' : String(value)}
        placeholder=${this.placeholder || nothing}
        autocomplete=${this.autocomplete || nothing}
        ?required=${this.required}
        ?disabled=${this.disabled}
        @input=${event => this.updateValue(coerceInputValue(event.currentTarget, this.type), event)}
      >
    </label>`;
  }
}

export class FormTextarea extends FormBoundControl {
  static properties = {
    ...FormBoundControl.properties,
    placeholder: { type:String },
    rows: { type:Number }
  };

  constructor() {
    super();
    this.placeholder = '';
    this.rows = 4;
  }

  render() {
    const value = this.currentValue();
    return html`<label>
      ${this.fieldLabel() ? html`<span class="label" part="label">${this.fieldLabel()}</span>` : nothing}
      <textarea
        part="textarea"
        .value=${value == null ? '' : String(value)}
        rows=${this.rows || 4}
        placeholder=${this.placeholder || nothing}
        ?required=${this.required}
        ?disabled=${this.disabled}
        @input=${event => this.updateValue(event.currentTarget.value, event)}
      ></textarea>
    </label>`;
  }
}

export class FormSelect extends FormBoundControl {
  static properties = {
    ...FormBoundControl.properties,
    _options: { state:true }
  };

  constructor() {
    super();
    this._options = [];
  }

  connectedCallback() {
    super.connectedCallback();
    queueMicrotask(() => this.#syncOptions());
  }

  #syncOptions() {
    this._options = [...this.querySelectorAll(':scope > option')].map(option => ({
      value:option.value,
      label:option.textContent || option.value,
      disabled:option.disabled
    }));
  }

  render() {
    const value = this.currentValue();
    return html`<label>
      ${this.fieldLabel() ? html`<span class="label" part="label">${this.fieldLabel()}</span>` : nothing}
      <select
        part="select"
        .value=${value == null ? '' : String(value)}
        ?required=${this.required}
        ?disabled=${this.disabled}
        @change=${event => this.updateValue(event.currentTarget.value, event)}
      >
        ${this._options.map(option => html`<option value=${option.value} ?disabled=${option.disabled}>${option.label}</option>`)}
      </select>
      <slot hidden @slotchange=${() => this.#syncOptions()}></slot>
    </label>`;
  }
}

export class FormCheckbox extends FormBoundControl {
  static styles = [
    FormBoundControl.styles,
    css`
      label{display:flex;align-items:center;gap:8px;font-weight:500}
      input{width:auto;margin:0;box-shadow:none}
      .text{font-size:13px;color:inherit}
    `
  ];

  render() {
    return html`<label>
      <input
        part="input"
        type="checkbox"
        .checked=${Boolean(this.currentValue())}
        ?required=${this.required}
        ?disabled=${this.disabled}
        @change=${event => this.updateValue(event.currentTarget.checked, event)}
      >
      <span class="text" part="label"><slot>${this.fieldLabel()}</slot></span>
    </label>`;
  }
}

export class FormRadio extends FormBoundControl {
  static properties = {
    ...FormBoundControl.properties,
    optionValue: { attribute:'value' }
  };

  static styles = [
    FormBoundControl.styles,
    css`
      label{display:flex;align-items:center;gap:8px;font-weight:500}
      input{width:auto;margin:0;box-shadow:none}
      .text{font-size:13px;color:inherit}
    `
  ];

  constructor() {
    super();
    this.optionValue = '';
  }

  render() {
    const current = this.currentValue();
    return html`<label>
      <input
        part="input"
        type="radio"
        name=${this.field || ''}
        value=${this.optionValue}
        .checked=${String(current ?? '') === String(this.optionValue)}
        ?required=${this.required}
        ?disabled=${this.disabled}
        @change=${event => {
          if (event.currentTarget.checked) this.updateValue(this.optionValue, event);
        }}
      >
      <span class="text" part="label"><slot>${this.label || this.optionValue}</slot></span>
    </label>`;
  }
}

export function readDataField(resource, path) {
  if (!path) return resource;
  return String(path).split('.').reduce((value, key) => value?.[key], resource);
}

export function writeDataField(resource, path, value) {
  if (!resource || typeof resource !== 'object') return resource;
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return resource;
  let target = resource;
  for (const key of parts.slice(0, -1)) {
    if (!target[key] || typeof target[key] !== 'object') target[key] = {};
    target = target[key];
  }
  target[parts.at(-1)] = value;
  return resource;
}

function coerceInputValue(input, type) {
  if (type === 'number' || type === 'range') return input.value === '' ? null : input.valueAsNumber;
  return input.value;
}

function humanizeField(field) {
  const tail = String(field || '').split('.').at(-1) || '';
  return tail.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
}

export function emitDataAction(element, resource, originalEvent) {
  const action = element.getAttribute('data-action')?.trim();
  if (!action) return;
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(action)) {
    console.warn(`Ignoring invalid data-action event name: ${action}`);
    return;
  }
  element.dispatchEvent(new CustomEvent(action, {
    bubbles: true,
    composed: true,
    detail: { action, resource, originalEvent }
  }));
}

function validateFormControls(form) {
  if (!(form instanceof HTMLFormElement)) return true;
  let valid = true;
  for (const control of form.querySelectorAll('form-input,form-textarea,form-select,form-checkbox,form-radio')) {
    if (typeof control.reportValidity === 'function' && !control.reportValidity()) valid = false;
  }
  return valid;
}

function actionElementForEvent(event, provider) {
  // For form submissions the submitter owns the semantic action. This lets
  // authors use ordinary forms and put data-action only on the button:
  //   <form>...<button type="submit" data-action="save">Save</button></form>
  // Keep form[data-action] as a backwards-compatible fallback.
  if (event.type === 'submit') {
    const submitter = event.submitter;
    if (submitter instanceof Element && submitter.hasAttribute?.('data-action')) return submitter;
    if (event.target instanceof HTMLFormElement && event.target.hasAttribute('data-action')) return event.target;
  }

  for (const node of event.composedPath()) {
    if (node === provider) break;
    if (!(node instanceof Element) || !node.hasAttribute?.('data-action')) continue;
    if (event.type === 'click') {
      // The button itself owns the semantic action. Native submission is
      // prevented by the provider before the action is emitted.
      if (node instanceof HTMLFormElement) continue;
    }
    return node;
  }
  return null;
}


function isPromiseLike(value) {
  return value != null && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function';
}

export function registerMetaprojectDataComponents(registry = customElements) {
  if (!registry.get('data-source')) registry.define('data-source', DataSource);
  if (!registry.get('data-table')) registry.define('data-table', DataTable);
  if (!registry.get('data-label')) registry.define('data-label', DataLabel);
  if (!registry.get('form-input')) registry.define('form-input', FormInput);
  if (!registry.get('form-textarea')) registry.define('form-textarea', FormTextarea);
  if (!registry.get('form-select')) registry.define('form-select', FormSelect);
  if (!registry.get('form-checkbox')) registry.define('form-checkbox', FormCheckbox);
  if (!registry.get('form-radio')) registry.define('form-radio', FormRadio);
}

if (typeof customElements !== 'undefined') registerMetaprojectDataComponents();
