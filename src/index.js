const dotenv = require("dotenv").config();
const fetch = require("node-fetch");
const xml = require("xml2js");
const yaml = require("yaml");
const fs = require("fs");
const path = require("path");
const git = require("simple-git").simpleGit();
const nbt = require("nbt");

const parseRepo = async (root, source, pools = []) => {
  const IGNORE_DIRS = [".git", ".github", "region"];
  var maps = [];

  const files = fs.readdirSync(root);
  for (var i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(root, file);
    const stat = fs.lstatSync(filePath);

    if (stat.isDirectory() && !IGNORE_DIRS.includes(file)) {
      var nestedMaps = await parseRepo(filePath, source, pools);
      if (nestedMaps) maps = [].concat(maps, nestedMaps);
    } else if (file === "map.xml") {
      var defaultMap = {};
      const processMapDir = async (filePath, source, variant = "default", variant_info = {}) => {
        var map = await parseMap(filePath, source, variant, variant_info);
        if (source.maintainer === "OvercastCommunity") {
          for (const pool in pools) {
            if (pools[pool]["maps"].includes(map["name"])) {
              (map["source"]["pools"] = map["source"]["pools"] || []).push(pools[pool]["display-name"] || pool);
            };
          };
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

  const getSupportedVersions = (node) => {
      var versions = {};
      var min = node.hasOwnProperty("min-server-version") ? node["min-server-version"] : source?.min_server_version;
      var max = node.hasOwnProperty("max-server-version") ? node["max-server-version"] : undefined;

      if (min) versions["min"] = min;
      if (max) versions["max"] = max;

      if (Object.keys(versions).length === 0)
        return false;

      return versions;
  }

  if (xmlData.map.variant) {
    if (variant !== "default") {
      var defaultVariant = {
        "id": "default",
        "name": xmlData.map.name[0],
        "override_name": true,
        "world": false,
        "internal_id": toSlug([source.maintainer, source.repository, xmlData.map.name[0]].join("_"))
      };
      if (Object.keys(getSupportedVersions(xmlData.map.$)).length > 0) {
        defaultVariant["server_version"] = getSupportedVersions(xmlData.map.$);
      };
      variants.push(defaultVariant);
    };

    for (var i in xmlData.map.variant) {
      if (xmlData.map.variant[i].$.id === "default") {
        if (variant === "default")
          variant_info["world"] = xmlData.map.variant[i].$.hasOwnProperty("world") ? xmlData.map.variant[i].$.world : false;
        continue;
      }

      if (xmlData.map.variant[i].$.id !== variant) {
        var newVariant = {
          "id": xmlData.map.variant[i].$.id,
          "name": xmlData.map.variant[i].$.hasOwnProperty("override") && xmlData.map.variant[i].$.override === "true" ? xmlData.map.variant[i]._ : `${xmlData.map.name[0]}: ${xmlData.map.variant[i]._}`,
          "override_name": xmlData.map.variant[i].$.hasOwnProperty("override") ? xmlData.map.variant[i].$.override === "true" : false,
          "world": xmlData.map.variant[i].$.hasOwnProperty("world") ? xmlData.map.variant[i].$.world : false
        };
        newVariant["internal_id"] = toSlug([source.maintainer, source.repository, newVariant["name"]].join("_"));
        if (Object.keys(getSupportedVersions(xmlData.map.$)).length > 0) {
          newVariant["server_version"] = getSupportedVersions(xmlData.map.$);
        };
        if (Object.keys(getSupportedVersions(xmlData.map.variant[i].$)).length > 0) {
          newVariant["server_version"] = getSupportedVersions(xmlData.map.variant[i].$);
        };
        variants.push(newVariant);
      };
    };
  };

  const preprocessXml = (node, variant) => {
    for (var [key, value] of Object.entries(node)) {
      if (["if", "unless"].includes(key)) {
        for (var i in value) {
          var insertBlock = false;
          var condition = value[i];
          if (!condition.$) continue;

          if (condition.$.hasOwnProperty("variant")) {
            var variantValues = condition.$.variant.split(",");
            variantValues = variantValues.map(s => s.trim());
            insertBlock = variantValues.includes(variant);
          };

          if (condition.$.hasOwnProperty("has-variant")) {
            insertBlock = variants.some(v => v.id === condition.$.variant);
          };

          if (condition.$.hasOwnProperty("constant")) {
            var constant = condition.$.constant;
            var constantComparison = condition.$.hasOwnProperty("constant-comparison") ? condition.$["constant-comparison"].replace(/ /g,"_") : "defined_value";
            var constantComparisonValue = condition.$.hasOwnProperty("constant-value") ? condition.$["constant-value"] : undefined;
            var isDefined = constants.hasOwnProperty(constant);

            switch (constantComparison) {
              case "undefined":
                insertBlock = !isDefined;
                break;
              case "defined":
                insertBlock = isDefined;
                break;
              case "defined_delete":
                insertBlock = isDefined && constants[constant] == undefined;
                break;
              case "defined_value":
                insertBlock = isDefined && constants[constant] != undefined;
                break;
              case "equals":
                insertBlock = constants[constant] === constantComparisonValue;
                break;
              case "contains":
                insertBlock = constants[constant].includes(constantComparisonValue);
                break;
              case "regex":
                var value = constants[constant] || "";
                var matcher = value.match(constantComparisonValue);

                insertBlock = matcher != null;
                break;
              case "range":
                // https://github.com/PGMDev/PGM/blob/dev/util/src/main/java/tc/oc/pgm/util/xml/XMLUtils.java#L405
                const RANGE_DOTTED = /\s*(-oo|-?\d*\.?\d+)?\s*\.{2}\s*(oo|-?\d*\.?\d+)?\s*/;
                var matcher = constantComparisonValue.match(RANGE_DOTTED);
                var lowerBound = (matcher[1] == undefined || matcher[1] === "-oo") ? Number.NEGATIVE_INFINITY : parseInt(matcher[1]);
                var upperBound = (matcher[2] == undefined || matcher[2] === "oo") ? Number.POSITIVE_INFINITY : parseInt(matcher[2]);
                var constantInt = parseInt(constants[constant]);

                insertBlock = constantInt > lowerBound && constantInt < upperBound;
                break;
              default:
                console.log(`Unexpected constant conditional: ${constantComparison}`);
            };
          };

          if (key === "if" && insertBlock || key === "unless" && !insertBlock) {
            delete value[i]["$"];
            preprocessXml(value[i], variant);
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
      var imageTestPath = target.replace("map.xml", `${variant_info.world}/map.png`);
      return fs.existsSync(imageTestPath);
    };

    if (source.url.includes("github.com")) {
      return `https://raw.githubusercontent.com/${source.maintainer}/${source.repository}/${source.branch}/${mapDir}${variant_info.world && variantHasUniqueImage() ? "/" + variant_info.world : ""}/map.png`
    };
    if (source.url.includes("gitlab.com")) {
      return `https://gitlab.com/${source.maintainer}/${source.repository}/-/raw/${source.branch}/${mapDir}${variant_info.world && variantHasUniqueImage() ? "/" + variant_info.world : ""}/map.png`
    };
  };

  var mapLicense = determineMapLicense(target, source);

  mapSource = {
    maintainer: source.maintainer,
    repository: source.repository,
    path: `${mapDir}${variant_info.world ? "/" + variant_info.world : ""}`,
    license: mapLicense.license,
    license_scope: mapLicense.scope,
    github_url: source.url + "/tree/" + source.branch + "/" + mapDir,
    image_url: mapImageUrl(source, mapDir)
  };

  const insertIncludeXml = async () => {
    for (var i = 0; i < xmlData.map.include.length; i++) {
      var includeReference = xmlData.map.include[i].$.id ? xmlData.map.include[i].$.id : xmlData.map.include[i].$.src;
      if (includeReference) {
        includeReference = includeReference.replace(/(\.\.\/|\.xml)/g, "");
        if (includes.files.includes(xmlData.map.include[i].$.id)) continue;

        if (includes["root"] !== false) {
          console.log("Fetching include data from", getRawUrl(`${source.includes_url}/${includeReference}.xml`));
          var res = await fetch(getRawUrl(`${source.includes_url}/${includeReference}.xml`), {
            method: "get",
            headers: {
              "User-Agent": "NodeJS"
            }
          });
          if (res.ok) {
            includes["files"].push(includeReference);
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

  var includes = {
    root: source.includes_url || false,
    files: []
  };

  if (xmlData.map.include) {
    var initialIncludeCount = 0;
    do {
      initialIncludeCount = xmlData.map.include.length;
      await insertIncludeXml();
      preprocessXml(xmlData.map, variant);
    } while (initialIncludeCount !== xmlData.map.include.length);
  };

  const usesSoundKeysInclude = (node) => {
    var string = JSON.stringify(node);
    var pattern = /"key":"\${(entity|block)\..+}"/gi;
    return pattern.test(string);
  };
  if (usesSoundKeysInclude(xmlData.map)) {
    includes["files"].push("sound-keys");
  };

  if (includes["files"].length > 0) {
    mapSource["includes"] = includes;
  };

  const parseConstants = (constantList, fallback = false) => {
    if (constantList) {
      constantList.forEach((constant, i) => {
        if (fallback && constants.hasOwnProperty(constant.$.id)) { return };

        constants[constant.$.id] = constant._;
      });
    };
  };
  if (xmlData.map.constants) {
    xmlData.map.constants.forEach((constants, i) => {
      var fallback = (constants.hasOwnProperty("$") && constants.$.hasOwnProperty("fallback")) ? constants.$.fallback.toLowerCase() === "true" : false;
      parseConstants(constants.constant, fallback);
    });
  };
  if (xmlData.map.constant) {
    parseConstants(xmlData.map.constant);
  };
  preprocessXml(xmlData.map, variant);

  const insertConstantValues = (node) => {
    var tmp = JSON.stringify(node);
    var pattern = /\${([\w-_ ]*)}/g;
    tmp = tmp.replace(pattern, (keyExpr, key) => {
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

  if (variant == "default" && getSupportedVersions(xmlData.map.$)) {
    map["server_version"] = getSupportedVersions(xmlData.map.$);
  };
  if (variant != "default" && variant_info.server_version) {
    map["server_version"] = variant_info.server_version;
  };

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
  map["player_capacity"] = 0;
  if (xmlData.map.teams) {
    for (var i in xmlData.map.teams[0].team) {
      var team = xmlData.map.teams[0].team[i];
      map["teams"].push({
        name: team._,
        color: toSlug(team.$.color),
        size: team.$.max
      });
      map["player_capacity"] += parseInt(team.$.max);
    };
  };
  if (xmlData.map.players) {
    map["teams"].push({
      name: "Players",
      color: "yellow",
      size: xmlData.map.players[0].$.max
    });
    map["player_capacity"] += parseInt(xmlData.map.players[0].$.max);
  };

  map["tags"] = [];
  if (xmlData.map.teams && xmlData.map.teams[0].team) map["tags"].push(`${xmlData.map.teams[0].team.length}teams`);
  if (map["teams"].length === 2 && ["attacker", "attackers", "defender", "defenders"].includes(map["teams"][0]["name"].toLowerCase())) map["tags"].push("a/d");
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

const determineMapLicense = (target, source) => {
  const scope = source.license_scope;
  var license = "unresolved";
  var referenced_scope = "unresolved";

  const resolveLicenseTxt = (target) => {
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
        keywords: ["Xerocoles", "Xerorca"]
      }
    ];

    for (var i = 0; i < licenseTypes.length; i++) {
      for (var j = 0; j < licenseTypes[i].keywords.length; j++) {
        if (!data.includes(licenseTypes[i].keywords[j])) continue;

        return licenseTypes[i].license;
      };
    };

    return "unresolved";
  };

  switch (scope) {
    case "repository":
      license = source.license;
      referenced_scope = "repository";
      break;
    case "map":
      license = resolveLicenseTxt(target);
      referenced_scope = "map";
      break;
    case "mixed":
      license = resolveLicenseTxt(target);
      referenced_scope = "map";

      if (license === "not-found") {
        license = source.license;
        referenced_scope = "repository";
      }
      break;
    default:
      license = "not-found";
  };

  return { license: license, scope: referenced_scope };
};

const toSlug = (string) => {
  return string.toLowerCase().replace(/[^\w ]+/g, "").replace(/ +/g, "_");
};

const getRawUrl = (url) => {
  if (url.includes("github.com")) {
    url = url.replace("https://github.com/", "https://raw.githubusercontent.com/");
    url = url.replace("/tree/", "/");
  };
  if (url.includes("gitlab.com")) {
    url = "";
  };

  return url;
};

const main = async () => {
  const args = require("yargs")(process.argv.slice(2))
    .option("source", {
      alias: "s",
      describe: "Source/template file path"
    })
    .option("dry", {
      alias: "d",
      describe: "Dry run; don't redownload temp map files",
      type: "boolean"
    })
    .demandOption(["source"])
    .help()
    .argv;

  var templateData = JSON.parse(fs.readFileSync(args.source, "utf8"));

  const tmpDir = path.join(__dirname, "..", "tmp");
  if (!args.dry) {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
    fs.mkdirSync(tmpDir);
  }

  var mapsOutput = [];

  for (var i = 0; i < templateData.settings.maps.sources.length; i++) {
    const source = templateData.settings.maps.sources[i];
    const repoDir = path.join(tmpDir, source.maintainer, source.repository);

    console.log(`Fetching maps from ${source.maintainer}/${source.repository}`);
    if (!args.dry) {
      await git.clone(source.url, repoDir);
    }

    var pools = [];
    if (source.maintainer === "OvercastCommunity") {
      const getNestedPoolMaps = (subpool) => {
        if (subpool.constructor === Object) {
          return subpool["maps"];
        };

        if (subpool.constructor === Array) {
          return subpool;
        };

        return [];
      };

      const poolsUrl = "https://raw.githubusercontent.com/OvercastCommunity/MapPools/master/map-pools.yml";
      const poolsFile = await fetch(poolsUrl, {
        method: "get",
        headers: {
          "User-Agent": "NodeJS"
        }
      });
      const poolsData = await poolsFile.text();
      pools = yaml.parse(poolsData);
      pools = pools["pools"];

      for (const pool in pools) {
        if (pools[pool]["maps"] && pools[pool]["maps"].constructor === Object) {
          var maps = [];
          for (const subpool in pools[pool]["maps"]) {
            maps = [...maps, ...getNestedPoolMaps(pools[pool]["maps"][subpool])];
          };
          pools[pool]["maps"] = maps;
        };
      };
    };

    var foundMaps = await parseRepo(repoDir, source, pools);
    if (foundMaps) mapsOutput = [].concat(mapsOutput, foundMaps);
  };

  const outputFile = args.output ? args.output : path.join(__dirname, "..", "output.json");
  if (fs.existsSync(outputFile)) fs.rmSync(outputFile);

  templateData.data.maps = [...new Set(mapsOutput)];
  fs.writeFile(args.source, JSON.stringify(templateData, null, 4), (err) => {
    if (err) return console.log(err);
  });
};

main();
