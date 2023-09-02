const dotenv = require("dotenv").config();
const fetch = require("node-fetch");
const xml = require("xml2js");
const fs = require("fs");
const path = require("path");
const git = require("simple-git").simpleGit();
const nbt = require("nbt");

const SOURCES = require("./sources").SOURCES;

const parseRepo = async (root, source) => {
  const IGNORE_DIRS = [".git", ".github", "region"];
  var maps = [];

  const files = fs.readdirSync(root);
  for (var i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(root, file);
    const stat = fs.lstatSync(filePath);

    if (stat.isDirectory() && !IGNORE_DIRS.includes(file)) {
      var nestedMaps = await parseRepo(filePath, source);
      if (nestedMaps) maps = [].concat(maps, nestedMaps);
    } else if (file === "map.xml") {
      var defaultMap = {};
      const processMapDir = async (filePath, source, variant = "default", variant_info = {}) => {
        var map = await parseMap(filePath, source, variant, variant_info);
        var regionDir = filePath.replace("map.xml", "region");
        if (fs.existsSync(regionDir)) {
          var regionInfo = parseRegionInfo(regionDir);
          map["regions"] = regionInfo;
        };
        if (map) maps.push(map);
        if (variant === "default") defaultMap = map;
      };
      await processMapDir(filePath, source);

      if (defaultMap.hasOwnProperty("variants")) {
        for (var j = 0; j < defaultMap.variants.length; j++) {
          await processMapDir(filePath, source, defaultMap.variants[j].id, defaultMap.variants[j]);
        };
      };
    };
  };

  return maps;
};

