/* eslint-disable no-unused-vars */
const express = require('express');
const helper = require('node-red-node-test-helper');
const http = require('http');
const should = require('should');
const stoppable = require('stoppable');
const configNode = require('../../nodes/config.js');

describe('Hubitat Config Node', () => {
  const testPort = 10234;

  const defaultConfigNode = {
    id: 'n0',
    type: 'hubitat config',
    name: 'test config name',
    usetls: false,
    host: 'localhost',
    port: testPort,
    appId: 1,
    nodeRedServer: 'localhost',
    webhookPath: '/hubitat/webhook',
    useWebsocket: false,
  };
  const testApp = express();
  let nbGetDeviceCalled = 0;
  const testServer = stoppable(http.createServer(testApp));

  testApp.use((req, res, next) => {
    nbGetDeviceCalled += 1;
    next();
  });

  function startServer(done) {
    testServer.listen(testPort, (err) => {});
    done();
  }

  before((done) => {
    testApp.get('/apps/api/1/devices/slow', (req, res) => {
      setTimeout(() => {
        res.json({ id: 'slow', attributes: [{ name: 'switch' }] });
      }, 100);
    });
    testApp.get('/apps/api/1/devices/switch-off-duplicate', (req, res) => {
      res.json({ id: 'switch-off-duplicate', attributes: [{ name: 'switch', currentValue: 'off' }, { name: 'switch', currentValue: 'off' }] });
    });
    testApp.get('/apps/api/1/devices/:deviceId', (req, res) => { res.json({ id: req.params.deviceId, attributes: [{ name: 'switch' }] }); });

    startServer((err) => {
      if (err) {
        done(err);
      }
      helper.startServer(done);
    });
  });

  after((done) => {
    testServer.stop(() => {
      helper.stopServer(done);
    });
  });

  afterEach(() => {
    helper.unload();
    nbGetDeviceCalled = 0;
  });

  it('should be loaded', (done) => {
    const flow = [defaultConfigNode];
    helper.load(configNode, flow, () => {
      const n0 = helper.getNode('n0');
      try {
        n0.should.have.property('name', 'test config name');
        n0.should.have.property('usetls', false);
        n0.should.have.property('host', 'localhost');
        n0.should.have.property('port', 10234);
        n0.should.have.property('appId', 1);
        n0.should.have.property('nodeRedServer', 'localhost');
        n0.should.have.property('webhookPath', '/hubitat/webhook');
        n0.should.have.property('useWebsocket', false);
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should not load websocket when not used', (done) => {
    const flow = [{ ...defaultConfigNode, useWebsocket: false }];
    helper.load(configNode, flow, () => {
      const n0 = helper.getNode('n0');
      try {
        n0.should.not.have.property('wsServer');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should fetch initDevice only once by deviceId', (done) => {
    const flow = [defaultConfigNode];
    helper.load(configNode, flow, () => {
      const n0 = helper.getNode('n0');
      n0.initDevice(1).then((device) => {
        try {
          should.equal(nbGetDeviceCalled, 1);
        } catch (err) {
          done(err);
        }
      });
      n0.initDevice(1).then((device) => {
        try {
          should.equal(nbGetDeviceCalled, 1);
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });
  it('should not mixed up initDevice cache', (done) => {
    const flow = [defaultConfigNode];
    helper.load(configNode, flow, () => {
      const n0 = helper.getNode('n0');
      n0.initDevice(1).then((device) => {
        try {
          device.should.have.property('id', '1');
        } catch (err) {
          done(err);
        }
      });
      n0.initDevice(2).then((device) => {
        try {
          device.should.have.property('id', '2');
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });
  it('should wait on slow initDevice until first request is completed', (done) => {
    const flow = [defaultConfigNode];
    helper.load(configNode, flow, () => {
      const n0 = helper.getNode('n0');
      n0.initDevice('slow').then((device) => {
        try {
          should.equal(nbGetDeviceCalled, 1);
          device.should.have.property('id', 'slow');
        } catch (err) {
          done(err);
        }
      });
      n0.initDevice('slow').then((device) => {
        try {
          should.equal(nbGetDeviceCalled, 1);
          device.should.have.property('id', 'slow');
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });
  it('initDevice should reorder and remove duplicate attributes', (done) => {
    const flow = [defaultConfigNode];
    helper.load(configNode, flow, () => {
      const n0 = helper.getNode('n0');
      n0.initDevice('switch-off-duplicate').then((device) => {
        try {
          should.equal(nbGetDeviceCalled, 1);
          device.should.have.property('id', 'switch-off-duplicate');
          device.attributes.switch.should.have.property('value', 'off');
          device.attributes.switch.should.have.property('currentValue', 'off');
          device.attributes.switch.should.have.property('deviceId', 'switch-off-duplicate');
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });
  it('should cast event dataType NUMBER to integer', (done) => {
    const flow = [defaultConfigNode];
    const event = { deviceId: 42, name: 'testAttribute', value: '-2.5' };
    helper.load([configNode], flow, () => {
      const n0 = helper.getNode('n0');
      n0.devices = { 42: { attributes: { testAttribute: { value: 1, dataType: 'NUMBER' } } } };
      n0.updateDevice(event);
      try {
        n0.devices[42].attributes.testAttribute.should.have.property('value', -2.5);
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should cast event dataType BOOL to boolean', (done) => {
    const flow = [defaultConfigNode];
    const event = { deviceId: 42, name: 'testAttribute', value: 'true' };
    helper.load([configNode], flow, () => {
      const n0 = helper.getNode('n0');
      n0.devices = { 42: { attributes: { testAttribute: { value: false, dataType: 'BOOL' } } } };
      n0.updateDevice(event);
      try {
        n0.devices[42].attributes.testAttribute.should.have.property('value', true);
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should cast event dataType three axes VECTOR3 to object', (done) => {
    const flow = [defaultConfigNode];
    const event = { deviceId: 42, name: 'testAttribute', value: '[x:2,y:-4,z:1.5]' };
    helper.load([configNode], flow, () => {
      const n0 = helper.getNode('n0');
      n0.devices = { 42: { attributes: { testAttribute: { value: { x: -9, y: 1, z: -2 }, dataType: 'VECTOR3' } } } };
      n0.updateDevice(event);
      try {
        n0.devices[42].attributes.testAttribute.should.have.property('value', { x: 2, y: -4, z: 1.5 });
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should cast event dataType range VECTOR3 to object', (done) => {
    const flow = [defaultConfigNode];
    const event = { deviceId: 42, name: 'testAttribute', value: '[42.5,24]' };
    helper.load([configNode], flow, () => {
      const n0 = helper.getNode('n0');
      n0.devices = { 42: { attributes: { testAttribute: { value: [1, 2], dataType: 'VECTOR3' } } } };
      n0.updateDevice(event);
      try {
        n0.devices[42].attributes.testAttribute.should.have.property('value', [42.5, 24]);
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should cast event dataType null VECTOR3 to object', (done) => {
    const flow = [defaultConfigNode];
    const event = { deviceId: 42, name: 'testAttribute', value: 'null' };
    helper.load([configNode], flow, () => {
      const n0 = helper.getNode('n0');
      n0.devices = { 42: { attributes: { testAttribute: { value: [1, 2], dataType: 'VECTOR3' } } } };
      n0.updateDevice(event);
      try {
        n0.devices[42].attributes.testAttribute.should.have.property('value', null);
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should cast event dataType empty VECTOR3 to object', (done) => {
    const flow = [defaultConfigNode];
    const event = { deviceId: 42, name: 'testAttribute', value: '' };
    helper.load([configNode], flow, () => {
      const n0 = helper.getNode('n0');
      n0.devices = { 42: { attributes: { testAttribute: { value: [1, 2], dataType: 'VECTOR3' } } } };
      n0.updateDevice(event);
      try {
        n0.devices[42].attributes.testAttribute.should.have.property('value', '');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should cast event dataType UNDEFINED to string', (done) => {
    const flow = [defaultConfigNode];
    const event = { deviceId: 42, name: 'testAttribute', value: 'string' };
    helper.load([configNode], flow, () => {
      const n0 = helper.getNode('n0');
      n0.devices = { 42: { attributes: { testAttribute: { value: 'undefined', dataType: 'UNDEFINED' } } } };
      n0.updateDevice(event);
      try {
        n0.devices[42].attributes.testAttribute.should.have.property('value', 'string');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should not cast event with object value', (done) => {
    const flow = [defaultConfigNode];
    const event = { deviceId: 42, name: 'testAttribute', value: { object: 'val' } };
    helper.load([configNode], flow, () => {
      const n0 = helper.getNode('n0');
      n0.devices = { 42: { attributes: { testAttribute: { value: 'string', dataType: 'UNDEFINED' } } } };
      n0.updateDevice(event);
      try {
        n0.devices[42].attributes.testAttribute.should.have.property('value', { object: 'val' });
        done();
      } catch (err) {
        done(err);
      }
    });
  });
});
