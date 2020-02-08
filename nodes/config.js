module.exports = function(RED) {
  function HubitatConfigNode(config) {
    RED.nodes.createNode(this,config);
    this.name = config.name;
    this.usetls = config.usetls;
    this.host = config.host;
    this.port = config.port;
    this.token = config.token;
    this.api_id = config.api_id;

    const scheme = ((this.usetls) ? 'https': 'http');
    this.base_url = `${scheme}://${this.host}:${this.port}/apps/api/${this.api_id}`;
  }

  RED.nodes.registerType("hubitat config", HubitatConfigNode);
}
