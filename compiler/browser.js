import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { ResourceContextController, requestResourceContext, metaprojectEnvironment } from 'metaproject/components';
import { parseComponentSource, splitLitTemplate, designTimeProperties, BASE_COMPONENT_CSS } from './index.js';

/**
 * Define an HTML-first Metaproject component in the current browser registry.
 * Used by the canvas preview for projects opened through the File System API.
 * The production Vite plugin compiles the same source to a static JS module.
 */
export function defineBrowserComponent({ tag, path, source, css = '', helpers = {} }, registry = customElements) {
  const definition = parseComponentSource(source, { tag, path });
  if (registry.get(tag)) return { definition, elementClass:registry.get(tag) };
  const template = splitLitTemplate(definition.body);
  const propertyNames = definition.properties.map(x => x.name);
  const helperNames = Object.keys(helpers).filter(name => /^[A-Za-z_$][\w$]*$/.test(name));
  const evaluators = template.expressions.map(expression => {
    return Function('api','navigate','html','nothing',...propertyNames,...helperNames, `"use strict"; return (${expression});`);
  });
  const contextProperty = definition.contextProperty;

  class MetaprojectHtmlComponent extends LitElement {
    static properties = Object.fromEntries(definition.properties.map(prop => [prop.name, browserPropertyOptions(prop)]));
    static styles = unsafeCSS(`${BASE_COMPONENT_CSS}\n${css || ''}`);

    constructor() {
      super();
      for (const prop of definition.properties) if (prop.default !== undefined) this[prop.name] = clone(prop.default);
      if (contextProperty) this.__resourceContext = new ResourceContextController(this, () => this[contextProperty]);
    }

    connectedCallback() {
      super.connectedCallback();
      if (contextProperty) queueMicrotask(() => {
        if (this[contextProperty] === undefined) this.__contextSubscription = requestResourceContext(this, value => {
          if (this[contextProperty] === undefined) this[contextProperty] = value;
        }, { subscribe:true });
      });
    }

    disconnectedCallback() {
      this.__contextSubscription?.();
      super.disconnectedCallback();
    }

    updated(changed) {
      if (contextProperty && changed.has(contextProperty)) this.__resourceContext.resourceChanged();
    }

    render() {
      const { api, navigate } = metaprojectEnvironment();
      const propertyValues = propertyNames.map(name => this[name]);
      const helperValues = helperNames.map(name => helpers[name]);
      const values = evaluators.map((evaluate, index) => {
        try { return evaluate(api, navigate, html, nothing, ...propertyValues, ...helperValues); }
        catch (error) { throw new Error(`Expression failed in <${tag}> #${index + 1}: ${error.message}`); }
      });
      const strings = [...template.strings];
      strings.raw = [...template.strings];
      return html(strings, ...values);
    }
  }

  registry.define(tag, MetaprojectHtmlComponent);
  return { definition, elementClass:MetaprojectHtmlComponent };
}

export { designTimeProperties };

function browserPropertyOptions(prop) {
  const type = String(prop.type).toLowerCase();
  if (!['string','boolean','number','integer'].includes(type) || prop.attribute === 'false') return { attribute:false };
  if (type === 'boolean') return { type:Boolean };
  if (type === 'number' || type === 'integer') return { type:Number };
  return { type:String };
}
function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
