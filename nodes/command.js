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
    this.haltCommand = config.haltCommand;
    this.haltCommandArgs = config.haltCommandArgs;
    this.haltAttribute = config.haltAttribute;
    this.haltAttributeValue = config.haltAttributeValue;
    this.haltAttributeValueType = config.haltAttributeValueType;
    this.defaultStatus = {};

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

    node.on('input', async (msg, send, done) => {
      node.status({ fill: 'blue', shape: 'dot', text: 'requesting' });

      const deviceId = ((msg.deviceId !== undefined) ? msg.deviceId : node.deviceId);
      if (!deviceId) {
        const errorMsg = 'undefined deviceId';
        node.status({ fill: 'red', shape: 'ring', text: errorMsg });
        doneWithId(node, done, errorMsg);
        return;
      }

      let {
        command,
        commandArgs,
        haltCommand,
        haltCommandArgs,
        haltAttribute,
        haltAttributeValue,
      } = node;

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
        node.debug('Halt enabled');
        if (msg.haltCommand !== undefined) {
          haltCommand = msg.haltCommand;
          haltCommandArgs = msg.haltCommandArgs;
        } else if (msg.haltCommandArgs !== undefined) {
          haltCommandArgs = msg.haltCommandArgs;
        }
        if (!haltCommand) {
          const errorMsg = 'undefined halt command';
          node.status({ fill: 'red', shape: 'ring', text: errorMsg });
          doneWithId(node, done, errorMsg);
          return;
        }

        if (msg.haltAttribute !== undefined) {
          haltAttribute = msg.haltAttribute;
          haltAttributeValue = msg.haltAttributeValue;
        } else if (msg.haltAttributeValue !== undefined) {
          haltAttributeValue = msg.haltAttributeValue;
        } else if (!haltAttributeValue) {
          haltAttributeValue = commandArgs;
          if ((haltAttribute === 'switch') && (!commandArgs)) {
            haltAttributeValue = command;
          }
        } else {
          haltAttributeValue = RED.util.evaluateNodeProperty(
            haltAttributeValue,
            this.haltAttributeValueType,
            this,
          );
        }

        if ((!haltAttribute) || (!(haltAttributeValue) && haltAttributeValue !== 0)) {
          const errorMsg = 'undefined halt attribute/value';
          node.status({ fill: 'red', shape: 'ring', text: errorMsg });
          doneWithId(node, done, errorMsg);
          return;
        }

        let attribute;
        try {
          attribute = node.hubitat.devices[deviceId].attributes[haltAttribute];
        } catch (err) {
          const errorMsg = `Device(${deviceId}) not initialized`;
          node.status({ fill: 'red', shape: 'ring', text: errorMsg });
          done(errorMsg);
          return;
        }

        node.debug(`haltCommand: ${typeof haltCommand} - ${haltCommand}`);
        node.debug(`command: ${typeof command} - ${command}`);
        node.debug(`haltCommandArgs: ${typeof haltCommandArgs} - ${haltCommandArgs}`);
        node.debug(`commandArgs: ${typeof commandArgs} - ${commandArgs}`);
        node.debug(`haltAttributeValue: ${typeof haltAttributeValue} - ${haltAttributeValue}`);
        node.debug(`attribute.value: ${typeof attribute.value} - ${attribute.value}`);
        if (
          (haltCommand === command)
          && (((!haltCommandArgs) && (!commandArgs)) || (haltCommandArgs === commandArgs))
          && (haltAttributeValue === attribute.value)
        ) {
          node.debug(`Command halted: ${command}/${commandArgs}`);
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
