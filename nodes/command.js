/* eslint-disable global-require */
module.exports = function HubitatCommandModule(RED) {
  const fetch = require('node-fetch');
  const doneWithId = require('./utils/done-with-id');

  function HubitatCommandNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.deviceId = config.deviceId;
    this.command = config.command;
    this.commandArgs = config.commandArgs;
    this.haltEnabled = config.haltEnabled;
    this.haltAttribute = config.haltAttribute;
    this.defaultStatus = {};
    this.haltAttributeValue = config.haltAttributeValue;

    if (this.command) {
      const base = `>> ${this.command}`;
      const args = (this.commandArgs) ? `: ${this.commandArgs}` : '';
      const halt = ((this.haltEnabled) ? ' | 🖑' : '');
      this.defaultStatus = { text: `${base}${args}${halt}` };
    }

    const node = this;

    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }
    node.status(node.defaultStatus);

    if ((!this.haltAttributeValue) && (this.haltAttributeValue !== 0)) {
      this.haltAttributeValue = this.commandArgs;
      if ((this.haltAttribute === 'switch') && (!this.commandArgs)) {
        this.haltAttributeValue = this.command;
      }
    }

    node.on('input', async (msg, send, done) => {
      node.status({ fill: 'blue', shape: 'dot', text: 'requesting' });

      const deviceId = ((msg.deviceId !== undefined) ? msg.deviceId : node.deviceId);
      if (!deviceId) {
        const errorMsg = 'undefined deviceId';
        node.status({ fill: 'red', shape: 'ring', text: errorMsg });
        doneWithId(node, done, errorMsg);
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
        const errorMsg = 'undefined command';
        node.status({ fill: 'red', shape: 'ring', text: errorMsg });
        doneWithId(node, done, errorMsg);
        return;
      }

      if (this.haltEnabled) {
        let currentValue;
        try {
          currentValue = node.hubitat.devices[deviceId].attributes[this.haltAttribute].value;
        } catch (err) {
          const errorMsg = `Device(${deviceId}) not initialized`;
          node.status({ fill: 'red', shape: 'ring', text: errorMsg });
          done(errorMsg);
          return;
        }
        if (currentValue === this.haltAttributeValue) {
          node.status(node.defaultStatus);
          send(msg);
          done();
          return;
        }
      }

      let commandWithArgs = command;
      if ((commandArgs != null) && (commandArgs !== '')) {
        commandWithArgs = `${command}/${encodeURIComponent(commandArgs)}`;
      }
      const baseUrl = `${node.hubitat.baseUrl}/devices/${deviceId}/${commandWithArgs}`;
      const url = `${baseUrl}?access_token=${node.hubitat.token}`;
      const options = { method: 'GET' };

      try {
        await node.hubitat.acquireLock();
        node.debug(`Request: ${baseUrl}`);
        const response = await fetch(url, options);
        if (response.status >= 400) {
          node.status({ fill: 'red', shape: 'ring', text: 'response error' });
          const message = `${baseUrl}: ${await response.text()}`;
          doneWithId(node, done, message);
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
