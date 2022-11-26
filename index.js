const dotenv = require("dotenv").config();
const fetch = require("node-fetch");
const xml = require("xml2js");

const PER_PAGE_COUNT = 100; // max 100
const SOURCES = [
  {
    "maintainer": "OvercastCommunity",
    "repository": "CommunityMaps",
    "license": "cc-by-sa"
  }
];

const fetchMapList = async (source, page = 1) => {
  const endpoint = `https://api.github.com/search/code?per_page=${PER_PAGE_COUNT}&page=${page}&q=filename:map.xml+extension:xml+repo:${source.maintainer}/${source.repository}`;
  const options = {
    method: "get",
    headers: {
      "User-Agent": "NodeJS",
      "Authorization": "Token " + process.env.API_TOKEN
    }
  };

  var res = await fetch(endpoint, options);
  var data = await res.json();

  return {
    maps: data.items,
    results: data.items.length || 0,
    total_results: data.total_count
  };
};

const main = async function() {
  var mapsOutput = [];

  for (var i = 0; i < SOURCES.length; i++) {
    const source = SOURCES[i];

    console.log(`Fetching maps from ${source.maintainer}/${source.repository}`);

    var page = 1;
    var initResult = await fetchMapList(source, page);

    var foundMaps = initResult.maps;
    var totalMaps = initResult.total_results;
    var countedMaps = initResult.results;

    while (countedMaps < totalMaps) {
      page += 1;

      var result = await fetchMapList(source, page);
      countedMaps += result.results;
      foundMaps = [...foundMaps, ...result.maps];

      console.log(countedMaps)
    }

  }
};

main();
