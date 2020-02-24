module.exports = function(RED) {
  const fetch = require('node-fetch');

  function castHubitatValue(dataType, value) {
    switch(dataType) {
      case "STRING":
        return value;
      case "ENUM":
        return value;
      case "NUMBER":
        return parseFloat(value);
      case "BOOL":
        return value == "true";
      default:
        console.warn("Unable to cast to dataType. Open an issue to report back the following output:");
        console.warn(dataType);
        console.warn(value);
        return value;
    }
  }

  function HubitatDeviceNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.deviceId = config.deviceId;
    this.sendEvent = config.sendEvent;
    this.currentAttributes = undefined;

    let node = this;

    if (!node.hubitat) {
      console.log("HubitatDeviceNode: Hubitat server not configured");
      return;
    }

    const callback = (event) => {
      console.debug("Device(" + node.name + "): Callback called");
      console.debug(event);
      if (this.currentAttributes === undefined) {
        node.status({fill:"red", shape:"dot", text:"Uninitialized"});
        console.warn("Device(" + node.name + "): Uninitialized");
        return;
      }

      let found = false;
      this.currentAttributes.forEach( (attribute) => {
        if (event["name"] === attribute["name"]) {
          attribute["currentValue"] = castHubitatValue(attribute["dataType"], event["value"]);
          attribute["deviceId"] = node.deviceId;
          node.status({});
          if (this.sendEvent) {
            this.send({payload: attribute, topic: node.name});
          }
          found = true;
        }
      });

      if (!found) {
        node.status({fill:"red", shape:"dot", text:"Unknown event: " + event["name"]});
      }
    }

    node.hubitat.registerCallback(node, node.deviceId, callback);

    node.hubitat.getDevice(node.deviceId).then( (device) => {
      console.debug("Device(" + node.name + "): Status refreshed");
      node.currentAttributes = device.attributes;
      node.status({});
    }).catch( err => {
      console.log(err);
      node.status({fill:"red", shape:"dot", text:"Uninitialized"});
    });

    node.on('input', function(msg, send, done) {
      console.debug("HubitatDeviceNode: Input received");
      if (msg.attribute === undefined) {
        node.status({fill:"red", shape:"dot", text:"Undefined attribute"});
        return;
      }
      let found = false;
      node.currentAttributes.forEach( (attribute) => {
        if (msg.attribute === attribute["name"]) {
          node.status({});
          msg.payload = attribute;
          msg.payload.deviceId = node.deviceId;
          msg.topic = node.name;
          send(msg);
          found = true;
        }
      });

      if (!found) {
        node.status({fill:"red", shape:"dot", text:"Invalid attribute: " + msg.attribute});
      }
      done();
    });

    node.on('close', function() {
      console.debug("HubitatDeviceNode: Closed");
      node.hubitat.unregisterCallback(node, node.deviceId, callback);
    });
  }

  RED.nodes.registerType("hubitat device", HubitatDeviceNode);
}
