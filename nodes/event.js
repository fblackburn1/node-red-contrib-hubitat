module.exports = function HubitatEventModule(RED) {
  function HubitatEventNode(config) {
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
      node.log(`Event: ${event.name}`);

      const msg = {
        payload: { ...event },
        topic: 'hubitat-event',
      };
      node.send(msg);
    };
    this.hubitat.hubitatEvent.on('event', callback);

    node.on('close', () => {
      node.debug('Closed');
      this.hubitat.hubitatEvent.removeListener('event', callback);
    });
  }

  RED.nodes.registerType('hubitat event', HubitatEventNode);
};
