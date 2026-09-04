import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectApiOperations, generateApiClientModule } from '../api-client/index.js';

const openapi = {
  openapi:'3.1.0',
  paths:{
    '/users':{
      parameters:[{name:'tenant',in:'header',required:true}],
      get:{
        operationId:'listUsers',
        parameters:[{name:'page',in:'query',required:false}]
      },
      post:{
        operationId:'createUser',
        requestBody:{required:true,content:{'application/json':{}}}
      }
    },
    '/users/{id}':{
      get:{
        operationId:'getUser',
        parameters:[{name:'id',in:'path',required:true},{name:'include',in:'query',required:false}]
      },
      put:{
        operationId:'updateUser',
        'x-project-id':'44444444-4444-4444-8444-444444444444',
        parameters:[{name:'id',in:'path',required:true}],
        requestBody:{required:true,content:{'application/json':{}}}
      }
    }
  }
};

test('OpenAPI operations become operationId client methods with request metadata', () => {
  const operations=collectApiOperations(openapi);
  assert.deepEqual(operations.map(op=>op.operationId),['listUsers','createUser','getUser','updateUser']);
  const list=operations.find(op=>op.operationId==='listUsers');
  assert.equal(list.method,'GET');
  assert.equal(list.path,'/users');
  assert.ok(list.parameters.some(p=>p.in==='header'&&p.name==='tenant'&&p.required));
  const update=operations.find(op=>op.operationId==='updateUser');
  assert.equal(update.projectId,'44444444-4444-4444-8444-444444444444');
  assert.deepEqual(update.requestBody,{required:true,contentTypes:['application/json']});
});

test('generated API client is a self-contained static ESM asset', () => {
  const source=generateApiClientModule({openapi,apiRoot:'/api'});
  assert.match(source,/DEFAULT_API_ROOT = "\/api"/);
  assert.match(source,/"updateUser": \(args = \{\}\) => invoke/);
  assert.doesNotMatch(source,/\bimport\s/);
  assert.doesNotMatch(source,/from\s+['"](?:lit|metaproject)/);
});

test('api_root + operation path is used with encoded path and query arguments', async () => {
  const module=await importGenerated(openapi,'/api');
  let call;
  const api=module.createApiClient({
    apiRoot:'https://backend.example.test/api/',
    headers:{'X-App':'metaproject'},
    fetch:async (url,init)=>{
      call={url,init};
      return jsonResponse({id:'a/b',name:'Updated'});
    }
  });

  const result=await api.updateUser({
    path:{id:'a/b'},
    query:{include:['roles','permissions'],empty:null},
    headers:{Authorization:'Bearer test'},
    body:{name:'Updated'}
  });

  assert.deepEqual(result,{id:'a/b',name:'Updated'});
  assert.equal(call.url,'https://backend.example.test/api/users/a%2Fb?include=roles&include=permissions');
  assert.equal(call.init.method,'PUT');
  assert.equal(call.init.credentials,'same-origin');
  assert.equal(call.init.headers['X-App'],'metaproject');
  assert.equal(call.init.headers.Authorization,'Bearer test');
  assert.equal(call.init.headers['Content-Type'],'application/json');
  assert.equal(call.init.body,JSON.stringify({name:'Updated'}));
});

test('generated client validates required path/header/body values before fetch', async () => {
  const module=await importGenerated(openapi,'/api');
  let calls=0;
  const api=module.createApiClient({fetch:async()=>{calls+=1;return jsonResponse({});}});

  await assert.rejects(()=>api.getUser(),/missing required path parameter id/);
  await assert.rejects(()=>api.listUsers(),/missing required header parameter tenant/);
  await assert.rejects(()=>api.createUser({headers:{tenant:'x'}}),/request body is required/);
  assert.equal(calls,0);
});

test('generated client returns undefined for empty success and throws ApiClientError for backend failures', async () => {
  const module=await importGenerated(openapi,'/api');
  const emptyApi=module.createApiClient({fetch:async()=>({ok:true,status:204,headers:{get:()=>''},text:async()=>''})});
  assert.equal(await emptyApi.getUser({path:{id:1}}),undefined);

  const failing=module.createApiClient({fetch:async()=>jsonResponse({error:'denied'},{status:403})});
  await assert.rejects(
    ()=>failing.getUser({path:{id:1}}),
    error=>error instanceof module.ApiClientError && error.status===403 && error.operationId==='getUser' && error.body.error==='denied'
  );
});

test('generated default api uses the compiled api_root while createApiClient can override it', async () => {
  const module=await importGenerated(openapi,'/backend');
  assert.equal(module.DEFAULT_API_ROOT,'/backend');
  assert.equal(module.joinApiUrl(module.DEFAULT_API_ROOT,'/users'),'/backend/users');
  assert.equal(module.joinApiUrl('/','/users'),'/users');
  assert.equal(module.joinApiUrl('https://api.example.test/root/','/users'),'https://api.example.test/root/users');
});

async function importGenerated(spec,apiRoot){
  const dir=await mkdtemp(join(tmpdir(),'metaproject-api-'));
  const file=join(dir,'api.mjs');
  await writeFile(file,generateApiClientModule({openapi:spec,apiRoot}));
  const url=pathToFileURL(file).href+`?v=${Date.now()}-${Math.random()}`;
  try{return await import(url);}finally{await rm(dir,{recursive:true,force:true});}
}

function jsonResponse(body,{status=200}={}){
  return {
    ok:status>=200&&status<300,
    status,
    statusText:'',
    headers:{get:name=>name.toLowerCase()==='content-type'?'application/json':''},
    json:async()=>body,
    text:async()=>JSON.stringify(body)
  };
}
