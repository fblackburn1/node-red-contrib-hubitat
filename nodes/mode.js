module.exports = function(RED) {
  function HubitatModeNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.sendEvent = config.sendEvent;
    this.currentMode = undefined;
    this.deviceId = 0;  // fake the deviceId to be able to register on callback

    let node = this;

    if (!node.hubitat) {
      console.log("HubitatModeNode: Hubitat server not configured");
      return;
    }

    const callback = function(event) {
      console.debug("Mode(" + this.name + "): Callback called");
      console.debug(event);
      if (this.currentMode === undefined) {
        this.status({fill:"red", shape:"dot", text:"Uninitialized"});
        console.warn("Mode(" + this.name + "): Uninitialized");
        return;
      }

      this.currentMode = event["value"];

      payload = {
        name: "mode",
        value: this.currentMode,
        displayName: event["displayName"],
        descriptionText: event["descriptionText"],
      };

      if (this.sendEvent) {
        this.send({payload: payload, topic: "hubitat-mode"});
      }

      this.status({fill:"blue", shape:"dot", text: this.currentMode});
    }

    node.hubitat.registerCallback(node, node.deviceId, callback);

    node.hubitat.getMode().then( (mode) => {
      node.currentMode = mode.filter(function(eachMode) {
        return eachMode.active;
      })[0].name;
      console.debug("Mode(" + node.name + "): Status refreshed.  Current mode: " + node.currentMode);
      node.status({fill:"blue", shape:"dot", text:node.currentMode});
    }).catch( err => {
      console.log(err);
      node.status({fill:"red", shape:"dot", text:"Uninitialized"});
    });


    node.on('input', function(msg, send, done) {
      console.debug("HubitatModeNode: Input received");
      console.debug(msg);

      msg.payload = {
        name: "mode",
        value: node.currentMode,
      };
      msg.topic = "hubitat-mode";
      send(msg);

      done();
    });

    node.on('close', function() {
      console.debug("HubitatModeNode: Closed");
      node.hubitat.unregisterCallback(node, callback);
    });
  }

  RED.nodes.registerType("hubitat mode", HubitatModeNode);
}
