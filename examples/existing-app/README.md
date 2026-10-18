# Existing application example

This example starts with an application that already owns:

- server-rendered routes and HTML;
- its `/api/customers` backend endpoint;
- an existing OpenAPI contract at `docs/openapi.yaml`;
- the public web root.

Metaproject is added only as a build/development layer.

From this directory:

```bash
npm install
npm run check
npm run build
npm start
```

Open http://127.0.0.1:4173/customers.

`metaproject.yaml` points directly at the existing OpenAPI document and emits generated assets into `public/components/`. The existing server still owns routing, page layout, navigation, and the API. Its customers page merely loads `/components/all.js` and places `<customer-list>` inside the existing template.

The host also handles the component's `open-customer` semantic event itself. Metaproject does not replace the backend or frontend framework.
