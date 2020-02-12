module.exports = function(RED) {
  const fetch = require('node-fetch');

  let nodes = {};
  let callbacks = [];

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

    let node = this;

    if ((!node.host) || (!node.port) || (!node.token) || (!node.api_id)) {
      return;
    }

    node.getDevice = async function(device_id, type) {
      const url = `${node.base_url}/devices/${device_id}?access_token=${node.token}`;
      const options = {method: 'GET'};
      try {
        const response = await fetch(url, options);
        device = await response.json();
      }
      catch(err) {
        console.log("unable to fetch device: " + device_id);
        return;
      }
      console.log("HubitatConfigNode: Device:");
      console.log(device);
      return device;
    };

    node.unregisterCallback = function(parent, device_id, callback) {
      if (callbacks[device_id]) {
        callbacks[device_id].filter( (c) => c !== callback );
      }
    };

    node.registerCallback = function(parent, device_id, callback) {
      if (!(device_id in callbacks)) {
        callbacks[device_id] = [];
      }

      callbacks[device_id].push({
        parent: parent,
        callback: callback
      });
    };

    nodes[node.base_url] = node;
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

  RED.httpAdmin.post('/hubitat/webhook', function(req,res){

    console.log("POST /hubitat/webhook with body:");
    console.log(req.body);
    if (!req.body.content) {
      res.sendStatus(400);
      return;
    }

    const callback = callbacks[req.body.content["deviceid"]];

    if(callback){
      callback.forEach( (c) => {
        c.callback.call(c.parent, req.body.content);
      });
    }

    res.sendStatus(204);
  });

}
