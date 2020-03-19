module.exports = function HubitatLocationModule(RED) {
  function HubitatLocationNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.deviceId = -2; // fake the deviceId to be able to register on callback

    const node = this;

    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }

    const callback = function callback(event) {
      node.debug(`Callback called: ${JSON.stringify(event)}`);
      node.log(`Location Event: ${event.name}`);

      const msg = {
        payload: {
          name: event.name,
          value: event.value,
          displayName: event.displayName,
          descriptionText: event.descriptionText,
        },
        topic: 'hubitat-location',
      };
      this.send(msg);
      this.status = ({});
    };

    node.hubitat.registerCallback(node, node.deviceId, callback);

    node.on('close', () => {
      node.debug('Closed');
      node.hubitat.unregisterCallback(node, callback);
    });
  }

  RED.nodes.registerType('hubitat location', HubitatLocationNode);
};
