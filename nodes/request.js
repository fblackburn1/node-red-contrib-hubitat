/* eslint-disable global-require */
module.exports = function HubitatRequestModule(RED) {
  const fetch = require('node-fetch');
  const doneWithId = require('./utils/done-with-id');

  function HubitatRequestNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.path = config.path;
    const node = this;

    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }

    node.on('input', async (msg, send, done) => {
      node.status({ fill: 'blue', shape: 'dot', text: 'requesting' });

      const path = msg.path || node.path;
      if (!path) {
        const errorMsg = 'undefined path';
        node.status({ fill: 'red', shape: 'ring', text: errorMsg });
        doneWithId(node, done, errorMsg);
        return;
      }
      const url = `${node.hubitat.baseUrl}/${path}?access_token=${node.hubitat.token}`;
      const options = { method: 'GET' };

      try {
        const response = await fetch(url, options);
        if (response.status >= 400) {
          node.status({ fill: 'red', shape: 'ring', text: 'response error' });
          doneWithId(node, done, await response.text());
          return;
        }
        const output = { ...msg, payload: await response.json() };
        node.status({});
        send(output);
        done();
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: err.code });
        doneWithId(node, done, err);
      }
    });
  }

  RED.nodes.registerType('hubitat request', HubitatRequestNode);
};
