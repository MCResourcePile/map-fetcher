const dotenv = require("dotenv").config();
const fetch = require("node-fetch");
const xml = require("xml2js");
const fs = require("fs");
const path = require("path");
const git = require("simple-git").simpleGit();

const SOURCES = require("./sources").SOURCES;

const parseRepo = (root, source) => {
  const IGNORE_DIRS = [".git", ".github", "region"];
  var maps = [];

  const files = fs.readdirSync(root);
  files.forEach((file) => {
    const filePath = path.join(root, file);
    const stat = fs.lstatSync(filePath);

    if (stat.isDirectory() && !IGNORE_DIRS.includes(file)) {
      var nestedMaps = parseRepo(filePath, source);
      if (nestedMaps) maps = [].concat(maps, nestedMaps);
    } else if (file === "map.xml") {
      var map = parseMapInfo(filePath, source);
      if (map) maps.push(map);
    };
  });

  return maps;
};

const parseMapInfo = (target, source) => {
  var map = {};
  const data = fs.readFileSync(target, 'utf8');

  xml.parseString(data, (err, result) => {
    console.log(`Parsing map data from ${target}`);

    map["name"] = result.map.name[0];
    map["slug"] = toSlug(result.map.name[0]);
    map["id"] = toSlug([source.maintainer, source.repository, result.map.name[0]].join("_"));
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
    if (target.toLowerCase().includes("competitive")) map["tags"].push("tournament");

    // include any special tags
    if (target.toLowerCase().includes("christmas")) map["tags"].push("christmas");
    if (target.toLowerCase().includes("halloween")) map["tags"].push("halloween");
    // warzone seasonal folders
    if (target.toLowerCase().includes("holiday")) map["tags"].push("christmas");
    if (target.toLowerCase().includes("spooky")) map["tags"].push("halloween");

    if (source.global_tags) {
      map["tags"] = [].concat(map["tags"], source.global_tags);
    };

    // remove duplicate tag entries
    map["tags"] = [...new Set(map["tags"])];

    var workingTarget = target.replaceAll("\\", "/");
    var repoSegment = `/${source.maintainer}/${source.repository}/`;
    var mapDir = workingTarget.split(repoSegment)[1].replace("/map.xml", "");
    var mapImageUrl = (source, mapDir) => {
      if (source.url.includes("github.com")) {
        return `https://raw.githubusercontent.com/${source.maintainer}/${source.repository}/${source.branch}/${mapDir}/map.png`
      };
      if (source.url.includes("gitlab.com")) {
        return `https://gitlab.com/${source.maintainer}/${source.repository}/-/raw/${source.branch}/${mapDir}/map.png`
      };
    };

    map["source"] = {
      maintainer: source.maintainer,
      repository: source.repository,
      path: mapDir,
      license: source.license != "ambiguous" ? source.license : determineMapLicense(target, source),
      license_scope: source.license != "ambiguous" ? "repository" : "map",
      github_url: source.url + "/tree/" + source.branch + "/" + mapDir,
      image_url: mapImageUrl(source, mapDir)
    };

    if (result.map.include) {
      var include = {
        root: source.includes_url || "https://github.com/MCResourcePile/pgm-includes",
        files: []
      };
      for (var i = 0; i < result.map.include.length; i++) {
        if (result.map.include[i].$.id) include["files"].push(result.map.include[i].$.id);
      };
      map["source"]["includes"] = include;
    };
  });

  return map;
}

const determineMapLicense = (target, source) => {
  const licenseTarget = target.replace("map.xml", "LICENSE.txt");
  if (!fs.existsSync(licenseTarget)) return "not-found";
  const data = fs.readFileSync(licenseTarget, 'utf8');

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
    };
    if (license !== "unresolved") break;
  };

  return license;
};

const toSlug = (string) => {
  return string.toLowerCase().replace(/[^\w ]+/g, '').replace(/ +/g, '_');
}

const main = async () => {
  const args = require('yargs').argv;

  const tmpDir = path.join(__dirname, "..", "tmp");
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  fs.mkdirSync(tmpDir);

  var mapsOutput = [];

  for (var i = 0; i < SOURCES.length; i++) {
    const source = SOURCES[i];
    const repoDir = path.join(tmpDir, source.maintainer, source.repository);

    console.log(`Fetching maps from ${source.maintainer}/${source.repository}`);
    await git.clone(source.url, repoDir);
    var foundMaps = parseRepo(repoDir, source);
    if (foundMaps) mapsOutput = [].concat(mapsOutput, foundMaps);

    fs.rmSync(repoDir, { recursive: true })
  };

  fs.rmSync(tmpDir, { recursive: true })

  const outputFile = args.output ? args.output : path.join(__dirname, "..", "pgm.json");
  if (fs.existsSync(outputFile)) fs.rmSync(outputFile);

  const templateUrl = "https://raw.githubusercontent.com/MCResourcePile/mcresourcepile.github.io/source/src/data/maps/pgm.json"
  const res = await fetch(templateUrl, {
    method: "get",
    headers: {
      "User-Agent": "NodeJS"
    }
  });
  const data = await res.text();
  var jsonData = JSON.parse(data);
  jsonData.data.maps = [...new Set(mapsOutput)];

  fs.writeFile(outputFile, JSON.stringify(jsonData, null, 4), (err) => {
    if (err) return console.log(err);
  });
};

main();
