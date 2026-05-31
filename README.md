# EventViz — LHE Event Visualizer

> Interactive browser-based 3D visualizer for Les Houches Event (LHE) files.

## Overview

EventViz is a lightweight client-side tool to explore particle-collision events stored
in the Les Houches Event (LHE) format. It parses event headers and per-particle
kinematics from an uploaded `.lhe` file and renders an interactive 3D view of the
collision (incoming beams, outgoing tracks and decay chains) using Three.js.

## Features

- Upload uncompressed `.lhe` files and preview generator/process metadata
- Builds an index of `<event>` blocks for fast, on-demand event loading
- Interactive 3D view with orbit controls, hover tooltips and LaTeX-rendered kinematics (KaTeX)
- Particle coloring and PDG name lookup; decay topology rebuilt from mother indices

## Usage

1. Click **Upload .lhe file** and choose an uncompressed `.lhe` file.
2. Use the Event Navigator to select an event number and explore the 3D view.
3. Hover over tracks or spheres to see particle kinematics and PDG info.

Note: Compressed `.lhe.gz` files are not supported in-browser; please gunzip before upload.

## Implementation notes

- Visualization: Three.js (imported via importmap in `index.html`) and `OrbitControls`.
- Labels & tooltips: CSS2DRenderer and KaTeX for readable LaTeX math rendering.
- Parsing: Robust Fortran-style float parsing, streaming event index builder to avoid loading whole files.
- Particle database: `script.js` contains a small PDG lookup to resolve names, LaTeX labels, charges and colors.

## Contributions are Welcomed and much appretiated !

