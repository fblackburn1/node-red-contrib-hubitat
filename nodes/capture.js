module.exports = function HubitatCaptureModule(RED) {
  function HubitatCaptureNode(config) {

    RED.nodes.createNode(this, config);
    const node = this;
    node.hubitat = RED.nodes.getNode(config.server);
    node.clearOnEditRestart = config.clearOnEditRestart;

    // Cleanup immediately if clearOnEditRestart is set in the new config
    (async () => {
      if (node.clearOnEditRestart) {
        await refreshDeviceMap(true);
        const getSafeHubId = (hubitat) => {
          let hubId = hubitat.name && hubitat.name.trim();
          if (!hubId) {
            if (hubitat.host) {
              hubId = hubitat.host;
            } else {
              hubId = hubitat.id;
            }
          }
          return String(hubId).replace(/[^a-zA-Z0-9]/g, '_');
        };
        const hubId = getSafeHubId(node.hubitat);
        const flowContext = node.context().flow;
        const keys = await flowContext.keys();
        for (const key of keys) {
          if (key.startsWith(`hubitat_state_${hubId}_`)) {
            const existing = flowContext.get(key);
            if (existing && existing.owner === node.id) {
              flowContext.set(key, undefined);
            }
          }
        }
      }
    })();


    const count = Array.isArray(config.deviceId) ? config.deviceId.length : 0;
    const base = config.name && config.name.trim().length ? config.name : "capture";
    node.name = `${base} (${count})`;


    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }

    // normalize configured device list
    function configuredDeviceList() {
      return Array.isArray(config.deviceId) ? config.deviceId.slice() : [];
    }

    async function refreshDeviceMap(force = false) {
      if (!node.hubitat) return;
      if (typeof node.hubitat.devicesFetcher !== 'function') {
        node.log('hubitat-capture: devicesFetcher() is not available on hubitat config node');
        return;
      }

      if (force) {
        try {
          node.hubitat.devicesInitialized = false;
        } catch (e) {}
      }

      try {
        await node.hubitat.devicesFetcher();
      } catch (e) {
        node.log(`hubitat-capture: devicesFetcher() threw: ${e?.message || e}`);
      }
    }

    function findDevice(deviceId, devicesMap) {
      if (!devicesMap) return undefined;

      if (Object.prototype.hasOwnProperty.call(devicesMap, deviceId)) {
        return devicesMap[deviceId];
      }

      const numId = Number(deviceId);
      if (!isNaN(numId) && Object.prototype.hasOwnProperty.call(devicesMap, numId)) {
        return devicesMap[numId];
      }

      const values = Object.values(devicesMap || {});
      for (let i = 0; i < values.length; i++) {
        const d = values[i];
        if (!d) continue;
        if (String(d.id) === String(deviceId) || String(d.deviceId) === String(deviceId)
            || String(d.name) === String(deviceId) || String(d.label) === String(deviceId)) {
          return d;
        }
      }
      return undefined;
    }

    const ATTRS = [
      "switch", "level", "color", "hue", "RGB",
      "colorTemperature", "saturation", "colorMode", "colorName"
    ];

    node.on("input", async function (msg, send, done) {
      try {
        const toCapture = configuredDeviceList();
        if (!Array.isArray(toCapture) || toCapture.length === 0) {
          node.warn("No devices selected");
          send(msg);
          if (done) done();
          return;
        }



        await refreshDeviceMap(true);
        const devicesMap = node.hubitat.devices || {};
        const flowContext = node.context().flow;

        const getSafeHubId = (hubitat) => {
          let hubId = hubitat.name && hubitat.name.trim();
          if (!hubId) {
            if (hubitat.host) {
              hubId = hubitat.host;
            } else {
              hubId = hubitat.id;
            }
          }
          return String(hubId).replace(/[^a-zA-Z0-9]/g, '_');
        };
        const hubId = getSafeHubId(node.hubitat);
        const summaries = [];

        await Promise.all(toCapture.map(async (rawId) => {
          const deviceId = (rawId && typeof rawId === 'object' && (rawId.id || rawId.deviceId)) ? (rawId.id || rawId.deviceId) : rawId;
          const device = findDevice(deviceId, devicesMap);
          if (!device) {
            return;
          }

          const captured = { id: device.id, name: device.label || device.name || "", owner: node.id };
          ATTRS.forEach(attr => {
            const attrs = device.attributes || {};
            const found = attrs[attr] || attrs[attr.toLowerCase()];
            if (found && typeof found.value !== "undefined") {
              captured[attr] = found.value;
            } else if (found && typeof found.currentValue !== "undefined") {
              captured[attr] = found.currentValue;
            } else if (typeof device[attr] !== "undefined") {
              captured[attr] = device[attr];
            }
          });

          const varName = `hubitat_state_${hubId}_${device.id}`;
          flowContext.set(varName, captured);
          summaries.push({ id: device.id, name: captured.name, varName });
        }));

        send({ payload: summaries });
        if (done) done();
      } catch (err) {
        node.error(`Error capturing devices: ${err?.message || err}`, msg);
        if (done) done(err);
      }
    });

    node.on("close", async function (removed, done) {
      try {
        // Use the NEW config value for clearOnEditRestart if available
        const newConfig = removed && typeof removed === 'object' ? removed : null;
        const shouldCleanup = newConfig && typeof newConfig.clearOnEditRestart !== 'undefined'
          ? newConfig.clearOnEditRestart
          : node.clearOnEditRestart;
        if (shouldCleanup) {
          await refreshDeviceMap(true);
          const getSafeHubId = (hubitat) => {
            let hubId = hubitat.name && hubitat.name.trim();
            if (!hubId) {
              if (hubitat.host) {
                hubId = hubitat.host;
              } else {
                hubId = hubitat.id;
              }
            }
            return String(hubId).replace(/[^a-zA-Z0-9]/g, '_');
          };
          const hubId = getSafeHubId(node.hubitat);
          const flowContext = node.context().flow;
          // Remove all context variables owned by this node
          const keys = await flowContext.keys();
          for (const key of keys) {
            if (key.startsWith(`hubitat_state_${hubId}_`)) {
              const existing = flowContext.get(key);
              if (existing && existing.owner === node.id) {
                flowContext.set(key, undefined);
              }
            }
          }
        }
        done();
      } catch (err) {
        node.error(`Error during close cleanup: ${err?.message || err}`);
        done();
      }
    });
  }

  RED.nodes.registerType("hubitat capture", HubitatCaptureNode);
};
