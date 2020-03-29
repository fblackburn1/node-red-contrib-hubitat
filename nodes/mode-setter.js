/* eslint-disable global-require */
module.exports = function HubitatModeSetterModule(RED) {
  const fetch = require('node-fetch');

  function HubitatModeSetterNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.modeId = config.modeId;
    const node = this;

    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }

    node.on('input', async (msg, send, done) => {
      node.status({ fill: 'blue', shape: 'dot', text: 'requesting' });

      const modeId = msg.modeId || node.modeId;
      if (!modeId) {
        node.status({ fill: 'red', shape: 'ring', text: 'undefined mode' });
        done('undefined mode');
        return;
      }

      const url = `${node.hubitat.baseUrl}/modes/${modeId}?access_token=${node.hubitat.token}`;
      const options = { method: 'GET' };

      try {
        const response = await fetch(url, options);
        if (response.status >= 400) {
          node.status({ fill: 'red', shape: 'ring', text: 'response error' });
          done(await response.text());
          return;
        }
        const output = { ...msg, response: await response.json() };
        node.status({});
        send(output);
        done();
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: err.code });
        done(err);
      }
    });
  }

  RED.nodes.registerType('hubitat mode-setter', HubitatModeSetterNode);
};
