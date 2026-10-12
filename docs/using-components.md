# Using generated components in an application

Metaproject build output is browser-native ESM. Components run directly in host applications.

After:

```bash
npx metaproject build
```

the configured output directory (default `public/components/`) contains a shared host runtime (`index.js`), standalone generated component bundles, and an `all.js` convenience entry.

## Plain HTML

For all local components, load the convenience entry:

```html
<script type="module" src="/components/all.js"></script>
<user-list></user-list>
```

For individually distributed components, load the host runtime first:

```html
<script type="module">
  await import('/components/index.js');
  await import('https://widgets.example.com/components/user-list.js');
</script>
<user-list></user-list>
```

Each generated component bundle self-registers its custom element. The host's `index.js` supplies the shared runtime; component bundles do not ship a second copy. See [Shared runtime and remote components](remote-components.md).

A parameterized component can be used with normal HTML attributes:

```html
<db-table-list db-name="app"></db-table-list>
```

Primitive camelCase component properties use kebab-case attributes by default (`dbName` → `db-name`).

## Plain JavaScript

Properties can always be assigned directly:

```js
const list=document.querySelector('db-table-list');
list.dbName='app';
```

Semantic `data-action` events are normal DOM events:

```js
list.addEventListener('open', event => {
  const table=event.detail.resource;
  openTable(table);
});
```

This is the preferred boundary for application behavior. A reusable component emits intent; the host decides whether that means routing, opening a modal, selecting an item, updating another component, and so on.

## Lit

Generated elements work like any other custom element:

```js
html`
  <db-table-list
    .dbName=${database}
    @open=${event => showTable(event.detail.resource)}
  ></db-table-list>
`;
```

Use property binding for non-primitive values or whenever property assignment is clearer.

## React, Vue, Svelte, server-rendered apps

No Metaproject-specific wrapper is required. Use the framework's normal custom-element support:

- set primitive attributes or element properties;
- listen for native CustomEvents;
- load `/components/all.js` to register all local components, or load `/components/index.js` first followed by the individual component modules.

A thin framework wrapper can be added when the framework benefits from typed props/events, but the generated custom element remains the actual runtime component.

## Configure the API client

The generated runtime creates a default REST client from the first resolved OpenAPI `servers` entry.

For many applications a same-origin server entry is sufficient:

```yaml
servers:
  - url: /api
```

A host may replace it:

```js
import {
  configureMetaproject,
  createRestClient
} from '/components/index.js';

configureMetaproject({
  client:createRestClient({
    baseUrl:'/backend',
    credentials:'same-origin'
  })
});
```

Static headers can also be supplied:

```js
createRestClient({
  baseUrl:'/api',
  headers:{'X-Application':'admin'}
});
```

For dynamic tokens, CSRF integration, tracing, or application-specific request behavior, pass a custom `fetch` implementation or a custom client implementing `invoke(operation, args)`.

## Component inputs

Declare public inputs in source:

```html
<component-property
  name="userId"
  type="integer"
  required
  example="1"
></component-property>
```

This compiles to a `user-id` HTML attribute and `userId` JavaScript property.

Use:

```html
<component-property name="resource" type="User" attribute="false"></component-property>
```

for property-only object values, and:

```html
<component-property name="userId" type="integer" attribute="uid"></component-property>
```

when the public HTML attribute must have a custom name.

`example` supplies useful design-time/preview data. `default` initializes the runtime property when the host does not provide one.

## Component outputs

There are two important action types.

### Semantic application actions

```html
<button data-action="open">Open</button>
```

emits an `open` CustomEvent whose detail includes the current resource:

```js
{
  action:'open',
  resource,
  originalEvent
}
```

Use these for host/application intent.

### API operations

```html
<button data-operation="deleteUser">Delete</button>
```

invokes the OpenAPI operation through Core. The host may observe `operation-complete` if it needs to react to successful completion, but it does not need to perform the HTTP request itself.

## Override row actions from a host

An HTML-first component with an automatic table may provide default row actions. A host can replace them without forking the component:

```html
<db-table-list id="tables">
  <button data-action="select">Select</button>
</db-table-list>
```

```js
document.querySelector('#tables').addEventListener('select', event => {
  chooseTable(event.detail.resource);
});
```

The supplied action markup is cloned per row and receives that row as resource context.

## CSS and encapsulation

Generated HTML-first components are Lit custom elements and their component CSS is encapsulated in the component shadow root. Core primitives such as `data-table` and `data-form` provide sensible generated-UI defaults; component CSS should focus on component-specific presentation.

## Deployment

Serve the generated output as static browser assets. The host serves `index.js`; individual components may be hosted independently on trusted origins with JavaScript module CORS support. Component bundles do not require sibling runtime files.

A typical existing application workflow is:

```bash
npx metaproject check
npx metaproject build
# application deployment publishes public/ as usual
```

Metaproject does not require the host application to use Node.js at runtime. Node is a development/build dependency; the resulting components run in the browser.
