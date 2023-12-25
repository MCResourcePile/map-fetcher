ResourcePile Map Fetcher
================

This tool fetches specific Git repositories that contain [PGM maps](https://pgm.dev/) and parses each map's XML file to be displayed on the [MCResourcePile website](https://mcresourcepile.github.io/maps/pgm).

### Running

`node src/index.js --source="path\to\source.json"`

Note: your source file is also your output file.

### Adding repositories

Repositories are stored in the respective webpage data file, such as [pgm.json in `settings.maps.sources`](https://raw.githubusercontent.com/MCResourcePile/mcresourcepile.github.io/source/src/data/maps/pgm.json).


| Option            | Description                                                                         |
|-------------------|-------------------------------------------------------------------------------------|
| `"maintainer"`    | The username of the maintainer.                                                     |
| `"repository"`    | The name of the repository.                                                         |
| `"branch"`        | The main branch.                                                                    |
| `"url"`           | Full URL to the Git host frontend of the repository.                                |
| `"includes_url"`  | Full URL to the Git host frontend to the XML includes folder.                       |
| `"license_scope"` | Specify whether maps are licensed as a `repository` or individually per `map`.      |
| `"license"`       | The repository license. Only used if license scope is set to `repository`.          |
| `"global_tags"`   | An array of tags to apply to all maps in the repository. Optional.                  |

```json
 {
   "maintainer": "OvercastCommunity",
   "repository": "public-competitive",
   "branch": "master",
   "url": "https://github.com/OvercastCommunity/public-competitive",
   "includes_url": "https://github.com/OvercastCommunity/PublicMaps/tree/main/includes",
   "license_scope": "map",
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
        "2teams",
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
        },
        "pools": [
            "sample-pool"
        ]
    },
    "variants": [
        {
            "id": "sticky_situation",
            "name": "War Wars: Sticky Situation",
            "override_name": true,
            "world": true,
            "internal_id": "overcastnetwork_maps_war_wars_sticky_situation"
        }
    ]
}
```
