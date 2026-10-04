import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProject } from '../build/index.js';

async function fixture(scope,tag) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mp-remote-'));
  await fs.mkdir(path.join(root,'components',tag),{recursive:true});
  await fs.writeFile(path.join(root,'metaproject.yaml'),`version: 1
name: ${scope}
scope: ${scope}
openapi: openapi.yaml
components:
  source: components
  output: public/components
`);
  await fs.writeFile(path.join(root,'openapi.yaml'),`openapi: 3.1.0
info: {title: ${scope}, version: '1'}
servers:
  - url: https://${scope}.example.test/api
paths:
  /items:
    get:
      operationId: listItems
      x-project-id: op-list-items
      responses:
        '200':
          description: list
          content:
            application/json:
              schema: {type: array, items: {type: object}}
              example: [{id: 1}]
`);
  await fs.writeFile(path.join(root,'components',tag,'component.html'),'<title>Items</title><data-source request="listItems"><data-table></data-table></data-source>');
  return root;
}

test('generated host index contains the runtime; independent components contain no runtime imports',async()=>{
  const root=await fixture('users','user-list');
  try{
    const result=await buildProject({root});
    const folder=path.join(root,'public/components');
    const [host,component,all,manifest]=await Promise.all([
      fs.readFile(path.join(folder,'index.js'),'utf8'),
      fs.readFile(path.join(folder,'user-list.js'),'utf8'),
      fs.readFile(path.join(folder,'all.js'),'utf8'),
      fs.readFile(path.join(folder,'manifest.json'),'utf8').then(JSON.parse)
    ]);
    assert.match(host,/metaproject.runtime.v1/);
    assert.match(host,/registerMetaprojectScope/);
    assert.match(component,/metaproject.runtime.v1/);
    assert.match(component,/registerMetaprojectScope/);
    assert.match(component,/users/);
    assert.doesNotMatch(component,/class DataSourceElement/);
    assert.doesNotMatch(component,/import .*\.\/runtime\.js/);
    assert.doesNotMatch(component,/from ['"](?:lit|metaproject\/) /);
    assert.match(all,/import '\.\/index\.js'/);
    assert.equal(manifest.scope,'users');
    assert.equal(manifest.components['user-list'].standalone,true);
    assert.equal(result.components.count,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('bundles from different projects have isolated operation scopes and distinct component tags',async()=>{
  const users=await fixture('users','user-list');
  const billing=await fixture('billing','invoice-list');
  try{
    await Promise.all([buildProject({root:users}),buildProject({root:billing})]);
    const userModule=await fs.readFile(path.join(users,'public/components/user-list.js'),'utf8');
    const billingModule=await fs.readFile(path.join(billing,'public/components/invoice-list.js'),'utf8');
    assert.match(userModule,/users\.example\.test/);
    assert.match(billingModule,/billing\.example\.test/);
    assert.doesNotMatch(userModule,/billing\.example\.test/);
    assert.doesNotMatch(billingModule,/users\.example\.test/);

    const key=Symbol.for('metaproject.runtime.v1');
    const priorRuntime=globalThis[key];
    const priorElements=globalThis.customElements;
    const registered=new Map(), scopes=new Map(), tags=new Map();
    globalThis[key]={
      LitElement:class {},html:()=>{},nothing:null,unsafeCSS:css=>css,
      ResourceContextController:class {},requestResourceContext:()=>{},metaprojectEnvironment:()=>({navigate(){}}),
      registerMetaprojectScope:({scope,operations,apiRoot})=>scopes.set(scope,{operations,apiRoot}),
      registerMetaprojectTag:(tag,scope)=>{
        if(tags.has(tag)&&tags.get(tag)!==scope)throw Error('tag collision');
        tags.set(tag,scope);
      }
    };
    globalThis.customElements={get:tag=>registered.get(tag),define:(tag,klass)=>registered.set(tag,klass)};
    try{
      await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(userModule));
      await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(billingModule));
      assert.equal(registered.get('user-list').prototype.metaprojectScope,'users');
      assert.equal(registered.get('invoice-list').prototype.metaprojectScope,'billing');
      assert.equal(scopes.get('users').apiRoot,'https://users.example.test/api');
      assert.equal(scopes.get('billing').apiRoot,'https://billing.example.test/api');
      assert.equal(scopes.get('users').operations.listItems.operationId,'listItems');
      assert.equal(scopes.get('billing').operations.listItems.operationId,'listItems');
    }finally{
      if(priorRuntime===undefined)delete globalThis[key];else globalThis[key]=priorRuntime;
      if(priorElements===undefined)delete globalThis.customElements;else globalThis.customElements=priorElements;
    }
  }finally{await Promise.all([fs.rm(users,{recursive:true,force:true}),fs.rm(billing,{recursive:true,force:true})]);}
});

test('standalone bundle includes component dependencies and bridges advanced helper imports',async()=>{
  const root=await fixture('users','user-list');
  const dir=path.join(root,'components','user-container');
  try{
    await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(dir,'component.html'),'<title>Container</title><user-list></user-list><p>'+'$'+'{ready()}</p>');
    await fs.writeFile(path.join(dir,'component.js'),"import { getDataRuntime } from 'metaproject/data-source';\nexport function ready(){ return Boolean(getDataRuntime('users')); }\n");
    await buildProject({root});
    const code=await fs.readFile(path.join(root,'public/components/user-container.js'),'utf8');
    assert.match(code,/metaproject.runtime.v1/);
    assert.match(code,/getDataRuntime/);
    assert.match(code,/user-list/);
    assert.match(code,/user-container/);
    assert.doesNotMatch(code,/import ['"]\.\/user-list\.js/);
    assert.doesNotMatch(code,/function configureDataRuntime/);
    assert.doesNotMatch(code,/class DataSourceElement/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('actual generated host runtime accepts a separately built component scope',async()=>{
  const users=await fixture('users','user-list');
  const billing=await fixture('billing','invoice-list');
  const key=Symbol.for('metaproject.runtime.v1');
  const previous={runtime:globalThis[key],elements:globalThis.customElements,HTMLElement:globalThis.HTMLElement,document:globalThis.document};
  try{
    await Promise.all([buildProject({root:users}),buildProject({root:billing})]);
    const index=await fs.readFile(path.join(users,'public/components/index.js'),'utf8');
    const remote=await fs.readFile(path.join(billing,'public/components/invoice-list.js'),'utf8');
    const registry=new Map();
    globalThis.HTMLElement=class {};
    globalThis.document={createTreeWalker:()=>({nextNode:()=>null}),createComment:()=>({})};
    globalThis.customElements={get:tag=>registry.get(tag),define:(tag,ctor)=>registry.set(tag,ctor)};
    const host=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(index));
    await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(remote));
    assert.equal(host.defaultClient.baseUrl,'https://users.example.test/api');
    assert.equal(host.getDataRuntime('billing').client.baseUrl,'https://billing.example.test/api');
    assert.equal(host.getDataRuntime('users').operations.listItems.path,'/items');
    assert.equal(host.getDataRuntime('billing').operations.listItems.path,'/items');
    assert.equal(registry.get('invoice-list').prototype.metaprojectScope,'billing');
  }finally{
    if(previous.runtime===undefined)delete globalThis[key];else globalThis[key]=previous.runtime;
    if(previous.elements===undefined)delete globalThis.customElements;else globalThis.customElements=previous.elements;
    if(previous.HTMLElement===undefined)delete globalThis.HTMLElement;else globalThis.HTMLElement=previous.HTMLElement;
    if(previous.document===undefined)delete globalThis.document;else globalThis.document=previous.document;
    await Promise.all([fs.rm(users,{recursive:true,force:true}),fs.rm(billing,{recursive:true,force:true})]);
  }
});
