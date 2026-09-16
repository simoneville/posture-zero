# Vendored: three.js

This directory contains an unmodified copy of files from the
[three.js](https://threejs.org/) project, vendored locally so the app
works without a build step or a CDN dependency.

- **Version:** 0.160.0
- **Source:** [`three`](https://www.npmjs.com/package/three) on npm
  (`https://registry.npmjs.org/three/-/three-0.160.0.tgz`)
- **License:** MIT — see [`LICENSE`](./LICENSE) in this directory
  (copied verbatim from the npm package).
- **Files taken:**
  - `build/three.module.js` — the core library
  - `examples/jsm/controls/OrbitControls.js` — the orbit/pan/zoom camera
    controls used for the 3D viewport

Nothing here has been edited; `index.html`'s import map points `three`
and `three/addons/` at these files.
