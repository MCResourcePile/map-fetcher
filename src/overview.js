const dotenv = require("dotenv").config();
const fetch = require("node-fetch");
const { spawn } = require("child_process");
const xml = require("xml2js");
const fs = require("fs");
const path = require("path");
const git = require("simple-git").simpleGit();

const VARIANT_REGEX = /[^\\/]+(?=[\\/][^\\/]+$)/;
const TMP_REGEX = /^.*?\\tmp/;
const IGNORE_DIRS = [".git", ".github", "region"];

const parseRepo = async (root, source, output) => {

  const files = fs.readdirSync(root);
  for (var i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(root, file);
    const stat = fs.lstatSync(filePath);

    if (stat.isDirectory() && !IGNORE_DIRS.includes(file)) {
      await parseRepo(filePath, source, output);
    } else if (file === "map.xml") {
      await parseMap(filePath, source, output);
    }
  }
}

const parseMap = async (target, source, output) => {
  console.log(`Starting ${target}`);

  var xmlData;
  const data = fs.readFileSync(target, 'utf8');
  xml.parseString(data, async (err, result) => {
    xmlData = result;
  });

  const workingTarget = target.replaceAll("\\", "/");
  const repoSegment = `/${source.maintainer}/${source.repository}/`;
  const mapPath = workingTarget.split(repoSegment)[1].replace("/map.xml", "");
  const folderPath = workingTarget.match(/(.+)\/map\.xml$/)[1];
  const save = path.join(output, "objects", source.maintainer, source.repository, mapPath);
  const versionFile = path.join(save, "version");
  const version = xmlData.map.version ? xmlData.map.version[0] : "1.0.0";

  if (fs.existsSync(versionFile)) {
    const savedVersion = fs.readFileSync(versionFile, "utf8");
    if (version === savedVersion) {
      console.log(`Skipping as saved version matches current version (${savedVersion})`);
      return;
    }
  } else {
    fs.mkdirSync(save, { recursive: true });
  }

  await locateWorlds(folderPath, save, output, 0);
  fs.writeFileSync(versionFile, version);
}

const locateWorlds = async (currentPath, save, root, depth) => {
  const files = fs.readdirSync(currentPath);
  for (var i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(currentPath, file);
    const stat = fs.lstatSync(filePath);

    if (stat.isDirectory() && !IGNORE_DIRS.includes(file)) {
      await locateWorlds(filePath, save, root, depth+1);
    } else if (file === "level.dat") {
      await generateOverview(filePath, save, root, depth);
    }
  }
}

const generateOverview = async (world, save, root, depth) => {
  const variant = depth > 0 ? world.match(VARIANT_REGEX)[0] : "default";
  const worldDir = world.replace("level.dat", "");
  const chunkBounds = await getChunkBounds(worldDir);

  const output = path.join(save, variant);
  const texOutput = path.join(output, "tex");

  fs.mkdirSync(output, { recursive: true });

  return new Promise((resolve, reject) => {
    const process = spawn("java", [
      "-jar",
      "./tmp/jmc2Obj.jar",
      "--render-sides",
      "--block-randomization",
      "--optimize-geometry",
      "--texturescale", 4,
      "--tex-export", "base,alpha",
      "--chunks", chunkBounds.chunkString,
      "--output", output,
      worldDir
    ]);

    process.stdout.on('data', (data) => {
      console.log(data.toString());
    });

    process.stderr.on('data', (data) => {
      console.error(data.toString());
    });

    process.on('close', (code) => {
      if (code === 0) {
        if (fs.existsSync(texOutput)) {
          fs.cpSync(texOutput, path.join(root, "textures"), {
            recursive: true,
            errorOnExist: false
          });
          fs.rmSync(texOutput, { recursive: true, force: true });
        }

        console.log(`Saved to ${output}`);

        const objFile = path.join(output, "minecraft.obj");
        if (fs.existsSync(objFile)) {
          const stats = fs.statSync(objFile);
          const sizeMB = stats.size / (1024 * 1024);
          if (sizeMB > 99) {
            fs.rmSync(output, { recursive: true, force: true });
            console.log(`Deleting output as file is too large (TODO: add support) (${sizeMB.toFixed(2)} MB)`);
          }
        }
        resolve(code);
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    process.on('error', (error) => {
      console.error(`Failed to start process: ${error.message}`);
      reject(error);
    });
  });
}

const getChunkBounds = async (worldDir) => {
  const regionDir = path.join(worldDir, "region");

  if (!fs.existsSync(regionDir)) return {
    chunkString: "-32,32,-32,32"
  };

  const files = fs.readdirSync(regionDir);
  const regionFiles = files.filter(f => f.endsWith(".mca"));

  if (regionFiles.length === 0) {
    return null;
  }

  let minRegionX = Infinity;
  let maxRegionX = -Infinity;
  let minRegionZ = Infinity;
  let maxRegionZ = -Infinity;

  for (const file of regionFiles) {
    const match = file.match(/^r\.(-?\d+)\.(-?\d+)\.mca$/);
    if (match) {
      const regionX = parseInt(match[1]);
      const regionZ = parseInt(match[2]);

      minRegionX = Math.min(minRegionX, regionX);
      maxRegionX = Math.max(maxRegionX, regionX);
      minRegionZ = Math.min(minRegionZ, regionZ);
      maxRegionZ = Math.max(maxRegionZ, regionZ);
    }
  }

  const minChunkX = minRegionX * 32;
  const maxChunkX = (maxRegionX * 32) + 31;
  const minChunkZ = minRegionZ * 32;
  const maxChunkZ = (maxRegionZ * 32) + 31;

  return {
    chunkString: `${minChunkX},${minChunkZ},${maxChunkX},${maxChunkZ}`
  };
}

const toSlug = (string) => {
  return string.toLowerCase().replace(/[^\w ]+/g, "").replace(/ +/g, "_");
}

const main = async () => {
  const args = require("yargs")(process.argv.slice(2))
    .option("source", {
      alias: "s",
      describe: "Source/template file path"
    })
    .option("output", {
      alias: "o",
      describe: "Output directory",
      default: "tmp/overview"
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

  const jmcVersion = process.env.JMC2OBJVERSION;
  const jmcJar = await fetch(`https://github.com/jmc2obj/j-mc-2-obj/releases/download/${jmcVersion}/jMc2Obj-${jmcVersion}.jar`);
  if (!jmcJar.ok) {
    throw new Error(`Failed to download: ${jmcJar.statusText}`);
  }
  const arrayBuffer = await jmcJar.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(`${tmpDir}/jmc2Obj.jar`, buffer);

  const outputDir = path.resolve(args.output);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);


  for (var i = 0; i < templateData.sources.length; i++) {
    const source = structuredClone(templateData.sources[i]);
    const repoDir = path.join(tmpDir, source.maintainer, source.repository);

    console.log(`Fetching maps from ${source.maintainer}/${source.repository}`);
    if (!args.dry) {
      await git.clone(source.url, repoDir);
    }

    await parseRepo(repoDir, source, outputDir);
  }
}

main();
