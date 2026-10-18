# Vite example

Use the Vite integration when an application already has a Vite-owned module graph and you want Metaproject component source compiled as part of that application bundle.

From this directory:

```bash
npm install
npm run dev
```

For a production bundle:

```bash
npm run build
npm run preview
```

`vite.config.js` adds the public `metaproject/vite` plugin. `src/main.js` imports the virtual `metaproject:components` registry, which compiles and registers the components discovered under `components/`.

Prefer **`npx metaproject build`** when you want framework-independent static assets (`index.js`, individual component bundles, `all.js`, and `manifest.json`), especially for plain HTML, server-rendered hosts, or remote-component distribution.

Prefer **`metaproject/vite`** when Vite already owns the host application's build and the component code should live inside that bundle. The Vite plugin is a compiler integration; the static build remains the product path for OpenAPI-backed shared runtime/client distribution and independently loadable remote component files.
