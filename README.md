ResourcePile Map Fetcher
================

This tool fetches specific Git repositories that contain [PGM maps](https://pgm.dev/) and parses each map's XML file to be displayed on the [MCResourcePile website](https://mcresourcepile.github.io/maps/pgm).

Repositories are stored in [src/sources.js](https://github.com/MCResourcePile/map-fetcher/blob/main/src/sources.js). If you actively maintain a Git repository with PGM maps and would like them included on the ResourcePile website please submit a pull request adding your repository details to this file.

### Running

`node src/index.js --output="path\to\output.json"`

### Sample Map Output

```json
{
    "name": "War Wars",
    "slug": "war_wars",
    "id": "overcastnetwork_maps_war_wars",
    "proto": "1.3.2",
    "version": "150",
    "phase": "production",
    "edition": "standard",
    "authors": [
        {
            "uuid": "177803b2-797c-4089-aae1-5702ca259e2c"
        }
    ],
    "teams": [
        {
            "name": "Blue",
            "color": "blue",
            "size": "5"
        },
        {
            "name": "Red",
            "color": "dark red",
            "size": "5"
        }
    ],
    "tags": [
        "core",
        "blitz"
    ],
    "source": {
        "maintainer": "OvercastNetwork",
        "repository": "maps",
        "path": "...",
        "license": "...",
        "license_scope": "repository",
        "github_url": "...",
        "image_url": "...",
        "includes": {
            "root": "...",
            "files": [
                "warwars"
            ]
        }
    }
}
```
