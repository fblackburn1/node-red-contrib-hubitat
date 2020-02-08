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

    node.on('input', async function(msg, send, done) {
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
        done(err);
        return;
      }
      node.status({});
      send(msg);
      done();
    });
  }

  RED.nodes.registerType("hubitat command", Command);
}
