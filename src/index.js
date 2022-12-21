const dotenv = require("dotenv").config();
const fetch = require("node-fetch");
const xml = require("xml2js");
const fs = require("fs");

const PER_PAGE_COUNT = 100; // max 100
const SOURCES = require("./sources").SOURCES;

const fetchMapList = async (source, page = 1) => {
  const endpoint = `https://api.github.com/search/code?per_page=${PER_PAGE_COUNT}&page=${page}&q=filename:map.xml+extension:xml+repo:${source.maintainer}/${source.repository}`;
  const options = {
    method: "get",
    headers: {
      "User-Agent": "NodeJS",
      "Authorization": "Bearer " + process.env.API_TOKEN
    }
  };
  const res = await fetch(endpoint, options);
  const data = await res.json();

  if (res.status === 403) {
    console.log("Hit API limit, waiting...");
    console.log(data);
    await sleep(20000);
  };

  if (!data.items) return false;

  return {
    maps: data.items,
    results: data.items.length,
    total_results: data.total_count
  };
};

const parseMapInfo = async (target, source) => {
  const path = target.path;
  const ref = target.url.split("?ref=")[1];
  const endpoint = `https://raw.githubusercontent.com/${target.repository.full_name}/${source.branch}/${path}`;
  const options = {
    method: "get",
    headers: {
      "User-Agent": "NodeJS"
    }
  };
  const res = await fetch(endpoint, options);
  const data = await res.text();

  var map = {};

  xml.parseString(data, (err, result) => {
    console.log(`Parsing map data from ${path}`);

    map["name"] = result.map.name[0];
    map["slug"] = toSlug(result.map.name[0]);
    map["id"] = toSlug([target.repository.owner.login, target.repository.name, result.map.name[0]].join("_"));
    map["proto"] = result.map.$.proto;
    map["version"] = result.map.version[0];
    if (result.map.objective) map["objective"] = result.map.objective[0];
    if (result.map.created) map["created"] = result.map.created[0];
    map["phase"] = result.map.phase ? result.map.phase[0] : "production";
    map["edition"] = result.map.edition ? result.map.edition[0] : "standard";

    map["authors"] = [];
    for (var i in result.map.authors[0].author) {
      var author = {};
      if (result.map.authors[0].author[i].$) {
        if (result.map.authors[0].author[i].$.uuid) {
          author["uuid"] = result.map.authors[0].author[i].$.uuid;
        };
        if (result.map.authors[0].author[i].$.contribution) {
          author["contribution"] = result.map.authors[0].author[i].$.contribution;
        };
      } else {
        author["username"] = result.map.authors[0].author[i]._ ? result.map.authors[0].author[i]._ : result.map.authors[0].author[i];
      };

      map["authors"].push(author);
    };

    if (result.map.contributors) {
      map["contributors"] = [];
      for (var i in result.map.contributors[0].contributor) {
        var contributor = {};
        if (result.map.contributors[0].contributor[i].$) {
          if (result.map.contributors[0].contributor[i].$.uuid) {
            contributor["uuid"] = result.map.contributors[0].contributor[i].$.uuid;
          };
          if (result.map.contributors[0].contributor[i].$.contribution) {
            author["contribution"] = result.map.contributors[0].contributor[i].$.contribution;
          };
        } else {
          contributor["username"] = result.map.contributors[0].contributor[i]._ ? result.map.contributors[0].contributor[i]._ : result.map.contributors[0].contributor[i];
        };

        map["contributors"].push(contributor);
      };
    };

    map["teams"] = [];
    if (result.map.teams) {
      for (var i in result.map.teams[0].team) {
        var team = result.map.teams[0].team[i];
        map["teams"].push({
          name: team._,
          color: toSlug(team.$.color),
          size: team.$.max
        });
      };
    };
    if (result.map.players) {
      map["teams"].push({
        name: "Players",
        color: "yellow",
        size: result.map.players[0].$.max
      });
    };

    map["tags"] = [];
    if (result.map.teams)        map["tags"].push(`${result.map.teams[0].team.length}teams`);
    if (result.map.players)      map["tags"].push("ffa");
    if (result.map.cores)        map["tags"].push("core");
    if (result.map.destroyables) map["tags"].push("monument");
    if (result.map.wools)        map["tags"].push("wool");
    if (result.map.payloads)     map["tags"].push("payload");
    // todo: differentiate between classic ctf, kotf, etc
    if (result.map.flags)        map["tags"].push("flag");

    if (result.map.king || result.map["control-points"]) {
      (result.map.score) ? map["tags"].push("hill", "king") : map["tags"].push("hill", "control");
    };

    if (result.map.blitz)        map["tags"].push("blitz");
    if (result.map.rage)         map["tags"].push("rage");
    if (result.map.time)         map["tags"].push("timelimit");
    if (result.map.score && result.map.score[0].kills) map["tags"].push("deathmatch");
    if (result.map.score && result.map.score[0].box)   map["tags"].push("scorebox");

    if (map["edition"] !== "standard") map["tags"].push(map["edition"]);
    if (path.toLowerCase().includes("competitive")) map["tags"].push("tournament");

    // include any special tags
    if (path.toLowerCase().includes("christmas")) map["tags"].push("christmas");
    if (path.toLowerCase().includes("halloween")) map["tags"].push("halloween");
    // warzone seasonal folders
    if (path.toLowerCase().includes("holiday")) map["tags"].push("christmas");
    if (path.toLowerCase().includes("spooky")) map["tags"].push("halloween");

    if (source.global_tags) {
      map["tags"] = [].concat(map["tags"], source.global_tags);
    };

    // remove duplicate tag entries
    map["tags"] = [...new Set(map["tags"])];

    map["source"] = {
      maintainer: source.maintainer,
      repository: source.repository,
      path: target.path.split("/map.xml")[0],
      license: result.map.license ? result.map.license[0] : source.license,
      license_scope: "repository",
      github_url: `https://github.com/${target.repository.full_name}/tree/${source.branch}/${path.split("/map.xml")[0]}`,
      image_url: `https://raw.githubusercontent.com/${target.repository.full_name}/${source.branch}/${path.split("/map.xml")[0]}/map.png`
    };

    if (result.map.include) {
      var include = {
        root: source.includes_root_url || "https://github.com/MCResourcePile/pgm-includes",
        files: []
      };
      for (var i = 0; i < result.map.include.length; i++) {
        if (result.map.include[i].$.id) include["files"].push(`${result.map.include[i].$.id}.xml`);
      };
      map["source"].push(include);
    };
  });

  return map;
}

