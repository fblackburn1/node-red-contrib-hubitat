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

    this.hubitat.hubitatEvent.on('location', (async function (node, event) {
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
      node.send(msg);
      node.status = ({});
    }).bind(null, this));


    node.on('close', () => {
      node.debug('Closed');
    });
  }

  RED.nodes.registerType('hubitat location', HubitatLocationNode);
};
