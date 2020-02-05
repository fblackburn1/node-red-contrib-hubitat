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

    var node = this;

    node.on('input', async function(msg) {
      node.status({fill:"blue", shape:"dot", text:"requesting"});

      const command_with_args = this.command;
      if (this.command_args) {
        command_with_args = `${this.command}/${this.command_args}`;
      }
      let scheme = ((this.usetls) ? 'https': 'http');
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

  RED.httpAdmin.get('/hubitat/:config_node_id/devices', RED.auth.needsPermission('hubitat.read'), async function(req, res) {
    let node = RED.nodes.getNode(req.params.config_node_id);
    let url = `${node.base_url}/devices?access_token=${node.token}`;
    let options = {method: 'GET'}
    try {
      const response = await fetch(url, options);
      res.json(await response.json());
    }
    catch(err) {
      res.send(err);
    }
  });

  RED.httpAdmin.get('/hubitat/:config_node_id/devices/:device_id/commands', RED.auth.needsPermission('hubitat.read'), async function(req, res) {
    let node = RED.nodes.getNode(req.params.config_node_id);
    let url = `${node.base_url}/devices/${req.params.device_id}/commands?access_token=${node.token}`;
    let options = {method: 'GET'}
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
