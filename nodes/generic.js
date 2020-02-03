module.exports = function(RED) {
  const fetch = require('node-fetch');

  function Generic(config) {
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
      const options = {
        method: 'GET',
        headers: {'content-type': 'application/json'}
      };

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

  RED.nodes.registerType("hubitat generic", Generic);
}