const determineMapLicense = async (target, source) => {
  const path = target.path;
  const ref = target.url.split("?ref=")[1];
  const endpoint = `https://raw.githubusercontent.com/${target.repository.full_name}/${source.branch}/${path.replace("/map.xml", "/LICENSE.txt")}`;
  const options = {
    method: "get",
    headers: {
      "User-Agent": "NodeJS"
    }
  };
  const res = await fetch(endpoint, options);
  const data = await res.text();

  if (res.status === 404) {
    return "not-found";
  };

  const licenseTypes = [
    {
      license: "cc-by",
      keywords: ["Creative Commons Attribution ", "/by/"]
    },
    {
      license: "cc-by-sa",
      keywords: ["Creative Commons Attribution-ShareAlike ", "/by-sa/"]
    },
    {
      license: "cc-by-nd",
      keywords: ["Creative Commons Attribution-NoDerivatives ", "/by-nd/"]
    },
    {
      license: "cc-by-nc",
      keywords: ["Creative Commons Attribution-NonCommercial ", "/by-nc/"]
    },
    {
      license: "cc-by-nc-sa",
      keywords: ["Creative Commons Attribution-NonCommercial-ShareAlike ", "/by-nc-sa/"]
    },
    {
      license: "cc-by-nc-nd",
      keywords: ["Creative Commons Attribution-NonCommercial-NoDerivs ", "/by-nc-nd/"]
    },
    {
      license: "copr-xerocoles",
      keywords: ["Xerocoles"]
    }
  ];

  var license = "unresolved";
  for (var i = 0; i < licenseTypes.length; i++) {
    for (var j = 0; j < licenseTypes[i].keywords.length; j++) {
      if (!data.includes(licenseTypes[i].keywords[j])) continue;

      license = licenseTypes[i].license;
      break;
    }
    if (license !== "unresolved") break;
  }

  return license;
}

const toSlug = (string) => {
  return string.toLowerCase().replace(/[^\w ]+/g, '').replace(/ +/g, '_');
}

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const main = async () => {
  var mapsOutput = [];

  for (var i = 0; i < SOURCES.length; i++) {
    const source = SOURCES[i];

    console.log(`Fetching maps from ${source.maintainer}/${source.repository}`);

    var page = 1;
    var initResult = await fetchMapList(source, page);

    var foundMaps = initResult.maps || [];
    var totalMaps = initResult.total_results || 0;
    var countedMaps = initResult.results || 0;
    var maxPages = Math.ceil(totalMaps / PER_PAGE_COUNT);
    console.log(`Total maps: ${totalMaps}`)
    console.log(`Pages: ${maxPages}`)
    page += 1;

    while (page <= maxPages) {
      var result = await fetchMapList(source, page);

      if (!result) {
        console.log("Returned empty result, retrying...");
        continue;
      }

      if (result.results !== PER_PAGE_COUNT && page !== maxPages) {
        console.log("Returned incomplete result, retrying...");
        continue;
      }

      countedMaps += result.results;
      foundMaps = [...foundMaps, ...result.maps];
      console.log(`Counted maps: ${countedMaps}`);
      page += 1;
    };

    console.log(`Found ${foundMaps.length} maps`);

    if (foundMaps.length) {
      for (var j = 0; j < foundMaps.length; j++) {
        var mapObj = await parseMapInfo(foundMaps[j], source);

        if (!mapObj) continue;

        if (mapObj.source.license === "ambiguous") {
          mapObj.source.license = await determineMapLicense(foundMaps[j], source);
          mapObj.source.license_scope = "map";
        };

        mapsOutput.push(mapObj);
      };
    };
  };

  mapsOutput = [...new Set(mapsOutput)];
  fs.writeFile("output.json", JSON.stringify(mapsOutput, null, 4), (err) => {
    if (err) return console.log(err);
  });
};

main();
