const { promisify } = require('util')
const redis = require('redis')
const { v4: uuidv4 } = require('uuid')
const appendQuery = require('append-query')
const config = require('@femto-apps/config')
const normUrl = require('normalize-url')

const consumerService = require('../services/consumer')

const client = config.get('redis.url')
  ? redis.createClient({
      url: config.get('redis.url')
    })
  : redis.createClient({
      host: config.get('redis.host') || '127.0.0.1',
      port: config.get('redis.port') || 6379,
      db: config.get('redis.db') || '0'
   })
const setAsync = promisify(client.set).bind(client)

client.on('error', err => {
    console.log(`Received error: ${err}`)
    process.exit(1)
})

// contains 'id', 'redirect'
exports.getAuth = async function(req, res) {
    const { id, redirect } = req.query

    let consumer = await consumerService.readConsumer(id)
    console.log(consumer)
    if (!(consumer)) {
        return res.json({ err: 'Invalid ID' })
    }

    let redirects = consumer.redirects
    let url
    try {
        url = new URL(redirect)
    } catch(e) {
        return res.json({ err: 'Cannot Parse Redirect URL' })
    }
    
    let callbackUrl = url.origin
    if (callbackUrl.port) {
        callbackUrl += ":" + port
    }
    callbackUrl += url.pathname

    if (redirect.indexOf(callbackUrl) == -1) {
        return res.json({ err: 'Unacceptable Redirect' })
    }

    // generate a new token.
    const tokenId = uuidv4()

    if ('tokens' in req.session) {
        req.session.tokens.push({ token: tokenId, user: req.user._id})
    } else {
        req.session.tokens = [{ token: tokenId, user: req.user._id }]
    }

    await setAsync(`${config.get('redis.session')}:${tokenId}`, JSON.stringify({ users: [req.user] }))

    return res.redirect(appendQuery(redirect, 'token=' + encodeURIComponent(tokenId)))
}

