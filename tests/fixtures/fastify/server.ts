const fastify = require('fastify')();

// Simple route
fastify.get('/users', (req, res) => {
  res.send([{ id: 1, name: 'John Doe' }]);
});

// Route with parameters and schema
fastify.get('/users/:id', {
  schema: {
    params: {
      id: { type: 'string' }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' }
        }
      }
    }
  }
}, (req, res) => {
  res.send({ id: req.params.id, name: 'John Doe' });
});

// POST route with body schema
fastify.post('/users', {
  schema: {
    body: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email' },
        age: { type: 'number' }
      }
    }
  }
}, (req, res) => {
  res.code(201).send({ ok: true });
});

// Complex .route() call
fastify.route({
  method: 'PUT',
  url: '/users/:id',
  schema: {
    params: { id: { type: 'string' } },
    body: {
      type: 'object',
      properties: { name: { type: 'string' } }
    }
  },
  handler: (req, res) => {
    res.send({ ok: true });
  }
});

// Plugin registration (prefixing)
const userPlugin = async (fastify, options) => {
  fastify.get('/profile', (req, res) => {
    res.send({ user: 'me' });
  });
};
fastify.register(userPlugin, { prefix: '/api/users' });

module.exports = fastify;
