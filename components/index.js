import { configureDataRuntime } from '../data-source/index.js';
import { DataSourceElement } from './data-source.js';
import { DataTable } from './data-table.js';
import { DataForm, DataLabel, FormInput, FormTextarea, FormSelect, FormCheckbox, FormRadio } from './data-form.js';

export * from './context.js';
export * from './data-source.js';
export * from './data-table.js';
export * from './data-form.js';

let environment = Object.freeze({
  navigate:() => { throw new Error('Metaproject navigation is not configured.'); }
});

export function configureMetaproject(options = {}) {
  if (options.operations !== undefined || options.client !== undefined) {
    configureDataRuntime({ operations:options.operations, client:options.client });
  }
  environment=Object.freeze({
    ...environment,
    navigate:options.navigate ?? environment.navigate
  });
  return metaprojectEnvironment();
}

export function metaprojectEnvironment(){return Object.freeze({...environment});}

export function registerMetaprojectDataComponents(registry=customElements){
  const definitions=[
    ['data-source',DataSourceElement],['data-table',DataTable],['data-form',DataForm],['data-label',DataLabel],
    ['form-input',FormInput],['form-textarea',FormTextarea],['form-select',FormSelect],['form-checkbox',FormCheckbox],['form-radio',FormRadio]
  ];
  for(const [tag,klass] of definitions)if(!registry.get(tag))registry.define(tag,klass);
}
if(typeof customElements!=='undefined')registerMetaprojectDataComponents();
