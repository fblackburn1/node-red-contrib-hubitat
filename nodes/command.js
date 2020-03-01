module.exports = function(RED) {
  const fetch = require('node-fetch');

  function HubitatCommandNode(config) {
    RED.nodes.createNode(this, config);

    hubitat = RED.nodes.getNode(config.server);
    this.baseUrl = hubitat.baseUrl;
    this.token = hubitat.token;

    this.deviceId = config.deviceId;
    this.command = config.command;
    this.commandArgs = config.commandArgs;

    let node = this;

    node.on('input', async function(msg, send, done) {
      node.status({fill:"blue", shape:"dot", text:"requesting"});

      let command = ((msg.command === undefined)? this.command: msg.command);
      let arguments = ((msg.arguments === undefined)? this.commandArgs: msg.arguments);

      let commandWithArgs = command;
      if ((arguments == null) || (arguments == "")) {
        commandWithArgs = `${command}/${arguments}`;
      }
      const url = `${this.baseUrl}/devices/${this.deviceId}/${commandWithArgs}?access_token=${this.token}`;
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

  RED.nodes.registerType("hubitat command", HubitatCommandNode);
}
