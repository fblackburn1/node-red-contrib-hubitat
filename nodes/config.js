module.exports = function(RED) {
  const fetch = require('node-fetch');

  function HubitatConfigNode(config) {
    RED.nodes.createNode(this,config);
    this.name = config.name;
    this.usetls = config.usetls;
    this.host = config.host;
    this.port = config.port;
    this.token = config.token;
    this.api_id = config.api_id;

    const scheme = ((this.usetls) ? 'https': 'http');
    this.base_url = `${scheme}://${this.host}:${this.port}/apps/api/${this.api_id}`;
  }

  RED.nodes.registerType("hubitat config", HubitatConfigNode);

  RED.httpAdmin.get('/hubitat/devices', RED.auth.needsPermission('hubitat.read'), async function(req, res) {
    console.log("GET /hubitat/devices");
    if ((!req.query.host) || (!req.query.port) || (!req.query.api_id) || (!req.query.token)) {
      res.send(404);
      return;
    }
    const scheme = ((req.query.usetls == 'true') ? 'https': 'http');
    const base_url = `${scheme}://${req.query.host}:${req.query.port}/apps/api/${req.query.api_id}`;
    const options = {method: 'GET'}
    let url = `${base_url}/devices`;
    console.log(`GET ${url}`);
    url = `${url}?access_token=${req.query.token}`;

    try {
      const response = await fetch(url, options);
      res.json(await response.json());
    }
    catch(err) {
      console.log("ERROR /hubitat/devices:");
      console.log(err);
      res.send(err);
    }
  });

  RED.httpAdmin.get('/hubitat/devices/:device_id/commands', RED.auth.needsPermission('hubitat.read'), async function(req, res) {
    console.log("GET /hubitat/devices/" + req.params.device_id + "/commands");
    if ((!req.query.host) || (!req.query.port) || (!req.query.api_id) || (!req.query.token)) {
      res.send(404);
      return;
    }
    const scheme = ((req.query.usetls == 'true') ? 'https': 'http');
    const base_url = `${scheme}://${req.query.host}:${req.query.port}/apps/api/${req.query.api_id}`;
    const options = {method: 'GET'}
    let url = `${base_url}/devices/${req.params.device_id}/commands`;
    console.log(`GET ${url}`);
    url = `${url}?access_token=${req.query.token}`;

    try {
      const response = await fetch(url, options);
      res.json(await response.json());
    }
    catch(err) {
      console.log("ERROR /hubitat/devices/" + req.params.device_id + "/commands:");
      console.log(err);
      res.send(err);
    }
  });
}
