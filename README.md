# SimRail Map

## Overview

Welcome to the **SimRail Map** project! 🌟

## Features

- 🗺️ Interactive Map: Zoom in/out, pan, and explore different areas.
- 📍 Location Details: Information on stations and trains.
- 🛤️ Route Information: Visual representation of rail routes (track speed, signalling).
- 🔍 Search Functionality: Easily find specific trains or train conductors.

## Contributing

### How to ?

- 🍴 Fork the repository.
- 🌿 Create a new branch: git checkout -b feature-branch.
- 💾 Commit your changes: git commit -am 'Add new feature'.
- 🚀 Push to the branch: git push origin feature-branch.
- 📨 Create a new Pull Request.

### Installation

1. Clone the Repository:

```bash
git clone https://github.com/simrail/map-v2.git
cd map-v2
```

2. Install Dependencies:

```bash
pnpm install
```

3. Run the Application:

```bash
pnpm run dev
```

AdSense placements are configured independently so their performance can be
measured and tuned in the AdSense dashboard:

- Portal: `VITE_GOOGLE_ADSENSE_HOME_LEADERBOARD_SLOT`,
  `VITE_GOOGLE_ADSENSE_HOME_INFEED_SLOT`, and
  `VITE_GOOGLE_ADSENSE_HOME_RAIL_SLOT`.
- Server picker: `NEXT_PUBLIC_GOOGLE_ADSENSE_SERVERS_LEADERBOARD_SLOT`,
  `NEXT_PUBLIC_GOOGLE_ADSENSE_SERVERS_INFEED_SLOT`, and
  `NEXT_PUBLIC_GOOGLE_ADSENSE_SERVERS_RAIL_SLOT`.
- Live map: `NEXT_PUBLIC_GOOGLE_ADSENSE_MAP_SLOT` enables the dismissible banner
  after a randomized 5–10 minute delay.

Unconfigured placements collapse in production and appear as labeled previews
during local development. Rail placements only appear on wide desktop screens.

4. Check linting, TypeScript diagnostics, and formatting:

```bash
pnpm check
```

Use `pnpm fix` to apply safe Oxlint fixes and format supported files with Oxfmt.

### Projects

This projects is a monorepo containing two projects:

- `packages/home`: The main portal page hosted at [www.simrail.app](https://www.simrail.app) that redirects users to either EDR or the map.
- `packages/map`: The interactive map project hosted at [map.simrail.app](https://map.simrail.app).