const parseMap = async (target, source, variant = "default", variant_info) => {
  var map = {};
  var variants = [];
  var constants = {};

  var xmlData;

  const data = fs.readFileSync(target, 'utf8');

  xml.parseString(data, async (err, result) => {
    xmlData = result;
  });

  console.log(`Parsing map data from ${target} (${variant})`);

  if (xmlData.map.variant) {
    if (variant !== "default") {
      variants.push({
        "id": "default",
        "name": xmlData.map.name[0],
        "override_name": true,
        "world": false,
      });
    };

    for (var i in xmlData.map.variant) {
      if (xmlData.map.variant[i].$.id !== variant) {
        variants.push({
          "id": xmlData.map.variant[i].$.id,
          "name": xmlData.map.variant[i].$.hasOwnProperty("override") && xmlData.map.variant[i].$.override === "true" ? xmlData.map.variant[i]._ : `${xmlData.map.name[0]}: ${xmlData.map.variant[i]._}`,
          "override_name": xmlData.map.variant[i].$.hasOwnProperty("override") ? xmlData.map.variant[i].$.override === "true" : false,
          "world": xmlData.map.variant[i].$.hasOwnProperty("world") ? xmlData.map.variant[i].$.world : false
        });
      };
    };
  };

  const preprocessXml = (node, variant) => {
    for (var [key, value] of Object.entries(node)) {
      if (["if", "unless"].includes(key)) {
        for (var i in value) {
          if (!value[i].$) continue;
          var variants = value[i].$.variant.split(",");
          if (key === "if" && variants.includes(variant) || key === "unless" && !variants.includes(variant)) {
            delete value[i]["$"];
            for (var [innerKey, innerValue] of Object.entries(value[i])) {
              if (node.hasOwnProperty(innerKey)) {
                node[innerKey] = node[innerKey].concat(innerValue);
              } else {
                node[innerKey] = innerValue;
              };
            };
          };
        };
      };
      if (typeof value === "object" && key !== "$") {
        preprocessXml(value, variant);
      };
    };
  };
  preprocessXml(xmlData.map, variant);

  var workingTarget = target.replaceAll("\\", "/");
  var repoSegment = `/${source.maintainer}/${source.repository}/`;
  var mapDir = workingTarget.split(repoSegment)[1].replace("/map.xml", "");
  var mapImageUrl = (source, mapDir) => {
    var variantHasUniqueImage = () => {
      var imageTestPath = target.replace("map.xml", `${variant_info.world}\\map.png`);
      return fs.existsSync(imageTestPath);
    };

    if (source.url.includes("github.com")) {
      return `https://raw.githubusercontent.com/${source.maintainer}/${source.repository}/${source.branch}/${mapDir}${variant_info.world && variantHasUniqueImage() ? "/" + variant_info.world : ""}/map.png`
    };
    if (source.url.includes("gitlab.com")) {
      return `https://gitlab.com/${source.maintainer}/${source.repository}/-/raw/${source.branch}/${mapDir}${variant_info.world && variantHasUniqueImage() ? "/" + variant_info.world : ""}/map.png`
    };
  };

  mapSource = {
    maintainer: source.maintainer,
    repository: source.repository,
    path: mapDir,
    license: source.license_scope === "repository" ? source.license : determineMapLicense(target, source),
    license_scope: source.license_scope,
    github_url: source.url + "/tree/" + source.branch + "/" + mapDir,
    image_url: mapImageUrl(source, mapDir)
  };

  const insertIncludeXml = async () => {
    for (var i = 0; i < xmlData.map.include.length; i++) {
      if (xmlData.map.include[i].$.id && !include.files.includes(xmlData.map.include[i].$.id)) {
        var includeReference = xmlData.map.include[i].$.id;
        include["files"].push(includeReference);

        if (include["root"] !== false) {
          console.log("Fetching include data from", getRawUrl(`${source.includes_url}/${includeReference}.xml`));
          var res = await fetch(getRawUrl(`${source.includes_url}/${includeReference}.xml`), {
            method: "get",
            headers: {
              "User-Agent": "NodeJS"
            }
          });
          if (res.ok) {
            const includeFileData = await res.text();
            xml.parseString(includeFileData, async (includeFileErr, includeFileResult) => {
              for (var [includeKey, includeValue] of Object.entries(includeFileResult.map)) {
                if (includeKey === "$") {
                  continue;
                };

                if (xmlData.map.hasOwnProperty(includeKey)) {
                  xmlData.map[includeKey] = xmlData.map[includeKey].concat(includeValue);
                } else {
                  xmlData.map[includeKey] = includeValue;
                };
              };
            });
          };
        };
      };
    };
  };

  if (xmlData.map.include) {
    var include = {
      root: source.includes_url || false,
      files: []
    };
    var initialIncludeCount = 0;
    do {
      initialIncludeCount = xmlData.map.include.length;
      await insertIncludeXml();
      preprocessXml(xmlData.map);
    } while (initialIncludeCount !== xmlData.map.include.length);

    mapSource["includes"] = include;
  };

  console.log(xmlData)

  const parseConstants = (constantList) => {
    if (constantList) {
      constantList.forEach((constant, i) => {
        constants[constant.$.id] = constant._
      });
    };
  };
  if (xmlData.map.constants) {
    xmlData.map.constants.forEach((constants, i) => {
      parseConstants(constants.constant);
    });
  };
  if (xmlData.map.constant) {
    parseConstants(xmlData.map.constant);
  };

  const insertConstantValues = (node) => {
    console.log(constants)
    var tmp = JSON.stringify(node);
    tmp = tmp.replace(/\${([\w-_ ]*)}/g, (keyExpr, key) => {
      if (constants.hasOwnProperty(key)) {
        return constants[key];
      };
    });
    return JSON.parse(tmp);
  };
  xmlData.map = insertConstantValues(xmlData.map);

  map["name"] = variant_info.name ? variant_info.name : xmlData.map.name[0];
  map["slug"] = toSlug(map["name"]);
  map["id"] = toSlug([source.maintainer, source.repository, map["name"]].join("_"));
  map["proto"] = xmlData.map.$.proto;
  map["version"] = xmlData.map.version[0];
  if (xmlData.map.objective) map["objective"] = xmlData.map.objective[0];
  if (xmlData.map.created) map["created"] = xmlData.map.created[0];
  map["phase"] = xmlData.map.phase ? xmlData.map.phase[0] : "production";
  map["edition"] = xmlData.map.edition ? xmlData.map.edition[0] : "standard";

  map["authors"] = [];
  for (var i in xmlData.map.authors[0].author) {
    var author = {};
    if (xmlData.map.authors[0].author[i].$) {
      if (xmlData.map.authors[0].author[i].$.uuid) {
        author["uuid"] = xmlData.map.authors[0].author[i].$.uuid;
      };
      if (xmlData.map.authors[0].author[i].$.contribution) {
        author["contribution"] = xmlData.map.authors[0].author[i].$.contribution;
      };
    };
    if (xmlData.map.authors[0].author[i].hasOwnProperty("_")) {
      author["username"] = xmlData.map.authors[0].author[i]._;
    };
    // for when a username is provided and there are no attributes
    if (typeof xmlData.map.authors[0].author[i] === "string") {
      author["username"] = xmlData.map.authors[0].author[i];
    };

    map["authors"].push(author);
  };

  if (xmlData.map.contributors) {
    map["contributors"] = [];
    for (var i in xmlData.map.contributors[0].contributor) {
      var contributor = {};
      if (xmlData.map.contributors[0].contributor[i].$) {
        if (xmlData.map.contributors[0].contributor[i].$.uuid) {
          contributor["uuid"] = xmlData.map.contributors[0].contributor[i].$.uuid;
        };
        if (xmlData.map.contributors[0].contributor[i].$.contribution) {
          contributor["contribution"] = xmlData.map.contributors[0].contributor[i].$.contribution;
        };
      }
      if (xmlData.map.contributors[0].contributor[i]._) {
        contributor["username"] = xmlData.map.contributors[0].contributor[i]._;
      };
      if (typeof xmlData.map.contributors[0].contributor[i] === "string") {
        contributor["username"] = xmlData.map.contributors[0].contributor[i];
      };

      map["contributors"].push(contributor);
    };
  };

  map["teams"] = [];
  if (xmlData.map.teams) {
    for (var i in xmlData.map.teams[0].team) {
      var team = xmlData.map.teams[0].team[i];
      map["teams"].push({
        name: team._,
        color: toSlug(team.$.color),
        size: team.$.max
      });
    };
  };
  if (xmlData.map.players) {
    map["teams"].push({
      name: "Players",
      color: "yellow",
      size: xmlData.map.players[0].$.max
    });
  };

  map["tags"] = [];
  if (xmlData.map.teams && xmlData.map.teams[0].team) map["tags"].push(`${xmlData.map.teams[0].team.length}teams`);
  if (xmlData.map.players) map["tags"].push("ffa");
  if (xmlData.map.cores) map["tags"].push("core");
  if (xmlData.map.destroyables) map["tags"].push("monument");
  if (xmlData.map.wools) map["tags"].push("wool");
  if (xmlData.map.payloads) map["tags"].push("payload");
  // todo: differentiate between classic ctf, kotf, etc
  if (xmlData.map.flags) map["tags"].push("flag");

  if (xmlData.map.king || xmlData.map["control-points"]) {
    (xmlData.map.score) ? map["tags"].push("hill", "king"): map["tags"].push("hill", "control");
  };

  if (xmlData.map.blitz) map["tags"].push("blitz");
  if (xmlData.map.rage) map["tags"].push("rage");
  if (xmlData.map.time) map["tags"].push("timelimit");
  if (xmlData.map.score && xmlData.map.score[0].kills) map["tags"].push("deathmatch");
  if (xmlData.map.score && xmlData.map.score[0].box) map["tags"].push("scorebox");

  if (map["edition"] !== "standard") map["tags"].push(map["edition"]);
  if (target.toLowerCase().includes("competitive")) map["tags"].push("tournament");

  // include any special tags
  if (target.toLowerCase().includes("christmas") || variant === "christmas") map["tags"].push("christmas");
  if (target.toLowerCase().includes("halloween") || variant === "halloween") map["tags"].push("halloween");
  if (target.toLowerCase().includes("arcade")) map["tags"].push("arcade");
  // warzone seasonal folders
  if (target.toLowerCase().includes("holiday")) map["tags"].push("christmas");
  if (target.toLowerCase().includes("spooky")) map["tags"].push("halloween");

  if (mapSource.hasOwnProperty("includes")) {
    mapSource["includes"]["files"].forEach((includeReference) => {
      // special OCC gamemodes that use standard include files
      if (["4-team-bedwars", "8-team-bedwars"].includes(includeReference)) map["tags"].push("bedwars");
      if ("bridge" === includeReference) map["tags"].push("bridge");
      if ("infection" === includeReference) map["tags"].push("infection");
      if ("gs" === includeReference) map["tags"].push("gs");
    });
  };

  if (source.global_tags) {
    map["tags"] = [].concat(map["tags"], source.global_tags);
  };

  // remove duplicate tag entries
  map["tags"] = [...new Set(map["tags"])];
  map["source"] = mapSource;
  if (variants.length > 0) {
    map["variants"] = variants;
    map["tags"].push("variants");
  };

  return map;
}

