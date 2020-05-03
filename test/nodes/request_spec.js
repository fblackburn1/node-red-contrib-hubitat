/* eslint-disable no-unused-vars */
const express = require('express');
const helper = require('node-red-node-test-helper');
const http = require('http');
const stoppable = require('stoppable');
const requestNode = require('../../nodes/request.js');
const configNode = require('../../nodes/config.js');


describe('Hubitat Request Node', () => {
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
  };
  const defaultRequestNode = {
    id: 'n1',
    type: 'hubitat request',
    name: 'test request name',
    server: 'n0',
    path: '/test/path',
  };
  const testApp = express();
  const testServer = stoppable(http.createServer(testApp));

  function startServer(done) {
    testServer.listen(testPort, (err) => {});
    done();
  }

  before((done) => {
    testApp.get('/apps/api/1/error/path', (req, res) => { res.sendStatus(500); });
    testApp.get('/apps/api/1/:path', (req, res) => { res.json(req.params); });
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
  });

  it('should be loaded', (done) => {
    const flow = [defaultRequestNode];
    helper.load(requestNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('name', 'test request name');
        n1.should.have.property('path', '/test/path');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should not send msg when server is not configured', (done) => {
    const flow = [
      { ...defaultRequestNode, server: '', wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(requestNode, flow, () => {
      const n2 = helper.getNode('n2');
      const n1 = helper.getNode('n1');
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n1.receive({});
      setTimeout(() => {
        if (inError) {
          done(new Error('no server allowed though'));
        } else {
          done();
        }
      }, 20);
    });
  });

  it('should not send msg when server return error', (done) => {
    const flow = [
      defaultConfigNode,
      {
        ...defaultRequestNode,
        path: '/error/path',
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([requestNode, configNode], flow, () => {
      const n2 = helper.getNode('n2');
      const n1 = helper.getNode('n1');
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n1.receive();
      setTimeout(() => {
        if (inError) {
          done(new Error('server error allowed though'));
        } else {
          done();
        }
      }, 20);
    });
  });

  it('should output an error when empty path is provided', (done) => {
    const flow = [
      { ...defaultRequestNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(requestNode, flow, () => {
      const n2 = helper.getNode('n2');
      const n1 = helper.getNode('n1');
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n1.receive({ path: '' });
      setTimeout(() => {
        if (inError) {
          done(new Error('no path allowed though'));
        } else {
          done();
        }
      }, 20);
    });
  });

  it('should take path from message', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultRequestNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([requestNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('payload', { path: 'foobar' });
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.receive({ path: 'foobar' });
    });
  });
});
