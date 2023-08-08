/* eslint-disable no-unused-vars */
const http = require('http');
const express = require('express');
const helper = require('node-red-node-test-helper');
const stoppable = require('stoppable');
const hsmSetterNode = require('../../nodes/hsm-setter');
const configNode = require('../../nodes/config');

describe('Hubitat HSM Setter Node', () => {
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
  const defaultHsmSetterNode = {
    id: 'n1',
    type: 'hubitat hsm-setter',
    name: 'test hsm setter name',
    server: 'n0',
    state: 'disarm',
  };
  const testApp = express();
  const testServer = stoppable(http.createServer(testApp));

  function startServer(done) {
    testServer.listen(testPort, (err) => {});
    done();
  }

  before((done) => {
    testApp.get('/apps/api/1/hsm/armAway', (req, res) => { res.sendStatus(500); });
    testApp.get('/apps/api/1/hsm/:state', (req, res) => { res.json(req.params); });
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
    const flow = [defaultHsmSetterNode];
    helper.load(hsmSetterNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('name', 'test hsm setter name');
        n1.should.have.property('state', 'disarm');
        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('should not send msg when server is not configured', (done) => {
    const flow = [
      { ...defaultHsmSetterNode, server: '', wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(hsmSetterNode, flow, () => {
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
      { ...defaultHsmSetterNode, state: 'armAway', wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([hsmSetterNode, configNode], flow, () => {
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

  it('should output an error when empty state is provided', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultHsmSetterNode, state: '', wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([hsmSetterNode, configNode], flow, () => {
      const n2 = helper.getNode('n2');
      const n1 = helper.getNode('n1');
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n1.receive();
      setTimeout(() => {
        if (inError) {
          done(new Error('no state allowed though'));
        } else {
          done();
        }
      }, 20);
    });
  });

  it('should output an error when invalid state is provided', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultHsmSetterNode, state: 'invalid', wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([hsmSetterNode, configNode], flow, () => {
      const n2 = helper.getNode('n2');
      const n1 = helper.getNode('n1');
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n1.receive();
      setTimeout(() => {
        if (inError) {
          done(new Error('no state allowed though'));
        } else {
          done();
        }
      }, 20);
    });
  });

  it('should take state from message', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultHsmSetterNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    helper.load([hsmSetterNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('response', { state: 'armHome' });
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.receive({ state: 'armHome' });
    });
  });
});
