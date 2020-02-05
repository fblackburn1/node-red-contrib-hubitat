module.exports = function(RED) {
  const fetch = require('node-fetch');

  function authentication(config) {
    RED.nodes.createNode(this,config);
    this.name = config.name;
    this.usetls = config.usetls;
    this.server = config.server;
    this.port = config.port;
    this.token = config.token;
    this.api_id = config.api_id;

    let scheme = ((this.usetls) ? 'https': 'http');
    this.base_url = `${scheme}://${this.server}:${this.port}/apps/api/${this.api_id}`;
  }

  RED.nodes.registerType("hubitat auth", authentication);
}
