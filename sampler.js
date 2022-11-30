const dotenv = require("dotenv").config();
const fetch = require("node-fetch");
const xml = require("xml2js");

const api = async () => {
  const endpoint = "https://api.github.com/rate_limit";
  const options = {
    method: "get",
    headers: {
      "User-Agent": "NodeJS",
      "Authorization": "Bearer " + process.env.API_TOKEN
    }
  };

  var res = await fetch(endpoint, options);
  var data = await res.json();

  console.log(data)
};

const main = async () => {
  const endpoint = "https://raw.githubusercontent.com/OvercastCommunity/PublicMaps/main/dtcm/standard/bedrock_fortress_battles/map.xml";
  const options = {
    method: "get",
    headers: {
      "User-Agent": "NodeJS"
    }
  };

  var res = await fetch(endpoint, options);
  var data = await res.text();

  xml.parseString(data, (err, result) => {
    console.log(JSON.stringify(result, null, 2));
  });
};

main();
api();
