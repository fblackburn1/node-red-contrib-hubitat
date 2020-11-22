/* eslint-disable no-param-reassign */
/* eslint-disable no-unused-vars */
const helper = require('node-red-node-test-helper');
const configNode = require('../../nodes/config.js');
const deviceNode = require('../../nodes/device.js');

describe('Hubitat Device Node', () => {
  const defaultConfigNode = {
    id: 'n0',
    type: 'hubitat config',
    name: 'test config name',
    usetls: false,
    host: 'localhost',
    port: 10234,
    appId: 1,
    nodeRedServer: 'localhost',
    webhookPath: '/hubitat/webhook',
  };
  const defaultDeviceNode = {
    id: 'n1',
    type: 'hubitat device',
    name: 'test device name',
    server: 'n0',
    deviceId: '42',
    attribute: 'testAttribute',
    sendEvent: true,
  };

  afterEach(() => {
    helper.unload();
  });

  it('should be loaded', (done) => {
    const flow = [defaultDeviceNode];
    helper.load(deviceNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('name', 'test device name');
        n1.should.have.property('deviceId', '42');
        n1.should.have.property('sendEvent', true);
        n1.should.have.property('attribute', 'testAttribute');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should send event when event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultDeviceNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = {
      deviceId: '42',
      name: 'testAttribute',
      value: 'raw-value',
    };
    helper.load([deviceNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.hubitat.devices = { 42: { attributes: { testAttribute: { name: 'testAttribute', value: 'updated-value', deviceId: '42' } } } };
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('payload', { ...hubitatEvent, value: 'updated-value' });
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('device.42', hubitatEvent);
    });
  });
  it('should send event with extra properties when event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultDeviceNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = {
      deviceId: '42',
      name: 'testAttribute',
      value: 'raw-value',
      dataType: 'overriden attribute',
      extra: 'extra-arg',
    };
    helper.load([deviceNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.hubitat.devices = {
        42: {
          attributes: {
            testAttribute: {
              name: 'testAttribute', value: 'updated-value', deviceId: '42', dataType: 'STRING', currentValue: 'updated-value',
            },
          },
        },
      };
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('payload', {
            deviceId: '42',
            name: 'testAttribute',
            value: 'updated-value',
            currentValue: 'updated-value',
            dataType: 'STRING',
            extra: 'extra-arg',
          });
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('device.42', hubitatEvent);
    });
  });
  it('should not send event when event received with wrong deviceId', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultDeviceNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = {
      deviceId: '999',
      name: 'testAttribute',
      value: 'new-value',
    };
    helper.load([deviceNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentAttributes = { testAttribute: { name: 'testAttribute', value: 'old-value' } };
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n1.hubitat.hubitatEvent.emit('device.999', hubitatEvent);
      setTimeout(() => {
        if (inError) {
          done(new Error('device receive wrong event'));
        } else {
          try {
            n1.should.have.property('currentAttributes', { testAttribute: { name: 'testAttribute', value: 'old-value' } });
            done();
          } catch (err) {
            done(err);
          }
        }
      }, 20);
    });
  });
  it('should use dot shape icon when send event', (done) => {
    const flow = [{ ...defaultDeviceNode, sendEvent: true }];
    helper.load(deviceNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('shape', 'dot');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should use ring shape icon when send event', (done) => {
    const flow = [{ ...defaultDeviceNode, sendEvent: false }];
    helper.load(deviceNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('shape', 'ring');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should send all atributes when not specified', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultDeviceNode, attribute: '', wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([deviceNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.hubitat.devices = { 42: { attributes: { testAttribute: { name: 'testAttribute', value: 'old-value' } } } };
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('payload', { ...n1.hubitat.devices['42'].attributes });
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.receive({});
    });
  });
  it('should not link the internal properties to the output message', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultDeviceNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([deviceNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.hubitat.devices = { 42: { attributes: { testAttribute: { name: 'testAttribute', value: 'value' } } } };
      n2.on('input', (msg) => {
        try {
          // eslint-disable-next-line no-param-reassign
          msg.payload.value = 'update value in another node';
          n1.hubitat.devices['42'].attributes.should.containEql({ testAttribute: { name: 'testAttribute', value: 'value' } });
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.receive({});
    });
  });
  it('should not link the internal properties to the output message when event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultDeviceNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = {
      deviceId: '42',
      name: 'testAttribute',
      value: 'value',
    };
    helper.load([deviceNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.hubitat.devices = { 42: { attributes: { testAttribute: { value: 'value' } } } };
      n2.on('input', (msg) => {
        try {
          n1.hubitat.devices['42'].attributes.testAttribute.should.have.property('value', 'value');
          msg.payload.value = 'overwrite-value';
          n1.hubitat.devices['42'].attributes.testAttribute.should.have.property('value', 'value');
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('device.42', hubitatEvent);
    });
  });
  it('should send event when systemStart received and desynchronized', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultDeviceNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([deviceNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.hubitat.expiredDevices = { 42: { attributes: { testAttribute: { name: 'testAttribute', value: 'desync' } } } };
      n1.hubitat.devicesFetcher = () => new Promise((res) => {
        n1.hubitat.devices['42'] = {
          attributes: { testAttribute: { name: 'testAttribute', value: 'sync', dataType: 'STRING' } },
        };
        res();
      });

      n2.on('input', (msg) => {
        try {
          msg.payload.should.have.property('name', 'testAttribute');
          msg.payload.should.have.property('value', 'sync');
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('systemStart');
    });
  });
  it('should not send event when systemStart received and synchronized', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultDeviceNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([deviceNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.hubitat.expiredDevices = { 42: { attributes: { testAttribute: { name: 'testAttribute', value: 'sync' } } } };
      n1.hubitat.devicesFetcher = () => new Promise((res) => {
        n1.hubitat.devices['42'] = {
          attributes: { testAttribute: { name: 'testAttribute', value: 'sync', dataType: 'STRING' } },
        };
        res();
      });
      let inError = false;
      n2.on('input', () => {
        inError = true;
      });
      n1.hubitat.hubitatEvent.emit('systemStart');
      setTimeout(() => {
        if (inError) {
          done(new Error('synchronized attribute send event'));
        } else {
          done();
        }
      }, 20);
    });
  });
  it('should send only desynchronized attributes event when systemStart received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultDeviceNode, attribute: '', wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([deviceNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.hubitat.expiredDevices = {
        42: {
          attributes: {
            desync1: { name: 'desync1', value: 'desync' },
            sync: { name: 'sync', value: 'sync' },
            desync2: { name: 'desync2', value: 'desync' },
          },
        },
      };
      n1.hubitat.devicesFetcher = () => new Promise((res) => {
        n1.hubitat.devices['42'] = {
          attributes: {
            desync1: { name: 'desync1', value: 'sync', dataType: 'STRING' },
            sync: { name: 'sync', value: 'sync', dataType: 'STRING' },
            desync2: { name: 'desync2', value: 'sync', dataType: 'STRING' },
          },
        };
        res();
      });
      let eventRecevied = 0;
      n2.on('input', (msg) => {
        try {
          eventRecevied += 1;
          if (eventRecevied === 1) {
            msg.payload.should.have.property('name', 'desync1');
            msg.payload.should.have.property('value', 'sync');
          } else if (eventRecevied === 2) {
            msg.payload.should.have.property('name', 'desync2');
            msg.payload.should.have.property('value', 'sync');
            done();
          }
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('systemStart');
    });
  });
  it('should take deviceId from message', (done) => {
    const flow = [
      defaultConfigNode,
      {
        ...defaultDeviceNode,
        deviceId: 1,
        attribute: 'test',
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([deviceNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.hubitat.devices = { 42: { attributes: { test: { name: 'test', value: 'attr-of-id-42' } } } };
      n2.on('input', (msg) => {
        try {
          msg.payload.should.have.property('value', 'attr-of-id-42');
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.receive({ deviceId: '42' });
    });
  });
  it('should output an error when empty deviceId is provided', (done) => {
    const flow = [
      defaultConfigNode,
      {
        ...defaultDeviceNode,
        deviceId: 1,
        attribute: 'test',
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([deviceNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.hubitat.devices = { 1: { attributes: { test: { name: 'test', value: 'attr' } } } };
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n1.receive({ deviceId: '' });
      setTimeout(() => {
        if (inError) {
          done(new Error('no deviceId allowed though'));
        } else {
          done();
        }
      }, 20);
    });
  });
});
