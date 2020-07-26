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
  it('should fetch getDevice only once by deviceId', (done) => {
    const flow = [defaultConfigNode];
    helper.load(configNode, flow, () => {
      const n0 = helper.getNode('n0');
      n0.getDevice(1).then((device) => {
        clearTimeout(n0.invalidCacheTimeout);
        try {
          should.equal(nbGetDeviceCalled, 1);
        } catch (err) {
          done(err);
        }
      });
      n0.getDevice(1).then((device) => {
        try {
          should.equal(nbGetDeviceCalled, 1);
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });
  it('should not mixed up getDevice cache', (done) => {
    const flow = [defaultConfigNode];
    helper.load(configNode, flow, () => {
      const n0 = helper.getNode('n0');
      n0.getDevice(1).then((device) => {
        try {
          device.should.have.property('id', '1');
        } catch (err) {
          done(err);
        }
      });
      n0.getDevice(2).then((device) => {
        clearTimeout(n0.invalidCacheTimeout);
        try {
          device.should.have.property('id', '2');
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });
  it('should wait on slow getDevice until first request is completed', (done) => {
    const flow = [defaultConfigNode];
    helper.load(configNode, flow, () => {
      const n0 = helper.getNode('n0');
      n0.getDevice('slow').then((device) => {
        clearTimeout(n0.invalidCacheTimeout);
        try {
          should.equal(nbGetDeviceCalled, 1);
          device.should.have.property('id', 'slow');
        } catch (err) {
          done(err);
        }
      });
      n0.getDevice('slow').then((device) => {
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
});
