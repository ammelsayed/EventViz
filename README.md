# EventViz — LHE & HepMC Event Visualizer

> Interactive browser-based 3D visualizer for Les Houches Event (LHE) and HepMC files.

## Overview

EventViz is a lightweight client-side tool to explore particle-collision events stored
in Les Houches Event (`.lhe`) or HepMC (`.hepmc`) format. It parses event headers and
per-particle kinematics from the uploaded file and renders an interactive 3D view of the
collision (incoming beams, outgoing tracks and decay chains) using Three.js.

## Features

- Upload uncompressed `.lhe` or `.hepmc` files and preview generator/process metadata
- Builds an index of `<event>` blocks for fast, on-demand event loading
- Interactive 3D view with orbit controls, hover tooltips and LaTeX-rendered kinematics (KaTeX)
- Particle coloring and PDG name lookup; decay topology rebuilt from mother indices

## Usage

1. Click **Upload event file** and choose an uncompressed `.lhe` or `.hepmc` file.
2. Use the Event Navigator to select an event number and explore the 3D view.
3. Hover over tracks or spheres to see particle kinematics and PDG info.

Note: Compressed `.lhe.gz` and `.hepmc.gz` files are not supported in-browser; please gunzip before upload.

## Contributing

Contributions are welcome! If you have ideas for new visualizations, file format improvements, bug fixes, or performance enhancements, please open an issue or submit a pull request. Help make EventViz even more useful for the particle physics community.


