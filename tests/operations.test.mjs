import test from 'node:test';
import assert from 'node:assert/strict';
import { collectApiOperations, generateApiModule } from '../operations/index.js';

const openapi={openapi:'3.1.0',components:{schemas:{User:{type:'object',properties:{id:{type:'integer'},name:{type:'string'}}}}},paths:{'/users':{get:{operationId:'listUsers',parameters:[{name:'limit',in:'query',schema:{type:'integer'}}],responses:{'200':{content:{'application/json':{schema:{type:'array',items:{$ref:'#/components/schemas/User'}}}}}}}},'/users/{id}':{patch:{operationId:'updateUser',parameters:[{name:'id',in:'path',required:true,schema:{type:'integer'}}],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/User'}}}},responses:{'200':{content:{'application/json':{schema:{$ref:'#/components/schemas/User'}}}}}}}}};

test('operation metadata contains parameter/request/response schemas',()=>{const operations=collectApiOperations(openapi);const list=operations.find(op=>op.operationId==='listUsers');assert.equal(list.parameters[0].schema.type,'integer');assert.equal(list.responseSchema.type,'array');assert.equal(list.responseSchema.items.$ref,'#/components/schemas/User');const update=operations.find(op=>op.operationId==='updateUser');assert.equal(update.requestBody.schema.type,'object');assert.equal(update.responseSchema.type,'object');});

test('generated API module only contains root and operation metadata',()=>{const source=generateApiModule({openapi,apiRoot:'/api'});assert.match(source,/DEFAULT_API_ROOT = "\/api"/);assert.match(source,/"listUsers"/);assert.match(source,/responseSchema/);assert.doesNotMatch(source,/createApiClient/);assert.doesNotMatch(source,/\bimport\s/);});
