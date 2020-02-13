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
    this.currentAttributes = undefined;

    let node = this;

    if (!node.hubitat) {
      console.log("HubitatDeviceNode: Hubitat server not configured");
      return;
    }

    node.reportStatus = function(original, send) {
      let msg = {
        payload: {
          deviceId: node.deviceId,
          attributes: node.currentAttributes
        }
      };
      original.payload = msg.payload;
      Object.assign(msg, original);
      send(msg);
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
          node.status({});
          found = true;
        }
      });

      if (!found) {
        node.status({fill:"red", shape:"dot", text:"Unknown event: " + event["name"]});
        return;
      }
      this.send({payload: event});
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

    node.on('input', async function(msg, send, done) {
      console.debug("HubitatDeviceNode: Input received");
      node.reportStatus(msg, send);
      done();
    });

    node.on('close', function() {
      console.debug("HubitatDeviceNode: Closed");
      node.hubitat.unregisterCallback(node, node.deviceId, callback);
    });
  }

  RED.nodes.registerType("hubitat device", HubitatDeviceNode);
}
