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
    this.apiId = config.apiId;

    const scheme = ((this.usetls) ? 'https': 'http');
    this.baseUrl = `${scheme}://${this.host}:${this.port}/apps/api/${this.apiId}`;

    let node = this;

    if ((!node.host) || (!node.port) || (!node.token) || (!node.apiId)) {
      return;
    }

    node.getDevice = async function(deviceId, type) {
      const url = `${node.baseUrl}/devices/${deviceId}?access_token=${node.token}`;
      const options = {method: 'GET'};
      try {
        const response = await fetch(url, options);
        device = await response.json();
      }
      catch(err) {
        console.log("unable to fetch device: " + deviceId);
        return;
      }
      console.log("HubitatConfigNode: Device:");
      console.log(device);
      return device;
    };

    node.unregisterCallback = function(parent, deviceId, callback) {
      if (callbacks[deviceId]) {
        callbacks[deviceId].filter( (c) => c !== callback );
      }
    };

    node.registerCallback = function(parent, deviceId, callback) {
      if (!(deviceId in callbacks)) {
        callbacks[deviceId] = [];
      }

      callbacks[deviceId].push({
        parent: parent,
        callback: callback
      });
    };

    nodes[node.baseUrl] = node;
  }

  RED.nodes.registerType("hubitat config", HubitatConfigNode);

  RED.httpAdmin.get('/hubitat/devices', RED.auth.needsPermission('hubitat.read'), async function(req, res) {
    console.log("GET /hubitat/devices");
    if ((!req.query.host) || (!req.query.port) || (!req.query.apiId) || (!req.query.token)) {
      res.send(404);
      return;
    }
    const scheme = ((req.query.usetls == 'true') ? 'https': 'http');
    const baseUrl = `${scheme}://${req.query.host}:${req.query.port}/apps/api/${req.query.apiId}`;
    const options = {method: 'GET'}
    let url = `${baseUrl}/devices`;
    console.log(`GET ${url}`);
    url = `${url}?access_token=${req.query.token}`;

    try {
      const response = await fetch(url, options);
      var devices = await response.json();
    }
    catch(err) {
      console.log("ERROR /hubitat/devices:");
      console.log(err);
      res.send(err);
    }
    devices.sort(function(first, second) {
      return second.label < first.label;
    });
    res.json(devices);
    // Check if the result should not be [{deviceId: 1, label: light}, ...]
  });

  RED.httpAdmin.get('/hubitat/devices/:deviceId/commands', RED.auth.needsPermission('hubitat.read'), async function(req, res) {
    console.log("GET /hubitat/devices/" + req.params.deviceId + "/commands");
    if ((!req.query.host) || (!req.query.port) || (!req.query.apiId) || (!req.query.token)) {
      res.sendStatus(404);
      return;
    }
    const scheme = ((req.query.usetls == 'true') ? 'https': 'http');
    const baseUrl = `${scheme}://${req.query.host}:${req.query.port}/apps/api/${req.query.apiId}`;
    const options = {method: 'GET'}
    let url = `${baseUrl}/devices/${req.params.deviceId}/commands`;
    console.log(`GET ${url}`);
    url = `${url}?access_token=${req.query.token}`;

    try {
      const response = await fetch(url, options);
      res.json(await response.json());
    }
    catch(err) {
      console.log("ERROR /hubitat/devices/" + req.params.deviceId + "/commands:");
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

    const callback = callbacks[req.body.content["deviceId"]];

    if(callback){
      callback.forEach( (c) => {
        c.callback.call(c.parent, req.body.content);
      });
    }

    res.sendStatus(204);
  });

}
