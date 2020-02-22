module.exports = function(RED) {
  const fetch = require('node-fetch');

    var bodyParser = require("body-parser");
    var cookieParser = require("cookie-parser");

  let nodes = {};
//  let callbacks = [];

  function HubitatConfigNode(config) {
    RED.nodes.createNode(this,config);
    this.name = config.name;
    this.usetls = config.usetls;
    this.host = config.host;
    this.port = config.port;
    this.token = config.token;
    this.appId = config.appId;
    this.webhook = config.webhook;
    this.callbacks = [];

    const scheme = ((this.usetls) ? 'https': 'http');
    this.baseUrl = `${scheme}://${this.host}:${this.port}/apps/api/${this.appId}`;

    let node = this;

    if ((!node.host) || (!node.port) || (!node.token) || (!node.appId)) {
      return;
    }

    node.getMode = async function() {
      const url = `${node.baseUrl}/modes?access_token=${node.token}`;
      const options = {method: 'GET'};
      try {
        const response = await fetch(url, options);
        var mode = await response.json();
      }
      catch(err) {
        console.log(err);
        console.log("unable to fetch modes.");
      }

      console.log("HubitatConfigNode: Mode:");
      console.log(mode);
      return mode;
    };

    node.getDevice = async function(deviceId, type) {
      const url = `${node.baseUrl}/devices/${deviceId}?access_token=${node.token}`;
      const options = {method: 'GET'};
      try {
        const response = await fetch(url, options);
        var device = await response.json();
      }
      catch(err) {
        console.log("unable to fetch device: " + deviceId);
        return;
      }
      device.attributes = device.attributes.filter((attribute, index, self) =>
        index === self.findIndex((t) => (
          t.name === attribute.name
        ))
      )
      console.log("HubitatConfigNode: Device:");
      console.log(device);
      return device;
    };

    node.unregisterCallback = function(parent, deviceId, callback) {
      if (node.callbacks[deviceId]) {
        node.callbacks[deviceId] = node.callbacks[deviceId].filter( (c) => c.callback !== callback );
        if (node.callbacks[deviceId].length  == 0) {
          delete node.callbacks[deviceId];
        }
      }
    };

    node.registerCallback = function(parent, deviceId, callback) {
      if (!(deviceId in node.callbacks)) {
        node.callbacks[deviceId] = [];
      }

      node.callbacks[deviceId].push({
        parent: parent,
        callback: callback
      });
    };
    nodes[node.baseUrl] = node;
    
    if (RED.settings.httpNodeRoot !== false) {
        if (!this.webhook) {
            this.warn(RED._("webhook url not set"));
            return;
        }
        if (this.webhook[0] !== '/') {
            this.webhook = '/'+this.webhook;
        }
        console.log('Starting endpoint for ' + this.webhook);
        this.webErrorHandler = function(err,req,res,next) {
            node.warn(err);
            res.sendStatus(500);
        };
        this.postCallback = function(req,res) {
            var msgid = RED.util.generateId();
            res._msgid = msgid;
            console.log(req.body);
            if (!req.body.content) {
                node.warn('no content in body');
                return;
            }

            if(req.body.content["deviceId"] != null) {
                var callback = node.callbacks[req.body.content["deviceId"]];
            } else if (req.body.content["name"] == "mode") {
                var callback = node.callbacks[0];
            }

            if(callback){
                callback.forEach( (c) => {
                    c.callback.call(c.parent, req.body.content);
                });
            }

            //DO THE CALLBACK HERE FROM BELOW
        };
        var httpMiddleware = function(req,res,next) { next(); }
        var corsHandler = function(req,res,next) { next(); }
        var maxApiRequestSize = RED.settings.apiMaxLength || '5mb';
        var jsonParser = bodyParser.json({limit:maxApiRequestSize});
        var urlencParser = bodyParser.urlencoded({limit:maxApiRequestSize,extended:true});
        var metricsHandler = function(req,res,next) { next(); }
        var multipartParser = function(req,res,next) { next(); }
        var rawBodyParser = function(req, res, next) {next(); }
        RED.httpNode.post(this.webhook,cookieParser(),httpMiddleware,corsHandler,metricsHandler,jsonParser,urlencParser,multipartParser,rawBodyParser,this.postCallback,this.webErrorHandler);
        this.on("close",function() {
            var node = this;
            RED.httpNode._router.stack.forEach(function(route,i,routes) {
                if (route.route && route.route.path === node.url && route.route.methods[node.method]) {
                    routes.splice(i,1);
                }
            });
        });
    }
  }

  RED.nodes.registerType("hubitat config", HubitatConfigNode);

  RED.httpAdmin.get('/hubitat/devices', RED.auth.needsPermission('hubitat.read'), async function(req, res) {
    console.log("GET /hubitat/devices");
    if ((!req.query.host) || (!req.query.port) || (!req.query.appId) || (!req.query.token)) {
      res.send(404);
      return;
    }
    const scheme = ((req.query.usetls == 'true') ? 'https': 'http');
    const baseUrl = `${scheme}://${req.query.host}:${req.query.port}/apps/api/${req.query.appId}`;
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
      if (first.label < second.label) { return -1; }
      if (first.label > second.label) { return 1; }
      return 0;
    });
    res.json(devices);
    // Check if the result should not be [{deviceId: 1, label: light}, ...]
  });

  RED.httpAdmin.get('/hubitat/devices/:deviceId/commands', RED.auth.needsPermission('hubitat.read'), async function(req, res) {
    console.log("GET /hubitat/devices/" + req.params.deviceId + "/commands");
    if ((!req.query.host) || (!req.query.port) || (!req.query.appId) || (!req.query.token)) {
      res.sendStatus(404);
      return;
    }
    const scheme = ((req.query.usetls == 'true') ? 'https': 'http');
    const baseUrl = `${scheme}://${req.query.host}:${req.query.port}/apps/api/${req.query.appId}`;
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

}
