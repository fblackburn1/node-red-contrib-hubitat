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
    this.attribute = config.attribute;
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
          attribute["value"] = castHubitatValue(attribute["dataType"], event["value"]);
          attribute["deviceId"] = node.deviceId;
          attribute["currentValue"] = attribute.value;  // deprecated since 0.0.18

          if ((this.attribute === event["name"]) || (!this.attribute)) {
            if (this.attribute) {
              node.status({fill:"blue", shape:"dot", text:`${this.attribute}: ${attribute.value}`});
            } else {
              node.status({});
            }
            if (this.sendEvent) {
              this.send({payload: attribute, topic: node.name});
            }
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
      device.attributes.forEach( (attribute) => {
        attribute.value = attribute.currentValue;
        // delete attribute.currentValue;  // keet for compatibility
        if (node.attribute === attribute.name) {
          node.status({fill:"blue", shape:"dot", text:`${node.attribute}: ${attribute.value}`});
        }
      });
      node.currentAttributes = device.attributes;

      if (!node.attribute) {
        node.status({});
      }
    }).catch( err => {
      console.log(err);
      node.status({fill:"red", shape:"dot", text:"Uninitialized"});
    });

    node.on('input', function(msg, send, done) {
      console.debug("HubitatDeviceNode: Input received");
      let attributeSearched = msg.attribute || node.attribute;
      if (attributeSearched === undefined) {
        node.status({fill:"red", shape:"dot", text:"Undefined attribute"});
        return;
      }
      let foundAttribute = undefined;
      node.currentAttributes.forEach( (attribute) => {
        if (attributeSearched === attribute["name"]) {
          msg.payload = attribute;
          msg.payload.deviceId = node.deviceId;
          msg.topic = node.name;
          send(msg);
          foundAttribute = attribute;
        }
      });
      if (foundAttribute === undefined) {
        node.status({fill:"red", shape:"dot", text:"Invalid attribute: " + attributeSearched});
      } else if (!node.attribute) {
        node.status({});
      } else if (node.attribute === foundAttribute.name) {
        node.status({fill:"blue", shape:"dot", text:`${node.attribute}: ${foundAttribute.value}`});
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
