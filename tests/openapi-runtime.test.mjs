import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectOpenApiServers,
  resolveOpenApiServerUrl,
  collectOpenApiSecuritySchemes,
  applyOpenApiSecurity,
  OpenApiCredentialsError
} from '../openapi/index.js';

const openapi = {
  openapi:'3.1.0',
  servers:[
    { url:'https://api.example.test/{version}', description:'Production', variables:{version:{default:'v1',enum:['v1','v2']}} },
    { url:'https://staging.example.test', description:'Staging API', 'x-display-name':'Staging' },
    { url:'https://fallback.example.test' }
  ],
  security:[{ apiKey:[], bearer:[] }, { oauth:['read'] }],
  components:{securitySchemes:{
    apiKey:{type:'apiKey',in:'query',name:'key'},
    cookieKey:{type:'apiKey',in:'cookie',name:'session'},
    basic:{type:'http',scheme:'basic'},
    bearer:{type:'http',scheme:'bearer'},
    custom:{type:'http',scheme:'Digest'},
    oauth:{type:'oauth2',flows:{clientCredentials:{tokenUrl:'https://auth.example.test/token',scopes:{read:'Read'}}}},
    oidc:{type:'openIdConnect',openIdConnectUrl:'https://auth.example.test/.well-known/openid-configuration'},
    mtls:{type:'mutualTLS'}
  }}
};

test('servers are ordered, use display-name/description labels, and resolve variables',()=>{
  const servers=collectOpenApiServers(openapi);
  assert.deepEqual(servers.map(server=>server.label),['Production','Staging','Server 3']);
  assert.equal(servers[1].description,'Staging API');
  assert.equal(resolveOpenApiServerUrl(servers[0]),'https://api.example.test/v1');
  assert.equal(resolveOpenApiServerUrl(servers[0],{version:'v2'}),'https://api.example.test/v2');
  assert.equal(resolveOpenApiServerUrl(servers[1]),'https://staging.example.test');
});

test('OpenAPI implicit server is slash when servers are absent',()=>{
  assert.deepEqual(collectOpenApiServers({}).map(server=>server.url),['/']);
});

test('security schemes are discovered from components',()=>{
  assert.deepEqual(collectOpenApiSecuritySchemes(openapi).map(item=>item.name),['apiKey','cookieKey','basic','bearer','custom','oauth','oidc','mtls']);
});

test('security requirement AND semantics apply every scheme and OR semantics choose usable alternative',()=>{
  const operation={operationId:'listUsers'};
  const secured=applyOpenApiSecurity({
    openapi,
    operation,
    args:{query:{page:2}},
    credentials:{apiKey:{value:'abc'},bearer:{token:'token-1'}}
  });
  assert.deepEqual(secured.args.query,{page:2,key:'abc'});
  assert.equal(secured.args.headers.Authorization,'Bearer token-1');

  const oauth=applyOpenApiSecurity({openapi,operation,args:{},credentials:{oauth:{accessToken:'oauth-token'}}});
  assert.equal(oauth.args.headers.Authorization,'Bearer oauth-token');
});

test('operation security overrides root security and supports unauthenticated alternative',()=>{
  const none=applyOpenApiSecurity({openapi,operation:{operationId:'public',security:[]},args:{},credentials:{}});
  assert.deepEqual(none.args.headers,{});
  const optional=applyOpenApiSecurity({openapi:{...openapi,security:[{}, {bearer:[]}]},operation:{operationId:'optional'},args:{},credentials:{}});
  assert.deepEqual(optional.args.headers,{});
});

test('apiKey cookie and mutual TLS are expressed as transport metadata',()=>{
  const cookie=applyOpenApiSecurity({openapi:{...openapi,security:[{cookieKey:[]}]},operation:{operationId:'cookie'},credentials:{cookieKey:{value:'s1'}}});
  assert.deepEqual(cookie.transport.cookies,{session:'s1'});
  const mtls=applyOpenApiSecurity({openapi:{...openapi,security:[{mtls:[]}]},operation:{operationId:'secure'},credentials:{mtls:{certificate:'CERT',key:'KEY',passphrase:'secret'}}});
  assert.deepEqual(mtls.transport.tls,{certificate:'CERT',key:'KEY',passphrase:'secret'});
});

test('HTTP basic, bearer and arbitrary schemes are supported',()=>{
  const basic=applyOpenApiSecurity({openapi:{...openapi,security:[{basic:[]}]},operation:{operationId:'basic'},credentials:{basic:{username:'user',password:'p'}}});
  assert.match(basic.args.headers.Authorization,/^Basic /);
  const custom=applyOpenApiSecurity({openapi:{...openapi,security:[{custom:[]}]},operation:{operationId:'custom'},credentials:{custom:{authorization:'Digest response="abc"'}}});
  assert.equal(custom.args.headers.Authorization,'Digest response="abc"');
});

test('missing required credentials fail with operation context',()=>{
  assert.throws(
    ()=>applyOpenApiSecurity({openapi,operation:{operationId:'listUsers'},credentials:{}}),
    error=>error instanceof OpenApiCredentialsError && error.operationId==='listUsers'
  );
});
