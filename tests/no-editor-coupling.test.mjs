import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The native HTML <canvas> element remains reserved in the HTML tag list.
// Core must not own editor-specific project metadata, helpers, or prose.
test('Core implementation and documentation have no editor-specific references',()=>{
  const roots=['api','bin','build','compiler','components','data-source','docs','init','mock-api','openapi','operations','project','skills'];
  const files=['README.md'];
  function visit(target){
    for(const entry of fs.readdirSync(target,{withFileTypes:true})){
      const p=path.join(target,entry.name);
      if(entry.isDirectory())visit(p);
      else if(/\.(?:js|md)$/.test(entry.name))files.push(p);
    }
  }
  for(const root of roots)visit(root);
  for(const file of files){
    let source=fs.readFileSync(file,'utf8');
    if(file==='project/indexer.js')source=source.replace(/'canvas'/g,"'html-element'");
    assert.doesNotMatch(source,/canvas/i,`Unexpected editor integration reference in ${file}`);
  }
});
