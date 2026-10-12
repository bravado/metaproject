# Product examples

These examples show the four supported ways to start using Metaproject without designing a sample application first.

- [vanilla](vanilla/) — plain HTML host, static `npx metaproject build`, local API, public properties, and semantic events.
- [remote-component](remote-component/) — one host runtime plus a component and API served from a second origin/scope.
- [existing-app](existing-app/) — add generated Web Components to an application that already owns routes, templates, and an OpenAPI contract.
- [vite](vite/) — compile Metaproject component source inside an application's existing Vite bundle.

For the static examples, `npx metaproject build` emits browser assets under each example's `public/components/`. The Vite example deliberately does not use those static assets; Vite owns that application's bundle.
