# Vanilla example

This is the shortest complete Metaproject application: a plain HTML host, one OpenAPI operation, one Web Component, and a deterministic local API.

From this directory:

```bash
npm install
npm run check
npm run build
npm start
```

Open http://127.0.0.1:4173.

The host loads the generated `public/components/all.js`. The initial `limit="2"` demonstrates an HTML attribute input; **Show three users** assigns the same public input as the JavaScript `users.limit` property. The row button uses `data-action="select-user"`, so the host receives a semantic `select-user` event with the selected row in `event.detail.resource`.

The API is intentionally a tiny local Node server so the example is deterministic and requires no external service.
