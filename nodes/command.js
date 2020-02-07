module.exports = function(RED) {
  const fetch = require('node-fetch');

  function Command(config) {
    RED.nodes.createNode(this, config);

    hubitat = RED.nodes.getNode(config.server);
    this.base_url = hubitat.base_url;
    this.token = hubitat.token;

    this.device_id = config.device_id;
    this.command = config.command;
    this.command_args = config.command_args;

    let node = this;

    node.on('input', async function(msg) {
      node.status({fill:"blue", shape:"dot", text:"requesting"});

      let command_with_args = this.command;
      if (this.command_args) {
        command_with_args = `${this.command}/${this.command_args}`;
      }
      const url = `${this.base_url}/devices/${this.device_id}/${command_with_args}?access_token=${this.token}`;
      const options = {method: 'GET'};

      try {
        const response = await fetch(url, options);
        msg.response = await response.json();
      }
      catch(err) {
        node.status({fill:"red", shape:"ring", text:err.code});
      }
      node.status({});
      node.send(msg);
    });
  }

  RED.httpAdmin.get('/hubitat/devices', RED.auth.needsPermission('hubitat.read'), async function(req, res) {
    const scheme = ((req.query.usetls == 'true') ? 'https': 'http');
    const base_url = `${scheme}://${req.query.host}:${req.query.port}/apps/api/${req.query.api_id}`;
    const url = `${base_url}/devices?access_token=${req.query.token}`;
    const options = {method: 'GET'}
    try {
      const response = await fetch(url, options);
      res.json(await response.json());
    }
    catch(err) {
      res.send(err);
    }
  });

  RED.httpAdmin.get('/hubitat/devices/:device_id/commands', RED.auth.needsPermission('hubitat.read'), async function(req, res) {
    const scheme = ((req.query.usetls == 'true') ? 'https': 'http');
    const base_url = `${scheme}://${req.query.host}:${req.query.port}/apps/api/${req.query.api_id}`;
    const url = `${base_url}/devices/${req.params.device_id}/commands?access_token=${req.query.token}`;
    const options = {method: 'GET'}
    try {
      const response = await fetch(url, options);
      res.json(await response.json());
    }
    catch(err) {
      res.send(err);
    }
  });

  RED.nodes.registerType("hubitat command", Command);
}
