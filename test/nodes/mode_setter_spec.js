/* eslint-disable no-unused-vars */
const express = require('express');
const helper = require('node-red-node-test-helper');
const http = require('http');
const stoppable = require('stoppable');
const modeSetterNode = require('../../nodes/mode-setter.js');
const configNode = require('../../nodes/config.js');

describe('Hubitat Mode Setter Node', () => {
  const testPort = 10234;
  const defaultConfigNode = {
    id: 'n0',
    type: 'hubitat config',
    name: 'test config name',
    usetls: false,
    host: 'localhost',
    port: testPort,
    token: '1234-abcd',
    appId: 1,
    nodeRedServer: 'localhost',
    webhookPath: '/hubitat/webhook',
  };
  const defaultModeSetterNode = {
    id: 'n1',
    type: 'hubitat mode-setter',
    name: 'test mode setter name',
    server: 'n0',
    modeId: '42',
  };
  const testApp = express();
  const testServer = stoppable(http.createServer(testApp));

  function startServer(done) {
    testServer.listen(testPort, (err) => {});
    done();
  }

  before((done) => {
    testApp.get('/apps/api/1/modes/errorId', (req, res) => { res.sendStatus(500); });
    testApp.get('/apps/api/1/modes/:modeId', (req, res) => { res.json(req.params); });
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
    const flow = [defaultModeSetterNode];
    helper.load(modeSetterNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('name', 'test mode setter name');
        n1.should.have.property('modeId', '42');
        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('should not send msg when server is not configured', (done) => {
    const flow = [
      { ...defaultModeSetterNode, server: '', wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(modeSetterNode, flow, () => {
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
      { ...defaultModeSetterNode, modeId: 'errorId', wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([modeSetterNode, configNode], flow, () => {
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

  it('should output an error when empty modeId is provided', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultModeSetterNode, modeId: '', wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([modeSetterNode, configNode], flow, () => {
      const n2 = helper.getNode('n2');
      const n1 = helper.getNode('n1');
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n1.receive();
      setTimeout(() => {
        if (inError) {
          done(new Error('no mode allowed though'));
        } else {
          done();
        }
      }, 20);
    });
  });

  it('should take modeId from message', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultModeSetterNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([modeSetterNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('response', { modeId: '999' });
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.receive({ modeId: '999' });
    });
  });
});
