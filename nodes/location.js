module.exports = function HubitatLocationModule(RED) {
  function HubitatLocationNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;

    const node = this;

    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }

    const callback = async (event) => {
      node.debug(`Event received: ${JSON.stringify(event)}`);
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
      node.send(msg);
    };
    this.hubitat.hubitatEvent.on('location', callback);

    node.on('close', () => {
      node.debug('Closed');
      this.hubitat.hubitatEvent.removeListener('location', callback);
    });
  }

  RED.nodes.registerType('hubitat location', HubitatLocationNode);
};