const parseRegionInfo = (regionDir) => {
  var regions = {
    min_x: 0,
    min_z: 0,
    max_x: 0,
    max_z: 0
  };

  const files = fs.readdirSync(regionDir);
  files.forEach((file) => {
    var [regionSegmentX, regionSegmentZ] = file.split(".").slice(1, 3).map(v => parseInt(v));
    regions["min_x"] = regionSegmentX < regions["min_x"] ? regionSegmentX : regions["min_x"];
    regions["min_z"] = regionSegmentZ < regions["min_z"] ? regionSegmentZ : regions["min_z"];
    regions["max_x"] = regionSegmentX > regions["max_x"] ? regionSegmentX : regions["max_x"];
    regions["max_z"] = regionSegmentZ > regions["max_z"] ? regionSegmentZ : regions["max_z"];
  });

  regions["min_x"] *= 32;
  regions["min_z"] *= 32;
  regions["max_x"] = (regions["max_x"] + 1) * 32;
  regions["max_z"] = (regions["max_z"] + 1) * 32;

  return regions;
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
  return string.toLowerCase().replace(/[^\w ]+/g, "").replace(/ +/g, "_");
}

const getRawUrl = (url) => {
  if (url.includes("github.com")) {
    url = url.replace("https://github.com/", "https://raw.githubusercontent.com/");
    url = url.replace("/tree/", "/");
  };
  if (url.includes("gitlab.com")) {
    url = "";
  };

  return url;
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
    var foundMaps = await parseRepo(repoDir, source);
    if (foundMaps) mapsOutput = [].concat(mapsOutput, foundMaps);
  };

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
