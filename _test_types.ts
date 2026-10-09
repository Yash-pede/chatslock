import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'

const mw = createMiddleware<{ Variables: { foo: string } }>(async (c, next) => {
  c.set('foo', 'bar')
  await next()
})

const app = new Hono()
app.get('/test', mw, (c) => {
  const foo = c.get('foo')
  return c.json({ foo })
})
