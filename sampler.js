const fetch = require("node-fetch");
const xml = require("xml2js");

const main = async () => {
  const endpoint = "https://github.com/OvercastCommunity/CommunityMaps/raw/master/koth/standard/forge_ignea/map.xml";
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
