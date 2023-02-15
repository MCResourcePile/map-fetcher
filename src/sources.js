// use "ambiguous" as the license if the repo isn't uniform
const SOURCES = [
  {
    "maintainer": "OvercastCommunity",
    "repository": "CommunityMaps",
    "url": "https://github.com/OvercastCommunity/CommunityMaps",
    "branch": "master",
    "license": "cc-by-sa",
    "includes_url": "https://github.com/OvercastCommunity/PublicMaps/tree/main/includes"
  },
  {
    "maintainer": "OvercastCommunity",
    "repository": "PublicMaps",
    "url": "https://github.com/OvercastCommunity/PublicMaps",
    "branch": "main",
    "license": "ambiguous",
    "includes_url": "https://github.com/OvercastCommunity/PublicMaps/tree/main/includes"
  },
  {
    "maintainer": "OvercastCommunity",
    "repository": "public-competitive",
    "url": "https://github.com/OvercastCommunity/public-competitive",
    "branch": "master",
    "license": "ambiguous",
    "global_tags": ["tournament"]
  },
  {
    "maintainer": "Warzone",
    "repository": "PublicMaps",
    "url": "https://github.com/Warzone/PublicMaps",
    "branch": "main",
    "license": "cc-by-sa"
  },
  {
    "maintainer": "Xerocoles",
    "repository": "stratus-maps",
    "url": "https://github.com/Xerocoles/stratus-maps",
    "branch": "master",
    "license": "ambiguous"
  },
  {
    "maintainer": "MCResourcePile",
    "repository": "pgm-maps",
    "url": "https://github.com/MCResourcePile/pgm-maps",
    "branch": "master",
    "license": "ambiguous"
  }

  // {
  //   "maintainer": "mitchts",
  //   "repository": "sample-maps",
  //   "license": "ambiguous",
  //   "url": "https://github.com/mitchts/sample-maps",
  //   "branch": "main"
  // }
];

exports.SOURCES = SOURCES;
