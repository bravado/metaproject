# Remote component example

This example runs two local origins:

- host: http://127.0.0.1:4173
- remote component/API: http://127.0.0.1:4174

From this directory:

```bash
npm install
npm run check
npm run build
npm start
```

The host loads exactly one local `host/public/components/index.js` runtime, then imports only the remote project's `invoice-list.js`. The remote project uses the unique `billing` scope, so its `listInvoices` operation and default API client are registered separately from the host.

The example server sends the CORS headers required for cross-origin JavaScript and API requests. In production, both the component asset origin and its API must allow the host origin. Remote components execute JavaScript with host-page privileges, so load them only from trusted publishers. Pin deployed asset versions; package-version equality is not required when host and component implement the same Metaproject runtime ABI.
