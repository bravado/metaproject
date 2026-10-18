import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

// This test intentionally imports no Metaproject source from the checkout.
// It installs the exact CI-produced .tgz, builds with its installed executable,
// and serves only files generated in the unrelated consumer directory.
const args=process.argv.slice(2);
assert.equal(args.length,1,'Usage: node tests/packed-browser-smoke.mjs <package.tgz>');
const tarball=path.resolve(args[0]);
assert.ok(fs.statSync(tarball).isFile(),'Missing npm tarball: '+tarball);

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'metaproject-packed-browser-'));
const consumer=path.join(temp,'consumer');
const npm=process.platform==='win32'?'npm.cmd':'npm';
const binName=process.platform==='win32'?'metaproject.cmd':'metaproject';
const users=[{id:1,name:'Ada'},{id:2,name:'Grace'}];
let reads=0;
let server, browser;

function run(command,args){
  const result=spawnSync(command,args,{cwd:consumer,encoding:'utf8',timeout:120000});
  assert.equal(result.error,undefined,'Failed to start '+command+': '+result.error);
  assert.equal(result.status,0,['Failed: '+command+' '+args.join(' '),result.stdout,result.stderr].filter(Boolean).join('\n'));
  return result.stdout;
}

function send(response,status,body,type='text/plain; charset=utf-8'){
  response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});
  response.end(body);
}

try{
  fs.mkdirSync(consumer,{recursive:true});
  fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({
    name:'metaproject-packed-browser-consumer',
    private:true,
    type:'module'
  },null,2)+'\n');

  run(npm,['install','--ignore-scripts','--no-audit','--no-fund','--no-package-lock',tarball]);
  const installed=fs.realpathSync(path.join(consumer,'node_modules','metaproject'));
  const cli=path.join(consumer,'node_modules','.bin',binName);
  assert.ok(fs.existsSync(cli),'Installed package CLI is missing');
  if(process.platform!=='win32'){
    assert.equal(fs.realpathSync(cli),path.join(installed,'bin','metaproject.js'),
      'Build must use the installed tarball executable, never the checkout');
  }
  const installedPackage=JSON.parse(fs.readFileSync(path.join(installed,'package.json'),'utf8'));
  assert.equal(installedPackage.name,'metaproject');

  fs.mkdirSync(path.join(consumer,'components','user-list'),{recursive:true});
  fs.writeFileSync(path.join(consumer,'metaproject.yaml'),[
    'version: 1',
    'name: Packed browser smoke',
    'scope: packed-browser',
    'openapi: openapi.yaml',
    'components:',
    '  source: components',
    '  output: public/components',
    ''
  ].join('\n'));
  fs.writeFileSync(path.join(consumer,'openapi.yaml'),[
    'openapi: 3.1.0',
    'info:',
    '  title: Packed browser smoke',
    "  version: '1.0.0'",
    'servers:',
    '  - url: /api',
    'paths:',
    '  /users:',
    '    get:',
    '      operationId: listUsers',
    '      x-project-id: op-users',
    '      responses:',
    "        '200':",
    '          description: Users',
    '          content:',
    '            application/json:',
    '              schema:',
    '                type: array',
    '                items:',
    "                  $ref: '#/components/schemas/User'",
    '              example:',
    '                - { id: 1, name: Ada }',
    'components:',
    '  schemas:',
    '    User:',
    '      x-project-id: schema-user',
    '      type: object',
    '      properties:',
    '        id: { type: integer }',
    '        name: { type: string }',
    '      required: [id, name]',
    ''
  ].join('\n'));
  fs.writeFileSync(path.join(consumer,'components','user-list','component.html'),
    '<title>Users</title>\n<data-source request="listUsers"><data-table></data-table></data-source>\n');
  const publicRoot=path.join(consumer,'public');
  fs.mkdirSync(publicRoot,{recursive:true});
  fs.writeFileSync(path.join(publicRoot,'index.html'),[
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><title>Packed browser</title></head>',
    '<body><user-list></user-list><script type="module" src="/components/all.js"></script></body></html>',
    ''
  ].join('\n'));

  run(cli,['check']);
  run(cli,['build']);

  const output=path.join(publicRoot,'components');
  const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8'));
  assert.equal(manifest.generatedBy,'metaproject');
  assert.equal(manifest.generatedByVersion,installedPackage.version);
  assert.equal(manifest.runtime,'index.js');
  assert.ok(manifest.components['user-list'],'No generated user-list component');
  for(const name of ['index.js','all.js','api.js','user-list.js']){
    const js=fs.readFileSync(path.join(output,name),'utf8');
    const specifiers=[
      ...js.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
      ...js.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
      ...js.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)
    ].map(match=>match[1]);
    for(const specifier of specifiers){
      assert.ok(specifier.startsWith('.')||specifier.startsWith('/')||/^(?:https?:|data:)/.test(specifier),
        'Unresolved npm import in '+name+': '+specifier);
    }
  }

  server=http.createServer((request,response)=>{
    const pathname=new URL(request.url,'http://127.0.0.1').pathname;
    if(pathname==='/api/users'){
      reads++;
      return send(response,200,JSON.stringify(users),'application/json; charset=utf-8');
    }
    const relative=pathname==='/'?'index.html':pathname.slice(1);
    const file=path.resolve(publicRoot,relative);
    const within=path.relative(publicRoot,file);
    if(within.startsWith('..'+path.sep)||within==='..'||path.isAbsolute(within)){
      return send(response,403,'Forbidden');
    }
    let contents;
    try{contents=fs.readFileSync(file);}
    catch{return send(response,404,'Not found');}
    const mime=file.endsWith('.js')?'application/javascript; charset=utf-8':
      file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream';
    send(response,200,contents,mime);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const origin='http://127.0.0.1:'+server.address().port;

  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>errors.push('Request failed: '+request.url()+' '+request.failure()?.errorText));
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{
    const element=document.querySelector('user-list');
    return Boolean(customElements.get('user-list') &&
      element?.shadowRoot?.querySelector('data-table tbody')?.textContent?.includes('Ada'));
  },null,{timeout:20000});
  const rendered=await page.evaluate(()=>{
    const element=document.querySelector('user-list');
    const table=element.shadowRoot.querySelector('data-table');
    return [...table.querySelectorAll('tbody tr')].map(row=>row.textContent.trim());
  });
  assert.equal(rendered.length,2,'Packed component should render both API records');
  assert.match(rendered[0],/Ada/);
  assert.match(rendered[1],/Grace/);
  assert.equal(reads,1,'Expected exactly one API read from the generated component');
  assert.deepEqual(errors,[],'Browser failed to load the packed-package output');
  console.log('Packed npm artifact browser smoke passed for metaproject@'+installedPackage.version);
}finally{
  if(browser)await browser.close();
  if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  fs.rmSync(temp,{recursive:true,force:true});
}
