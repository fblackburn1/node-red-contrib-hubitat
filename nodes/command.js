/* eslint-disable global-require */
module.exports = function HubitatCommandModule(RED) {
  const fetch = require('node-fetch');

  function HubitatCommandNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.deviceId = config.deviceId;
    this.command = config.command;
    this.commandArgs = config.commandArgs;
    this.defaultStatus = {};
    if (this.command) {
      if (this.commandArgs) {
        this.defaultStatus = { text: `>> ${this.command}: ${this.commandArgs}` };
      } else {
        this.defaultStatus = { text: `>> ${this.command}` };
      }
    }

    const node = this;

    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }
    node.status(node.defaultStatus);

    node.on('input', async (msg, send, done) => {
      node.status({ fill: 'blue', shape: 'dot', text: 'requesting' });

      const deviceId = ((msg.deviceId !== undefined) ? msg.deviceId : node.deviceId);
      if (!deviceId) {
        const errorMsg = 'undefined deviceId';
        node.status({ fill: 'red', shape: 'ring', text: errorMsg });
        done(errorMsg);
        return;
      }

      let { command } = node;
      let { commandArgs } = node;
      if (msg.command !== undefined) {
        command = msg.command;
        commandArgs = msg.arguments;
      } else if (msg.arguments !== undefined) {
        commandArgs = msg.arguments;
      }
      if (!command) {
        const errorMsg = 'undefined deviceId';
        node.status({ fill: 'red', shape: 'ring', text: errorMsg });
        done(errorMsg);
        return;
      }

      let commandWithArgs = command;
      if ((commandArgs != null) && (commandArgs !== '')) {
        commandWithArgs = `${command}/${encodeURIComponent(commandArgs)}`;
      }
      const url = `${node.hubitat.baseUrl}/devices/${deviceId}/${commandWithArgs}?access_token=${node.hubitat.token}`;
      const options = { method: 'GET' };

      try {
        await node.hubitat.acquireLock();
        const response = await fetch(url, options);
        if (response.status >= 400) {
          node.status({ fill: 'red', shape: 'ring', text: 'response error' });
          done(await response.text());
          return;
        }
        const output = { ...msg, response: await response.json() };
        node.status(node.defaultStatus);
        send(output);
        done();
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: err.code });
        done(err);
      } finally {
        node.hubitat.releaseLock();
      }
    });
  }

  RED.nodes.registerType('hubitat command', HubitatCommandNode);
};
