ResourcePile Map Fetcher
================

This tool fetches specific Git repositories that contain [PGM maps](https://pgm.dev/) and parses each map's XML file to be displayed on the [MCResourcePile website](https://mcresourcepile.github.io/maps/pgm).

### Running

`node src/index.js --output="path\to\output.json"`

### Adding repositories

Repositories are stored in [src/sources.js](https://github.com/MCResourcePile/map-fetcher/blob/main/src/sources.js). If you actively maintain a Git repository with PGM maps and would like them included on the ResourcePile website please submit a pull request adding your repository details to this file.


| Option            | Description                                                                         |
|-------------------|-------------------------------------------------------------------------------------|
| `"maintainer"`    | The username of the maintainer.                                                     |
| `"repository"`    | The name of the repository.                                                         |
| `"url"`           | Full URL to the Git host frontend of the repository.                                |
| `"includes_url"`  | Full URL to the Git host frontend to the XML includes folder.                       |
| `"branch"`        | The main branch.                                                                    |
| `"license_scope"` | Specify whether maps are licensed as a `repository` or individually per `map`.      |
| `"license"`       | The repository license. Only used if license scope is set to `repository`.          |
| `"global_tags"`   | An array of tags to apply to all maps in the repository. Optional.                  |

```json
 {
   "maintainer": "OvercastCommunity",
   "repository": "public-competitive",
   "url": "https://github.com/OvercastCommunity/public-competitive",
   "branch": "master",
   "license_scope": "map",
   "includes_url": "https://github.com/OvercastCommunity/PublicMaps/tree/main/includes",
   "global_tags": ["tournament"]
 }
```

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
            "color": "dark_red",
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
